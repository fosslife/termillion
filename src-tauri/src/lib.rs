// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod config;
mod pty;

use config::Config;
use pty::PtyManager;

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
    let pty_manager = PtyManager::new();

    tauri::Builder::default()
        .manage(pty_manager)
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            create_pty,
            resize_pty,
            destroy_pty,
            write_pty,
            get_config,
            save_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
async fn write_pty(
    state: tauri::State<'_, PtyManager>,
    pty_id: String,
    data: String,
) -> Result<(), String> {
    state.write_pty(pty_id, data)
}

#[tauri::command]
async fn create_pty(
    window: tauri::Window,
    state: tauri::State<'_, PtyManager>,
    cwd: String,
    rows: u16,
    cols: u16,
) -> Result<String, String> {
    state.create_pty(cwd, rows, cols, window).await
}

#[tauri::command]
async fn resize_pty(
    state: tauri::State<'_, PtyManager>,
    pty_id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    state.resize_pty(pty_id, rows, cols)
}

#[tauri::command]
async fn destroy_pty(state: tauri::State<'_, PtyManager>, pty_id: String) -> Result<(), String> {
    state.destroy_pty(pty_id);
    Ok(())
}
