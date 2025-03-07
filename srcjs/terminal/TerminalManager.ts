import { TerminalInstance } from "./TerminalInstance";
import type { Config } from "../config";

export class TerminalManager {
  private terminals = new Map<string, TerminalInstance>();

  constructor(private readonly config: Config) {}

  createTerminal(id: string, onFocus?: () => void): TerminalInstance {
    console.log(`Creating terminal instance for tab ${id}`);
    const terminal = new TerminalInstance(this.config, id, onFocus);
    this.terminals.set(id, terminal);
    return terminal;
  }

  getTerminal(id: string): TerminalInstance | undefined {
    return this.terminals.get(id);
  }

  async destroyTerminal(id: string): Promise<void> {
    console.log(`Destroying terminal for tab ${id}`);
    const terminal = this.terminals.get(id);
    if (terminal) {
      await terminal.destroy();
      this.terminals.delete(id);
      console.log(`Terminal for tab ${id} destroyed`);
    } else {
      console.log(`No terminal found for tab ${id}`);
    }
  }

  public isTerminalFocused(terminalId: string): boolean {
    const terminal = this.terminals.get(terminalId);
    if (terminal) {
      return terminal.isFocused();
    }
    return false;
  }
}
