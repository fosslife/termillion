use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Window};
use uuid::Uuid;

use super::utils;

// Module for PTY data structures
mod types {
    use super::*;
    use std::io::Write;

    // Store PTY instances and their associated child processes
    pub struct PtyInstance {
        pub master: Box<dyn MasterPty + Send>,
        pub child: Box<dyn Child + Send>,
        pub reader_thread: Option<thread::JoinHandle<()>>,
        pub exit_watcher: Option<thread::JoinHandle<()>>,
        pub writer: Option<Box<dyn Write + Send>>,
    }

    // Struct for PTY size
    #[derive(Debug, Serialize, Deserialize, Clone)]
    pub struct PtySizeDto {
        pub rows: u16,
        pub cols: u16,
        pub pixel_width: u16,
        pub pixel_height: u16,
    }

    impl From<PtySizeDto> for PtySize {
        fn from(size: PtySizeDto) -> Self {
            PtySize {
                rows: size.rows,
                cols: size.cols,
                pixel_width: size.pixel_width,
                pixel_height: size.pixel_height,
            }
        }
    }
}

// Module for PTY store
mod store {
    use super::types::PtyInstance;
    use super::*;

    // Global PTY store
    lazy_static::lazy_static! {
        static ref PTY_STORE: Mutex<HashMap<String, PtyInstance>> = Mutex::new(HashMap::new());
    }

    // Add a PTY to the store
    pub fn add(id: String, instance: PtyInstance) {
        let mut store = PTY_STORE.lock().unwrap();
        store.insert(id, instance);
    }

    // Get a mutable reference to a PTY
    pub fn get_mut(id: &str) -> Option<std::sync::MutexGuard<HashMap<String, PtyInstance>>> {
        let store = PTY_STORE.lock().unwrap();
        if store.contains_key(id) {
            Some(store)
        } else {
            None
        }
    }

    // Get a reference to a PTY
    pub fn get(id: &str) -> Option<std::sync::MutexGuard<HashMap<String, PtyInstance>>> {
        let store = PTY_STORE.lock().unwrap();
        if store.contains_key(id) {
            Some(store)
        } else {
            None
        }
    }

    // Remove a PTY from the store
    pub fn remove(id: &str) -> Option<PtyInstance> {
        let mut store = PTY_STORE.lock().unwrap();
        store.remove(id)
    }

    // Get all PTY IDs
    pub fn get_all_ids() -> Vec<String> {
        let store = PTY_STORE.lock().unwrap();
        store.keys().cloned().collect()
    }
}

// Use our types
use types::*;

// Create a new PTY and return its ID
#[tauri::command]
pub async fn create_pty(
    window: Window,
    _app: AppHandle,
    cwd: String,
    rows: u16,
    cols: u16,
    command: Option<String>,
    args: Option<Vec<String>>,
) -> Result<String, String> {
    // Generate a unique ID for this PTY
    let pty_id = Uuid::new_v4().to_string();

    // Create PTY system
    let pty_system = native_pty_system();

    // Configure PTY size
    let size = PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    };

    // Open a new PTY
    let pair = pty_system.openpty(size).map_err(|e| e.to_string())?;

    // Prepare command
    let mut cmd_builder = if let Some(cmd) = command {
        CommandBuilder::new(cmd)
    } else {
        // Use default shell based on platform
        utils::get_default_shell()
    };

    // Set working directory
    cmd_builder.cwd(cwd);

    // Add arguments if provided
    if let Some(arg_list) = args {
        for arg in arg_list {
            cmd_builder.arg(arg);
        }
    }

    // Important: Drop the slave after spawning the command
    // This is necessary to avoid deadlocks and ensure proper cleanup
    let child = {
        let child = pair
            .slave
            .spawn_command(cmd_builder)
            .map_err(|e| e.to_string())?;
        // Explicitly drop the slave handle after spawning
        drop(pair.slave);
        child
    };

    // Clone window and pty_id for the reader thread
    let window_clone = window.clone();
    let pty_id_clone = pty_id.clone();

    // Create a reader for the PTY output
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;

    // Take the writer once and store it
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    // Spawn a thread to read from the PTY and emit events
    let reader_thread = thread::spawn(move || {
        let mut buffer = [0u8; 8192];

        loop {
            match reader.read(&mut buffer) {
                Ok(0) => {
                    // End of stream, PTY closed
                    break;
                }
                Ok(n) => {
                    // Convert bytes to string and emit event
                    let output = String::from_utf8_lossy(&buffer[0..n]).to_string();

                    // Emit event with PTY output
                    if let Err(e) =
                        window_clone.emit(&format!("pty://output/{}", pty_id_clone), output)
                    {
                        eprintln!("Failed to emit PTY output: {}", e);
                    }
                }
                Err(e) => {
                    eprintln!("Error reading from PTY: {}", e);
                    break;
                }
            }
        }

        // Emit PTY exit event
        if let Err(e) = window_clone.emit(&format!("pty://exit/{}", pty_id_clone), ()) {
            eprintln!("Failed to emit PTY exit event: {}", e);
        }
    });

    // Store the PTY instance first
    store::add(
        pty_id.clone(),
        PtyInstance {
            master: pair.master,
            child,
            reader_thread: Some(reader_thread),
            exit_watcher: None, // We'll set this after creating the thread
            writer: Some(writer),
        },
    );

    // Create a thread to watch for process exit
    let window_exit_clone = window.clone();
    let pty_id_exit_clone = pty_id.clone();

    let exit_watcher = thread::spawn(move || {
        // Sleep a bit to ensure the PTY is fully set up
        thread::sleep(Duration::from_millis(100));

        // Periodically check if the process has exited
        loop {
            // Get the PTY from the store
            if let Some(mut store) = store::get_mut(&pty_id_exit_clone) {
                let pty = match store.get_mut(&pty_id_exit_clone) {
                    Some(p) => p,
                    None => break, // PTY was removed, exit the loop
                };

                // Check if the process has exited
                match pty.child.try_wait() {
                    Ok(Some(status)) => {
                        // Process has exited
                        println!("PTY process exited with status: {:?}", status);

                        // Emit exit event with status
                        if let Err(e) = window_exit_clone.emit(
                            &format!("pty://exit/{}", pty_id_exit_clone),
                            serde_json::json!({ "status": format!("{:?}", status) }),
                        ) {
                            eprintln!("Failed to emit PTY exit event: {}", e);
                        }

                        // Clean up the PTY after a short delay to allow final output to be read
                        drop(store); // Release the lock before sleeping
                        thread::sleep(Duration::from_millis(100));

                        // Try to remove the PTY from the store
                        if let Some(mut pty) = store::remove(&pty_id_exit_clone) {
                            // We don't need to kill the child as it's already exited
                            // Just clean up the reader thread
                            if let Some(_thread) = pty.reader_thread.take() {
                                // We can't really join here as it might be blocked on read
                                // Just let it drop and clean up naturally
                            }
                        }

                        break; // Exit the loop
                    }
                    Ok(None) => {
                        // Process is still running, continue checking
                        drop(store); // Release the lock before sleeping
                        thread::sleep(Duration::from_millis(500));
                    }
                    Err(e) => {
                        // Error checking process status
                        eprintln!("Error checking PTY child status: {}", e);
                        drop(store); // Release the lock before sleeping
                        thread::sleep(Duration::from_millis(500));
                    }
                }
            } else {
                // PTY not found, exit the loop
                break;
            }
        }
    });

    // Update the PTY instance with the exit watcher thread
    if let Some(mut store) = store::get_mut(&pty_id) {
        if let Some(pty) = store.get_mut(&pty_id) {
            pty.exit_watcher = Some(exit_watcher);
        }
    }

    Ok(pty_id)
}

