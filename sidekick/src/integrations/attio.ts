import { config } from "../config";
import type { Field, LeadResult } from "../types";

/**
 * Look up leads by name against the live Attio REST API ("list records" on the configured object).
 * Returns both signals (LinkedIn outbound + status); the caller picks by field.
 */
export async function lookupLeads(names: string[], _field: Field): Promise<LeadResult[]> {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  return Promise.all(unique.map((n) => restLookup(n)));
}

type AttioValue = Record<string, unknown>;
interface AttioRecord {
  values: Record<string, AttioValue[]>;
}

function requireKey(): string {
  if (!config.attio.apiKey) throw new Error("ATTIO_API_KEY not set — set it in .env to use Attio.");
  return config.attio.apiKey;
}

async function queryRecords(body: object): Promise<AttioRecord[]> {
  const url = `${config.attio.apiBase}/objects/${config.attio.object}/records/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${requireKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Attio ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { data?: AttioRecord[] };
  return json.data ?? [];
}

async function restLookup(name: string): Promise<LeadResult> {
  // Name-not-found is graceful (empty data); HTTP/auth errors propagate so they're visible.
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
}

/** A few real records (for verification / demo seeding). */
export async function sampleCompanies(
  limit = 3,
): Promise<Array<{ name: string; outbound?: string; status?: string }>> {
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
