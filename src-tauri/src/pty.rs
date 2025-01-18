use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::async_runtime::spawn;
use tauri::Emitter;
use uuid::Uuid;

pub struct PtyManager {
    ptys: Arc<Mutex<HashMap<String, PtyInstance>>>,
}

struct PtyInstance {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            ptys: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn create_pty(
        &self,
        cwd: String,
        rows: u16,
        cols: u16,
        window: tauri::Window,
    ) -> Result<String, String> {
        let pty_system = native_pty_system();

        // Create PTY with size
        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;

        // Get default shell command
        let shell_cmd = if cfg!(target_os = "windows") {
            CommandBuilder::new("powershell.exe")
        } else {
            let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
            CommandBuilder::new(&shell)
        };

        // Configure command
        let mut cmd = shell_cmd;
        cmd.cwd(cwd);

        // Spawn shell in PTY
        let _child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

        // Generate unique ID for this PTY
        let pty_id = Uuid::new_v4().to_string();

        // Clone reader before moving master
        let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;

        // Get writer for sending input to PTY
        let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

        // Store PTY instance
        let mut ptys = self.ptys.lock().unwrap();
        ptys.insert(
            pty_id.clone(),
            PtyInstance {
                master: pair.master,
                writer,
            },
        );

        let pty_id_clone = pty_id.clone();
        let window_clone = window.clone();

        // Spawn async task to read PTY output
        spawn(async move {
            let mut buffer = [0u8; 1024];
            loop {
                match reader.read(&mut buffer) {
                    Ok(0) => break, // EOF
                    Ok(n) => {
                        let output = String::from_utf8_lossy(&buffer[..n]);
                        if let Err(e) = window_clone.emit(
                            &format!("pty://output/{}", pty_id_clone),
                            output.to_string(),
                        ) {
                            eprintln!("Failed to emit PTY output: {}", e);
                            break;
                        }
                    }
                    Err(e) => {
                        eprintln!("Failed to read from PTY: {}", e);
                        break;
                    }
                }
            }

            // Cleanup when PTY exits
            if let Err(e) = window_clone.emit(
                &format!("pty://exit/{}", pty_id_clone),
                "PTY process exited",
            ) {
                eprintln!("Failed to emit PTY exit event: {}", e);
            }
        });

        Ok(pty_id)
    }

    pub fn write_pty(&self, pty_id: String, data: String) -> Result<(), String> {
        let mut ptys = self.ptys.lock().unwrap();
        if let Some(pty) = ptys.get_mut(&pty_id) {
            pty.writer
                .write_all(data.as_bytes())
                .map_err(|e| e.to_string())?;
            pty.writer.flush().map_err(|e| e.to_string())?;
            Ok(())
        } else {
            Err("PTY not found".to_string())
        }
    }

    pub fn resize_pty(&self, pty_id: String, rows: u16, cols: u16) -> Result<(), String> {
        let ptys = self.ptys.lock().unwrap();
        if let Some(pty) = ptys.get(&pty_id) {
            pty.master
                .resize(PtySize {
                    rows,
                    cols,
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(|e| e.to_string())?;
            Ok(())
        } else {
            Err("PTY not found".to_string())
        }
    }

    pub fn destroy_pty(&self, pty_id: String) {
        let mut ptys = self.ptys.lock().unwrap();
        ptys.remove(&pty_id);
    }
}

// Make PtyManager Send + Sync
unsafe impl Send for PtyManager {}
unsafe impl Sync for PtyManager {}
