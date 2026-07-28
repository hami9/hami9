// Generates assets/stats.svg and assets/top-langs.svg from live GitHub data.
//
// Runs inside GitHub Actions with the built-in GITHUB_TOKEN, so the profile
// never depends on the public github-readme-stats instance (which is
// permanently over its API quota and serves broken cards).

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LOGIN = process.env.PROFILE_LOGIN || "hami9";
const TOKEN = process.env.GITHUB_TOKEN;
export const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "assets");

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

const ACCENT = "#38BDF8";
const MUTED = "#8B949E";
const DIM = "#6E7681";
const BORDER = "#30363D";
const SANS = "Segoe UI,Ubuntu,Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

if (IS_MAIN && !TOKEN) {
  console.error("GITHUB_TOKEN is required");
  process.exit(1);
}

async function graphql(query, variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "hami9-profile-stats",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`GitHub API returned ${res.status}: ${await res.text()}`);
  }

  const body = await res.json();
  if (body.errors?.length) {
    throw new Error(body.errors.map((e) => e.message).join("; "));
  }
  return body.data;
}

const PROFILE_QUERY = `
  query($login: String!) {
    user(login: $login) {
      name
      login
      followers { totalCount }
      pullRequests(states: [OPEN, MERGED, CLOSED]) { totalCount }
      issues { totalCount }
      repositories(first: 100, ownerAffiliations: OWNER, isFork: false, orderBy: {field: STARGAZERS, direction: DESC}) {
        totalCount
        nodes {
          stargazerCount
          languages(first: 12, orderBy: {field: SIZE, direction: DESC}) {
            edges { size node { name color } }
          }
        }
      }
    }
  }
`;

// Contribution data is queried separately: it is the field most likely to be
// restricted for a given token, and a failure there should not cost us the
// rest of the card.
const CONTRIB_QUERY = `
  query($login: String!) {
    user(login: $login) {
      contributionsCollection {
        totalCommitContributions
        restrictedContributionsCount
        contributionCalendar { totalContributions }
      }
    }
  }
`;

