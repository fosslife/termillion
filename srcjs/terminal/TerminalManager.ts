import { TerminalInstance } from "./TerminalInstance";
import type { Config } from "../config";

export class TerminalManager {
  private terminals = new Map<string, TerminalInstance>();

  constructor(private readonly config: Config) {}

  createTerminal(id: string, onFocus?: () => void): TerminalInstance {
    const terminal = new TerminalInstance(id, this.config, onFocus);
    this.terminals.set(id, terminal);
    return terminal;
  }

  getTerminal(id: string): TerminalInstance | undefined {
    return this.terminals.get(id);
  }

  async destroyTerminal(id: string): Promise<void> {
    const terminal = this.terminals.get(id);
    if (terminal) {
      await terminal.destroy();
      this.terminals.delete(id);
    }
  }
}
