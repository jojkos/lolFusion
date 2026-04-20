import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { put } from "@vercel/blob";
import { THEMES } from "@/lib/constants";

export const maxDuration = 300;

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

    // 4. Image Generation (Nano Banana Pro via /api/generate-image)
    try {
      const origin = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000";

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
        headers["x-vercel-protection-bypass"] =
          process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
      }

      console.log("Calling /api/generate-image...");
      const genRes = await fetch(`${origin}/api/generate-image`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          prompt: prompt.slice(0, 4000),
          reference_images: [
            `data:image/jpeg;base64,${base64A}`,
            `data:image/jpeg;base64,${base64B}`,
          ],
        }),
      });

      if (!genRes.ok) {
        const errBody = await genRes.text();
        throw new Error(
          `generate-image failed: ${genRes.status} ${errBody.slice(0, 500)}`,
        );
      }

      const genJson = (await genRes.json()) as
        | { ok: true; kind: "base64"; image_base64: string }
        | { ok: true; kind: "url"; image_url: string }
        | { ok: false; kind: string; error: string };

      if (!genJson.ok) {
        throw new Error(
          `generate-image kind=${genJson.kind}: ${genJson.error}`,
        );
      }

      let imageBuffer: Buffer;
      if (genJson.kind === "base64") {
        const comma = genJson.image_base64.indexOf(",");
        const b64 =
          comma >= 0
            ? genJson.image_base64.slice(comma + 1)
            : genJson.image_base64;
        imageBuffer = Buffer.from(b64, "base64");
      } else {
        const imgRes = await fetch(genJson.image_url);
        if (!imgRes.ok) {
          throw new Error(`Fetching image_url failed: ${imgRes.status}`);
        }
        imageBuffer = Buffer.from(await imgRes.arrayBuffer());
      }

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
