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

async function refinePrompt(
  basePrompt: string,
  base64A: string,
  base64B: string,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("GEMINI_API_KEY not set — skipping refinement");
    return basePrompt;
  }

  const genAI = new GoogleGenAI({ apiKey });

  try {
    const res = await genAI.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: "Refine this image prompt for an AI image generator. Use the two reference images provided to add concrete visual detail about both characters. IMPORTANT: Return ONLY the refined prompt text. Do NOT return JSON. Do NOT use tools.",
            },
            { text: basePrompt },
            { inlineData: { mimeType: "image/jpeg", data: base64A } },
            { inlineData: { mimeType: "image/jpeg", data: base64B } },
          ],
        },
      ],
    });

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

    // 3. Prepare Prompt & Images
    const base64A = await fetchImageBase64(champAImage);
    const base64B = await fetchImageBase64(champBImage);

    const prompt = `Generate a high-fidelity, cinematic splash art of a single fused character that combines the physical traits of League of Legends champions ${champA.name} and ${champB.name}.
    
    Reference Images Provided:
    1. ${champA.name} (Base appearance)
    2. ${champB.name} (Base appearance)
    
    Constraints:
    Fusion: The character must seamlessly blend features of both. It must look like one coherent entity, not two people.
    Theme: Rigidly apply the visual markers, materials, and VFX of the ${theme} universe (e.g. skin line).
    Clean: No text, logos, or UI elements.
    Composition: Center the character. High resolution, detailed background appropriate for a splash art.`;

    // 4. Refine prompt with gemini-3-flash-preview (multimodal)
    const refinedPrompt = await refinePrompt(prompt, base64A, base64B);
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
