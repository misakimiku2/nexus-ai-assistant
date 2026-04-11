use crate::mcp::transport::{next_request_id, StdioTransport};
use crate::mcp::types::*;
use std::collections::HashMap;

pub struct McpClient {
    transport: StdioTransport,
    initialized: bool,
    server_info: Option<Implementation>,
    server_capabilities: Option<ServerCapabilities>,
    cached_tools: Option<Vec<McpToolDefinition>>,
}

impl McpClient {
    pub fn new() -> Self {
        Self {
            transport: StdioTransport::new(),
            initialized: false,
            server_info: None,
            server_capabilities: None,
            cached_tools: None,
        }
    }

    pub fn connect(
        &mut self,
        command: &str,
        args: &[String],
        env: &HashMap<String, String>,
    ) -> Result<(), String> {
        self.transport.spawn(command, args, env)?;
        Ok(())
    }

    pub fn initialize(&mut self) -> Result<InitializeResult, String> {
        self.initialize_with_timeout(30)
    }

    pub fn initialize_with_timeout(&mut self, timeout_secs: u64) -> Result<InitializeResult, String> {
        let id = next_request_id();
        let params = InitializeParams {
            protocol_version: "2024-11-05".to_string(),
            capabilities: ClientCapabilities {
                roots: Some(RootsCapability {
                    list_changed: true,
                }),
            },
            client_info: Implementation {
                name: "nexus-ai-assistant".to_string(),
                version: "0.1.0".to_string(),
            },
        };

        let request = JsonRpcRequest::new(
            id,
            "initialize",
            Some(serde_json::to_value(params).map_err(|e| format!("Serialize error: {}", e))?),
        );

        self.transport.send(&request)?;
        let response = self.transport.read_response_with_timeout(timeout_secs)?;

        if let Some(error) = response.error {
            return Err(format!("Initialize error: {} (code: {})", error.message, error.code));
        }

        let result_value = response.result.ok_or("No result in initialize response")?;
        let result: InitializeResult = serde_json::from_value(result_value)
            .map_err(|e| format!("Deserialize initialize result: {}", e))?;

        self.server_info = Some(result.server_info.clone());
        self.server_capabilities = Some(result.capabilities.clone());

        self.transport.send_notification("notifications/initialized", None)?;

        self.initialized = true;
        Ok(result)
    }

    pub fn list_tools(&mut self) -> Result<Vec<McpToolDefinition>, String> {
        self.list_tools_with_timeout(30)
    }

    pub fn list_tools_with_timeout(&mut self, timeout_secs: u64) -> Result<Vec<McpToolDefinition>, String> {
        if !self.initialized {
            return Err("Client not initialized".to_string());
        }

        if let Some(ref tools) = self.cached_tools {
            return Ok(tools.clone());
        }

        let id = next_request_id();
        let request = JsonRpcRequest::new(id, "tools/list", None);

        self.transport.send(&request)?;
        let response = self.transport.read_response_with_timeout(timeout_secs)?;

        if let Some(error) = response.error {
            return Err(format!("List tools error: {} (code: {})", error.message, error.code));
        }

        let result_value = response.result.ok_or("No result in list_tools response")?;
        let result: ListToolsResult = serde_json::from_value(result_value)
            .map_err(|e| format!("Deserialize list_tools result: {}", e))?;

        self.cached_tools = Some(result.tools.clone());
        Ok(result.tools)
    }

    pub fn call_tool(
        &mut self,
        tool_name: &str,
        arguments: Option<serde_json::Value>,
    ) -> Result<CallToolResult, String> {
        self.call_tool_with_timeout(tool_name, arguments, 60)
    }

    pub fn call_tool_with_timeout(
        &mut self,
        tool_name: &str,
        arguments: Option<serde_json::Value>,
        timeout_secs: u64,
    ) -> Result<CallToolResult, String> {
        if !self.initialized {
            return Err("Client not initialized".to_string());
        }

        let id = next_request_id();
        let params = CallToolParams {
            name: tool_name.to_string(),
            arguments,
        };

        let request = JsonRpcRequest::new(
            id,
            "tools/call",
            Some(serde_json::to_value(params).map_err(|e| format!("Serialize error: {}", e))?),
        );

        self.transport.send(&request)?;
        let response = self.transport.read_response_with_timeout(timeout_secs)?;

        if let Some(error) = response.error {
            return Err(format!("Call tool error: {} (code: {})", error.message, error.code));
        }

        let result_value = response.result.ok_or("No result in call_tool response")?;
        let result: CallToolResult = serde_json::from_value(result_value)
            .map_err(|e| format!("Deserialize call_tool result: {}", e))?;

        Ok(result)
    }

    pub fn list_resources(&mut self) -> Result<Vec<McpResource>, String> {
        if !self.initialized {
            return Err("Client not initialized".to_string());
        }

        let id = next_request_id();
        let request = JsonRpcRequest::new(id, "resources/list", None);

        self.transport.send(&request)?;
        let response = self.transport.read_response()?;

        if let Some(error) = response.error {
            return Err(format!("List resources error: {} (code: {})", error.message, error.code));
        }

        let result_value = response.result.ok_or("No result in list_resources response")?;
        let result: ListResourcesResult = serde_json::from_value(result_value)
            .map_err(|e| format!("Deserialize list_resources result: {}", e))?;

        Ok(result.resources)
    }

    pub fn read_resource(&mut self, uri: &str) -> Result<ReadResourceResult, String> {
        if !self.initialized {
            return Err("Client not initialized".to_string());
        }

        let id = next_request_id();
        let params = ReadResourceParams {
            uri: uri.to_string(),
        };

        let request = JsonRpcRequest::new(
            id,
            "resources/read",
            Some(serde_json::to_value(params).map_err(|e| format!("Serialize error: {}", e))?),
        );

        self.transport.send(&request)?;
        let response = self.transport.read_response()?;

        if let Some(error) = response.error {
            return Err(format!("Read resource error: {} (code: {})", error.message, error.code));
        }

        let result_value = response.result.ok_or("No result in read_resource response")?;
        let result: ReadResourceResult = serde_json::from_value(result_value)
            .map_err(|e| format!("Deserialize read_resource result: {}", e))?;

        Ok(result)
    }

    pub fn invalidate_tools_cache(&mut self) {
        self.cached_tools = None;
    }

    pub fn shutdown(&mut self) -> Result<(), String> {
        self.transport.kill()?;
        self.initialized = false;
        self.server_info = None;
        self.server_capabilities = None;
        self.cached_tools = None;
        Ok(())
    }

    pub fn is_connected(&self) -> bool {
        self.initialized
    }

    pub fn get_server_info(&self) -> Option<&Implementation> {
        self.server_info.as_ref()
    }

    pub fn get_server_capabilities(&self) -> Option<&ServerCapabilities> {
        self.server_capabilities.as_ref()
    }

    pub fn get_stderr(&self) -> String {
        self.transport.get_stderr()
    }

    pub fn clear_stderr(&mut self) {
        self.transport.clear_stderr();
    }

    pub fn get_pid(&self) -> Option<u32> {
        self.transport.get_pid()
    }

    pub fn is_alive(&mut self) -> bool {
        self.transport.is_alive()
    }
}
