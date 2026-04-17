use encoding_rs;
use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Serialize, Deserialize)]
pub struct CommandResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

fn decode_output(bytes: &[u8]) -> String {
    if bytes.is_empty() {
        return String::new();
    }
    if let Ok(s) = String::from_utf8(bytes.to_vec()) {
        return s;
    }
    let (cow, _encoding, _had_errors) = encoding_rs::GBK.decode(bytes);
    cow.into_owned()
}

#[tauri::command]
pub async fn execute_command(
    command: String,
    args: Vec<String>,
    _timeout: Option<u64>,
) -> Result<CommandResult, String> {
    let _timeout_ms = _timeout.unwrap_or(30000);

    let blocked_commands = [
        "rm -rf",
        "format",
        "del /s",
        "shutdown",
        "reboot",
        "mkfs",
        "dd if=",
        "> /dev/sd",
        "chmod -R 777 /",
        "chown -R",
    ];

    let command_lower = command.to_lowercase();
    for blocked in &blocked_commands {
        if command_lower.contains(blocked) {
            return Err(format!("Blocked command detected: {}", blocked));
        }
    }

    let output = if cfg!(target_os = "windows") {
        Command::new("cmd")
            .args(["/C", &command])
            .args(&args)
            .output()
    } else {
        Command::new("sh")
            .args(["-c", &command])
            .output()
    };

    match output {
        Ok(output) => {
            let stdout = decode_output(&output.stdout);
            let stderr = decode_output(&output.stderr);
            let exit_code = output.status.code().unwrap_or(-1);

            Ok(CommandResult {
                stdout,
                stderr,
                exit_code,
            })
        }
        Err(e) => Err(format!("Failed to execute command: {}", e)),
    }
}

#[tauri::command]
pub async fn execute_powershell(
    command: String,
    _timeout: Option<u64>,
) -> Result<CommandResult, String> {
    if !cfg!(target_os = "windows") {
        return Err("PowerShell is only available on Windows".to_string());
    }

    let full_command =
        format!("[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; {}", command);
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &full_command,
        ])
        .output();

    match output {
        Ok(output) => {
            let stdout = decode_output(&output.stdout);
            let stderr = decode_output(&output.stderr);
            let exit_code = output.status.code().unwrap_or(-1);

            Ok(CommandResult {
                stdout,
                stderr,
                exit_code,
            })
        }
        Err(e) => Err(format!("Failed to execute PowerShell command: {}", e)),
    }
}

#[tauri::command]
pub async fn get_system_info() -> Result<SystemInfo, String> {
    let os_name = if cfg!(target_os = "windows") {
        "Windows"
    } else if cfg!(target_os = "macos") {
        "macOS"
    } else if cfg!(target_os = "linux") {
        "Linux"
    } else {
        "Unknown"
    };

    let home_dir = dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    let current_dir = std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    let username = whoami::username();
    let hostname = whoami::fallible::hostname().unwrap_or_default();

    Ok(SystemInfo {
        os: os_name.to_string(),
        home_dir,
        current_dir,
        username,
        hostname,
    })
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SystemInfo {
    pub os: String,
    pub home_dir: String,
    pub current_dir: String,
    pub username: String,
    pub hostname: String,
}
