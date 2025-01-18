export class TerminalOutput {
  private escapeSequence: string = "";
  private inEscapeSequence: boolean = false;

  process(data: string): string {
    let output = "";

    for (const char of data) {
      if (this.inEscapeSequence) {
        this.escapeSequence += char;
        if (this.isEscapeSequenceComplete(this.escapeSequence)) {
          this.inEscapeSequence = false;
          this.escapeSequence = "";
          continue;
        }
      } else if (char === "\x1b") {
        this.inEscapeSequence = true;
        this.escapeSequence = char;
      } else {
        output += char;
      }
    }

    return output;
  }

  private isEscapeSequenceComplete(sequence: string): boolean {
    if (sequence.length < 2) return false;

    // Handle CSI sequences
    if (sequence[1] === "[") {
      const lastChar = sequence[sequence.length - 1];
      return /[A-Za-z~]/.test(lastChar);
    }

    // Handle simple sequences
    return sequence.length === 2;
  }
}
