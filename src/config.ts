export interface TerminalConfig {
  font: {
    family: string;
    fallback_family: string;
    size: number;
    lineHeight: number;
  };
  theme: {
    background: string;
    foreground: string;
    cursor: string;
    selection: string;
  };
  shell: {
    windows: string;
    linux: string;
    macos: string;
  };
  terminal: {
    scrollback: number | "infinite";
  };
}

export const defaultConfig: TerminalConfig = {
  font: {
    family: "JetBrains Mono",
    fallback_family: "Consolas, Monaco, monospace",
    size: 14,
    lineHeight: 1.5,
  },
  theme: {
    background: "#1a1b26",
    foreground: "#a9b1d6",
    cursor: "#c0caf5",
    selection: "#283457",
  },
  shell: {
    windows: "powershell.exe",
    linux: "/bin/bash",
    macos: "/bin/zsh",
  },
  terminal: {
    scrollback: 5000,
  },
};
