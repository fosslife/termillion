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
pub struct FontConfig {
    pub family: String,
    pub fallback_family: String,
    pub size: u16,
    pub line_height: f32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ThemeConfig {
    pub background: String,
    pub foreground: String,
    pub cursor: String,
    pub selection: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ShellConfig {
    pub windows: String,
    pub linux: String,
    pub macos: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TerminalSettings {
    pub scrollback: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Profile {
    pub name: String,
    pub command: String,
    pub args: Option<Vec<String>>,
    // Optional overrides
    pub font: Option<FontConfig>,
    pub theme: Option<ThemeConfig>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Profiles {
    pub default: String,
    pub list: Vec<Profile>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Config {
    pub version: u32,
    pub font: FontConfig,
    pub theme: ThemeConfig,
    pub shell: ShellConfig, // Keep for backwards compatibility
    pub terminal: TerminalSettings,
    pub profiles: Option<Profiles>, // Optional new section
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
                line_height: 1.5,
            },
            theme: ThemeConfig {
                background: "#1a1b26".into(),
                foreground: "#a9b1d6".into(),
                cursor: "#c0caf5".into(),
                selection: "#283457".into(),
            },
            shell: ShellConfig {
                windows: "powershell.exe".into(),
                linux: "/bin/bash".into(),
                macos: "/bin/zsh".into(),
            },
            terminal: TerminalSettings {
                scrollback: Some(5000),
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
                // Add fallback font
                config.font.fallback_family = "Consolas, Monaco, monospace".into();
                config.terminal = TerminalSettings {
                    scrollback: Some(5000),
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
            },
            profiles: None,
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
