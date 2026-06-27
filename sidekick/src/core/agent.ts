import { GoogleGenAI } from "@google/genai";
import { config, SYSTEM_INSTRUCTION } from "../config";
import type { AgentAnswer, Field, LeadResult } from "../types";
import {
  lookupLeadsDeclaration,
  noActionDeclaration,
  runLookupLeads,
  type LookupLeadsArgs,
} from "../tools/lookupLeads";
import { lookupLeads, MOCK_NAMES } from "../integrations/attio";

const ai = config.google.apiKey ? new GoogleGenAI({ apiKey: config.google.apiKey }) : null;

/**
 * HYBRID stage 2. Given a screenshot + recent transcript, decide whether to look leads up,
 * do it, and return one concise spoken sentence. Returns null for "no action".
 *
 * If no Google API key is set, falls back to an offline brain that matches known fixture
 * names found in the transcript (deterministic demo without any external calls).
 */
export async function answer(input: { jpegBase64: string; transcript: string }): Promise<AgentAnswer | null> {
  // MOCK or no key → deterministic offline brain (no Gemini call).
  if (!ai || config.mock) return offlineAnswer(input.transcript);

  const tools = [{ functionDeclarations: [lookupLeadsDeclaration, noActionDeclaration] }];
  const userParts = [
    { inlineData: { mimeType: "image/jpeg", data: input.jpegBase64 } },
    {
      text: `Recent meeting transcript (latest last):\n${input.transcript}\n\nLook at the screen and decide.`,
    },
  ];
  const contents = [{ role: "user", parts: userParts }];

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

/**
 * Offline brain: no Gemini. Infer the field and match known fixture names found in the
 * CURRENT question (falling back to the wider transcript only if the line names no one).
 */
async function offlineAnswer(transcript: string): Promise<AgentAnswer | null> {
  const lastLine = transcript.split("\n").filter(Boolean).pop() ?? transcript;
  const scope = lastLine.toLowerCase();
  const field: Field = /interest/.test(scope) ? "interest_status" : "linkedin_outbound";

  let names = MOCK_NAMES.filter((n) => scope.includes(n.toLowerCase()));
  if (names.length === 0) {
    names = MOCK_NAMES.filter((n) => transcript.toLowerCase().includes(n.toLowerCase()));
  }
  if (names.length === 0) return null;

  const leads = await lookupLeads(names, field);
  return { spoken: summarize(leads, field), field, leads };
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
