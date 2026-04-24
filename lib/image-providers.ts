export type ImageProvider = "pollinations" | "gemini";

export function getProvider(): ImageProvider {
  const v = (process.env.IMAGE_PROVIDER || "").toLowerCase();
  return v === "gemini" ? "gemini" : "pollinations";
}

export async function generateWithPollinations(prompt: string): Promise<Buffer> {
  const apiKey = process.env.POLLINATIONS_API_KEY || "";
  const capped = prompt.slice(0, 2000);
  const encoded = encodeURIComponent(capped);

  const params = new URLSearchParams({
    model: "gpt-image-2",
    width: "2560",
    height: "1440",
    quality: "hd",
    seed: "1",
  });
  if (apiKey) params.set("key", apiKey);

  const url = `https://gen.pollinations.ai/image/${encoded}?${params.toString()}`;

  const res = await fetch(url, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Pollinations failed: ${res.status} ${errText.slice(0, 500)}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

export async function generateWithGemini(
  prompt: string,
  referenceImagesBase64: string[],
): Promise<Buffer> {
  const origin = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    headers["x-vercel-protection-bypass"] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  }

  const res = await fetch(`${origin}/api/generate-image`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      prompt: prompt.slice(0, 4000),
      reference_images: referenceImagesBase64.map((b) => `data:image/jpeg;base64,${b}`),
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`generate-image failed: ${res.status} ${errBody.slice(0, 500)}`);
  }

  const json = (await res.json()) as
    | { ok: true; kind: "base64"; image_base64: string }
    | { ok: true; kind: "url"; image_url: string }
    | { ok: false; kind: string; error: string };

  if (!json.ok) {
    throw new Error(`generate-image kind=${json.kind}: ${json.error}`);
  }

  if (json.kind === "base64") {
    const comma = json.image_base64.indexOf(",");
    const b64 = comma >= 0 ? json.image_base64.slice(comma + 1) : json.image_base64;
    return Buffer.from(b64, "base64");
  }

  const imgRes = await fetch(json.image_url);
  if (!imgRes.ok) {
    throw new Error(`Fetching image_url failed: ${imgRes.status}`);
  }
  return Buffer.from(await imgRes.arrayBuffer());
}
