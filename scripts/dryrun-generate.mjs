// Dry-run the new generate pipeline locally.
// Reproduces the logic from app/api/cron/generate/route.ts but:
//   - does NOT write to Vercel KV
//   - does NOT write to Vercel Blob
//   - writes the final image to /tmp and opens it in Preview
//
// Usage:
//   node scripts/dryrun-generate.mjs                 # random pair, random theme
//   node scripts/dryrun-generate.mjs Jinx Yasuo      # fixed pair, random theme
//   node scripts/dryrun-generate.mjs Jinx Yasuo "Star Guardian"

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";

// --- tiny .env loader ---------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  const txt = fs.readFileSync(envPath, "utf8");
  for (const line of txt.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2];
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}

// --- constants (mirror lib/constants.ts) --------------------------------
// The script reads them straight from the TS source by extracting the
// THEME_REFERENCES object literal — keeps the script in sync with the
// production constants without duplication.
const constantsSrc = fs.readFileSync(
  path.join(__dirname, "..", "lib", "constants.ts"),
  "utf8",
);
const themeRefMatch = constantsSrc.match(
  /export const THEME_REFERENCES[\s\S]*?=\s*(\{[\s\S]*?\n\});/,
);
if (!themeRefMatch) {
  throw new Error("Could not extract THEME_REFERENCES from lib/constants.ts");
}
// Safe-ish eval: the THEME_REFERENCES literal is plain data (strings, null).
// We strip TS-only type annotations the regex may have matched on.
const THEME_REFERENCES = new Function(`return (${themeRefMatch[1]});`)();
const THEMES = Object.keys(THEME_REFERENCES);

// --- DDragon helpers ----------------------------------------------------
async function getLatestVersion() {
  const r = await fetch("https://ddragon.leagueoflegends.com/api/versions.json");
  return (await r.json())[0];
}

async function getChampions(version) {
  const r = await fetch(
    `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`,
  );
  return (await r.json()).data;
}

async function getChampionDetail(version, id) {
  const r = await fetch(
    `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion/${id}.json`,
  );
  if (!r.ok) throw new Error(`detail ${id}: ${r.status}`);
  const d = (await r.json()).data[id];
  return {
    name: d.name,
    title: d.title,
    lore: d.lore,
    tags: d.tags ?? [],
    allytips: d.allytips ?? [],
  };
}

async function fetchImageBase64(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url}: ${r.status}`);
  return Buffer.from(await r.arrayBuffer()).toString("base64");
}

// Scan DDragon championFull.json for splash arts whose skin name startsWith
// the theme. Returns up to `limit` random URLs, excluding the two puzzle
// champions.
async function getThemeSkinSplashes(version, theme, excludeIds, limit = 2) {
  const r = await fetch(
    `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/championFull.json`,
  );
  if (!r.ok) return [];
  const champs = (await r.json()).data;
  const themeLower = theme.toLowerCase();
  const excluded = new Set(excludeIds);
  const matches = [];
  for (const champ of Object.values(champs)) {
    if (excluded.has(champ.id)) continue;
    for (const skin of champ.skins) {
      if (skin.parentSkin) continue;
      if (skin.name.toLowerCase().startsWith(themeLower)) {
        matches.push({ champId: champ.id, skinNum: skin.num, name: skin.name });
      }
    }
  }
  for (let i = matches.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [matches[i], matches[j]] = [matches[j], matches[i]];
  }
  return matches.slice(0, limit).map((m) => ({
    url: `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${m.champId}_${m.skinNum}.jpg`,
    name: m.name,
  }));
}

// --- refine prompt (mirrors route.ts) -----------------------------------
async function refinePrompt(
  basePrompt,
  theme,
  themeBlurb,
  loreA,
  loreB,
  b64A,
  b64B,
  themeSkinSplashesB64,
) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");

  const genAI = new GoogleGenAI({ apiKey });

  const instruction = `You are crafting an image-generation prompt for a "guess the two fused League of Legends champions" puzzle. The image should make the puzzle fun and somewhat guessable by embedding small, recognizable visual hints from each champion's lore, signature weapons/props, region/faction, companions, or skin universe — woven into the background, props, and secondary VFX.

Champion A — ${loreA.name}, ${loreA.title}
Tags: ${loreA.tags.join(", ")}
Lore: ${loreA.lore}
Gameplay flavor: ${loreA.allytips.join(" | ")}

