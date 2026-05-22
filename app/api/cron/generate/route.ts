import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { put } from "@vercel/blob";
import { GoogleGenAI } from "@google/genai";
import { THEMES } from "@/lib/constants";
import {
  generateWithGemini,
  generateWithPollinations,
  getProvider,
} from "@/lib/image-providers";

export const maxDuration = 300;

type ChampionLore = {
  name: string;
  title: string;
  lore: string;
  tags: string[];
  allytips: string[];
};

async function refinePrompt(
  basePrompt: string,
  theme: string,
  loreA: ChampionLore,
  loreB: ChampionLore,
  base64A: string,
  base64B: string,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("GEMINI_API_KEY not set — skipping refinement");
    return basePrompt;
  }

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

Base prompt to refine:
${basePrompt}

Guidance:
- Use the provided lore as a starting point. ALSO leverage your own knowledge of these champions, the Arcane TV show, official skin universes (Star Guardian, PROJECT, Pulsefire, Spirit Blossom, etc.), regional details (Piltover, Zaun, Ionia, Demacia, Noxus, Shurima, etc.), companions/pets, and signature abilities. Use Google Search when you need to confirm or enrich details, especially for less famous champions or recent releases.
- Pick 2–3 small recognizable hints per champion. Examples of good hints: signature weapons (Jinx's shark-grinned rocket, Senna's relic cannon, Ekko's Zero Drive), iconic companions (Yuumi's book, Annie's Tibbers, Kindred's lamb mask), faction motifs (Noxian banners, Ionian cherry blossoms, Piltover gears, Zaun pipes), characteristic VFX colors, or skin-line motifs.
- Reinterpret all hints through the "${theme}" skin universe — keep the theme's materials, palette, and VFX language dominant, but bend the hints to fit (e.g., a Star Guardian variant of a champion's signature weapon).
- Hints should be visually evocative but stop short of literal in-image text or champion name labels.
- The fused character itself remains ONE coherent entity blending the physical traits of both champions (hair, eye color, skin tone, body type, armor silhouette). Use the two reference images for physical anchors.
- Composition: cinematic splash art, centered character, detailed background full of hint props.
- ABSOLUTELY NO TEXT IN THE IMAGE: the refined prompt MUST end with an explicit, forceful exclusion of every form of text — "no text, no letters, no numbers, no words, no signature, no artist signature, no watermark, no logo, no UI elements, no captions, no labels, no subtitles." Reiterate this constraint at the end of the prompt verbatim so the image model honors it.

Return ONLY the refined image-generation prompt as plain text. No JSON, no preamble, no explanation, no markdown.`;

  const contents = [
    {
      role: "user",
      parts: [
        { text: instruction },
        { inlineData: { mimeType: "image/jpeg", data: base64A } },
        { inlineData: { mimeType: "image/jpeg", data: base64B } },
      ],
    },
  ];

  try {
    // Try with Google Search grounding first; if quota-exhausted, retry without.
    let res;
    try {
      res = await genAI.models.generateContent({
        model: "gemini-3.5-flash",
        contents,
        config: { tools: [{ googleSearch: {} }] },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isQuota = /429|RESOURCE_EXHAUSTED|quota/i.test(msg);
      if (!isQuota) throw e;
      console.warn(
        "Grounding quota exhausted — retrying refinement without googleSearch",
      );
      res = await genAI.models.generateContent({
        model: "gemini-3.5-flash",
        contents,
      });
    }

    const rawText = res.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const trimmed = rawText.trim();
    if (!trimmed) return basePrompt;

    // The model occasionally ignores instructions and returns JSON like
    // { prompt: "..." } or { action_input: { prompt: "..." } }
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
  } catch (e) {
    console.error("Gemini refinement failed:", e);
    return basePrompt;
  }
}

// Helper to fetch latest DDragon version
async function getLatestVersion(): Promise<string> {
  const res = await fetch(
    "https://ddragon.leagueoflegends.com/api/versions.json",
  );
  const versions = await res.json();
  return versions[0];
}

// Helper to fetch champion list
async function getChampions(version: string) {
  const res = await fetch(
    `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`,
  );
  const data = await res.json();
  return data.data; // format: { Aatrox: { ... }, Ahri: { ... } }
}

// Helper to fetch full per-champion detail (includes lore, tags, allytips, skins)
async function getChampionDetail(
  version: string,
  id: string,
): Promise<ChampionLore> {
  const res = await fetch(
    `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion/${id}.json`,
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch champion detail for ${id}: ${res.status}`);
  }
  const data = await res.json();
  const d = data.data[id];
  return {
    name: d.name,
    title: d.title,
    lore: d.lore,
    tags: d.tags ?? [],
    allytips: d.allytips ?? [],
  };
}

