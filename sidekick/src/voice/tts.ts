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

/** Speak text aloud via SLNG TTS → WAV → macOS `afplay`. No-op when SLNG isn't configured. */
export async function speak(text: string): Promise<void> {
  if (!config.slng.apiKey || !text.trim()) return;

  const audio = await synthesize(text);
  const file = join(tmpdir(), `sidekick-tts-${process.pid}-${counter++}.wav`);
  await writeFile(file, audio);
  await play(file);
}

function play(file: string): Promise<void> {
  return new Promise((resolve) => {
    const p = spawn("afplay", [file], { stdio: "ignore" });
    p.on("close", () => resolve());
    p.on("error", () => resolve()); // afplay missing (non-mac) → just skip playback
  });
}
