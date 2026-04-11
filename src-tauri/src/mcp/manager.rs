use crate::mcp::client::McpClient;
use crate::mcp::types::*;
use std::collections::HashMap;
use std::sync::Mutex;

pub struct ManagedServer {
    pub config: McpServerConfig,
    pub client: McpClient,
    pub status: McpServerStatus,
    pub error: Option<String>,
    pub cached_tools: Vec<McpToolDefinition>,
}

pub struct McpServerManager {
    servers: HashMap<String, ManagedServer>,
    active_calls: usize,
    max_concurrent_calls: usize,
}

impl McpServerManager {
    pub fn new() -> Self {
        Self {
            servers: HashMap::new(),
            active_calls: 0,
            max_concurrent_calls: 5,
        }
    }

    pub fn check_duplicate(&self, config: &McpServerConfig) -> Option<String> {
        for (existing_id, server) in &self.servers {
            if existing_id != &config.id {
                if server.config.name == config.name {
                    return Some(format!("已存在同名MCP服务: {}", config.name));
                }
                let existing_cmd_key = format!("{}:{:?}", server.config.command, server.config.args);
                let new_cmd_key = format!("{}:{:?}", config.command, config.args);
                if existing_cmd_key == new_cmd_key {
                    return Some(format!("已存在相同命令的MCP服务: {} {}", config.command, config.args.join(" ")));
                }
            }
        }
        None
    }

    pub fn add_server(&mut self, config: McpServerConfig) -> Result<McpServerInfo, String> {
        if let Some(dup_error) = self.check_duplicate(&config) {
            return Err(dup_error);
        }

        if self.servers.contains_key(&config.id) {
            return Err(format!("Server with id '{}' already exists", config.id));
        }

        let mut client = McpClient::new();
        let mut status = McpServerStatus::Connecting;
        let mut error = None;
        let mut tools = Vec::new();
        let connect_timeout = config.connect_timeout_secs;

        match client.connect(&config.command, &config.args, &config.env) {
            Ok(()) => {
                match client.initialize_with_timeout(connect_timeout) {
                    Ok(_) => {
                        match client.list_tools_with_timeout(connect_timeout) {
                            Ok(t) => {
                                tools = t.clone();
                                status = McpServerStatus::Connected;
                            }
                            Err(e) => {
                                error = Some(format!("Failed to list tools: {}", e));
                                status = McpServerStatus::Error;
                            }
                        }
                    }
                    Err(e) => {
                        error = Some(format!("Failed to initialize: {}", e));
                        status = McpServerStatus::Error;
                        let _ = client.shutdown();
                    }
                }
            }
            Err(e) => {
                error = Some(format!("Failed to connect: {}", e));
                status = McpServerStatus::Error;
            }
        }

        let info = McpServerInfo {
            id: config.id.clone(),
            name: config.name.clone(),
            command: config.command.clone(),
            args: config.args.clone(),
            env: config.env.clone(),
            status: status.clone(),
            tools: tools.clone(),
            error: error.clone(),
            enabled: config.enabled,
            tool_timeout_secs: config.tool_timeout_secs,
            connect_timeout_secs: config.connect_timeout_secs,
        };

        self.servers.insert(
            config.id.clone(),
            ManagedServer {
                config,
                client,
                status,
                error,
                cached_tools: tools,
            },
        );

        Ok(info)
    }

    pub fn remove_server(&mut self, id: &str) -> Result<(), String> {
        if let Some(mut server) = self.servers.remove(id) {
            server.client.shutdown()?;
        }
        Ok(())
    }

