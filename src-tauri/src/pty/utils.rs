use portable_pty::CommandBuilder;
use std::env;
use std::path::PathBuf;

/// Get the default shell for the current platform
pub fn get_default_shell() -> CommandBuilder {
    #[cfg(target_os = "windows")]
    {
        // On Windows, try to use PowerShell first, then cmd.exe as fallback
        if let Ok(powershell_path) = find_powershell() {
            CommandBuilder::new(powershell_path)
        } else {
            CommandBuilder::new("cmd.exe")
        }
    }

    #[cfg(target_os = "linux")]
    {
        // On Linux, try to use the SHELL env var, or bash as fallback
        if let Ok(shell) = env::var("SHELL") {
            CommandBuilder::new(shell)
        } else {
            CommandBuilder::new("bash")
        }
    }

    #[cfg(target_os = "macos")]
    {
        // On macOS, try to use the SHELL env var, or zsh as fallback
        if let Ok(shell) = env::var("SHELL") {
            CommandBuilder::new(shell)
        } else {
            CommandBuilder::new("zsh")
        }
    }
}

/// Find PowerShell on Windows
#[cfg(target_os = "windows")]
fn find_powershell() -> Result<String, String> {
    // Try PowerShell Core (pwsh.exe) first
    if let Ok(path) = which::which("pwsh.exe") {
        return Ok(path.to_string_lossy().to_string());
    }

    // Then try Windows PowerShell
    if let Ok(path) = which::which("powershell.exe") {
        return Ok(path.to_string_lossy().to_string());
    }

    // Check common installation paths
    let program_files =
        env::var("ProgramFiles").unwrap_or_else(|_| "C:\\Program Files".to_string());
    let program_files_x86 =
        env::var("ProgramFiles(x86)").unwrap_or_else(|_| "C:\\Program Files (x86)".to_string());

    // PowerShell Core paths
    let pwsh_paths = [
        format!("{}\\PowerShell\\7\\pwsh.exe", program_files),
        format!("{}\\PowerShell\\7-preview\\pwsh.exe", program_files),
        format!("{}\\PowerShell\\6\\pwsh.exe", program_files),
    ];

    // Windows PowerShell paths
    let powershell_paths = [
        "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe".to_string(),
        format!("{}\\PowerShell\\powershell.exe", program_files_x86),
    ];

    // Check all paths
    for path in pwsh_paths.iter().chain(powershell_paths.iter()) {
        if PathBuf::from(path).exists() {
            return Ok(path.clone());
        }
    }

    // Fallback to cmd.exe
    Err("PowerShell not found".to_string())
}

/// Get the current user's home directory
pub fn get_home_dir() -> Result<String, String> {
    dirs::home_dir()
        .map(|path| path.to_string_lossy().to_string())
        .ok_or_else(|| "Could not determine home directory".to_string())
}

/// Normalize a path for the current platform
pub fn normalize_path(path: &str) -> String {
    #[cfg(target_os = "windows")]
    {
        // Replace forward slashes with backslashes on Windows
        path.replace('/', "\\")
    }

    #[cfg(not(target_os = "windows"))]
    {
        // Replace backslashes with forward slashes on Unix
        path.replace('\\', "/")
    }
}

/// Check if a path exists
pub fn path_exists(path: &str) -> bool {
    PathBuf::from(path).exists()
}

/// Get the parent directory of a path
pub fn get_parent_dir(path: &str) -> Option<String> {
    PathBuf::from(path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
}
