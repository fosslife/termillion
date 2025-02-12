export interface FontConfig {
  family: string;
  fallback_family: string;
  size: number;
  line_height: number;
}

export interface ThemeConfig {
  background: string;
  foreground: string;
  cursor: string;
  selection: string;
  border?: string;
  header?: string;
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
  scrollback?: number;
  padding?: PaddingConfig;
}

export interface Profile {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  working_directory?: string;
  theme?: ThemeConfig;
  font?: FontConfig;
}

export interface ProfilesConfig {
  list: Profile[];
  default: string;
}

export interface Config {
  version: number;
  font: FontConfig;
  theme: ThemeConfig;
  shell: ShellConfig;
  terminal: TerminalSettings;
  profiles?: ProfilesConfig;
  ui?: {
    show_tab_bar: boolean;
    tab_bar_position: "top" | "bottom";
    show_scrollbar: boolean;
    window_transparency: number;
    animations_enabled: boolean;
    confirm_before_closing: boolean;
  };
  behavior?: {
    copy_on_select: boolean;
    scroll_on_output: boolean;
    scroll_on_input: boolean;
    bell_style: "none" | "visual" | "audible" | "both";
    cursor_blink: boolean;
    cursor_style: "block" | "underline" | "bar";
    scrollback_lines: number;
  };
  keybindings?: {
    new_tab: string;
    close_tab: string;
    next_tab: string;
    previous_tab: string;
    split_vertical: string;
    split_horizontal: string;
    zoom_in: string;
    zoom_out: string;
    fullscreen: string;
  };
}

export interface UIConfig {
  theme: ThemeConfig;
  font: FontConfig;
  padding: { x: number; y: number };
  border_radius: number;
  tab_bar: {
    height: number;
    spacing: number;
    show_close_buttons: boolean;
  };
  window: {
    title_bar_style: "native" | "custom";
    always_on_top: boolean;
    start_maximized: boolean;
  };
}