    pub fn connect_server(&mut self, id: &str) -> Result<McpServerInfo, String> {
        let server = self.servers.get_mut(id).ok_or(format!("Server '{}' not found", id))?;

        if server.status == McpServerStatus::Connected {
            return Ok(self.build_server_info(id));
        }

        let mut client = McpClient::new();
        let mut status = McpServerStatus::Connecting;
        let mut error = None;
        let mut tools = Vec::new();
        let connect_timeout = server.config.connect_timeout_secs;

        match client.connect(&server.config.command, &server.config.args, &server.config.env) {
            Ok(()) => {
                match client.initialize_with_timeout(connect_timeout) {
                    Ok(_) => {
                        match client.list_tools_with_timeout(connect_timeout) {
                            Ok(t) => {
                                tools = t.clone();
                                status = McpServerStatus::Connected;
                            }
                            Err(e) => {
                                error = Some(format!("Failed to list tools: {}", e));
                                status = McpServerStatus::Error;
                            }
                        }
                    }
                    Err(e) => {
                        error = Some(format!("Failed to initialize: {}", e));
                        status = McpServerStatus::Error;
                        let _ = client.shutdown();
                    }
                }
            }
            Err(e) => {
                error = Some(format!("Failed to connect: {}", e));
                status = McpServerStatus::Error;
            }
        }

        server.client = client;
        server.status = status.clone();
        server.error = error.clone();
        server.cached_tools = tools.clone();

        Ok(McpServerInfo {
            id: id.to_string(),
            name: server.config.name.clone(),
            command: server.config.command.clone(),
            args: server.config.args.clone(),
            env: server.config.env.clone(),
            status,
            tools,
            error,
            enabled: server.config.enabled,
            tool_timeout_secs: server.config.tool_timeout_secs,
            connect_timeout_secs: server.config.connect_timeout_secs,
        })
    }

    pub fn disconnect_server(&mut self, id: &str) -> Result<McpServerInfo, String> {
        let server = self.servers.get_mut(id).ok_or(format!("Server '{}' not found", id))?;

        server.client.shutdown()?;
        server.status = McpServerStatus::Disconnected;
        server.error = None;
        server.cached_tools.clear();

        Ok(self.build_server_info(id))
    }

    pub fn list_servers(&self) -> Vec<McpServerInfo> {
        self.servers
            .keys()
            .map(|id| self.build_server_info(id))
            .collect()
    }

    fn build_server_info(&self, id: &str) -> McpServerInfo {
        let server = self.servers.get(id).unwrap();
        McpServerInfo {
            id: id.to_string(),
            name: server.config.name.clone(),
            command: server.config.command.clone(),
            args: server.config.args.clone(),
            env: server.config.env.clone(),
            status: server.status.clone(),
            tools: server.cached_tools.clone(),
            error: server.error.clone(),
            enabled: server.config.enabled,
            tool_timeout_secs: server.config.tool_timeout_secs,
            connect_timeout_secs: server.config.connect_timeout_secs,
        }
    }

    pub fn list_tools(&self, server_id: Option<&str>) -> Vec<(String, McpToolDefinition)> {
        let mut result = Vec::new();

        if let Some(sid) = server_id {
            if let Some(server) = self.servers.get(sid) {
                if server.status == McpServerStatus::Connected {
                    for tool in &server.cached_tools {
                        result.push((server.config.id.clone(), tool.clone()));
                    }
                }
            }
        } else {
            for server in self.servers.values() {
                if server.status == McpServerStatus::Connected {
                    for tool in &server.cached_tools {
                        result.push((server.config.id.clone(), tool.clone()));
                    }
                }
            }
        }

        result
    }

    pub fn call_tool(
        &mut self,
        server_id: &str,
        tool_name: &str,
        arguments: Option<serde_json::Value>,
    ) -> Result<CallToolResult, String> {
        if self.active_calls >= self.max_concurrent_calls {
            return Err(format!("Too many concurrent tool calls (max: {})", self.max_concurrent_calls));
        }

        let server = self.servers.get_mut(server_id).ok_or(format!("Server '{}' not found", server_id))?;

        if server.status != McpServerStatus::Connected {
            return Err(format!("Server '{}' is not connected", server_id));
        }

        let timeout = server.config.tool_timeout_secs;
        self.active_calls += 1;
        let result = server.client.call_tool_with_timeout(tool_name, arguments, timeout);
        self.active_calls -= 1;
        result
    }

    pub fn call_tool_by_name(
        &mut self,
        tool_name: &str,
        arguments: Option<serde_json::Value>,
    ) -> Result<CallToolResult, String> {
        for (_server_id, server) in self.servers.iter_mut() {
            if server.status != McpServerStatus::Connected {
                continue;
            }
            if server.cached_tools.iter().any(|t| t.name == tool_name) {
                return server.client.call_tool(tool_name, arguments);
            }
        }
        Err(format!("Tool '{}' not found in any connected server", tool_name))
    }

    pub fn get_server_configs(&self) -> Vec<McpServerConfig> {
        self.servers
            .values()
            .map(|s| s.config.clone())
            .collect()
    }

