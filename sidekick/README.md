# Sidekick

An ambient **voice + screen copilot** for sales meetings. It listens to the conversation,
watches your screen, and when the team asks about the leads on screen it "kicks in" — reads
the names off the screen, looks them up in **Attio**, and answers out loud and in the terminal.

```
🗣  I forgot if these have LinkedIn outbounds right now?
• Sidekick is checking…

      ____  ______
     |___ \|___ /  ___
       __) | |_ \ |___|
      / __/ ___) |
     |_____|____/      2 / 3

╭───────────────── Sidekick ─────────────────╮
│  2 of 3 have LinkedIn outbounds (Alice Chen │
│  and Bob Martinez); Carol Nguyen doesn't.   │
│                                             │
│  ✓  Alice Chen — LinkedIn outbound          │
│  ✓  Bob Martinez — LinkedIn outbound        │
│  ✗  Carol Nguyen — no LinkedIn outbound     │
╰─────────────────────────────────────────────╯
```

## Stack

- **Gemini** (`@google/genai`) — vision (reads names off the screenshot) + reasoning + function-calling.
- **SLNG** ([slng.ai](https://slng.ai)) — real-time **STT** (listen) and **TTS** (speak).
- **Attio** (REST API) — live CRM lookups (LinkedIn-outbound presence, interest/status).
- Node + TypeScript CLI. Big terminal output via figlet/boxen.

## Architecture

```
mic → SLNG STT → transcript ─┐
                             ├─ stage 1: trigger-phrase gate → stage 2: Gemini confirms (sees screenshot)
screen → screenshot (on cue)─┘        → lookup_leads(names, field) → Attio REST → per-lead data
                                      → one spoken sentence → terminal + SLNG TTS
```

## Setup

```bash
pnpm install
brew install sox            # required for mic capture
cp .env.example .env        # then fill in keys
```

macOS: grant your terminal **Microphone** and **Screen Recording** permission
(System Settings ▸ Privacy & Security).

### Keys

- `GOOGLE_API_KEY` — **required** (vision + reasoning).
- `ATTIO_API_KEY` — **required** for lookups (read-only key is fine).
- `SLNG_API_KEY` — optional; without it Sidekick runs in `--text` mode with no speech.

## Run

```bash
pnpm dev          # mic + voice (SLNG) + Gemini vision + live Attio
pnpm text         # type questions instead of speaking (names taken from what you type)
```

### Triggering

Sidekick only kicks in when an utterance **opens with a trigger phrase** — by default
`"I forgot…"` or `"I actually don't know…"`. Everything else is ignored. Override with
`SIDEKICK_TRIGGERS` (pipe-separated), e.g. `SIDEKICK_TRIGGERS="i forgot|remind me|i can't remember"`.

### Keyboard testing (real Attio)

In `--text` mode the lead names are taken from what you type and looked up **live in Attio**:

```bash
pnpm text
› I forgot if <Company A> and <Company B> have LinkedIn outbounds?
› I actually don't know if <Company A> is interested.
```

## Live Attio notes

Uses Attio's **REST API** — `POST /v2/objects/{object}/records/query` ("list records"), with your
`ATTIO_API_KEY` as a bearer token. (The official hosted MCP at `mcp.attio.com/mcp` requires OAuth,
which a read-only API key can't satisfy, so REST is the path that works with a key.)

Defaults target the `companies` object and read two attributes — override per your schema:
- `ATTIO_ATTR_OUTBOUND` (default `outbound`): a *select*; option titled "LinkedIn" ⇒ has a LinkedIn outbound.
- `ATTIO_ATTR_STATUS` (default `status`): a *status*; e.g. "Interested" / "Connecting".

Run `pnpm verify` to check keys + do a real lookup against your workspace end-to-end.
