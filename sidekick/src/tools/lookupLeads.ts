import { Type } from "@google/genai";
import type { Field, LeadResult } from "../types";
import { lookupLeads } from "../integrations/attio";

/** Function declaration the model calls when it should look leads up in Attio. */
export const lookupLeadsDeclaration = {
  name: "lookup_leads",
  description: "Look up CRM data in Attio for specific leads currently visible on screen.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      names: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "Exact lead names read from the screenshot.",
      },
      field: {
        type: Type.STRING,
        enum: ["linkedin_outbound", "interest_status"],
        description: "Which CRM field to check.",
      },
    },
    required: ["names", "field"],
  },
};

/** Function declaration the model calls when nothing on screen needs a lookup. */
export const noActionDeclaration = {
  name: "no_action",
  description:
    "Call this when the conversation is NOT asking about specific leads/contacts visible on screen.",
  parameters: { type: Type.OBJECT, properties: {} },
};

export interface LookupLeadsArgs {
  names?: string[];
  field?: Field;
}

export async function runLookupLeads(args: LookupLeadsArgs): Promise<LeadResult[]> {
  return lookupLeads(args.names ?? [], args.field ?? "linkedin_outbound");
}