    pub fn load_configs(&mut self, configs: Vec<McpServerConfig>) {
        for config in configs {
            if !self.servers.contains_key(&config.id) {
                self.servers.insert(
                    config.id.clone(),
                    ManagedServer {
                        config,
                        client: McpClient::new(),
                        status: McpServerStatus::Disconnected,
                        error: None,
                        cached_tools: Vec::new(),
                    },
                );
            }
        }
    }

    pub fn connect_all_enabled(&mut self) -> Vec<McpServerInfo> {
        let ids: Vec<String> = self.servers
            .iter()
            .filter(|(_, s)| s.config.enabled && s.status != McpServerStatus::Connected)
            .map(|(id, _)| id.clone())
            .collect();

        let mut results = Vec::new();
        for id in ids {
            match self.connect_server(&id) {
                Ok(info) => results.push(info),
                Err(e) => {
                    if let Some(server) = self.servers.get(&id) {
                        results.push(McpServerInfo {
                            id: id.clone(),
                            name: server.config.name.clone(),
                            command: server.config.command.clone(),
                            args: server.config.args.clone(),
                            env: server.config.env.clone(),
                            status: McpServerStatus::Error,
                            tools: Vec::new(),
                            error: Some(e),
                            enabled: server.config.enabled,
                            tool_timeout_secs: server.config.tool_timeout_secs,
                            connect_timeout_secs: server.config.connect_timeout_secs,
                        });
                    }
                }
            }
        }
        results
    }

    pub fn find_server_for_tool(&self, tool_name: &str) -> Option<String> {
        for (server_id, server) in &self.servers {
            if server.status != McpServerStatus::Connected {
                continue;
            }
            if server.cached_tools.iter().any(|t| t.name == tool_name) {
                return Some(server_id.clone());
            }
        }
        None
    }

    pub fn get_stderr(&self, id: &str) -> Result<String, String> {
        let server = self.servers.get(id).ok_or(format!("Server '{}' not found", id))?;
        Ok(server.client.get_stderr())
    }

    pub fn clear_stderr(&mut self, id: &str) -> Result<(), String> {
        let server = self.servers.get_mut(id).ok_or(format!("Server '{}' not found", id))?;
        server.client.clear_stderr();
        Ok(())
    }

    pub fn check_all_health(&mut self) -> Vec<(String, McpServerStatus)> {
        let mut results = Vec::new();
        let ids: Vec<String> = self.servers.keys().cloned().collect();
        for id in ids {
            if let Some(server) = self.servers.get_mut(&id) {
                if server.status == McpServerStatus::Connected {
                    if !server.client.is_alive() {
                        server.status = McpServerStatus::Disconnected;
                        server.error = Some("Process crashed".to_string());
                        server.cached_tools.clear();
                    }
                }
                results.push((id, server.status.clone()));
            }
        }
        results
    }

    pub fn get_resource_usage(&self) -> HashMap<String, ServerResourceUsage> {
        use sysinfo::ProcessesToUpdate;
        let mut sys = sysinfo::System::new();
        sys.refresh_processes(ProcessesToUpdate::All, true);

        let mut results = HashMap::new();
        for (id, server) in &self.servers {
            if let Some(pid) = server.client.get_pid() {
                if let Some(process) = sys.process(sysinfo::Pid::from_u32(pid)) {
                    results.insert(id.clone(), ServerResourceUsage {
                        pid,
                        memory_kb: process.memory(),
                        cpu_percent: process.cpu_usage(),
                    });
                }
            }
        }
        results
    }
}

