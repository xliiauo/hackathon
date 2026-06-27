import { config } from "../config";
import { pcmToWav } from "./wav";

/** Transcribe one utterance (raw 16kHz mono PCM) via SLNG STT. */
export async function transcribePcm(pcm: Buffer): Promise<string> {
  return transcribeWav(pcmToWav(pcm, 16000, 1, 16));
}

/** Transcribe a WAV buffer via SLNG STT (HTTP multipart). */
export async function transcribeWav(wav: Buffer): Promise<string> {
  if (!config.slng.apiKey) throw new Error("SLNG_API_KEY not set");

  const form = new FormData();
  // Copy into a plain Uint8Array<ArrayBuffer> — Node Buffer isn't a valid BlobPart for TS DOM types.
  form.append("audio", new Blob([Uint8Array.from(wav)], { type: "audio/wav" }), "utterance.wav");

  const url = `${config.slng.baseUrl}/stt/${config.slng.sttModel}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.slng.apiKey}` },
    body: form,
  });
  if (!res.ok) throw new Error(`SLNG STT ${res.status}: ${await res.text()}`);

  const json = (await res.json()) as Record<string, unknown>;
  return extractTranscript(json);
}

/** SLNG proxies Deepgram-shaped JSON; tolerate a couple of nesting variants. */
function extractTranscript(json: Record<string, unknown>): string {
  const candidates: Array<unknown> = [
    json,
    (json as { result?: unknown }).result,
    (json as { data?: unknown }).data,
  ];
  for (const root of candidates) {
    const t = (root as any)?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
    if (typeof t === "string") return t.trim();
  }
  // Some TTS-style responses return { text }.
  const text = (json as { text?: unknown }).text;
  return typeof text === "string" ? text.trim() : "";
}
