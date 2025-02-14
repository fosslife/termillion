use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/**
 * When we need to add new config options in the future:
 * 1. Increment CURRENT_CONFIG_VERSION
 * 2. Add a new ConfigVX struct for the old version if needed
 * 3. Add migration logic in the migrate_config match statement
 */

// Current version of config schema
const CURRENT_CONFIG_VERSION: u32 = 1;

#[derive(Debug, Serialize, Deserialize)]
/// Font configuration settings
pub struct FontConfig {
    /// Primary font family
    pub family: String,
    /// Fallback font families
    pub fallback_family: String,
    /// Font size in pixels
    pub size: u16,
    /// Line height multiplier
    pub line_height: f32,
}

#[derive(Debug, Serialize, Deserialize)]
/// Color theme configuration
pub struct ThemeConfig {
    /// Terminal background color
    pub background: String, // Terminal background
    /// Default text color
    pub foreground: String, // Default text color
    /// Cursor color
    pub cursor: String, // Cursor color
    /// Selected text background color
    pub selection: String, // Selected text background

    /// UI elements
    /// Optional border color
    pub border: Option<String>, // Window/tab borders
    /// Optional header background color
    pub header: Option<String>, // Title bar background

    /// Standard ANSI Colors (0-7)
    /// ANSI 0 - Usually used for dark elements
    pub black: Option<String>,
    /// ANSI 1 - Error messages
    pub red: Option<String>,
    /// ANSI 2 - Success messages
    pub green: Option<String>,
    /// ANSI 3 - Warnings/modified files
    pub yellow: Option<String>,
    /// ANSI 4 - Information/special items
    pub blue: Option<String>,
    /// ANSI 5 - Debug messages/special items
    pub magenta: Option<String>,
    /// ANSI 6 - Info/path segments
    pub cyan: Option<String>,
    /// ANSI 7 - Default foreground fallback
    pub white: Option<String>,