pub fn get_global_manager() -> &'static Mutex<McpServerManager> {
    use std::sync::OnceLock;
    static MANAGER: OnceLock<Mutex<McpServerManager>> = OnceLock::new();
    MANAGER.get_or_init(|| Mutex::new(McpServerManager::new()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_manager_add_and_remove_server() {
        let mut manager = McpServerManager::new();
        let config = McpServerConfig {
            id: "test-nonexistent".to_string(),
            name: "Non-existent Server".to_string(),
            command: "nonexistent_command_that_does_not_exist".to_string(),
            args: vec![],
            env: HashMap::new(),
            enabled: true,
        };

        let result = manager.add_server(config);
        assert!(result.is_ok());
        let info = result.unwrap();
        assert_eq!(info.id, "test-nonexistent");
        assert_eq!(info.status, McpServerStatus::Error);
        assert!(info.error.is_some());

        let remove_result = manager.remove_server("test-nonexistent");
        assert!(remove_result.is_ok());
    }

    #[test]
    fn test_manager_add_duplicate_server() {
        let mut manager = McpServerManager::new();
        let config1 = McpServerConfig {
            id: "dup-server".to_string(),
            name: "Server 1".to_string(),
            command: "nonexistent".to_string(),
            args: vec![],
            env: HashMap::new(),
            enabled: true,
        };
        let config2 = McpServerConfig {
            id: "dup-server".to_string(),
            name: "Server 2".to_string(),
            command: "nonexistent".to_string(),
            args: vec![],
            env: HashMap::new(),
            enabled: true,
        };

        let _ = manager.add_server(config1);
        let result = manager.add_server(config2);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("already exists"));
    }

    #[test]
    fn test_manager_remove_nonexistent_server() {
        let mut manager = McpServerManager::new();
        let result = manager.remove_server("nonexistent");
        assert!(result.is_ok());
    }

    #[test]
    fn test_manager_connect_nonexistent_server() {
        let mut manager = McpServerManager::new();
        let result = manager.connect_server("nonexistent");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not found"));
    }

    #[test]
    fn test_manager_disconnect_nonexistent_server() {
        let mut manager = McpServerManager::new();
        let result = manager.disconnect_server("nonexistent");
        assert!(result.is_err());
    }

    #[test]
    fn test_manager_list_servers_empty() {
        let manager = McpServerManager::new();
        let servers = manager.list_servers();
        assert!(servers.is_empty());
    }

    #[test]
    fn test_manager_list_tools_empty() {
        let manager = McpServerManager::new();
        let tools = manager.list_tools(None);
        assert!(tools.is_empty());
    }

    #[test]
    fn test_manager_get_server_configs_empty() {
        let manager = McpServerManager::new();
        let configs = manager.get_server_configs();
        assert!(configs.is_empty());
    }

    #[test]
    fn test_manager_call_tool_nonexistent_server() {
        let mut manager = McpServerManager::new();
        let result = manager.call_tool("nonexistent", "test", None);
        assert!(result.is_err());
    }

    #[test]
    fn test_manager_find_server_for_tool_empty() {
        let manager = McpServerManager::new();
        let result = manager.find_server_for_tool("read_file");
        assert!(result.is_none());
    }

    #[test]
    #[ignore]
    fn test_manager_add_filesystem_server() {
        let mut manager = McpServerManager::new();
        let config = McpServerConfig {
            id: "fs-server".to_string(),
            name: "Filesystem Server".to_string(),
            command: "npx".to_string(),
            args: vec![
                "-y".to_string(),
                "@modelcontextprotocol/server-filesystem".to_string(),
                std::env::temp_dir().to_string_lossy().to_string(),
            ],
            env: HashMap::new(),
            enabled: true,
        };

        let result = manager.add_server(config);
        assert!(result.is_ok(), "add_server returned error: {:?}", result.err());
        let info = result.unwrap();
        assert_eq!(info.status, McpServerStatus::Connected, "Server status is {:?}, error: {:?}", info.status, info.error);
        assert!(!info.tools.is_empty(), "No tools found");

        let tools = manager.list_tools(Some("fs-server"));
        assert!(!tools.is_empty());

        let _ = manager.remove_server("fs-server");
    }

    #[test]
    #[ignore]
    fn test_manager_filesystem_call_tool() {
        let mut manager = McpServerManager::new();
        let config = McpServerConfig {
            id: "fs-server".to_string(),
            name: "Filesystem Server".to_string(),
            command: "npx".to_string(),
            args: vec![
                "-y".to_string(),
                "@modelcontextprotocol/server-filesystem".to_string(),
                std::env::temp_dir().to_string_lossy().to_string(),
            ],
            env: HashMap::new(),
            enabled: true,
        };

        let _ = manager.add_server(config);

        let list_result = manager.call_tool(
            "fs-server",
            "list_directory",
            Some(serde_json::json!({"path": std::env::temp_dir().to_string_lossy().to_string()})),
        );
        assert!(list_result.is_ok());

        let _ = manager.remove_server("fs-server");
    }
}
