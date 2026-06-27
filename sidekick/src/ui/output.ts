import chalk from "chalk";
import boxen from "boxen";
import figlet from "figlet";
import ora, { type Ora } from "ora";
import type { AgentAnswer, LeadResult } from "../types";

export function printBanner(): void {
  console.log(chalk.bold.magenta(figlet.textSync("Sidekick", { font: "Small" })));
  console.log(chalk.dim("ambient sales copilot — gemini · slng · attio\n"));
}

export function printStatus(msg: string): void {
  console.log(chalk.dim(`• ${msg}`));
}

export function printHeard(text: string): void {
  console.log(chalk.cyan(`\n🗣  ${text}`));
}

/** Start an animated "thinking" spinner. Caller resolves it via the helpers below. */
export function startThinking(text = "Sidekick is thinking…"): Ora {
  return ora({ text: chalk.bold.cyan(text), spinner: "dots", color: "cyan" }).start();
}

/** Stop the spinner with a green ✔ "completed thinking" state. */
export function thinkingDone(s: Ora, text = "Completed thinking"): void {
  s.succeed(chalk.bold.green(text));
}

/** Stop the spinner with a neutral note (no action taken). */
export function thinkingSkipped(s: Ora, text: string): void {
  s.stopAndPersist({ symbol: chalk.dim("•"), text: chalk.dim(text) });
}

/** Stop the spinner with a red ✖ error state. */
export function thinkingFailed(s: Ora, text: string): void {
  s.fail(chalk.red(text));
}

export function renderAnswer(ans: AgentAnswer): void {
  const { leads } = ans;
  const total = leads.length;
  const lines: string[] = [];
  let headline: string;

  if (ans.field === "interest_status") {
    const yes = leads.filter((l) => l.found && /^interested/i.test(l.status ?? ""));
    headline = `${yes.length}/${total}`;
    for (const l of leads) lines.push(interestLine(l));
  } else {
    const yes = leads.filter((l) => l.linkedinOutbound);
    headline = `${yes.length}/${total}`;
    for (const l of leads) lines.push(linkedinLine(l));
  }

  console.log();
  console.log(chalk.bold.cyan(figlet.textSync(headline, { font: "Standard" })));
  console.log(
    boxen(chalk.bold.white(ans.spoken) + "\n\n" + lines.join("\n"), {
      padding: 1,
      borderColor: "cyan",
      borderStyle: "round",
      title: "Sidekick",
      titleAlignment: "center",
    }),
  );
  console.log();
}

function linkedinLine(l: LeadResult): string {
  if (!l.found) return chalk.gray(`?  ${l.name} — not found in Attio`);
  return l.linkedinOutbound
    ? chalk.green(`✓  ${l.name} — LinkedIn outbound`)
    : chalk.red(`✗  ${l.name} — no LinkedIn outbound`);
}

function interestLine(l: LeadResult): string {
  if (!l.found) return chalk.gray(`?  ${l.name} — not found in Attio`);
  return /^interested/i.test(l.status ?? "")
    ? chalk.green(`✓  ${l.name} — ${l.status}`)
    : chalk.red(`✗  ${l.name} — ${l.status ?? "unknown"}`);
}
