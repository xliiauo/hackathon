/**
 * HYBRID stage 1: a cheap, no-LLM gate. Sidekick "kicks in" when an utterance CONTAINS a trigger
 * word — by default "forgot" or "don't know" (e.g. "I forgot if…", "I actually don't know…").
 * Everything else is ignored. Stage 2 (the agent) still makes the final call and can return no_action.
 *
 * Override with SIDEKICK_TRIGGERS (pipe-separated), e.g.
 *   SIDEKICK_TRIGGERS="forgot|don't know|remind me"
 */
const DEFAULT_TRIGGERS = ["forgot", "don't know", "dont know"];

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

  // Trigger when the utterance CONTAINS one of the trigger words.
  if (!TRIGGERS.some((t) => norm.includes(t))) return false;

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
