// Renders the profile's static chrome — assets/header.svg, assets/orbs.svg and
// assets/footer.svg — in the same terminal-panel language as visual-map.svg.
//
// Run by hand after changing anything here:
//   npm run chrome
//
// GitHub strips scripts from README images, so every animation is pure SMIL.

import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "assets");

export const ACCENT = "#38BDF8";
export const PURPLE = "#A78BFA";
export const BRIGHT = "#C9D6E3";
export const MUTED = "#7C8FA6";
export const DIM = "#4A5A6E";
export const PANEL = "#080D16";
export const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

const r1 = (n) => +n.toFixed(1);

/** Shared panel chrome: gradient edge, grid wash, optional title bar. */
export function frame(w, h, { titleBar = false, right = "" } = {}) {
  const bar = titleBar
    ? `
  <circle cx="26" cy="26" r="5" fill="#FF5F57"/><circle cx="44" cy="26" r="5" fill="#FEBC2E"/><circle cx="62" cy="26" r="5" fill="#28C840"/>
  <text x="86" y="30" font-size="12.5" font-family="${MONO}" fill="${BRIGHT}">hami9<tspan fill="${DIM}"> / </tspan>README.md</text>
  <text x="${w - 26}" y="30" text-anchor="end" font-size="11" font-family="${MONO}" fill="${DIM}">${right}</text>
  <line x1="14" y1="46" x2="${w - 14}" y2="46" stroke="${ACCENT}" stroke-opacity="0.16"/>`
    : "";

  return `<defs>
    <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${ACCENT}"/><stop offset="100%" stop-color="${PURPLE}"/>
    </linearGradient>
    <pattern id="grid" width="26" height="26" patternUnits="userSpaceOnUse">
      <path d="M26 0H0V26" fill="none" stroke="${ACCENT}" stroke-opacity="0.05"/>
    </pattern>
  </defs>

  <rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="12" fill="${PANEL}" stroke="url(#edge)" stroke-opacity="0.55"/>
  <rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="12" fill="url(#grid)"/>${bar}`;
}

export const cursor = (x, y, w = 8, h = 14) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${ACCENT}">` +
  `<animate attributeName="opacity" values="1;1;0;0" keyTimes="0;0.5;0.5;1" dur="1.1s" repeatCount="indefinite"/></rect>`;

/* ---------------------------------------------------------------- orbs --- */

// Crescent of radial strokes, tapering at both tips, rotating.
export function orbThinking(cx, cy, R) {
  const M = 46, ARC = 250, START = -215;
  const strokes = [];
  for (let i = 0; i < M; i++) {
    const t = i / (M - 1);
    const a = ((START + t * ARC) * Math.PI) / 180;
    const taper = Math.sin(Math.PI * t) ** 0.6;
    const inner = R - R * 0.38 * taper - 1;
    strokes.push(
      `<line x1="${r1(Math.cos(a) * inner)}" y1="${r1(Math.sin(a) * inner)}" x2="${r1(Math.cos(a) * R)}" y2="${r1(Math.sin(a) * R)}" stroke="${i % 5 === 0 ? PURPLE : ACCENT}" stroke-width="1.6" stroke-linecap="round" opacity="${+(0.12 + 0.88 * taper).toFixed(2)}"/>`
    );
  }
  return `<g transform="translate(${cx} ${cy})"><g>${strokes.join("")}` +
    `<animateTransform attributeName="transform" type="rotate" values="0;360" dur="2.6s" repeatCount="indefinite"/></g></g>`;
}

// Rings expanding out of a breathing core.
export function orbPulse(cx, cy, R) {
  const rings = [0, 1, 2]
    .map(
      (i) => `<circle r="6" fill="none" stroke="${ACCENT}" stroke-width="1.4">
      <animate attributeName="r" values="6;${R}" dur="2.4s" begin="${i * 0.8}s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0.9;0" dur="2.4s" begin="${i * 0.8}s" repeatCount="indefinite"/>
    </circle>`
    )
    .join("");
  return `<g transform="translate(${cx} ${cy})">${rings}
    <circle r="5.5" fill="${PURPLE}"><animate attributeName="r" values="5.5;7;5.5" dur="2.4s" repeatCount="indefinite"/></circle></g>`;
}

// Dots tracking tilted rings, each on its own period.
export function orbOrbit(cx, cy, R) {
  const rings = [
    { tilt: 0, dur: 3.1 },
    { tilt: 60, dur: 4.3 },
    { tilt: -60, dur: 2.5 },
  ];
  const ry = r1(R * 0.34);
  const path = `M ${-R} 0 a ${R} ${ry} 0 1 0 ${R * 2} 0 a ${R} ${ry} 0 1 0 ${-R * 2} 0`;
  const g = rings
    .map(
      (r, i) => `<g transform="rotate(${r.tilt})">
      <ellipse rx="${R}" ry="${ry}" fill="none" stroke="${ACCENT}" stroke-opacity="0.22" stroke-width="1"/>
      <circle r="2.6" fill="${i === 1 ? PURPLE : ACCENT}"><animateMotion dur="${r.dur}s" repeatCount="indefinite" path="${path}"/></circle>
    </g>`
    )
    .join("");
  return `<g transform="translate(${cx} ${cy})">${g}<circle r="4" fill="${ACCENT}" opacity="0.85"/></g>`;
}

