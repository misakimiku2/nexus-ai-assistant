use crate::mcp::manager::get_global_manager;
use crate::mcp::types::*;
use std::collections::HashMap;
use tauri_plugin_store::StoreExt;

const MCP_CONFIGS_STORE: &str = "mcp-servers.json";
const MCP_CONFIGS_KEY: &str = "mcp-server-configs";

#[tauri::command]
pub async fn mcp_check_duplicate(config: McpServerConfig) -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(move || {
        let manager = get_global_manager();
        let manager = manager.lock().map_err(|e| format!("Lock error: {}", e))?;
        Ok(manager.check_duplicate(&config))
    }).await.map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub async fn mcp_add_server(config: McpServerConfig) -> Result<McpServerInfo, String> {
    tokio::task::spawn_blocking(move || {
        let manager = get_global_manager();
        let mut manager = manager.lock().map_err(|e| format!("Lock error: {}", e))?;
        manager.add_server(config)
    }).await.map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub async fn mcp_remove_server(id: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let manager = get_global_manager();
        let mut manager = manager.lock().map_err(|e| format!("Lock error: {}", e))?;
        manager.remove_server(&id)
    }).await.map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub async fn mcp_connect_server(id: String) -> Result<McpServerInfo, String> {
    tokio::task::spawn_blocking(move || {
        let manager = get_global_manager();
        let mut manager = manager.lock().map_err(|e| format!("Lock error: {}", e))?;
        manager.connect_server(&id)
    }).await.map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub async fn mcp_disconnect_server(id: String) -> Result<McpServerInfo, String> {
    tokio::task::spawn_blocking(move || {
        let manager = get_global_manager();
        let mut manager = manager.lock().map_err(|e| format!("Lock error: {}", e))?;
        manager.disconnect_server(&id)
    }).await.map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub async fn mcp_list_servers() -> Result<Vec<McpServerInfo>, String> {
    tokio::task::spawn_blocking(move || {
        let manager = get_global_manager();
        let manager = manager.lock().map_err(|e| format!("Lock error: {}", e))?;
        Ok(manager.list_servers())
    }).await.map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub async fn mcp_list_tools(server_id: Option<String>) -> Result<Vec<serde_json::Value>, String> {
    tokio::task::spawn_blocking(move || {
        let manager = get_global_manager();
        let manager = manager.lock().map_err(|e| format!("Lock error: {}", e))?;
        let tools = manager.list_tools(server_id.as_deref());
        Ok(tools
            .into_iter()
            .map(|(server_id, tool)| {
                serde_json::json!({
                    "server_id": server_id,
                    "tool": tool,
                })
            })
            .collect())
    }).await.map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub async fn mcp_call_tool(
    server_id: String,
    tool_name: String,
    arguments: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    tokio::task::spawn_blocking(move || {
        let manager = get_global_manager();
        let mut manager = manager.lock().map_err(|e| format!("Lock error: {}", e))?;
        let result = manager.call_tool(&server_id, &tool_name, arguments)?;

        let text_content: Vec<String> = result
            .content
            .iter()
            .filter_map(|c| c.text.clone())
            .collect();

        Ok(serde_json::json!({
            "content": text_content.join("\n"),
            "isError": result.is_error.unwrap_or(false),
        }))
    }).await.map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub async fn mcp_get_server_configs() -> Result<Vec<McpServerConfig>, String> {
    tokio::task::spawn_blocking(move || {
        let manager = get_global_manager();
        let manager = manager.lock().map_err(|e| format!("Lock error: {}", e))?;
        Ok(manager.get_server_configs())
    }).await.map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub async fn mcp_save_configs(app_handle: tauri::AppHandle) -> Result<(), String> {
    let configs = tokio::task::spawn_blocking(move || -> Result<Vec<McpServerConfig>, String> {
        let manager = get_global_manager();
        let manager = manager.lock().map_err(|e| format!("Lock error: {}", e))?;
        Ok(manager.get_server_configs())
    }).await.map_err(|e| format!("Task error: {}", e))??;

    let store = app_handle.store(MCP_CONFIGS_STORE).map_err(|e| format!("Store error: {}", e))?;
    store.set(MCP_CONFIGS_KEY, serde_json::to_value(&configs).map_err(|e| format!("Serialize error: {}", e))?);
    store.save().map_err(|e| format!("Save error: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn mcp_load_configs(app_handle: tauri::AppHandle) -> Result<Vec<McpServerInfo>, String> {
    let configs: Vec<McpServerConfig> = {
        let store = app_handle.store(MCP_CONFIGS_STORE).map_err(|e| format!("Store error: {}", e))?;
        match store.get(MCP_CONFIGS_KEY) {
            Some(value) => serde_json::from_value(value.clone()).map_err(|e| format!("Deserialize error: {}", e))?,
            None => Vec::new(),
        }
    };

    tokio::task::spawn_blocking(move || {
        let manager = get_global_manager();
        let mut manager = manager.lock().map_err(|e| format!("Lock error: {}", e))?;
        manager.load_configs(configs);
        Ok(manager.list_servers())
    }).await.map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub async fn mcp_get_server_stderr(id: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let manager = get_global_manager();
        let manager = manager.lock().map_err(|e| format!("Lock error: {}", e))?;
        manager.get_stderr(&id)
    }).await.map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub async fn mcp_clear_server_stderr(id: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let manager = get_global_manager();
        let mut manager = manager.lock().map_err(|e| format!("Lock error: {}", e))?;
        manager.clear_stderr(&id)
    }).await.map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub async fn mcp_check_health() -> Result<Vec<serde_json::Value>, String> {
    tokio::task::spawn_blocking(move || {
        let manager = get_global_manager();
        let mut manager = manager.lock().map_err(|e| format!("Lock error: {}", e))?;
        let results = manager.check_all_health();
        Ok(results
            .into_iter()
            .map(|(id, status)| {
                serde_json::json!({
                    "id": id,
                    "status": status,
                })
            })
            .collect())
    }).await.map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub async fn mcp_get_resource_usage() -> Result<HashMap<String, serde_json::Value>, String> {
    tokio::task::spawn_blocking(move || {
        let manager = get_global_manager();
        let manager = manager.lock().map_err(|e| format!("Lock error: {}", e))?;
        let usage = manager.get_resource_usage();
        Ok(usage
            .into_iter()
            .map(|(id, res)| {
                (id, serde_json::json!({
                    "pid": res.pid,
                    "memoryKb": res.memory_kb,
                    "cpuPercent": res.cpu_percent,
                }))
            })
            .collect())
    }).await.map_err(|e| format!("Task error: {}", e))?
}