// Helper to fetch splash art as base64
async function fetchImageBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${url}`);
  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}

export async function GET(request: NextRequest) {
  // Security Check
  const authHeader = request.headers.get("authorization");
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");

  if (
    authHeader !== `Bearer ${process.env.CRON_SECRET}` &&
    secret !== process.env.CRON_SECRET &&
    secret !== process.env.ADMIN_SECRET
  ) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    // 0. Idempotency — skip if today's puzzle was already generated.
    // The cron is scheduled multiple times per day as retries; the first
    // successful run wins, later ones no-op.
    const today = new Date().toISOString().split("T")[0];
    const existing = await kv.get(`puzzle:${today}`);
    if (existing) {
      return NextResponse.json({ success: true, skipped: true, data: existing });
    }

    // 1. Data Fetching
    const version = await getLatestVersion();
    const championsMap = await getChampions(version);
    const championKeys = Object.keys(championsMap);

    // 2. Selection
    const champAKey =
      championKeys[Math.floor(Math.random() * championKeys.length)];
    let champBKey =
      championKeys[Math.floor(Math.random() * championKeys.length)];

    // Ensure A != B
    while (champAKey === champBKey) {
      champBKey = championKeys[Math.floor(Math.random() * championKeys.length)];
    }

    const champA = championsMap[champAKey];
    const champB = championsMap[champBKey];

    // Get full splash (num 0 is default skin)
    // DDragon creates default splash url like: https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Aatrox_0.jpg
    const champAImage = `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${champA.id}_0.jpg`;
    const champBImage = `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${champB.id}_0.jpg`;

    const themeIndex = Math.floor(Math.random() * THEMES.length);
    const theme = THEMES[themeIndex];

    console.log(
      `Generating fusion: ${champA.name} + ${champB.name} in ${theme} style`,
    );

    // 3. Prepare Prompt, Images, and per-champion lore (in parallel)
    const [base64A, base64B, loreA, loreB] = await Promise.all([
      fetchImageBase64(champAImage),
      fetchImageBase64(champBImage),
      getChampionDetail(version, champA.id),
      getChampionDetail(version, champB.id),
    ]);

    const prompt = `Generate a high-fidelity, cinematic splash art of a single fused character that combines the physical traits of League of Legends champions ${champA.name} and ${champB.name}.

    Reference Images Provided:
    1. ${champA.name} (Base appearance)
    2. ${champB.name} (Base appearance)

    Constraints:
    Fusion: The character must seamlessly blend features of both. It must look like one coherent entity, not two people.
    Theme: Rigidly apply the visual markers, materials, and VFX of the ${theme} universe (e.g. skin line).
    Hints: The background and surroundings should contain 2–3 small recognizable visual hints per champion (signature weapons, companions, faction motifs, region details, skin-universe references) to help players guess the fusion.
    Clean: Absolutely no text, no letters, no numbers, no words, no signature, no artist signature, no watermark, no logo, no UI elements, no captions, no labels, no subtitles anywhere in the image.
    Composition: Center the character. High resolution, detailed background appropriate for a splash art.`;

    // 4. Refine prompt with gemini-3.5-flash (multimodal + grounded via Google Search)
    const refinedPrompt = await refinePrompt(
      prompt,
      theme,
      loreA,
      loreB,
      base64A,
      base64B,
    );
    console.log("Refined prompt:", refinedPrompt.slice(0, 300));

    // 5. Image Generation — provider selected by IMAGE_PROVIDER env var
    try {
      const provider = getProvider();
      console.log(`Generating image via provider: ${provider}`);

      const imageBuffer =
        provider === "gemini"
          ? await generateWithGemini(refinedPrompt, [base64A, base64B])
          : await generateWithPollinations(refinedPrompt);

      // 6. Save to Vercel Blob
      const date = new Date().toISOString().split("T")[0];

      // We use allowOverwrite: true to let us regenerate the daily puzzle if needed
      // without manual deletion.
      const blob = await put(`fusion-${date}.png`, imageBuffer, {
        access: "public",
        contentType: "image/png",
        addRandomSuffix: false,
        token: process.env.BLOB_READ_WRITE_TOKEN,
        allowOverwrite: true,
      });

      // 7. Save State
      const dailyData = {
        champA: champA.name,
        champB: champB.name,
        theme,
        // Append timestamp to bust CDN cache since we overwrite the file
        imageUrl: `${blob.url}?t=${Date.now()}`,
        date,
      };

      await kv.set("daily_puzzle", dailyData);
      await kv.set(`puzzle:${date}`, dailyData);

      return NextResponse.json({ success: true, data: dailyData });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("Image Generation failed:", e);
      return NextResponse.json(
        { success: false, error: `Image Generation failed: ${message}` },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error("Error generating fusion:", error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}
