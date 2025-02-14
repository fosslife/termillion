use documented::DocumentedFields;
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
    pub background: String,
    /// Default text color
    pub foreground: String,
    /// Cursor color
    pub cursor: String,
    /// Selected text background color
    pub selection: String,

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
/// Style configuration for interactive UI elements
pub struct InteractiveElementStyle {
    /// Background color
    pub background_color: String,
    /// Text color
    pub text_color: String,
    /// Border color
    pub border_color: String,
    /// Hover background color
    pub hover_background: String,
}

#[derive(Debug, Serialize, Deserialize)]
/// Window appearance configuration
pub struct WindowConfig {
    /// Height of the titlebar in pixels
    pub titlebar_height: u32,
    /// Background color of the titlebar
    pub titlebar_background: String,
    /// Style for interactive elements like buttons
    pub interactive: InteractiveElementStyle,
    /// Tab styling (left side of titlebar)
    pub tabs: WindowTabsStyle,
}

#[derive(Debug, Serialize, Deserialize)]
/// Style configuration for tabs in the titlebar
pub struct WindowTabsStyle {
    /// Style for active tab
    pub active: TabStyle,
    /// Style for inactive tabs
    pub inactive: TabStyle,
}

#[derive(Debug, Serialize, Deserialize)]
/// Style configuration for individual tabs
pub struct TabStyle {
    /// Background color
    pub background_color: String,
    /// Text color
    pub text_color: String,
}

#[derive(Debug, Serialize, Deserialize, DocumentedFields)]
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
    /// Window appearance and behavior
    pub window: WindowConfig,
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
                // Base colors
                background: "#282c34".into(), // Darker background for better contrast
                foreground: "#abb2bf".into(), // Softer white for main text
                cursor: "#528bff".into(),     // Bright blue cursor
                selection: "#3e4451".into(),  // Subtle grey selection
                black: Some("#3f4451".into()), // Dark grey for black
                red: Some("#e06c75".into()),  // Soft red for errors
                green: Some("#98c379".into()), // Natural green for success
                yellow: Some("#e5c07b".into()), // Warm yellow for warnings
                blue: Some("#61afef".into()), // Clear blue for info
                magenta: Some("#c678dd".into()), // Rich purple for special items
                cyan: Some("#56b6c2".into()), // Teal for alternate info
                white: Some("#dcdfe4".into()), // Light grey for white
                bright_black: Some("#5c6370".into()), // Brighter grey for comments
                bright_red: Some("#ff7a85".into()), // Vibrant red
                bright_green: Some("#b5e890".into()), // Lighter green
                bright_yellow: Some("#ffd68a".into()), // Bright yellow
                bright_blue: Some("#80caff".into()), // Sky blue
                bright_magenta: Some("#d7a1e7".into()), // Light purple
                bright_cyan: Some("#7bc6d0".into()), // Light teal
                bright_white: Some("#f0f2f4".into()), // Nearly white
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
            window: WindowConfig {
                titlebar_height: 35,
                titlebar_background: "#1e2227".into(),
                interactive: InteractiveElementStyle {
                    background_color: "#32344a".into(),
                    text_color: "#abb2bf".into(),
                    border_color: "#21252b".into(),
                    hover_background: "#3e4451".into(),
                },
                tabs: WindowTabsStyle {
                    active: TabStyle {
                        background_color: "#24283b".into(),
                        text_color: "#a9b1d6".into(),
                    },
                    inactive: TabStyle {
                        background_color: "#1a1b26".into(),
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
            window: WindowConfig {
                titlebar_height: 35,
                titlebar_background: "#1e2227".into(),
                interactive: InteractiveElementStyle {
                    background_color: "#32344a".into(),
                    text_color: "#abb2bf".into(),
                    border_color: "#21252b".into(),
                    hover_background: "#3e4451".into(),
                },
                tabs: WindowTabsStyle {
                    active: TabStyle {
                        background_color: "#24283b".into(),
                        text_color: "#a9b1d6".into(),
                    },
                    inactive: TabStyle {
                        background_color: "#1a1b26".into(),
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

        // Convert to string first to get the table format
        let content = toml::to_string_pretty(self)
            .map_err(|e| format!("Failed to serialize config: {}", e))?;

        // Parse into toml_edit Document to preserve formatting
        let mut doc = content
            .parse::<toml_edit::DocumentMut>()
            .map_err(|e| format!("Failed to parse TOML document: {}", e))?;

        // Add doc comments for each field
        for table_key in [
            "font",
            "theme",
            "shell",
            "terminal",
            "profiles",
            "shortcuts",
            "window",
        ] {
            if let Some(table) = doc.get_mut(table_key) {
                if let Ok(comment) = Self::get_field_docs(table_key) {
                    let mut formatted_comment = String::new();
                    formatted_comment.push_str("\n"); // Add newline before comment
                    for line in comment.lines() {
                        let line = if line.is_empty() {
                            String::from("#\n")
                        } else {
                            format!("# {line}\n")
                        };
                        formatted_comment.push_str(&line);
                    }
                    if let Some(decor) = table.as_table_mut().map(|t| t.decor_mut()) {
                        decor.set_prefix(formatted_comment);
                    }
                }
            }
        }

        // Write the document to file
        fs::write(&config_path, doc.to_string())
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