export function formatNumber(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

function escapeXml(value) {
  return String(value).replace(/[<>&'"]/g, (c) => {
    return { "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c];
  });
}

// The legend lays out two entries per row, and the card is sized to sit beside
// the stats card, so the default keeps the total (top N plus "Other") at six.
export function collectLanguages(repos, limit = 5) {
  const totals = new Map();

  for (const repo of repos) {
    for (const edge of repo.languages?.edges ?? []) {
      const { name, color } = edge.node;
      const entry = totals.get(name) ?? { name, color: color || ACCENT, size: 0 };
      entry.size += edge.size;
      totals.set(name, entry);
    }
  }

  const ranked = [...totals.values()].sort((a, b) => b.size - a.size);
  const grandTotal = ranked.reduce((sum, lang) => sum + lang.size, 0);
  if (!grandTotal) return [];

  const top = ranked.slice(0, limit);
  const shown = top.reduce((sum, lang) => sum + lang.size, 0);
  const rest = grandTotal - shown;

  const result = top.map((lang) => ({
    ...lang,
    percent: (lang.size / grandTotal) * 100,
  }));

  if (rest > 0) {
    result.push({ name: "Other", color: DIM, size: rest, percent: (rest / grandTotal) * 100 });
  }
  return result;
}

export function statsCard({ title, stats }) {
  const width = 500;
  const height = 185;
  const cols = 3;
  const colGap = (width - 50) / cols;

  const cells = stats
    .map((stat, i) => {
      const x = 25 + (i % cols) * colGap;
      const labelY = i < cols ? 82 : 142;
      const valueY = labelY + 26;
      return `
    <text x="${x}" y="${labelY}" fill="${MUTED}" font-size="11" letter-spacing="1.4" font-family="${SANS}">${escapeXml(
        stat.label.toUpperCase()
      )}</text>
    <text x="${x}" y="${valueY}" fill="${ACCENT}" font-size="23" font-weight="700" font-family="${MONO}">${escapeXml(
        stat.value
      )}</text>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeXml(
    title
  )}">
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="8" fill="none" stroke="${BORDER}"/>
  <text x="25" y="38" fill="${ACCENT}" font-size="17" font-weight="700" font-family="${SANS}">${escapeXml(title)}</text>
  <rect x="25" y="50" width="46" height="2" rx="1" fill="${ACCENT}"/>${cells}
</svg>
`;
}

export function languagesCard(languages) {
  const width = 400;
  // Grow with the legend so a longer list can never spill past the border.
  const legendRows = Math.ceil(languages.length / 2);
  const height = Math.max(185, 110 + legendRows * 25);
  const barX = 25;
  const barY = 66;
  const barW = width - 50;
  const barH = 10;

  let offset = 0;
  const segments = languages
    .map((lang) => {
      const w = (lang.percent / 100) * barW;
      const rect = `<rect x="${(barX + offset).toFixed(2)}" y="${barY}" width="${Math.max(w, 0).toFixed(
        2
      )}" height="${barH}" fill="${lang.color}"/>`;
      offset += w;
      return rect;
    })
    .join("\n    ");

  const legend = languages
    .map((lang, i) => {
      const x = 25 + (i % 2) * 185;
      const y = 108 + Math.floor(i / 2) * 25;
      return `
  <circle cx="${x + 5}" cy="${y - 4}" r="5" fill="${lang.color}"/>
  <text x="${x + 17}" y="${y}" fill="${MUTED}" font-size="12" font-family="${SANS}">${escapeXml(
        lang.name
      )} <tspan fill="${DIM}">${lang.percent.toFixed(1)}%</tspan></text>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Most used languages">
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="8" fill="none" stroke="${BORDER}"/>
  <text x="25" y="38" fill="${ACCENT}" font-size="17" font-weight="700" font-family="${SANS}">Most Used Languages</text>
  <rect x="25" y="50" width="46" height="2" rx="1" fill="${ACCENT}"/>
  <clipPath id="bar"><rect x="${barX}" y="${barY}" width="${barW}" height="${barH}" rx="5"/></clipPath>
  <g clip-path="url(#bar)">
    <rect x="${barX}" y="${barY}" width="${barW}" height="${barH}" fill="${BORDER}"/>
    ${segments}
  </g>${legend}
</svg>
`;
}

async function main() {
  const { user } = await graphql(PROFILE_QUERY, { login: LOGIN });
  if (!user) throw new Error(`No such user: ${LOGIN}`);

  const repos = user.repositories.nodes ?? [];
  const stars = repos.reduce((sum, repo) => sum + repo.stargazerCount, 0);

  const year = new Date().getUTCFullYear();

  let commits = null;
  let contributions = null;
  try {
    const contrib = await graphql(CONTRIB_QUERY, { login: LOGIN });
    const c = contrib.user.contributionsCollection;
    commits = c.totalCommitContributions + c.restrictedContributionsCount;
    contributions = c.contributionCalendar.totalContributions;
  } catch (err) {
    console.warn(`Skipping contribution counts: ${err.message}`);
  }

  const stats = [
    { label: "Stars Earned", value: formatNumber(stars) },
    { label: "Repositories", value: formatNumber(user.repositories.totalCount) },
    { label: "Pull Requests", value: formatNumber(user.pullRequests.totalCount) },
    { label: "Issues", value: formatNumber(user.issues.totalCount) },
    commits === null
      ? { label: "Followers", value: formatNumber(user.followers.totalCount) }
      : { label: `Commits (${year})`, value: formatNumber(commits) },
    contributions === null
      ? { label: "Profile", value: `@${user.login}` }
      : { label: `Contributions (${year})`, value: formatNumber(contributions) },
  ];

  const languages = collectLanguages(repos);

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(
    join(OUT_DIR, "stats.svg"),
    statsCard({ title: `${user.name || user.login}'s GitHub Stats`, stats })
  );

  if (languages.length) {
    await writeFile(join(OUT_DIR, "top-langs.svg"), languagesCard(languages));
  } else {
    console.warn("No language data found; leaving top-langs.svg untouched");
  }

  console.log(`Stats written for ${LOGIN}:`, stats.map((s) => `${s.label}=${s.value}`).join(", "));
  console.log("Languages:", languages.map((l) => `${l.name} ${l.percent.toFixed(1)}%`).join(", "));
}

if (IS_MAIN) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
