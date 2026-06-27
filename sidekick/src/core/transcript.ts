/** A small rolling buffer of the most recent utterances, used as model context. */
export class Transcript {
  private items: string[] = [];
  constructor(private readonly max: number = 6) {}

  add(text: string): void {
    const s = text.trim();
    if (!s) return;
    this.items.push(s);
    if (this.items.length > this.max) this.items.shift();
  }

  /** Recent utterances, oldest first, newline-joined. */
  recent(): string {
    return this.items.join("\n");
  }

  last(): string {
    return this.items[this.items.length - 1] ?? "";
  }
}
