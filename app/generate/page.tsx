"use client";

import { useState } from "react";

type ApiResponse =
  | {
      ok: true;
      kind: "base64";
      image_base64: string;
      image_url?: string;
      byte_size?: number;
    }
  | { ok: true; kind: "url"; image_url: string; note?: string }
  | {
      ok: false;
      kind: string;
      error: string;
      response_text?: string;
    };

type Provider = "pollinations" | "gemini";

export default function GeneratePage() {
  const [prompt, setPrompt] = useState("");
  const [provider, setProvider] = useState<Provider>("pollinations");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [elapsed, setElapsed] = useState(0);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setResult(null);
    setElapsed(0);

    const start = Date.now();
    const tick = setInterval(
      () => setElapsed(Math.round((Date.now() - start) / 1000)),
      1000,
    );

    const endpoint =
      provider === "gemini" ? "/api/generate-image" : "/api/generate-pollinations";

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = (await res.json()) as ApiResponse;
      setResult(data);
    } catch (err) {
      setResult({
        ok: false,
        kind: "network",
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      clearInterval(tick);
      setLoading(false);
    }
  }

  const imageSrc =
    result && result.ok
      ? result.kind === "base64"
        ? result.image_base64
        : result.image_url
      : null;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Image generation test</h1>
        <p className="mt-1 text-sm text-gray-600">
          Pollinations (gpt-image-2) is fast. Gemini (nano banana pro, cookie-authenticated)
          takes 30–90s per generation.
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <fieldset className="flex gap-4 text-sm" disabled={loading}>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="provider"
              value="pollinations"
              checked={provider === "pollinations"}
              onChange={() => setProvider("pollinations")}
            />
            <span>Pollinations (gpt-image-2)</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="provider"
              value="gemini"
              checked={provider === "gemini"}
              onChange={() => setProvider("gemini")}
            />
            <span>Gemini (nano banana pro)</span>
          </label>
        </fieldset>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the image you want..."
          rows={4}
          className="w-full rounded border border-gray-300 p-3 font-mono text-sm"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !prompt.trim()}
          className="self-start rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? `Generating... ${elapsed}s` : "Generate"}
        </button>
      </form>

      {result && !result.ok && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm">
          <div className="font-semibold">
            Error ({result.kind})
          </div>
          <div className="mt-1 text-red-900">{result.error}</div>
          {result.response_text && (
            <details className="mt-2 text-xs text-gray-700">
              <summary className="cursor-pointer">Model response text</summary>
              <pre className="mt-2 overflow-auto whitespace-pre-wrap">
                {result.response_text}
              </pre>
            </details>
          )}
          <div className="mt-2 text-xs text-gray-600">
            {result.kind === "auth" &&
              "Cookies rejected. Likely cookie/IP binding — the cookies were minted on a different IP than Vercel's edge. See docs/gemini-cookies.md."}
            {result.kind === "empty" &&
              "Request succeeded but returned no image. Usually a geo-block — verify vercel.json regions is iad1."}
            {result.kind === "config" &&
              "GEMINI_PSID / GEMINI_PSIDTS env vars are not set on the deployment."}
            {result.kind === "generate" &&
              "Model call threw. If 'unknown model', your account may not have Pro tier."}
          </div>
        </div>
      )}

      {imageSrc && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={imageSrc}
          alt={prompt}
          className="w-full rounded border border-gray-200"
        />
      )}
    </main>
  );
}
