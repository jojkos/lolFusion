import { NextRequest, NextResponse } from "next/server";
import { generateWithPollinations } from "@/lib/image-providers";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  let body: { prompt?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, kind: "bad_request", error: "invalid JSON" },
      { status: 400 },
    );
  }

  const prompt = (body.prompt || "").trim();
  if (!prompt) {
    return NextResponse.json(
      { ok: false, kind: "bad_request", error: "prompt is required" },
      { status: 400 },
    );
  }

  try {
    const buf = await generateWithPollinations(prompt);
    const b64 = buf.toString("base64");
    return NextResponse.json({
      ok: true,
      kind: "base64",
      image_base64: `data:image/png;base64,${b64}`,
      byte_size: buf.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, kind: "generate", error: message },
      { status: 502 },
    );
  }
}
