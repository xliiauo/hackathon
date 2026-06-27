import { config, useMockAttio } from "../config";
import type { Field, LeadResult } from "../types";

/**
 * Built-in demo fixtures — the reliable demo path (used when MOCK=1 or no ATTIO_API_KEY).
 * Matches the north-star script: 2 with LinkedIn outbound, 1 without; interest mixed.
 */
const FIXTURES: Array<{ name: string; linkedinOutbound: boolean; status: string }> = [
  { name: "Alice Chen", linkedinOutbound: true, status: "Interested" },
  { name: "Bob Martinez", linkedinOutbound: true, status: "Not interested" },
  { name: "Carol Nguyen", linkedinOutbound: false, status: "Interested" },
];

/** Proper-case fixture names, used by the offline brain to spot names in text. */
export const MOCK_NAMES: string[] = FIXTURES.map((f) => f.name);

function mockLead(name: string): LeadResult {
  const hit = FIXTURES.find((f) => f.name.toLowerCase() === name.trim().toLowerCase());
  if (!hit) return { name, found: false };
  return { name: hit.name, found: true, linkedinOutbound: hit.linkedinOutbound, status: hit.status };
}

/** Public entry: look up leads by name. Returns both signals; caller picks by field. */
export async function lookupLeads(names: string[], _field: Field): Promise<LeadResult[]> {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (useMockAttio) return unique.map(mockLead);
  return Promise.all(unique.map((n) => restLookup(n)));
}

// --- Attio REST ("list records" on the companies object) ---------------------

type AttioValue = Record<string, unknown>;
interface AttioRecord {
  values: Record<string, AttioValue[]>;
}

async function queryRecords(body: object): Promise<AttioRecord[]> {
  const url = `${config.attio.apiBase}/objects/${config.attio.object}/records/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.attio.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Attio ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { data?: AttioRecord[] };
  return json.data ?? [];
}

async function restLookup(name: string): Promise<LeadResult> {
  try {
    const recs = await queryRecords({ filter: { name: { $contains: name } }, limit: 1 });
    const rec = recs[0];
    if (!rec) return { name, found: false };
    const outbound = selectTitle(rec, config.attio.attrOutbound);
    const status = statusTitle(rec, config.attio.attrStatus);
    return {
      name: textValue(rec, "name") ?? name,
      found: true,
      linkedinOutbound: outbound ? /linkedin/i.test(outbound) : false,
      status,
      raw: { outbound, status },
    };
  } catch {
    return { name, found: false };
  }
}

/** A few real records (for verification / demo seeding). */
export async function sampleCompanies(
  limit = 3,
): Promise<Array<{ name: string; outbound?: string; status?: string }>> {
  if (useMockAttio) {
    return FIXTURES.slice(0, limit).map((f) => ({
      name: f.name,
      outbound: f.linkedinOutbound ? "LinkedIn" : undefined,
      status: f.status,
    }));
  }
  const recs = await queryRecords({ limit: 50 });
  const out: Array<{ name: string; outbound?: string; status?: string }> = [];
  for (const r of recs) {
    const name = textValue(r, "name");
    if (!name) continue;
    out.push({ name, outbound: selectTitle(r, config.attio.attrOutbound), status: statusTitle(r, config.attio.attrStatus) });
    if (out.length >= limit) break;
  }
  return out;
}

function firstVal(rec: AttioRecord, slug: string): AttioValue | undefined {
  return (rec.values?.[slug] ?? [])[0];
}
function textValue(rec: AttioRecord, slug: string): string | undefined {
  const v = firstVal(rec, slug) as { value?: string; full_name?: string } | undefined;
  return v?.value ?? v?.full_name ?? undefined;
}
function selectTitle(rec: AttioRecord, slug: string): string | undefined {
  const v = firstVal(rec, slug) as { option?: { title?: string } } | undefined;
  return v?.option?.title ?? undefined;
}
function statusTitle(rec: AttioRecord, slug: string): string | undefined {
  const v = firstVal(rec, slug) as { status?: { title?: string }; option?: { title?: string }; value?: string } | undefined;
  return v?.status?.title ?? v?.option?.title ?? v?.value ?? undefined;
}

/** No persistent connection in REST mode. */
export async function closeAttio(): Promise<void> {
  /* no-op */
}
