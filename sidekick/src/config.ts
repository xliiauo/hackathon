import "dotenv/config";

const env = process.env;

export const config = {
  google: {
    apiKey: env.GOOGLE_API_KEY || env.GEMINI_API_KEY || "",
  },
  model: env.GEMINI_MODEL || "gemini-2.5-flash",
  slng: {
    apiKey: env.SLNG_API_KEY || "",
    baseUrl: "https://api.slng.ai/v1/bridges/unmute",
    sttModel: env.SLNG_STT_MODEL || "slng/deepgram/nova:3-en",
    ttsModel: env.SLNG_TTS_MODEL || "slng/deepgram/aura:2-en",
    ttsVoice: env.SLNG_TTS_VOICE || "aura-2-theia-en",
  },
  attio: {
    apiKey: env.ATTIO_API_KEY || "",
    // Attio REST API (the official hosted MCP needs OAuth, which a read-only API key can't satisfy).
    apiBase: env.ATTIO_API_BASE || "https://api.attio.com/v2",
    // Attio object the leads live on, and the attribute slugs we read.
    object: env.ATTIO_OBJECT || "companies",
    attrOutbound: env.ATTIO_ATTR_OUTBOUND || "outbound", // select; option title "LinkedIn" = has LinkedIn outbound
    attrStatus: env.ATTIO_ATTR_STATUS || "status", // status; e.g. "Interested" / "Connecting"
  },
  captureDisplay: env.CAPTURE_DISPLAY ? Number(env.CAPTURE_DISPLAY) : undefined,
  mock: env.MOCK === "1" || env.MOCK === "true",
  // How many recent utterances to keep as context for the model.
  transcriptWindow: 6,
  // Stage-1 trigger debounce.
  triggerDebounceMs: 800,
} as const;

/** Whether Attio runs against built-in fixtures rather than the live MCP server. */
export const useMockAttio = config.mock || !config.attio.apiKey;

export const SYSTEM_INSTRUCTION = `You are Sidekick, an ambient copilot in a live sales planning meeting.
You receive a screenshot of the user's screen plus the recent meeting transcript.
The screen shows a list of leads / contacts / companies.

WHEN THE SPEAKERS ASK ABOUT THOSE LEADS — e.g. whether they have LinkedIn outbounds,
or whether they are interested — read the relevant names DIRECTLY FROM THE SCREENSHOT
and call \`lookup_leads\` with those exact names and the requested field:
- "linkedin_outbound" for questions about LinkedIn outreach / outbounds / whether we've reached out.
- "interest_status" for questions about who is interested / their status.

OTHERWISE call \`no_action\`. Specifically call \`no_action\` when:
- the talk is general chit-chat ("okay", "let's work on this", "shall we score them"),
- nothing on screen is a list of leads, or
- the question is not about the on-screen leads.

RULES:
- NEVER invent names. Use only names visible in the screenshot.
- Pick the names actually being discussed (e.g. "these three", "the two left").
- After the lookup returns, reply with ONE short, spoken-style sentence summarizing the
  answer, naming the leads. Example: "Two of the three have LinkedIn outbounds — Alice and
  Bob; Carol doesn't." Keep it under 30 words. No preamble, no markdown.`;