    /// Bright ANSI Colors (8-15)
    /// ANSI 8  - Grey/comments
    pub bright_black: Option<String>,
    /// ANSI 9  - Lighter red
    pub bright_red: Option<String>,
    /// ANSI 10 - Lighter green
    pub bright_green: Option<String>,
    /// ANSI 11 - Lighter yellow
    pub bright_yellow: Option<String>,
    /// ANSI 12 - Lighter blue
    pub bright_blue: Option<String>,
    /// ANSI 13 - Lighter magenta
    pub bright_magenta: Option<String>,
    /// ANSI 14 - Lighter cyan
    pub bright_cyan: Option<String>,
    /// ANSI 15 - Bright white
    pub bright_white: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
/// Default shell commands for different platforms
pub struct ShellConfig {
    /// Default shell for Windows
    pub windows: String,
    /// Default shell for Linux
    pub linux: String,
    /// Default shell for macOS
    pub macos: String,
}

#[derive(Debug, Serialize, Deserialize)]
/// Terminal behavior settings
pub struct TerminalSettings {
    /// Number of lines to keep in scrollback buffer
    pub scrollback: Option<u32>,
    /// Padding around terminal content
    pub padding: Option<PaddingConfig>, // Changed to struct
}

#[derive(Debug, Serialize, Deserialize)]
/// Terminal padding configuration
pub struct PaddingConfig {
    /// Horizontal padding in pixels
    pub x: u32, // Horizontal padding
    /// Vertical padding in pixels
    pub y: u32, // Vertical padding
}

#[derive(Debug, Serialize, Deserialize)]
/// Terminal profile configuration
pub struct Profile {
    /// Profile name
    pub name: String,
    /// Command to execute
    pub command: String,
    /// Optional command arguments
    pub args: Option<Vec<String>>,
    /// Optional font overrides
    pub font: Option<FontConfig>,
    /// Optional theme overrides
    pub theme: Option<ThemeConfig>,
}

#[derive(Debug, Serialize, Deserialize)]
/// Collection of terminal profiles
pub struct Profiles {
    /// Default profile name
    pub default: String,
    /// List of available profiles
    pub list: Vec<Profile>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
/// Keyboard shortcut configuration
pub struct Shortcut {
    /// Key to bind
    pub key: String,
    /// Whether Ctrl is required
    #[serde(default)]
    pub ctrl: bool,
    /// Whether Shift is required
    #[serde(default)]
    pub shift: bool,
    /// Whether Alt is required
    #[serde(default)]
    pub alt: bool,
    /// Whether Meta/Command is required
    #[serde(default)]
    pub meta: bool,
}

#[derive(Debug, Serialize, Deserialize)]
/// Keyboard shortcut bindings
pub struct KeyboardShortcuts {
    /// Create new tab
    pub new_tab: Shortcut,
    /// Close current tab
    pub close_tab: Shortcut,
    /// Reload configuration
    pub reload_config: Shortcut,
    /// Show profiles menu
    pub show_profiles: Shortcut,
}

#[derive(Debug, Serialize, Deserialize)]
/// Window controls configuration
pub struct WindowControlsConfig {
    /// Position of window controls ("left" | "right")
    pub position: String, // "left" | "right"
    /// Style of window controls ("native" | "custom")
    pub style: String, // "native" | "custom"
    /// Whether window controls are visible
    pub visible: bool,
    /// Custom window control icons
    pub custom: Option<CustomWindowControls>,
}

#[derive(Debug, Serialize, Deserialize)]
/// Custom window control icons
pub struct CustomWindowControls {
    /// Close button icon
    pub close: String,
    /// Minimize button icon
    pub minimize: String,
    /// Maximize button icon
    pub maximize: String,
    /// Restore button icon
    pub restore: String,
}

#[derive(Debug, Serialize, Deserialize)]
/// Tab bar style configuration
pub struct TabBarStyle {
    /// Height of the tab bar
    pub height: u32,
    /// Background color
    pub background_color: String,
    /// Style for active tab
    pub active_tab: TabStyle,
    /// Style for inactive tabs
    pub inactive_tab: TabStyle,
}

#[derive(Debug, Serialize, Deserialize)]
/// Style configuration for individual tabs
pub struct TabStyle {
    /// Background color
    pub background_color: String,
    /// Border color
    pub border_color: String,
    /// Text color
    pub text_color: String,
}

#[derive(Debug, Serialize, Deserialize)]
/// Tab bar configuration
pub struct TabBarConfig {
    /// Whether tab bar is visible
    pub visible: bool,
    /// Position of tab bar ("top" | "bottom")
    pub position: String, // "top" | "bottom"
    /// Style configuration
    pub style: TabBarStyle,
}

#[derive(Debug, Serialize, Deserialize)]
/// Main application configuration
pub struct Config {
    /// Configuration version (used for migrations)
    pub version: u32,
    /// Font settings for the terminal
    pub font: FontConfig,
    /// Color theme settings
    pub theme: ThemeConfig,
    /// Default shell commands for different platforms
    pub shell: ShellConfig,
    /// Terminal behavior settings
    pub terminal: TerminalSettings,
    /// User-defined terminal profiles
    pub profiles: Option<Profiles>,
    /// Keyboard shortcut bindings
    pub shortcuts: KeyboardShortcuts,
    /// Window controls configuration
    pub window_controls: WindowControlsConfig,
    /// Tab bar appearance and behavior
    pub tab_bar: TabBarConfig,
}

// Config versions for migration
#[derive(Debug, Serialize, Deserialize)]
struct ConfigV0 {
    pub font: FontConfig,
    pub theme: ThemeConfig,
    pub shell: ShellConfig,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            version: CURRENT_CONFIG_VERSION,
            font: FontConfig {
                family: "JetBrains Mono".into(),
                fallback_family: "Consolas, Monaco, monospace".into(),
                size: 14,
                line_height: 1.0,
            },
            theme: ThemeConfig {
                background: "#1a1b26".into(),
                foreground: "#a9b1d6".into(),
                cursor: "#c0caf5".into(),
                selection: "#283457".into(),
                border: Some("#24283b".into()),
                header: Some("#16161e".into()),

                // ANSI colors
                black: Some("#32344a".into()),
                red: Some("#f7768e".into()),
                green: Some("#9ece6a".into()),
                yellow: Some("#e0af68".into()),
                blue: Some("#7aa2f7".into()),
                magenta: Some("#ad8ee6".into()),
                cyan: Some("#449dab".into()),
                white: Some("#787c99".into()),

                // Bright variants
                bright_black: Some("#444b6a".into()),
                bright_red: Some("#ff7a93".into()),
                bright_green: Some("#b9f27c".into()),
                bright_yellow: Some("#ff9e64".into()),
                bright_blue: Some("#7da6ff".into()),
                bright_magenta: Some("#bb9af7".into()),
                bright_cyan: Some("#0db9d7".into()),
                bright_white: Some("#acb0d0".into()),
            },
            shell: ShellConfig {
                windows: "powershell.exe".into(),
                linux: "/bin/bash".into(),
                macos: "/bin/zsh".into(),
            },
            terminal: TerminalSettings {
                scrollback: Some(5000),
                padding: Some(PaddingConfig {
                    x: 12, // Default horizontal padding
                    y: 8,  // Default vertical padding
                }),
            },
            profiles: Some(Profiles {
                default: "PowerShell".into(),
                list: vec![
                    Profile {
                        name: "PowerShell".into(),
                        command: "powershell.exe".into(),
                        args: None,
                        font: None,
                        theme: None,
                    },
                    Profile {
                        name: "WSL".into(),
                        command: "wsl.exe".into(),
                        args: None,
                        font: None,
                        theme: None,
                    },
                ],
            }),
            shortcuts: KeyboardShortcuts {
                new_tab: Shortcut {
                    key: "t".into(),
                    ctrl: true,
                    shift: true,
                    ..Default::default()
                },
                close_tab: Shortcut {
                    key: "w".into(),
                    ctrl: true,
                    shift: true,
                    ..Default::default()
                },
                reload_config: Shortcut {
                    key: "r".into(),
                    ctrl: true,
                    shift: true,
                    ..Default::default()
                },
                show_profiles: Shortcut {
                    key: "p".into(),
                    ctrl: true,
                    shift: true,
                    ..Default::default()
                },
            },
            window_controls: WindowControlsConfig {
                position: "left".into(),
                style: "native".into(),
                visible: true,
                custom: None,
            },
            tab_bar: TabBarConfig {
                visible: true,
                position: "top".into(),
                style: TabBarStyle {
                    height: 30,
                    background_color: "#1a1b26".into(),
                    active_tab: TabStyle {
                        background_color: "#24283b".into(),
                        border_color: "#32344a".into(),
                        text_color: "#a9b1d6".into(),
                    },
                    inactive_tab: TabStyle {
                        background_color: "#1a1b26".into(),
                        border_color: "#24283b".into(),
                        text_color: "#787c99".into(),
                    },
                },
            },
        }
    }
}

