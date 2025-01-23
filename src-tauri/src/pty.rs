use portable_pty::{Child, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::Emitter;
use tauri::{async_runtime::spawn, Manager, Window};
use uuid::Uuid;

struct PtyInstance {
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn Child + Send + Sync>,
    writer: Box<dyn Write + Send>,
}

pub struct PtyManager {
    ptys: Arc<Mutex<HashMap<String, PtyInstance>>>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            ptys: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn create_pty_with_command(
        &self,
        window: Window,
        cwd: String,
        rows: u16,
        cols: u16,
        command: String,
        args: Option<Vec<String>>,
    ) -> Result<String, String> {
        // Create command builder
        let mut cmd = CommandBuilder::new(command);

        // Add any provided arguments
        if let Some(args) = args {
            for arg in args {
                cmd.arg(arg);
            }
        }

        // Set working directory
        cmd.cwd(cwd);

        // Create new PTY
        let pty_system = portable_pty::native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to create PTY pair: {}", e))?;

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn command: {}", e))?;

        // Clone reader before moving master
        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to get PTY reader: {}", e))?;

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to get PTY writer: {}", e))?;

        let pty_id = Uuid::new_v4().to_string();

        let mut ptys = self.ptys.lock().unwrap();
        ptys.insert(
            pty_id.clone(),
            PtyInstance {
                master: pair.master,
                child,
                writer,
            },
        );

        // Set up output handling
        let pty_id_clone = pty_id.clone();
        let ptys_clone = Arc::clone(&self.ptys);
        let window_clone = window.clone();

        spawn(async move {
            let mut buffer = [0u8; 4096];
            loop {
                match reader.read(&mut buffer) {
                    Ok(0) => {
                        // EOF - PTY has closed
                        window_clone
                            .emit(&format!("pty://exit/{}", pty_id_clone), ())
                            .unwrap_or_else(|e| eprintln!("Failed to emit PTY exit: {}", e));
                        break;
                    }
                    Ok(n) => {
                        let output = String::from_utf8_lossy(&buffer[..n]);
                        window_clone
                            .emit(
                                &format!("pty://output/{}", pty_id_clone),
                                output.to_string(),
                            )
                            .unwrap_or_else(|e| eprintln!("Failed to emit PTY output: {}", e));
                    }
                    Err(e) => {
                        eprintln!("Failed to read from PTY: {}", e);
                        break;
                    }
                }
            }

            // Cleanup when PTY exits
            let mut ptys = ptys_clone.lock().unwrap();
            ptys.remove(&pty_id_clone);
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
