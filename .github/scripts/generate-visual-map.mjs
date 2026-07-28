// Renders assets/visual-map.svg: a terminal-styled card whose left panel is a
// particle cloud that morphs between the Arm, Arch and Linux marks.
//
// Unlike the stat cards this is not on a schedule — the output only changes
// when the shapes or the SYSTEM.INFO rows below change, so it is run by hand:
//
//   npm install && node .github/scripts/generate-visual-map.mjs
//
// GitHub strips scripts from README images, so the animation is pure SMIL:
// every particle carries one animateTransform through the shape keyframes.

import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import * as si from "simple-icons";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "assets", "visual-map.svg");

const N = 430; // particles, shared by every shape so they can morph 1:1
const RASTER = 300; // sampling resolution for each mark

// simple-icons has no BlackArch mark, so the Arch Linux triangle stands in for
// it — BlackArch is an Arch derivative and the label names it explicitly.
const SHAPES = [
  { key: "ARM", path: si.siArm.path },
  { key: "BLACKARCH", path: si.siArchlinux.path },
  { key: "LINUX", path: si.siLinux.path },
];

const W = 900, H = 382;
const VX = 34, VY = 74, VW = 300, VH = 248;
const IX = 358;
const ACCENT = "#38BDF8", PURPLE = "#A78BFA", MUTED = "#7C8FA6", DIM = "#4A5A6E";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

const DUR = 15;
// hold, morph, hold, morph, hold, morph — as fractions of the cycle
const KT = [0, 0.24, 0.3133, 0.5733, 0.6467, 0.9067, 1];
const SPLINES = Array(6).fill(".4 0 .2 1").join(";");

const cx0 = VX + VW / 2, cy0 = VY + 16 + (VH - 40) / 2;
const SPAN = Math.min(VW, VH - 40) * 0.82;

// Deterministic PRNG: regenerating without changing inputs must not churn the diff.
let seed = 987654321;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

const ROWS = [
  ["Subject", "Hami Kainy"],
  ["Role", "Full-Stack & AI Engineer"],
  ["Origin", "Canada / US"],
  ["Status", "Open to collaboration"],
  ["ToolChain", "Linux · Docker · Nginx"],
  null,
  ["Core.Lang", "Python · TypeScript"],
  ["Core.Frontend", "React · Tailwind"],
  ["Core.Backend", "FastAPI · Node.js · PHP"],
  ["Core.Database", "PostgreSQL"],
  ["Core.Infra", "Docker · Nginx · Actions"],
  null,
  ["Grid.Mail", "hami.kainy.9559@gmail.com"],
  ["Grid.GitHub", "github.com/hami9"],
];

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Rasterise each mark, then draw N points from the covered pixels.
async function samplePoints(page, path) {
  const covered = await page.evaluate(
    async ({ d, size }) => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}"><path fill="#000" d="${d}"/></svg>`;
      const img = new Image();
      await new Promise((r) => {
        img.onload = r;
        img.src = "data:image/svg+xml;base64," + btoa(svg);
      });
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;
      const out = [];
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (data[(y * size + x) * 4 + 3] > 128) out.push([x, y]);
        }
      }
      return out;
    },
    { d: path, size: RASTER }
  );

  if (!covered.length) throw new Error("mark rasterised to nothing");

  let s = 12345;
  const pick = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const picked = Array.from({ length: N }, () => covered[Math.floor(pick() * covered.length)]);

  // Normalise into a centred unit box, preserving aspect.
  const xs = picked.map((q) => q[0]), ys = picked.map((q) => q[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  const w = x1 - x0, h = y1 - y0, scale = 1 / Math.max(w, h);
  const pts = picked.map(([x, y]) => [(x - x0 - w / 2) * scale, (y - y0 - h / 2) * scale]);

  // Angle-sort so particle i occupies a comparable position in every shape and
  // the morph reads as a rotation rather than a scramble.
  pts.sort(
    (a, b) =>
      Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0]) ||
      (a[0] ** 2 + a[1] ** 2) - (b[0] ** 2 + b[1] ** 2)
  );
  return pts;
}

function particles(shapes) {
  const out = [];
  for (let i = 0; i < N; i++) {
    const P = shapes.map((s) => s.pts[i]);
    const X = P.map(([x]) => Math.round(cx0 + x * SPAN));
    const Y = P.map(([, y]) => Math.round(cy0 + y * SPAN));
    const at = (k) => `${X[k]} ${Y[k]}`;
    const vals = `${at(0)};${at(0)};${at(1)};${at(1)};${at(2)};${at(2)};${at(0)}`;

    // Nudge each particle's keyTimes so they don't arrive in lockstep.
    const j = () => (rnd() - 0.5) * 0.018;
    const kt = [KT[0], KT[1] + j(), KT[2] + j(), KT[3] + j(), KT[4] + j(), KT[5] + j(), KT[6]];
    for (let k = 1; k < kt.length - 1; k++) {
      kt[k] = Math.min(Math.max(kt[k], kt[k - 1] + 0.004), 0.99);
    }

    const r = (0.8 + rnd() * 0.9).toFixed(2);
    const op = (0.45 + rnd() * 0.55).toFixed(2);
    const col = rnd() < 0.24 ? PURPLE : ACCENT;

    out.push(
      `<circle r="${r}" fill="${col}" opacity="${op}">` +
        `<animateTransform attributeName="transform" type="translate" values="${vals}"` +
        ` keyTimes="${kt.map((v) => +v.toFixed(3)).join(";")}" dur="${DUR}s"` +
        ` repeatCount="indefinite" calcMode="spline" keySplines="${SPLINES}"/>` +
        `</circle>`
    );
  }
  return out;
}

