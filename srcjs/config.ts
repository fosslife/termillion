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

export interface WindowControlsConfig {
  position: string;
  style: string;
  visible: boolean;
  custom?: {
    close: string;
    minimize: string;
    maximize: string;
    restore: string;
  };
}

export interface TabStyle {
  background_color: string;
  border_color: string;
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

export interface DividerConfig {
  size: number;
  color: string;
  hover_color: string;
  drag_color: string;
  hit_size: number;
}

export interface AnimationConfig {
  enabled: boolean;
  duration: number;
}

export interface SplitPaneConfig {
  divider: DividerConfig;
  min_size: number;
  animation: AnimationConfig;
}

export interface Config {
  version: number;
  font: FontConfig;
  theme: ThemeConfig;
  shell: ShellConfig;
  terminal: TerminalSettings;
  profiles: Profiles;
  shortcuts: KeyboardShortcuts;
  window_controls: WindowControlsConfig;
  tab_bar: TabBarConfig;
  split_pane: SplitPaneConfig;
}
