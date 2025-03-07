// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod config;
mod pty;
mod validation;

use std::env;

use config::Config;
use tauri::Manager;
use validation::ValidationError;

#[tauri::command]
async fn validate_config(app: tauri::AppHandle) -> Result<Vec<ValidationError>, String> {
    let config = Config::load(&app)?;
    Ok(config.validate())
}

#[tauri::command]
async fn get_config(app: tauri::AppHandle) -> Result<Config, String> {
    Config::load(&app)
}

#[tauri::command]
async fn save_config(app: tauri::AppHandle, config: Config) -> Result<(), String> {
    config.save(&app)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_config,
            validate_config,
            // PTY commands
            pty::create_pty,
            pty::write_pty,
            pty::resize_pty,
            pty::destroy_pty,
            pty::is_pty_alive,
            pty::get_active_ptys
        ])
        .setup(|app| {
            let process_arg: Vec<String> = env::args().collect();
            if process_arg.contains(&"--debug".to_string()) {
                // in prod build, if --debug is passed, open devtools
                app.get_webview_window("main").unwrap().open_devtools();
            }

            #[cfg(debug_assertions)]
            app.get_webview_window("main").unwrap().open_devtools();

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