impl Config {
    pub fn load(app: &AppHandle) -> Result<Self, String> {
        let config_path = get_config_path(app)?;

        if !config_path.exists() {
            let config = Config::default();
            config.save(app)?;
            return Ok(config);
        }

        let content = fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read config file: {}", e))?;

        // First try to parse as current version
        if let Ok(mut config) = toml::from_str::<Config>(&content) {
            // Check if we need to upgrade from an older version
            if config.version < CURRENT_CONFIG_VERSION {
                config = Self::migrate_config(config)?;
                config.save(app)?;
            }
            return Ok(config);
        }

        // Try to parse as V0 (unversioned) config
        if let Ok(old_config) = toml::from_str::<ConfigV0>(&content) {
            let config = Self::migrate_from_v0(old_config);
            config.save(app)?;
            return Ok(config);
        }

        Err("Unable to parse config file".to_string())
    }

    fn migrate_config(mut config: Config) -> Result<Config, String> {
        match config.version {
            0 => {
                config.font.fallback_family = "Consolas, Monaco, monospace".into();
                config.terminal = TerminalSettings {
                    scrollback: Some(5000),
                    padding: Some(PaddingConfig { x: 12, y: 8 }),
                };
                config.version = 1;
            }
            _ => {}
        }
        Ok(config)
    }