// Radar trace sweeping a clipped disc. `id` keeps the clipPath unique per file.
export function orbScan(cx, cy, R, id = "disc") {
  const lines = [];
  for (let y = -R + 6; y <= R - 6; y += 6) {
    lines.push(`<line x1="${-R}" y1="${y}" x2="${R}" y2="${y}" stroke="${ACCENT}" stroke-opacity="0.14" stroke-width="1"/>`);
  }
  return `<g transform="translate(${cx} ${cy})">
    <clipPath id="${id}"><circle r="${R}"/></clipPath>
    <circle r="${R}" fill="none" stroke="${ACCENT}" stroke-opacity="0.35" stroke-width="1.2"/>
    <g clip-path="url(#${id})">${lines.join("")}
      <rect x="${-R}" y="-3" width="${R * 2}" height="6" fill="${PURPLE}" opacity="0.85">
        <animate attributeName="y" values="${-R};${R};${-R}" dur="3s" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1" keySplines=".4 0 .6 1;.4 0 .6 1"/>
      </rect>
    </g></g>`;
}

// Nested arcs counter-rotating around a blinking centre.
export function orbCore(cx, cy, R) {
  const arc = (rad, from, to, col, w, dur, dir) => {
    const a1 = (from * Math.PI) / 180, a2 = (to * Math.PI) / 180;
    const large = to - from > 180 ? 1 : 0;
    const d = `M ${r1(Math.cos(a1) * rad)} ${r1(Math.sin(a1) * rad)} A ${r1(rad)} ${r1(rad)} 0 ${large} 1 ${r1(Math.cos(a2) * rad)} ${r1(Math.sin(a2) * rad)}`;
    return `<g><path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>` +
      `<animateTransform attributeName="transform" type="rotate" values="${dir > 0 ? "0;360" : "360;0"}" dur="${dur}s" repeatCount="indefinite"/></g>`;
  };
  return `<g transform="translate(${cx} ${cy})">
    ${arc(R, 0, 250, ACCENT, 1.8, 3.4, 1)}
    ${arc(R * 0.74, 40, 300, PURPLE, 1.5, 2.6, -1)}
    ${arc(R * 0.47, 10, 200, ACCENT, 1.2, 2, 1)}
    <circle r="4.5" fill="${PURPLE}"><animate attributeName="opacity" values="1;0.35;1" dur="1.6s" repeatCount="indefinite"/></circle></g>`;
}

/* --------------------------------------------------------------- pages --- */

function header() {
  const W = 900, H = 200;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Hami Kainy — Full-Stack and AI Engineer">
  ${frame(W, H, { titleBar: true, right: "~/profile" })}

  <text x="34" y="102" font-size="30" font-weight="700" font-family="${MONO}" fill="${BRIGHT}" letter-spacing="1">Hami Kainy</text>
  <text x="34" y="128" font-size="11.5" letter-spacing="4.2" font-family="${MONO}" fill="${PURPLE}">FULL-STACK &amp; AI ENGINEER</text>
  <text x="34" y="164" font-size="12" font-family="${MONO}" fill="${MUTED}"><tspan fill="${ACCENT}">$</tspan> ./init.sh --profile</text>
  ${cursor(196, 153)}

  ${orbThinking(792, 122, 44)}
  <text x="792" y="182" text-anchor="middle" font-size="9" letter-spacing="2.4" font-family="${MONO}" fill="${DIM}">THINKING</text>
</svg>
`;
}

function orbs() {
  const W = 900, H = 178, CY = 92, R = 34;
  const XS = [130, 290, 450, 610, 770];
  const items = [
    { draw: () => orbThinking(XS[0], CY, R), label: "THINKING" },
    { draw: () => orbPulse(XS[1], CY, R), label: "PULSE" },
    { draw: () => orbOrbit(XS[2], CY, R), label: "ORBIT" },
    { draw: () => orbScan(XS[3], CY, R, "scanDisc"), label: "SCAN" },
    { draw: () => orbCore(XS[4], CY, R), label: "CORE" },
  ];
  const labels = items
    .map((o, i) => `<text x="${XS[i]}" y="${CY + R + 24}" text-anchor="middle" fill="${MUTED}" font-size="9.5" letter-spacing="2.4" font-family="${MONO}">${o.label}</text>`)
    .join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Animated thinking orbs">
  ${frame(W, H)}

  <text x="26" y="30" font-size="9.5" letter-spacing="2.6" font-family="${MONO}" fill="${PURPLE}">ORB.ARRAY</text>
  <text x="${W - 26}" y="30" text-anchor="end" font-size="9.5" letter-spacing="1.6" font-family="${MONO}" fill="${DIM}">STATUS: THINKING</text>
  <line x1="14" y1="42" x2="${W - 14}" y2="42" stroke="${ACCENT}" stroke-opacity="0.16"/>

  ${items.map((o) => o.draw()).join("\n  ")}
  ${labels}
</svg>
`;
}

function footer() {
  const W = 900, H = 104;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Footer">
  ${frame(W, H)}

  ${orbCore(60, 52, 24)}
  <text x="${W / 2}" y="48" text-anchor="middle" font-size="11" letter-spacing="3.4" font-family="${MONO}" fill="${MUTED}">THANKS FOR SCROLLING</text>
  <text x="${W / 2}" y="70" text-anchor="middle" font-size="10.5" font-family="${MONO}" fill="${DIM}"><tspan fill="${ACCENT}">$</tspan> exit</text>
  ${cursor(W / 2 + 32, 60, 7, 12)}
  ${orbPulse(W - 60, 52, 24)}
</svg>
`;
}

const files = [
  ["header.svg", header()],
  ["orbs.svg", orbs()],
  ["footer.svg", footer()],
];

for (const [name, svg] of files) {
  await writeFile(join(ASSETS, name), svg);
  console.log(`${name.padEnd(12)} ${(svg.length / 1024).toFixed(1)} KB`);
}
