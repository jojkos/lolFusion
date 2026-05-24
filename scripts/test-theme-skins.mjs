// Discovery-only test: for each of the 27 themes, list how many skins
// match via startsWith and print 2 sample splash URLs. No image gen, no
// AI calls — just the DDragon scan. Lets us verify the matching strategy
// before wiring it into the cron.

const VERSION =
  process.argv[2] ||
  (await fetch("https://ddragon.leagueoflegends.com/api/versions.json").then((r) =>
    r.json(),
  ).then((v) => v[0]));

const THEMES = [
  "Blood Moon", "Coven", "Dark Star", "Dawnbringer", "Nightbringer",
  "Dragonmancer", "Elderwood", "Empyrean", "High Noon", "Inkshadow",
  "Mecha Kingdoms", "Odyssey", "Omega Squad", "Pool Party", "PROJECT",
  "PsyOps", "Pulsefire", "Ruined", "Sentinel", "Soul Fighter",
  "Spirit Blossom", "Star Guardian", "Winterblessed", "Arcade",
  "Battle Academia", "Cafe Cuties", "Space Groove",
];

console.log(`DDragon version: ${VERSION}\n`);
console.log("Fetching championFull.json…");
const t0 = Date.now();
const data = await fetch(
  `https://ddragon.leagueoflegends.com/cdn/${VERSION}/data/en_US/championFull.json`,
).then((r) => r.json());
console.log(`Loaded ${Object.keys(data.data).length} champions in ${Date.now() - t0}ms\n`);

function findSkinsForTheme(theme) {
  const themeLower = theme.toLowerCase();
  const matches = [];
  for (const champ of Object.values(data.data)) {
    for (const skin of champ.skins) {
      if (skin.parentSkin) continue;
      if (skin.name.toLowerCase().startsWith(themeLower)) {
        matches.push({
          champId: champ.id,
          champName: champ.name,
          skinNum: skin.num,
          skinName: skin.name,
        });
      }
    }
  }
  return matches;
}

let totalThemes = 0;
let themesWithMatches = 0;
let themesWithFewMatches = [];

for (const theme of THEMES) {
  totalThemes++;
  const matches = findSkinsForTheme(theme);
  const hasMatches = matches.length > 0;
  if (hasMatches) themesWithMatches++;
  if (matches.length < 2) themesWithFewMatches.push({ theme, count: matches.length });

  const marker = matches.length >= 2 ? "✓" : matches.length === 1 ? "⚠" : "✗";
  console.log(`${marker} ${theme.padEnd(22)} ${String(matches.length).padStart(3)} skins`);

  // Show 2 random samples + the URL we'd build
  const sample = [...matches].sort(() => Math.random() - 0.5).slice(0, 2);
  for (const m of sample) {
    const url = `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${m.champId}_${m.skinNum}.jpg`;
    console.log(`    "${m.skinName}" → ${url}`);
  }
  console.log();
}

console.log("──────── SUMMARY ────────");
console.log(`Themes with ≥1 match: ${themesWithMatches}/${totalThemes}`);
if (themesWithFewMatches.length > 0) {
  console.log(`Themes with <2 matches (would have to fall back to blurb-only or 1 image):`);
  for (const t of themesWithFewMatches) {
    console.log(`  - ${t.theme}: ${t.count}`);
  }
}

// Spot-check: actually fetch a few URLs to confirm DDragon returns valid images
console.log("\n──────── URL VALIDATION (HEAD checks on 3 random samples) ────────");
const checks = ["Star Guardian", "Elderwood", "Cafe Cuties"];
for (const theme of checks) {
  const matches = findSkinsForTheme(theme);
  if (matches.length === 0) continue;
  const m = matches[Math.floor(Math.random() * matches.length)];
  const url = `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${m.champId}_${m.skinNum}.jpg`;
  const r = await fetch(url, { method: "HEAD" });
  const sz = r.headers.get("content-length");
  console.log(
    `${theme.padEnd(22)} ${r.ok ? "✓" : "✗"}  ${r.status}  ${sz ? `${(parseInt(sz) / 1024).toFixed(0)} KB` : "?"}  ${m.skinName}`,
  );
}