// Write data to a PTY
#[tauri::command]
pub async fn write_pty(pty_id: String, data: String) -> Result<(), String> {
    if let Some(mut store) = store::get_mut(&pty_id) {
        let pty = store.get_mut(&pty_id).unwrap();

        // Use the stored writer instead of taking it each time
        if let Some(writer) = &mut pty.writer {
            writer
                .write_all(data.as_bytes())
                .map_err(|e| e.to_string())?;
            writer.flush().map_err(|e| e.to_string())?;
            Ok(())
        } else {
            // If the writer is not available, try to take it again
            let mut writer = pty.master.take_writer().map_err(|e| e.to_string())?;
            writer
                .write_all(data.as_bytes())
                .map_err(|e| e.to_string())?;
            writer.flush().map_err(|e| e.to_string())?;

            // Store the writer for future use
            pty.writer = Some(writer);
            Ok(())
        }
    } else {
        Err(format!("PTY with ID {} not found", pty_id))
    }
}

// Resize a PTY
#[tauri::command]
pub async fn resize_pty(pty_id: String, rows: u16, cols: u16) -> Result<(), String> {
    if let Some(store) = store::get(&pty_id) {
        let pty = store.get(&pty_id).unwrap();

        let size = PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        };

        pty.master.resize(size).map_err(|e| e.to_string())?;

        Ok(())
    } else {
        Err(format!("PTY with ID {} not found", pty_id))
    }
}

// Destroy a PTY
#[tauri::command]
pub async fn destroy_pty(pty_id: String) -> Result<(), String> {
    if let Some(mut pty) = store::remove(&pty_id) {
        // First try to gracefully kill the child process
        if let Err(e) = pty.child.kill() {
            eprintln!("Failed to kill PTY child process: {}", e);
            // Continue anyway, as the process might have already exited
        }

        // Wait for the child to exit with a timeout
        let wait_result = pty.child.wait();
        match wait_result {
            Ok(status) => {
                println!("PTY child exited with status: {:?}", status);
            }
            Err(e) => {
                eprintln!("Failed to wait for PTY child: {}", e);
                // Continue anyway, we're cleaning up
            }
        }

        // Clean up the threads
        if let Some(_thread) = pty.reader_thread.take() {
            // We can't really join here as it might be blocked on read
            // Just let it drop and clean up naturally
        }

        if let Some(_thread) = pty.exit_watcher.take() {
            // Same for the exit watcher
        }

        // Drop the writer explicitly
        drop(pty.writer.take());

        Ok(())
    } else {
        // If the PTY is not found, it might have already been cleaned up
        // Just return success
        Ok(())
    }
}

// Check if a PTY is alive
#[tauri::command]
pub async fn is_pty_alive(pty_id: String) -> Result<bool, String> {
    if let Some(mut store) = store::get_mut(&pty_id) {
        let pty = store.get_mut(&pty_id).unwrap();

        // Try to get exit status - if we can, it's not running
        match pty.child.try_wait() {
            Ok(Some(_)) => Ok(false), // Process has exited
            Ok(None) => Ok(true),     // Process is still running
            Err(e) => Err(e.to_string()),
        }
    } else {
        // If the PTY is not found, it's not alive
        Ok(false)
    }
}

// Get all active PTY IDs
#[tauri::command]
pub async fn get_active_ptys() -> Result<Vec<String>, String> {
    Ok(store::get_all_ids())
}
