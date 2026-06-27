import "dotenv/config";
import readline from "node:readline";
import { config, useMockAttio } from "./config";
import { Transcript } from "./core/transcript";
import { isActionable } from "./core/trigger";
import { captureFrame } from "./capture/screen";
import { answer } from "./core/agent";
import { transcribePcm } from "./voice/stt";
import { startMic, soxAvailable } from "./voice/mic";
import { speak } from "./voice/tts";
import { closeAttio } from "./integrations/attio";
import * as out from "./ui/output";

const transcript = new Transcript(config.transcriptWindow);
const needsVision = !!config.google.apiKey && !config.mock;
// Use mic only when SLNG is configured and --text wasn't passed.
const textMode = process.argv.includes("--text") || !config.slng.apiKey;

// Serialize utterance handling so answers can't overlap and pending work drains before exit.
let work: Promise<void> = Promise.resolve();
function enqueue(fn: () => Promise<void>): void {
  work = work.then(fn).catch((e) => out.printStatus(`error: ${(e as Error).message}`));
}

async function handleUtterance(text: string): Promise<void> {
  const t = text.trim();
  if (!t) return;
  out.printHeard(t);
  transcript.add(t);

  // Stage 1: cheap gate.
  if (!isActionable(t)) return;

  out.printStatus("Sidekick is checking…");
  const jpeg = needsVision ? await captureFrame() : "";
  // Stage 2: the model (or offline brain) decides + looks up.
  const ans = await answer({ jpegBase64: jpeg, transcript: transcript.recent() });
  if (!ans) {
    out.printStatus("(nothing actionable on screen)");
    return;
  }
  out.renderAnswer(ans);
  await speak(ans.spoken);
}

function startTextMode(): void {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "› " });
  let closed = false;
  rl.prompt();
  rl.on("line", (line) => {
    enqueue(async () => {
      await handleUtterance(line);
      if (!closed) rl.prompt();
    });
  });
  rl.on("close", async () => {
    closed = true;
    await work;
    await shutdown();
  });
}

function startMicMode(): void {
  const mic = startMic({
    onUtterance: (pcm) =>
      enqueue(async () => {
        const text = await transcribePcm(pcm);
        if (text) await handleUtterance(text);
      }),
    onError: (err) => out.printStatus(`mic error: ${err.message}`),
  });
  process.on("SIGINT", () => {
    mic.stop();
    void (async () => {
      await work;
      await shutdown();
    })();
  });
}

async function shutdown(): Promise<void> {
  await closeAttio();
  process.exit(0);
}

function main(): void {
  out.printBanner();
  out.printStatus(`vision: ${needsVision ? "Gemini (" + config.model + ")" : "offline name-match (no GOOGLE_API_KEY)"}`);
  out.printStatus(`voice:  ${config.slng.apiKey ? "SLNG (STT+TTS)" : "text input, no speech (no SLNG_API_KEY)"}`);
  out.printStatus(`attio:  ${useMockAttio ? "MOCK fixtures" : "live MCP"}`);

  const hint = 'Sidekick kicks in when you start with "I forgot…" or "I actually don\'t know…".';

  if (textMode) {
    out.printStatus(`Text mode. ${hint} Ctrl-C to quit.\n`);
    startTextMode();
  } else if (!soxAvailable()) {
    out.printStatus("`sox` not found — run `brew install sox` to enable voice. Falling back to text mode.\n");
    startTextMode();
  } else {
    out.printStatus(`Listening on the mic. ${hint} Ctrl-C to quit.\n`);
    startMicMode();
  }
}

main();
