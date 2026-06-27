/** Which CRM field the team is asking about. */
export type Field = "linkedin_outbound" | "interest_status";

/** One lead's looked-up CRM data. */
export interface LeadResult {
  name: string;
  found: boolean;
  linkedinOutbound?: boolean;
  /** Free-text status, e.g. "Interested" / "Not interested". */
  status?: string;
  /** Raw record payload from Attio (live mode), for debugging / future use. */
  raw?: unknown;
}

/** Sidekick's answer to one actionable question. */
export interface AgentAnswer {
  /** One concise, spoken-style sentence (also used as the spoken TTS line). */
  spoken: string;
  field?: Field;
  leads: LeadResult[];
}
