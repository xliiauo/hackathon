import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { config, useMockAttio } from "../src/config";
import { synthesize } from "../src/voice/tts";
import { transcribeWav } from "../src/voice/stt";
import { answer } from "../src/core/agent";
import { lookupLeads, sampleCompanies, closeAttio, MOCK_NAMES } from "../src/integrations/attio";
import { captureFrame } from "../src/capture/screen";

function mask(v: string): string {
  return v ? `SET (len ${v.length})` : "MISSING";
}
function ok(label: string, detail = ""): void {
  console.log(`✅ ${label}${detail ? " — " + detail : ""}`);
}
function bad(label: string, detail = ""): void {
  console.log(`❌ ${label}${detail ? " — " + detail : ""}`);
}
function escapeXml(s: string): string {
  return s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] ?? c);
}

async function checkScreen(): Promise<void> {
  try {
    const b64 = await captureFrame();
    const kb = Math.round(b64.length / 1024);
    if (b64.length > 2000) ok("Screen capture", `${kb} KB jpeg`);
    else bad("Screen capture", `only ${kb} KB — grant Screen Recording permission`);
  } catch (e) {
    bad("Screen capture", (e as Error).message);
  }
}

async function checkSlng(): Promise<void> {
  if (!config.slng.apiKey) return void bad("SLNG", "no SLNG_API_KEY — skipped");
  try {
    const wav = await synthesize("Two of the three leads have LinkedIn outbounds.");
    ok("SLNG TTS", `${Math.round(wav.length / 1024)} KB audio (${config.slng.ttsModel})`);
    try {
      const heard = await transcribeWav(wav);
      if (heard) ok("SLNG STT (round-trip)", `heard: "${heard}"`);
      else bad("SLNG STT (round-trip)", "empty transcript — check response shape vs docs");
    } catch (e) {
      bad("SLNG STT", (e as Error).message);
    }
  } catch (e) {
    bad("SLNG TTS", (e as Error).message);
  }
}

async function checkAttio(): Promise<string[]> {
  if (useMockAttio) {
    bad("Attio REST", "mock mode / no key — using fixtures");
    return MOCK_NAMES.slice(0, 3);
  }
  try {
    const sample = await sampleCompanies(3);
    if (sample.length === 0) {
      bad("Attio REST", "query returned no companies");
      return [];
    }
    ok("Attio REST query", `${config.attio.object} reachable; e.g. ${sample.map((s) => s.name).join(", ")}`);
    const target = sample[0].name;
    const [li] = await lookupLeads([target], "linkedin_outbound");
    const [st] = await lookupLeads([target], "interest_status");
    const raw = (li.raw as { outbound?: string }) ?? {};
    ok(
      "Attio lookup (real record)",
      `"${target}" → linkedinOutbound=${li.linkedinOutbound} (outbound="${raw.outbound ?? "—"}"), status="${st.status ?? "—"}"`,
    );
    return sample.map((s) => s.name);
  } catch (e) {
    bad("Attio REST", (e as Error).message);
    return [];
  }
}

async function checkGeminiBrain(names: string[]): Promise<void> {
  if (!config.google.apiKey) return void bad("Gemini brain", "no GOOGLE_API_KEY — app uses offline brain");
  const leads = names.length ? names.slice(0, 3) : ["Alice Chen", "Bob Martinez", "Carol Nguyen"];
  try {
    const rows = leads
      .map((n, i) => `<text x="40" y="${170 + i * 70}" font-family="Helvetica" font-size="34" fill="black">${i + 1}.  ${escapeXml(n)}</text>`)
      .join("");
    const svg = `<svg width="1000" height="${180 + leads.length * 70}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><text x="40" y="80" font-family="Helvetica" font-size="40" font-weight="bold" fill="black">Potential customers — this week</text>${rows}</svg>`;
    const jpeg = await sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer();
    const imgPath = join(tmpdir(), "sidekick-verify-screen.jpg");
    await writeFile(imgPath, jpeg);

    const ans = await answer({
      jpegBase64: jpeg.toString("base64"),
      transcript: "Let's focus on the LinkedIn outbounds.\nDo all three have LinkedIn outbounds right now?",
    });
    if (!ans) {
      bad("Gemini brain", `returned no_action (expected a lookup). Test image: ${imgPath}`);
      return;
    }
    const read = ans.leads.map((l) => `${l.name}${l.found ? "✓" : "✗"}`).join(", ");
    ok("Gemini brain (real e2e)", `field=${ans.field}; read=[${read}]`);
    console.log(`     spoken → "${ans.spoken}"`);
    console.log(`     (screenshot: ${imgPath})`);
  } catch (e) {
    bad("Gemini brain", (e as Error).message);
  }
}

async function main(): Promise<void> {
  console.log("\n=== Sidekick E2E verification ===\n");
  console.log("Keys:");
  console.log(`  GOOGLE_API_KEY : ${mask(config.google.apiKey)}`);
  console.log(`  SLNG_API_KEY   : ${mask(config.slng.apiKey)}`);
  console.log(`  ATTIO_API_KEY  : ${mask(config.attio.apiKey)}  (mode: ${useMockAttio ? "MOCK" : "LIVE REST"})`);
  console.log();

  await checkScreen();
  await checkSlng();
  const names = await checkAttio();
  await checkGeminiBrain(names);

  await closeAttio();
  console.log("\n=== done ===\n");
  process.exit(0);
}

void main();
