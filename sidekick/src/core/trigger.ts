/**
 * HYBRID stage 1: a cheap, no-LLM gate that decides whether a finalized utterance is
 * worth paying for a Gemini call. Stage 2 (the agent) makes the smart final decision and
 * can still return no_action.
 *
 * Passes utterances that look like a question about leads/CRM, dropping only near-identical
 * repeats (e.g. STT re-emitting the same line) within a short window. Distinct questions
 * always pass, even back-to-back.
 */
const LEAD_KEYWORDS =
  /(which|who|whose|do (?:they|we|you)|does|did|have we|has|status|interest|interested|linkedin|out\s?bound|reach(?:ed)? out|contact|engaged|qualif|score|deal)/i;

const DEDUP_WINDOW_MS = 5000;

let lastUtterance = "";
let lastFiredAt = 0;

export function isActionable(utterance: string, now: number = Date.now()): boolean {
  const u = utterance.trim();
  if (!u) return false;

  const looksLikeQuestion = u.endsWith("?") || LEAD_KEYWORDS.test(u);
  if (!looksLikeQuestion) return false;

  // Drop identical repeats within a short window; allow distinct questions through.
  if (u.toLowerCase() === lastUtterance.toLowerCase() && now - lastFiredAt < DEDUP_WINDOW_MS) {
    return false;
  }

  lastUtterance = u;
  lastFiredAt = now;
  return true;
}

/** Reset internal state (used by tests). */
export function _resetTrigger(): void {
  lastUtterance = "";
  lastFiredAt = 0;
}