    fn migrate_from_v0(old: ConfigV0) -> Config {
        Config {
            version: CURRENT_CONFIG_VERSION,
            font: old.font,
            theme: old.theme,
            shell: old.shell,
            terminal: TerminalSettings {
                scrollback: Some(5000),
                padding: Some(PaddingConfig { x: 12, y: 8 }),
            },
            profiles: None,
            shortcuts: KeyboardShortcuts {
                new_tab: Shortcut {
                    key: "t".into(),
                    ctrl: true,
                    shift: true,
                    ..Default::default()
                },
                close_tab: Shortcut {
                    key: "w".into(),
                    ctrl: true,
                    shift: true,
                    ..Default::default()
                },

                reload_config: Shortcut {
                    key: "r".into(),
                    ctrl: true,
                    shift: true,
                    ..Default::default()
                },
                show_profiles: Shortcut {
                    key: "p".into(),
                    ctrl: true,
                    shift: true,
                    ..Default::default()
                },
            },
            window_controls: WindowControlsConfig {
                position: "left".into(),
                style: "native".into(),
                visible: true,
                custom: None,
            },
            tab_bar: TabBarConfig {
                visible: true,
                position: "top".into(),
                style: TabBarStyle {
                    height: 30,
                    background_color: "#1a1b26".into(),
                    active_tab: TabStyle {
                        background_color: "#24283b".into(),
                        border_color: "#32344a".into(),
                        text_color: "#a9b1d6".into(),
                    },
                    inactive_tab: TabStyle {
                        background_color: "#1a1b26".into(),
                        border_color: "#24283b".into(),
                        text_color: "#787c99".into(),
                    },
                },
            },
        }
    }

    pub fn save(&self, app: &AppHandle) -> Result<(), String> {
        let config_path = get_config_path(app)?;

        if let Some(parent) = config_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create config directory: {}", e))?;
        }

        let content = toml::to_string_pretty(self)
            .map_err(|e| format!("Failed to serialize config: {}", e))?;

        fs::write(&config_path, content)
            .map_err(|e| format!("Failed to write config file: {}", e))?;

        Ok(())
    }
}

fn get_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let mut path = app
        .path()
        .app_config_dir()
        .map_err(|_| "Failed to get config directory".to_string())?;
    path.push("termillion.toml");
    Ok(path)
}

// Add Default implementation for Shortcut
impl Default for Shortcut {
    fn default() -> Self {
        Self {
            key: String::new(),
            ctrl: false,
            shift: false,
            alt: false,
            meta: false,
        }
    }
}

impl Default for KeyboardShortcuts {
    fn default() -> Self {
        Self {
            new_tab: Shortcut {
                key: "t".into(),
                ctrl: true,
                shift: true,
                ..Default::default()
            },
            close_tab: Shortcut {
                key: "w".into(),
                ctrl: true,
                shift: true,
                ..Default::default()
            },

            reload_config: Shortcut {
                key: "r".into(),
                ctrl: true,
                shift: true,
                ..Default::default()
            },
            show_profiles: Shortcut {
                key: "p".into(),
                ctrl: true,
                shift: true,
                ..Default::default()
            },
        }
    }
}
