export interface FontConfig {
  family: string;
  fallback_family: string;
  size: number;
  line_height: number;
}

export interface ThemeConfig {
  // Basic colors
  background: string;
  foreground: string;
  cursor: string;
  selection: string;

  // UI elements
  border?: string;
  header?: string;

  // Standard ANSI Colors (0-7)
  black?: string;
  red?: string;
  green?: string;
  yellow?: string;
  blue?: string;
  magenta?: string;
  cyan?: string;
  white?: string;

  // Bright ANSI Colors (8-15)
  bright_black?: string;
  bright_red?: string;
  bright_green?: string;
  bright_yellow?: string;
  bright_blue?: string;
  bright_magenta?: string;
  bright_cyan?: string;
  bright_white?: string;
}

export interface ShellConfig {
  windows: string;
  linux: string;
  macos: string;
}

export interface PaddingConfig {
  x: number;
  y: number;
}

export interface TerminalSettings {
  scrollback?: number | "infinite";
  padding?: PaddingConfig;
}

export interface Profile {
  name: string;
  command: string;
  args?: string[];
  font?: FontConfig;
  theme?: ThemeConfig;
}

export interface Profiles {
  default: string;
  list: Profile[];
}

export interface KeyboardShortcuts {
  new_tab: string;
  close_tab: string;
  split_vertical: string;
  split_horizontal: string;
  focus_next_pane: string;
  focus_previous_pane: string;
  close_pane: string;
  // Add more as needed
}

export interface WindowControlsConfig {
  position: "left" | "right";
  style: "native" | "custom";
  visible: boolean;
  // For custom style only
  custom?: {
    close: string; // Icon paths or Unicode
    minimize: string;
    maximize: string;
    restore: string;
  };
}

export interface TabBarConfig {
  visible: boolean;
  position: "top" | "bottom";
  style: {
    height: number;
    backgroundColor: string;
    activeTab: {
      backgroundColor: string;
      borderColor: string;
      textColor: string;
    };
    inactiveTab: {
      backgroundColor: string;
      borderColor: string;
      textColor: string;
    };
  };
}

export interface SplitPaneConfig {
  divider: {
    size: number;
    color: string;
    hoverColor: string;
    dragColor: string;
  };
  minSize: number; // Minimum pane size in pixels
  animation: {
    enabled: boolean;
    duration: number;
  };
}

export interface Config {
  version: number;
  font: FontConfig;
  theme: ThemeConfig;
  shell: ShellConfig;
  terminal: TerminalSettings;
  profiles?: Profiles;
  shortcuts: KeyboardShortcuts;
  windowControls: WindowControlsConfig;
  tabBar: TabBarConfig;
  splitPane: SplitPaneConfig;
}

// Helper function to type-check config from Rust
export function isConfig(obj: unknown): obj is Config {
  const config = obj as Config;
  return (
    config !== null &&
    typeof config === "object" &&
    typeof config.version === "number" &&
    typeof config.font === "object" &&
    typeof config.theme === "object" &&
    typeof config.shell === "object" &&
    typeof config.terminal === "object"
  );
}
