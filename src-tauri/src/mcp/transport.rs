use crate::mcp::types::{JsonRpcRequest, JsonRpcResponse};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

static REQUEST_ID_COUNTER: AtomicU64 = AtomicU64::new(1);

const READ_TIMEOUT_SECS: u64 = 30;
const MAX_SKIP_LINES: usize = 1000;

pub struct StdioTransport {
    child: Option<Child>,
    reader: Option<BufReader<std::process::ChildStdout>>,
    writer: Option<std::process::ChildStdin>,
    stderr_buffer: Arc<Mutex<String>>,
}

impl StdioTransport {
    pub fn new() -> Self {
        Self {
            child: None,
            reader: None,
            writer: None,
            stderr_buffer: Arc::new(Mutex::new(String::new())),
        }
    }

    pub fn spawn(
        &mut self,
        command: &str,
        args: &[String],
        env: &HashMap<String, String>,
    ) -> Result<(), String> {
        let (cmd_name, cmd_args) = if cfg!(windows) {
            let mut all_args = vec![command.to_string()];
            all_args.extend(args.iter().cloned());
            ("cmd", vec!["/C".to_string()].into_iter().chain(all_args).collect::<Vec<_>>())
        } else {
            (command, args.to_vec())
        };

        let mut cmd = Command::new(cmd_name);
        cmd.args(&cmd_args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }

        for (key, value) in env {
            cmd.env(key, value);
        }

        let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn process '{}': {}", command, e))?;

        let stdin = child.stdin.take().ok_or("Failed to get stdin")?;
        let stdout = child.stdout.take().ok_or("Failed to get stdout")?;
        let stderr = child.stderr.take().ok_or("Failed to get stderr")?;

        self.capture_stderr(stderr);

        self.writer = Some(stdin);
        self.reader = Some(BufReader::new(stdout));
        self.child = Some(child);

        Ok(())
    }

    fn capture_stderr(&self, stderr: std::process::ChildStderr) {
        let buffer = self.stderr_buffer.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                match line {
                    Ok(l) => {
                        let mut buf = buffer.lock().unwrap();
                        if buf.len() < 10000 {
                            buf.push_str(&l);
                            buf.push('\n');
                        }
                    }
                    Err(_) => break,
                }
            }
        });
    }

    pub fn get_stderr(&self) -> String {
        self.stderr_buffer.lock().unwrap().clone()
    }

    pub fn clear_stderr(&self) {
        self.stderr_buffer.lock().unwrap().clear();
    }

    pub fn send(&mut self, request: &JsonRpcRequest) -> Result<(), String> {
        let writer = self.writer.as_mut().ok_or("Transport not connected")?;
        let mut json = serde_json::to_string(request).map_err(|e| format!("Serialize error: {}", e))?;
        json.push('\n');
        writer.write_all(json.as_bytes()).map_err(|e| format!("Write error: {}", e))?;
        writer.flush().map_err(|e| format!("Flush error: {}", e))?;
        Ok(())
    }

    pub fn read_response(&mut self) -> Result<JsonRpcResponse, String> {
        self.read_response_with_timeout(READ_TIMEOUT_SECS)
    }

    pub fn read_response_with_timeout(&mut self, timeout_secs: u64) -> Result<JsonRpcResponse, String> {
        let reader = self.reader.as_mut().ok_or("Transport not connected")?;

        let start = Instant::now();
        let mut skipped = 0;

        loop {
            if start.elapsed() > Duration::from_secs(timeout_secs) {
                let stderr = self.get_stderr();
                let stderr_hint = if !stderr.is_empty() {
                    format!("\nServer stderr (last 500 chars): {}",
                        if stderr.len() > 500 { &stderr[stderr.len()-500..] } else { &stderr })
                } else {
                    String::new()
                };
                return Err(format!("Timeout after {}s waiting for response{}", timeout_secs, stderr_hint));
            }

            let mut line = String::new();
            match reader.read_line(&mut line) {
                Ok(0) => {
                    let stderr = self.get_stderr();
                    let stderr_hint = if !stderr.is_empty() {
                        format!("\nServer stderr (last 500 chars): {}",
                            if stderr.len() > 500 { &stderr[stderr.len()-500..] } else { &stderr })
                    } else {
                        String::new()
                    };
                    return Err(format!("Server closed connection (EOF){}", stderr_hint));
                }
                Ok(_) => {
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        skipped += 1;
                        if skipped > MAX_SKIP_LINES {
                            return Err("Too many empty lines, giving up".to_string());
                        }
                        continue;
                    }
                    if !trimmed.starts_with('{') {
                        skipped += 1;
                        if skipped > MAX_SKIP_LINES {
                            return Err(format!("Too many non-JSON lines, giving up. Last line: {}", &trimmed[..trimmed.len().min(200)]));
                        }
                        continue;
                    }

                    let response: JsonRpcResponse = serde_json::from_str(trimmed)
                        .map_err(|e| format!("Parse error: {} (input: {})", e, &trimmed[..trimmed.len().min(200)]))?;
                    return Ok(response);
                }
                Err(e) => {
                    return Err(format!("Read error: {}", e));
                }
            }
        }
    }

    pub fn send_notification(&mut self, method: &str, params: Option<serde_json::Value>) -> Result<(), String> {
        let writer = self.writer.as_mut().ok_or("Transport not connected")?;
        let notification = serde_json::json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params.unwrap_or(serde_json::Value::Null),
        });
        let mut json = serde_json::to_string(&notification).map_err(|e| format!("Serialize error: {}", e))?;
        json.push('\n');
        writer.write_all(json.as_bytes()).map_err(|e| format!("Write error: {}", e))?;
        writer.flush().map_err(|e| format!("Flush error: {}", e))?;
        Ok(())
    }

    pub fn kill(&mut self) -> Result<(), String> {
        if let Some(ref mut child) = self.child {
            let _ = child.kill();
            let _ = child.wait();
        }
        self.child = None;
        self.reader = None;
        self.writer = None;
        Ok(())
    }

    pub fn is_alive(&mut self) -> bool {
        if let Some(ref mut child) = self.child {
            match child.try_wait() {
                Ok(None) => true,
                _ => false,
            }
        } else {
            false
        }
    }

    pub fn get_pid(&self) -> Option<u32> {
        self.child.as_ref().map(|c| c.id())
    }
}

impl Drop for StdioTransport {
    fn drop(&mut self) {
        let _ = self.kill();
    }
}

pub fn next_request_id() -> u64 {
    REQUEST_ID_COUNTER.fetch_add(1, Ordering::SeqCst)
}