function shapeLabels(shapes) {
  return shapes
    .map((s, i) => {
      const on = [0, 0, 0, 0, 0, 0, 0];
      on[i * 2] = 1;
      on[i * 2 + 1] = 1;
      if (i === 0) on[6] = 1; // the cycle closes back on the first shape
      return (
        `<text x="${cx0}" y="${VY + VH - 4}" text-anchor="middle" fill="${ACCENT}" font-size="11"` +
        ` letter-spacing="3.5" font-family="${MONO}" opacity="0">${esc(s.key)}` +
        `<animate attributeName="opacity" values="${on.join(";")}" keyTimes="${KT.join(";")}"` +
        ` dur="${DUR}s" repeatCount="indefinite"/></text>`
      );
    })
    .join("\n  ");
}

function infoRows() {
  let y = VY + 34;
  return ROWS.map((row) => {
    if (!row) {
      y += 9;
      return "";
    }
    const [k, v] = row;
    const dots = ".".repeat(Math.max(2, 15 - k.length));
    const line =
      `<text x="${IX}" y="${y}" font-size="11.5" font-family="${MONO}">` +
      `<tspan fill="${MUTED}">${esc(k)}</tspan><tspan fill="${DIM}"> ${dots} </tspan>` +
      `<tspan fill="#C9D6E3">${esc(v)}</tspan></text>`;
    y += 19;
    return line;
  })
    .filter(Boolean)
    .join("\n  ");
}

async function main() {
  // Normally Playwright's own download is used (`npx playwright install`).
  // CHROMIUM_PATH lets an environment that already ships a browser point at it.
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
  );
  const page = await browser.newPage();

  const shapes = [];
  for (const s of SHAPES) {
    const pts = await samplePoints(page, s.path);
    shapes.push({ key: s.key, pts });
    console.log(`${s.key.padEnd(10)} sampled ${pts.length} points`);
  }
  await browser.close();

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Hami Kainy system card with an animated Arm, BlackArch and Linux particle map">
  <defs>
    <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${ACCENT}"/><stop offset="100%" stop-color="${PURPLE}"/>
    </linearGradient>
    <radialGradient id="halo" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.13"/>
      <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="26" height="26" patternUnits="userSpaceOnUse">
      <path d="M26 0H0V26" fill="none" stroke="${ACCENT}" stroke-opacity="0.05"/>
    </pattern>
  </defs>

  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="12" fill="#080D16" stroke="url(#edge)" stroke-opacity="0.55"/>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="12" fill="url(#grid)"/>

  <circle cx="26" cy="26" r="5" fill="#FF5F57"/><circle cx="44" cy="26" r="5" fill="#FEBC2E"/><circle cx="62" cy="26" r="5" fill="#28C840"/>
  <text x="86" y="30" font-size="12.5" font-family="${MONO}" fill="#C9D6E3">hami9<tspan fill="${DIM}"> / </tspan>README.md</text>
  <text x="${W - 26}" y="30" text-anchor="end" font-size="11" font-family="${MONO}" fill="${DIM}">hami.kainy.9559@gmail.com</text>
  <line x1="14" y1="46" x2="${W - 14}" y2="46" stroke="${ACCENT}" stroke-opacity="0.16"/>

  <text x="${VX}" y="${VY - 8}" font-size="9.5" letter-spacing="2.6" font-family="${MONO}" fill="${PURPLE}">VISUAL.MAP</text>
  <rect x="${VX}" y="${VY}" width="${VW}" height="${VH}" rx="8" fill="none" stroke="${ACCENT}" stroke-opacity="0.3"/>
  <circle cx="${cx0}" cy="${cy0}" r="${(SPAN * 0.72).toFixed(1)}" fill="url(#halo)"/>
  <g>
  ${particles(shapes).join("\n  ")}
  </g>
  ${shapeLabels(shapes)}

  <text x="${IX}" y="${VY - 8}" font-size="9.5" letter-spacing="2.6" font-family="${MONO}" fill="${PURPLE}">SYSTEM.INFO</text>
  <rect x="${IX - 10}" y="${VY}" width="6" height="16" rx="3" fill="${ACCENT}"/>
  <text x="${IX}" y="${VY + 13}" font-size="12.5" font-family="${MONO}" fill="${ACCENT}" font-weight="700">hami9</text>
  ${infoRows()}

  <line x1="14" y1="${H - 30}" x2="${W - 14}" y2="${H - 30}" stroke="${ACCENT}" stroke-opacity="0.16"/>
  <text x="26" y="${H - 12}" font-size="10" letter-spacing="1.6" font-family="${MONO}" fill="${DIM}">ARM · BLACKARCH · LINUX</text>
  <text x="${W - 26}" y="${H - 12}" text-anchor="end" font-size="10" letter-spacing="1.6" font-family="${MONO}" fill="${DIM}">${N} NODES · ${DUR}s CYCLE</text>
</svg>
`;

  await writeFile(OUT, svg);
  console.log(`wrote ${OUT} (${(svg.length / 1024).toFixed(0)} KB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
