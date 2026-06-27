import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "../config";

let counter = 0;

/** Call SLNG TTS and return the raw audio (WAV) bytes. */
export async function synthesize(text: string): Promise<Buffer> {
  if (!config.slng.apiKey) throw new Error("SLNG_API_KEY not set");

  const url = `${config.slng.baseUrl}/tts/${config.slng.ttsModel}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.slng.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text, voice: config.slng.ttsVoice }),
  });
  if (!res.ok) throw new Error(`SLNG TTS ${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Speak text aloud via SLNG TTS → (optional sox speed-up) → macOS `afplay`. */
export async function speak(text: string): Promise<void> {
  if (!config.slng.apiKey || !text.trim()) return;

  const audio = await synthesize(text);
  const base = join(tmpdir(), `sidekick-tts-${process.pid}-${counter++}`);
  const raw = `${base}.wav`;
  await writeFile(raw, audio);

  let file = raw;
  const speed = config.slng.ttsSpeed;
  if (speed && speed !== 1) {
    const fast = `${base}-x${speed}.wav`;
    if (await tempo(raw, fast, speed)) file = fast; // fall back to raw if sox fails
  }
  await play(file);
}

/** Time-stretch a WAV with sox (pitch-preserving). Returns false if sox isn't available/fails. */
function tempo(input: string, output: string, factor: number): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn("sox", [input, output, "tempo", String(factor)], { stdio: "ignore" });
    p.on("close", (code) => resolve(code === 0));
    p.on("error", () => resolve(false));
  });
}

function play(file: string): Promise<void> {
  return new Promise((resolve) => {
    const p = spawn("afplay", [file], { stdio: "ignore" });
    p.on("close", () => resolve());
    p.on("error", () => resolve()); // afplay missing (non-mac) → just skip playback
  });
}
