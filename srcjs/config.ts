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
  black?: string;
  red?: string;
  green?: string;
  yellow?: string;
  blue?: string;
  magenta?: string;
  cyan?: string;
  white?: string;
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
  scrollback?: number;
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

export interface Shortcut {
  key: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}

export interface KeyboardShortcuts {
  new_tab: Shortcut;
  close_tab: Shortcut;
  split_vertical: Shortcut;
  split_horizontal: Shortcut;
  focus_next_pane: Shortcut;
  focus_previous_pane: Shortcut;
  close_pane: Shortcut;
  reload_config: Shortcut;
  show_profiles: Shortcut;
}

export interface TabStyle {
  background_color: string;
  text_color: string;
}

export interface TabBarStyle {
  height: number;
  background_color: string;
  active_tab: TabStyle;
  inactive_tab: TabStyle;
}

export interface TabBarConfig {
  visible: boolean;
  position: string;
  style: TabBarStyle;
}

export interface InteractiveElementStyle {
  background_color: string;
  text_color: string;
  border_color: string;
  hover_background: string;
}

export interface WindowTabsStyle {
  active: TabStyle;
  inactive: TabStyle;
}

export interface WindowConfig {
  titlebar_height: number;
  titlebar_background: string;
  interactive: InteractiveElementStyle;
  tabs: WindowTabsStyle;
}

export interface Config {
  version: number;
  font: FontConfig;
  theme: ThemeConfig;
  shell: ShellConfig;
  terminal: TerminalSettings;
  profiles: Profiles;
  shortcuts: KeyboardShortcuts;
  window: WindowConfig;
}
