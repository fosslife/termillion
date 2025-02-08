use portable_pty::{Child, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::Emitter;
use tauri::{async_runtime::spawn, Window};
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
        let ptys_clone_err = Arc::clone(&self.ptys);
        let window_clone = window.clone();

        spawn(async move {
            async {
                let mut buffer = vec![0u8; 8192];
                loop {
                    match reader.read(&mut buffer) {
                        Ok(0) => break,
                        Ok(n) => {
                            if let Ok(output) = String::from_utf8(buffer[..n].to_vec()) {
                                if let Err(e) = window_clone
                                    .emit(&format!("pty://output/{}", pty_id_clone), output)
                                {
                                    eprintln!("Failed to emit PTY output: {}", e);
                                    break;
                                }
                            }
                        }
                        Err(e) => {
                            eprintln!("Failed to read from PTY: {}", e);
                            break;
                        }
                    }
                }
            }
            .await;

            // Proper cleanup
            let mut ptys = ptys_clone_err.lock().unwrap();
            if let Some(mut pty) = ptys.remove(&pty_id_clone) {
                if let Err(e) = pty.child.kill() {
                    eprintln!("Failed to kill PTY child process: {}", e);
                }
                if let Err(e) = pty.child.wait() {
                    eprintln!("Failed to wait for PTY child process: {}", e);
                }
            }

            // Notify frontend of PTY exit
            if let Err(e) = window_clone.emit(&format!("pty://exit/{}", pty_id_clone), ()) {
                eprintln!("Failed to emit PTY exit: {}", e);
            }
        });

        Ok(pty_id)
    }

    pub fn write_pty(&self, pty_id: String, data: String) -> Result<(), String> {
        let mut ptys = self
            .ptys
            .lock()
            .map_err(|e| format!("Mutex poison error: {}", e))?;

        let pty = ptys
            .get_mut(&pty_id)
            .ok_or_else(|| format!("PTY {} not found", pty_id))?;

        // Write in chunks for better performance with large data
        const CHUNK_SIZE: usize = 4096;
        let bytes = data.as_bytes();
        for chunk in bytes.chunks(CHUNK_SIZE) {
            pty.writer
                .write_all(chunk)
                .map_err(|e| format!("Write failed: {}", e))?;
        }

        pty.writer
            .flush()
            .map_err(|e| format!("Flush failed: {}", e))?;

        Ok(())
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

    pub fn is_pty_alive(&self, pty_id: &str) -> bool {
        if let Ok(mut ptys) = self.ptys.lock() {
            if let Some(pty) = ptys.get_mut(pty_id) {
                return match pty.child.try_wait() {
                    Ok(None) => true,     // Process is still running
                    Ok(Some(_)) => false, // Process has exited
                    Err(_) => false,      // Error checking process status
                };
            }
        }
        false
    }

    pub fn destroy_pty(&self, pty_id: String) {
        if let Ok(mut ptys) = self.ptys.lock() {
            if let Some(mut pty) = ptys.remove(&pty_id) {
                let _ = pty.child.kill();
                let _ = pty.child.wait();
            }
        }
    }
}

// Make PtyManager Send + Sync
unsafe impl Send for PtyManager {}
unsafe impl Sync for PtyManager {}
