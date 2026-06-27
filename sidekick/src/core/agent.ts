import { GoogleGenAI } from "@google/genai";
import { config, SYSTEM_INSTRUCTION } from "../config";
import type { AgentAnswer, Field, LeadResult } from "../types";
import {
  lookupLeadsDeclaration,
  noActionDeclaration,
  runLookupLeads,
  type LookupLeadsArgs,
} from "../tools/lookupLeads";

const ai = config.google.apiKey ? new GoogleGenAI({ apiKey: config.google.apiKey }) : null;

/**
 * HYBRID stage 2. Given the recent transcript (+ a screenshot in mic mode), decide whether to
 * look leads up, do it against live Attio, and return one concise spoken sentence.
 * Returns null for "no action".
 *
 * - mic mode: a screenshot is provided → Gemini reads the lead names off the screen.
 * - text mode: no screenshot → Gemini takes the lead names from the typed transcript.
 */
export async function answer(input: { transcript: string; jpegBase64?: string }): Promise<AgentAnswer | null> {
  if (!ai) throw new Error("GOOGLE_API_KEY not set");

  const tools = [{ functionDeclarations: [lookupLeadsDeclaration, noActionDeclaration] }];
  const parts = [
    ...(input.jpegBase64 ? [{ inlineData: { mimeType: "image/jpeg", data: input.jpegBase64 } }] : []),
    {
      text: input.jpegBase64
        ? `Recent meeting transcript (latest last):\n${input.transcript}\n\nLook at the screen and decide.`
        : `Recent meeting transcript (latest last):\n${input.transcript}\n\nNo screenshot provided — take the lead names from the transcript.`,
    },
  ];
  const contents = [{ role: "user", parts }];

  const first = await ai.models.generateContent({
    model: config.model,
    contents,
    config: { systemInstruction: SYSTEM_INSTRUCTION, tools },
  });

  const call = first.functionCalls?.[0];
  if (!call || call.name === "no_action" || call.name !== "lookup_leads") return null;

  const args = (call.args ?? {}) as LookupLeadsArgs;
  const field: Field = args.field ?? "linkedin_outbound";
  const leads = await runLookupLeads(args);

  // Second turn: hand the model the lookup result, ask for the spoken summary.
  const second = await ai.models.generateContent({
    model: config.model,
    contents: [
      ...contents,
      { role: "model", parts: [{ functionCall: { name: call.name, args: call.args } }] },
      { role: "user", parts: [{ functionResponse: { name: call.name, response: { leads } } }] },
    ],
    config: { systemInstruction: SYSTEM_INSTRUCTION, tools },
  });

  const spoken = second.text?.trim() || summarize(leads, field);
  return { spoken, field, leads };
}

/** Compose a concise sentence from results (fallback when the model returns no text). */
export function summarize(leads: LeadResult[], field: Field): string {
  const found = leads.filter((l) => l.found);
  if (found.length === 0) return "I couldn't find any of those leads in Attio.";

  if (field === "interest_status") {
    const yes = found.filter((l) => /^interested/i.test(l.status ?? ""));
    const no = found.filter((l) => !/^interested/i.test(l.status ?? ""));
    const parts: string[] = [];
    if (yes.length) parts.push(`${names(yes)} ${yes.length === 1 ? "is" : "are"} interested`);
    if (no.length) parts.push(`${names(no)} ${no.length === 1 ? "isn't" : "aren't"}`);
    return capitalize(parts.join("; ") + ".");
  }

  const yes = found.filter((l) => l.linkedinOutbound);
  const no = found.filter((l) => !l.linkedinOutbound);
  const parts: string[] = [];
  if (yes.length) parts.push(`${yes.length} of ${found.length} have LinkedIn outbounds (${names(yes)})`);
  if (no.length) parts.push(`${no.length} ${no.length === 1 ? "doesn't" : "don't"} (${names(no)})`);
  return capitalize(parts.join("; ") + ".");
}

function names(leads: LeadResult[]): string {
  const ns = leads.map((l) => l.name);
  if (ns.length <= 1) return ns.join("");
  return ns.slice(0, -1).join(", ") + " and " + ns[ns.length - 1];
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
