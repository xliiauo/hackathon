/**
 * HYBRID stage 1: a cheap, no-LLM gate. Sidekick only "kicks in" when an utterance OPENS with
 * an explicit trigger phrase — by default "I forgot…" or "I actually don't know…". Everything
 * else (chit-chat, statements, other questions) is ignored. Stage 2 (the agent) still makes the
 * final call and can return no_action.
 *
 * Override the phrases with SIDEKICK_TRIGGERS (pipe-separated), e.g.
 *   SIDEKICK_TRIGGERS="i forgot|i can't remember|remind me"
 */
const DEFAULT_TRIGGERS = [
  "i forgot",
  "i actually don't know",
  "i actually dont know",
  "i don't know",
  "i dont know",
];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ") // strip punctuation, keep apostrophes
    .replace(/\s+/g, " ")
    .trim();
}

const TRIGGERS = (process.env.SIDEKICK_TRIGGERS ? process.env.SIDEKICK_TRIGGERS.split("|") : DEFAULT_TRIGGERS)
  .map(normalize)
  .filter(Boolean);

const DEDUP_WINDOW_MS = 5000;
let lastUtterance = "";
let lastFiredAt = 0;

export function isActionable(utterance: string, now: number = Date.now()): boolean {
  const norm = normalize(utterance);
  if (!norm) return false;

  // Trigger only when the utterance OPENS with one of the trigger phrases.
  if (!TRIGGERS.some((t) => norm.startsWith(t))) return false;

  // Drop identical repeats within a short window (e.g. STT re-emitting the same line).
  if (norm === lastUtterance && now - lastFiredAt < DEDUP_WINDOW_MS) return false;

  lastUtterance = norm;
  lastFiredAt = now;
  return true;
}

/** The active trigger phrases (for startup hints). */
export const triggerPhrases: string[] = TRIGGERS;

/** Reset internal state (used by tests). */
export function _resetTrigger(): void {
  lastUtterance = "";
  lastFiredAt = 0;
}