Champion B — ${loreB.name}, ${loreB.title}
Tags: ${loreB.tags.join(", ")}
Lore: ${loreB.lore}
Gameplay flavor: ${loreB.allytips.join(" | ")}

Skin theme to apply: ${theme}
Theme visual style guide: ${themeBlurb}${themeSkinSplashesB64.length > 0 ? `\n\n${themeSkinSplashesB64.length} additional reference image${themeSkinSplashesB64.length > 1 ? "s are" : " is"} provided showing official Riot splash art${themeSkinSplashesB64.length > 1 ? "s" : ""} of OTHER champions in the "${theme}" skinline. Treat ${themeSkinSplashesB64.length > 1 ? "these" : "this"} as the AUTHORITATIVE source for the theme's palette, materials, costuming, silhouettes, and VFX language — but do NOT copy the other characters themselves. Apply only the skinline's aesthetic to the fused character.` : ""}

Base prompt to refine:
${basePrompt}

Guidance:
- Use the provided lore as a starting point. ALSO leverage your own knowledge of these champions, the Arcane TV show, official skin universes (Star Guardian, PROJECT, Pulsefire, Spirit Blossom, etc.), regional details (Piltover, Zaun, Ionia, Demacia, Noxus, Shurima, etc.), companions/pets, and signature abilities. Use Google Search when you need to confirm or enrich details, especially for less famous champions or recent releases.
- Pick 2–3 small recognizable hints per champion. Examples of good hints: signature weapons (Jinx's shark-grinned rocket, Senna's relic cannon, Ekko's Zero Drive), iconic companions (Yuumi's book, Annie's Tibbers, Kindred's lamb mask), faction motifs (Noxian banners, Ionian cherry blossoms, Piltover gears, Zaun pipes), characteristic VFX colors, or skin-line motifs.
- Reinterpret all hints through the "${theme}" skin universe — match the palette, materials, and VFX language from the theme visual style guide${themeSkinSplashesB64.length > 0 ? " and the additional skinline reference image(s)" : ""}. Bend the hints to fit the theme (e.g., a Star Guardian variant of a champion's signature weapon).
- Hints should be visually evocative but stop short of literal in-image text or champion name labels.
- The fused character itself remains ONE coherent entity blending the physical traits of both champions (hair, eye color, skin tone, body type, armor silhouette). Use the FIRST TWO reference images for physical anchors${themeSkinSplashesB64.length > 0 ? `; the remaining ${themeSkinSplashesB64.length} reference image${themeSkinSplashesB64.length > 1 ? "s show" : " shows"} the skinline aesthetic only — do not let those characters appear in the output` : ""}.
- Composition: cinematic splash art, centered character, detailed background full of hint props.
- ABSOLUTELY NO TEXT IN THE IMAGE: the refined prompt MUST end with an explicit, forceful exclusion of every form of text — "no text, no letters, no numbers, no words, no signature, no artist signature, no watermark, no logo, no UI elements, no captions, no labels, no subtitles." Reiterate this constraint at the end of the prompt verbatim so the image model honors it.

Return ONLY the refined image-generation prompt as plain text. No JSON, no preamble, no explanation, no markdown.`;

  const parts = [
    { text: instruction },
    { inlineData: { mimeType: "image/jpeg", data: b64A } },
    { inlineData: { mimeType: "image/jpeg", data: b64B } },
  ];
  for (const b64 of themeSkinSplashesB64) {
    parts.push({ inlineData: { mimeType: "image/jpeg", data: b64 } });
  }
  const contents = [{ role: "user", parts }];

  let res;
  try {
    res = await genAI.models.generateContent({
      model: "gemini-3.5-flash",
      contents,
      config: { tools: [{ googleSearch: {} }] },
    });
    console.log("[grounding] enabled");
  } catch (e) {
    const msg = e?.message || String(e);
    const isQuota = /429|RESOURCE_EXHAUSTED|quota/i.test(msg);
    if (!isQuota) throw e;
    console.warn("[grounding] quota exhausted — retrying without googleSearch");
    res = await genAI.models.generateContent({
      model: "gemini-3.5-flash",
      contents,
    });
  }

  const meta = res.candidates?.[0]?.groundingMetadata;
  if (meta?.webSearchQueries?.length) {
    console.log("\n[grounding] search queries:", meta.webSearchQueries);
  }

  const rawText = res.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const trimmed = rawText.trim();
  if (!trimmed) return basePrompt;

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      const nested =
        typeof parsed.action_input === "string"
          ? JSON.parse(parsed.action_input)
          : parsed.action_input;
      return nested?.prompt || parsed.prompt || trimmed;
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

// --- gemini "nano banana pro" via prod /api/generate-image --------------
// The image-gen endpoint is a Vercel Python serverless function backed by
// gemini-webapi (cookie-based Gemini web UI scraper). It can't run with
// plain `next dev`, so we POST to the deployed prod URL and authenticate
// using VERCEL_AUTOMATION_BYPASS_SECRET. This is the same path prod's
// cron uses via lib/image-providers.ts:generateWithGemini.
async function generateWithGeminiProd(prompt, referenceImagesBase64) {
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!bypass) {
    throw new Error("VERCEL_AUTOMATION_BYPASS_SECRET missing");
  }
  const origin = process.env.PROD_URL || "https://lol-fusion.vercel.app";

  const steered =
    "Generate an image. Output the image only — do not reply with text, do not describe the image in words, do not ask follow-up questions. " +
    prompt.slice(0, 4000);

  const res = await fetch(`${origin}/api/generate-image`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-vercel-protection-bypass": bypass,
    },
    body: JSON.stringify({
      prompt: steered,
      reference_images: referenceImagesBase64.map(
        (b) => `data:image/jpeg;base64,${b}`,
      ),
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`generate-image ${res.status}: ${t.slice(0, 500)}`);
  }

  const json = await res.json();
  if (!json.ok) {
    throw new Error(`generate-image kind=${json.kind}: ${json.error}`);
  }

  if (json.kind === "base64") {
    const comma = json.image_base64.indexOf(",");
    const b64 =
      comma >= 0 ? json.image_base64.slice(comma + 1) : json.image_base64;
    return Buffer.from(b64, "base64");
  }

  const imgRes = await fetch(json.image_url);
  if (!imgRes.ok) {
    throw new Error(`Fetching image_url failed: ${imgRes.status}`);
  }
  return Buffer.from(await imgRes.arrayBuffer());
}

// --- pollinations image gen ---------------------------------------------
// Tries the paid endpoint (gen.pollinations.ai/image/...) first when an
// API key with balance is available. Falls back to the free anonymous
// endpoint (image.pollinations.ai/prompt/...) for local dry runs.
async function generateWithPollinations(prompt) {
  const apiKey = process.env.POLLINATIONS_API_KEY || "";
  const capped = prompt.slice(0, 2000);
  const encoded = encodeURIComponent(capped);

  if (apiKey) {
    const params = new URLSearchParams({
      model: "gpt-image-2",
      width: "2560",
      height: "1440",
      quality: "hd",
      seed: "1",
      key: apiKey,
    });
    const url = `https://gen.pollinations.ai/image/${encoded}?${params.toString()}`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    const t = await r.text();
    console.warn(
      `Paid pollinations failed (${r.status}: ${t.slice(0, 120)}), falling back to free endpoint`,
    );
  }

  const params = new URLSearchParams({
    width: "1280",
    height: "720",
    nologo: "true",
    seed: "1",
  });
  const url = `https://image.pollinations.ai/prompt/${encoded}?${params.toString()}`;
  const r = await fetch(url);
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Pollinations free ${r.status}: ${t.slice(0, 300)}`);
  }
  return Buffer.from(await r.arrayBuffer());
}

// --- main ---------------------------------------------------------------
async function main() {
  const [argA, argB, argTheme] = process.argv.slice(2);

  console.log("→ Fetching DDragon catalog…");
  const version = await getLatestVersion();
  const champs = await getChampions(version);
  const keys = Object.keys(champs);

  function findKey(name) {
    if (!name) return null;
    const lower = name.toLowerCase();
    return keys.find(
      (k) => k.toLowerCase() === lower || champs[k].name.toLowerCase() === lower,
    );
  }

  let aKey = findKey(argA) || keys[Math.floor(Math.random() * keys.length)];
  let bKey = findKey(argB) || keys[Math.floor(Math.random() * keys.length)];
  while (bKey === aKey) bKey = keys[Math.floor(Math.random() * keys.length)];

  const theme =
    (argTheme && THEMES.find((t) => t.toLowerCase() === argTheme.toLowerCase())) ||
    THEMES[Math.floor(Math.random() * THEMES.length)];

  const champA = champs[aKey];
  const champB = champs[bKey];

  console.log(`\nVersion: ${version}`);
  console.log(`Champion A: ${champA.name} (${champA.id})`);
  console.log(`Champion B: ${champB.name} (${champB.id})`);
  console.log(`Theme:      ${theme}\n`);

  const splashA = `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${champA.id}_0.jpg`;
  const splashB = `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${champB.id}_0.jpg`;

  const themeBlurb = THEME_REFERENCES[theme]?.blurb || "";

  console.log("→ Fetching lore + splash images + skinline reference splashes…");
  const [b64A, b64B, loreA, loreB, themeSkinSplashes] = await Promise.all([
    fetchImageBase64(splashA),
    fetchImageBase64(splashB),
    getChampionDetail(version, champA.id),
    getChampionDetail(version, champB.id),
    getThemeSkinSplashes(version, theme, [champA.id, champB.id], 2).catch(
      (e) => {
        console.warn(`Skinline splash scan failed (${e.message}) — proceeding blurb-only`);
        return [];
      },
    ),
  ]);

  if (themeSkinSplashes.length > 0) {
    console.log(`   skinline references for ${theme}:`);
    for (const s of themeSkinSplashes) console.log(`     - ${s.name} → ${s.url}`);
  } else {
    console.log(`   no skinline splashes found for ${theme} (blurb-only)`);
  }

  const themeSkinSplashesB64 = (
    await Promise.all(
      themeSkinSplashes.map((s) =>
        fetchImageBase64(s.url).catch((e) => {
          console.warn(`Skinline splash fetch failed (${s.url}):`, e.message);
          return null;
        }),
      ),
    )
  ).filter(Boolean);

  const basePrompt = `Generate a high-fidelity, cinematic splash art of a single fused character that combines the physical traits of League of Legends champions ${champA.name} and ${champB.name}.

    Reference Images Provided:
    1. ${champA.name} (Base appearance)
    2. ${champB.name} (Base appearance)

    Constraints:
    Fusion: The character must seamlessly blend features of both. It must look like one coherent entity, not two people.
    Theme: Rigidly apply the visual markers, materials, and VFX of the ${theme} universe (e.g. skin line).
    Hints: The background and surroundings should contain 2–3 small recognizable visual hints per champion (signature weapons, companions, faction motifs, region details, skin-universe references) to help players guess the fusion.
    Clean: Absolutely no text, no letters, no numbers, no words, no signature, no artist signature, no watermark, no logo, no UI elements, no captions, no labels, no subtitles anywhere in the image.
    Composition: Center the character. High resolution, detailed background appropriate for a splash art.`;

  console.log("\n========== BASE PROMPT ==========");
  console.log(basePrompt);

  console.log("\n→ Refining with gemini-3.5-flash + googleSearch grounding…");
  const refined = await refinePrompt(
    basePrompt,
    theme,
    themeBlurb,
    loreA,
    loreB,
    b64A,
    b64B,
    themeSkinSplashesB64,
  );

  console.log("\n========== REFINED PROMPT ==========");
  console.log(refined);
  console.log("====================================\n");

  // save the prompt to /tmp so we can copy it out
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = `/tmp/lolfusion-dryrun-${stamp}-${champA.id}-${champB.id}`;
  fs.writeFileSync(`${base}.prompt.txt`, refined);
  console.log(`Prompt saved: ${base}.prompt.txt`);

  // Choose image provider — defaults to "gemini" (prod path) to match
  // production output. Override with IMAGE_PROVIDER=pollinations for the
  // free Flux fallback.
  const provider = (process.env.IMAGE_PROVIDER || "gemini").toLowerCase();
  console.log(`\n→ Generating image via ${provider}…`);
  const img =
    provider === "pollinations"
      ? await generateWithPollinations(refined)
      : await generateWithGeminiProd(refined, [b64A, b64B]);
  const imgPath = `${base}.png`;
  fs.writeFileSync(imgPath, img);
  console.log(`Image saved:  ${imgPath}`);

  // open in macOS Preview
  spawn("open", [imgPath], { stdio: "ignore", detached: true }).unref();
}

main().catch((e) => {
  console.error("\n✗ Dry run failed:", e);
  process.exit(1);
});
