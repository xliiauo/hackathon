import record from "node-record-lpcm16";

export interface MicHandlers {
  /** Fired once per detected utterance with its raw 16kHz mono PCM. */
  onUtterance: (pcm: Buffer) => void;
  onError?: (err: Error) => void;
}

const THRESHOLD = Number(process.env.MIC_THRESHOLD || 600); // int16 RMS speech/silence cutoff
const SILENCE_MS = 700; // trailing silence that ends an utterance
const MIN_SPEECH_MS = 300; // ignore blips shorter than this
const MAX_UTTERANCE_MS = 15000; // hard flush so we never buffer forever

/**
 * Capture the microphone and emit discrete utterances using simple energy-based VAD.
 * Requires `sox` (`brew install sox`).
 */
export function startMic(h: MicHandlers): { stop: () => void } {
  const rec = record.record({
    sampleRate: 16000,
    channels: 1,
    audioType: "raw",
    recorder: "sox",
    threshold: 0, // we do our own silence detection
  });

  let chunks: Buffer[] = [];
  let speaking = false;
  let silenceMs = 0;
  let speechMs = 0;
  let totalMs = 0;

  const reset = () => {
    chunks = [];
    speaking = false;
    silenceMs = 0;
    speechMs = 0;
    totalMs = 0;
  };

  const flush = () => {
    const had = speechMs;
    const pcm = Buffer.concat(chunks);
    reset();
    if (had >= MIN_SPEECH_MS && pcm.length > 0) h.onUtterance(pcm);
  };

  const stream = rec.stream();
  stream.on("data", (data: Buffer) => {
    const ms = (data.length / 2 / 16000) * 1000; // 16-bit mono samples → ms
    const loud = rms(data) > THRESHOLD;

    if (loud) {
      speaking = true;
      silenceMs = 0;
      speechMs += ms;
      chunks.push(data);
    } else if (speaking) {
      chunks.push(data);
      silenceMs += ms;
      if (silenceMs >= SILENCE_MS) flush();
    }

    if (speaking) {
      totalMs += ms;
      if (totalMs >= MAX_UTTERANCE_MS) flush();
    }
  });
  stream.on("error", (e: Error) => h.onError?.(e));

  return { stop: () => rec.stop() };
}

function rms(buf: Buffer): number {
  const n = Math.floor(buf.length / 2);
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const s = buf.readInt16LE(i * 2);
    sum += s * s;
  }
  return Math.sqrt(sum / n);
}
