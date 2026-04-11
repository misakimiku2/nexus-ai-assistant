# MCP 优化方向实施计划

## 概述

基于 `docs/MCP_PROTOCOL_IMPLEMENTATION.md` 中列出的 8 个优化方向，本计划将按优先级分三个阶段实施。

---

## 阶段一：用户体验核心优化（配置持久化 + 环境变量 + 预设模板）

### 1.1 配置持久化

**问题**：MCP 服务器配置仅存在于内存中，应用重启后完全丢失。

**方案**：使用已安装的 `tauri-plugin-store` 在 Rust 后端持久化 MCP 配置。

**实施步骤**：

#### 后端 (Rust)

1. **`commands.rs`** — 新增两个 Tauri 命令：
   - `mcp_save_configs(app_handle: tauri::AppHandle)` — 将当前所有服务器配置保存到 `mcp-servers.json`
   - `mcp_load_configs(app_handle: tauri::AppHandle)` — 从 `mcp-servers.json` 加载配置，不自动连接

2. **`manager.rs`** — 新增方法：
   - `get_configs_for_save() -> Vec<McpServerConfig>` — 获取所有服务器配置（含已断开的）
   - `load_configs(configs: Vec<McpServerConfig>)` — 批量加载配置到内存（仅存 config，不启动进程）
   - `connect_all_enabled() -> Vec<McpServerInfo>` — 连接所有 enabled=true 的服务器

3. **`lib.rs`** — 在 `invoke_handler` 中注册新命令

4. **持久化时机**：
   - 添加服务器后 → 保存
   - 删除服务器后 → 保存
   - 断开/重连后 → 不保存（运行时状态，非配置变更）
   - 应用启动时 → 加载配置 + 自动重连 enabled 服务器

#### 前端 (TypeScript)

5. **`McpService.ts`** — 新增方法：
   - `saveConfigs()` — 调用 `mcp_save_configs`
   - `loadConfigs()` — 调用 `mcp_load_configs`，返回配置列表

6. **`App.tsx`** — 修改：
   - 在应用初始化时调用 `McpService.loadConfigs()`，然后对 enabled 服务器调用 `McpService.connectServer()`
   - 在 `handleAddMcpServer` 成功后调用 `McpService.saveConfigs()`
   - 在 `onRemove` 成功后调用 `McpService.saveConfigs()`

---

### 1.2 环境变量配置

**问题**：当前 `AddMcpModal` 不支持环境变量输入，但 `McpServerConfig` 已有 `env` 字段。

**实施步骤**：

1. **`AddMcpModal.tsx`** — 新增环境变量编辑区域：
   - 添加 `envVars` state: `{ key: string; value: string }[]`
   - 在参数输入框下方添加"环境变量"区域
   - 每行一个 key-value 对，带删除按钮
   - 底部"添加环境变量"按钮
   - 修改 `onAdd` 回调签名，增加 `env: Record<string, string>` 参数

2. **`App.tsx`** — 修改 `handleAddMcpServer`：
   - 从 `envVars` state 构建 `env: Record<string, string>`
   - 传入 `McpServerConfig.env`

3. **`McpControlCenter.tsx`** — 在服务器详情中展示环境变量：
   - 如果 `server.env` 非空，显示环境变量列表（key 值明文，value 用 `***` 遮盖，点击可切换显示）

---

### 1.3 MCP 服务器预设模板

**问题**：用户需要手动输入命令和参数，容易出错。

**实施步骤**：

1. **新建 `src/data/mcpPresets.ts`** — 预设数据：
   ```typescript
   export interface McpPreset {
     id: string;
     name: string;
     description: string;
     command: string;
     args: string[];
     envKeys: string[];  // 需要的环境变量 key（如 ['GITHUB_PERSONAL_ACCESS_TOKEN']）
   }
   ```
   预设列表：
   - `@modelcontextprotocol/server-filesystem` — 文件系统访问
   - `@modelcontextprotocol/server-github` — GitHub API
   - `@modelcontextprotocol/server-brave-search` — Brave 搜索
   - `@modelcontextprotocol/server-sqlite` — SQLite 数据库
   - `@modelcontextprotocol/server-memory` — 知识图谱记忆
   - `@modelcontextprotocol/server-puppeteer` — 浏览器自动化

2. **`AddMcpModal.tsx`** — 新增预设选择器：
   - 在表单顶部添加"从预设选择"下拉菜单
   - 选择预设后自动填充 name、command、args
   - 如果预设需要环境变量，自动生成对应的环境变量输入行（key 预填，value 留空）
   - 用户仍可手动修改所有字段

---

## 阶段二：可靠性增强（服务器日志 + 崩溃检测 + 工具超时）

### 2.1 服务器日志

**问题**：MCP 服务器 stderr 已在后台捕获，但前端无法查看。

**实施步骤**：

#### 后端

1. **`commands.rs`** — 新增 Tauri 命令：
   - `mcp_get_server_stderr(id: String) -> Result<String, String>` — 获取指定服务器的 stderr 缓冲区内容
   - `mcp_clear_server_stderr(id: String) -> Result<(), String>` — 清空 stderr 缓冲区

2. **`manager.rs`** — 新增方法：
   - `get_stderr(id: &str) -> Result<String, String>` — 获取 stderr
   - `clear_stderr(id: &str) -> Result<(), String>` — 清空 stderr

3. **`client.rs`** — 新增方法：
   - `get_stderr() -> String` — 委托给 transport
   - `clear_stderr()` — 清空 transport 的 stderr buffer

#### 前端

4. **`McpService.ts`** — 新增方法：
   - `getServerStderr(id: string): Promise<string>`
   - `clearServerStderr(id: string): Promise<void>`

5. **`McpControlCenter.tsx`** — 每个服务器卡片新增"日志"按钮：
   - 点击展开日志面板，显示 stderr 内容
   - 自动刷新（每 2 秒轮询一次，展开时启动，收起时停止）
   - 清空日志按钮
   - 日志区域使用等宽字体，支持滚动

---

### 2.2 崩溃检测与自动重连

**问题**：MCP 服务器进程崩溃后，状态不会自动更新，需要用户手动重连。

**实施步骤**：

#### 后端

1. **`transport.rs`** — 改进 `is_alive()` 方法：
   - 当前实现使用 `child.try_wait()`，但 `ManagedServer` 持有 `McpClient`，`McpClient` 持有 `StdioTransport`，`StdioTransport` 持有 `Child`
   - `is_alive()` 已经能检测进程是否退出

2. **`manager.rs`** — 新增方法：
   - `check_server_health(id: &str) -> Option<McpServerStatus>` — 检查单个服务器健康状态
   - `check_all_health() -> Vec<(String, McpServerStatus)>` — 检查所有服务器

3. **`commands.rs`** — 新增 Tauri 命令：
   - `mcp_check_health() -> Result<Vec<(String, McpServerStatus)>, String>` — 健康检查

#### 前端

4. **`McpControlCenter.tsx`** — 自动健康检查：
   - 组件挂载时启动定时器（每 10 秒）
   - 调用 `mcp_check_health` 检查所有服务器
   - 发现状态变化时更新 UI
   - 组件卸载时清除定时器

5. **自动重连逻辑**（前端控制，避免后端复杂性）：
   - 当检测到服务器从 `connected` 变为 `error`/`disconnected` 时
   - 自动尝试重连（最多 3 次，间隔 5s/10s/20s）
   - 在 UI 上显示"自动重连中..."状态
   - 重连成功后调用 `refreshTools()`

---

### 2.3 工具执行超时

**问题**：当前 `call_tool` 使用 `read_response()` 的固定 30 秒超时，对某些耗时工具不够。

**实施步骤**：

#### 后端

1. **`types.rs`** — `McpServerConfig` 新增字段：
   ```rust
   #[serde(default = "default_tool_timeout")]
   pub tool_timeout_secs: u64,  // 默认 60 秒
   ```
   `fn default_tool_timeout() -> u64 { 60 }`

2. **`transport.rs`** — 修改 `read_response()`：
   - 新增 `read_response_with_timeout(timeout_secs: u64)` 方法
   - 原 `read_response()` 委托调用，使用默认 30 秒（用于 initialize 等协议交互）
   - 新方法用于 `call_tool`，使用服务器配置的超时时间

3. **`client.rs`** — 修改 `call_tool()`：
   - 新增 `call_tool_with_timeout(tool_name, arguments, timeout_secs)` 方法
   - 使用 `read_response_with_timeout` 替代 `read_response`

4. **`manager.rs`** — 修改 `call_tool()`：
   - 从 `server.config.tool_timeout_secs` 读取超时时间
   - 传递给 `client.call_tool_with_timeout()`

#### 前端

5. **`types.ts`** — `McpServerConfig` 新增 `toolTimeoutSecs?: number`

6. **`AddMcpModal.tsx`** — 新增超时设置输入：
   - 在环境变量区域下方添加"工具执行超时"输入框
   - 默认值 60 秒，范围 10-300 秒
   - 使用 number input + 步进按钮

7. **`McpControlCenter.tsx`** — 在服务器详情中显示超时设置

---

## 阶段三：性能与高级功能（并发控制 + 资源管理）

### 3.1 并发控制

**问题**：全局 `Mutex<McpServerManager>` 导致所有 MCP 操作串行执行，长时间工具调用阻塞整个子系统。

**方案**：将全局 Mutex 改为 per-server Mutex，并添加并发信号量。

**实施步骤**：

1. **`manager.rs`** — 架构重构：
   - 将 `HashMap<String, ManagedServer>` 改为 `HashMap<String, Arc<Mutex<ManagedServer>>>`
   - 全局 Manager 仍保留 Mutex，但仅保护 HashMap 结构变更（add/remove）
   - `call_tool` 时只锁定目标服务器的 Mutex，不锁定全局
   - 添加 `Semaphore`（使用 `tokio::sync::Semaphore`）限制最大并发工具调用数（默认 5）

2. **`commands.rs`** — 修改命令实现：
   - `mcp_call_tool` 只锁定目标服务器，不锁定全局
   - 其他管理操作仍锁定全局

3. **`types.rs`** — 新增全局配置：
   ```rust
   pub struct McpGlobalConfig {
       pub max_concurrent_tools: usize,  // 默认 5
   }
   ```

4. **前端** — 在 MCP 控制中心添加并发数设置（可选，低优先级）

### 3.2 资源管理

**问题**：无法监控 MCP 服务器进程的资源使用情况。

**方案**：使用 Windows API 或 `sysinfo` crate 监控进程资源。

**实施步骤**：

1. **`Cargo.toml`** — 添加依赖：
   ```toml
   sysinfo = "0.33"
   ```

2. **`transport.rs`** — 新增方法：
   - `get_pid() -> Option<u32>` — 获取子进程 PID
   - `get_memory_usage() -> Option<u64>` — 获取内存使用（KB）

3. **`manager.rs`** — 新增方法：
   - `get_server_resource_usage(id: &str) -> Option<ServerResourceUsage>`
   ```rust
   pub struct ServerResourceUsage {
       pub pid: u32,
       pub memory_kb: u64,
       pub cpu_percent: f32,
   }
   ```

4. **`commands.rs`** — 新增 Tauri 命令：
   - `mcp_get_resource_usage() -> Result<HashMap<String, ServerResourceUsage>, String>`

5. **前端** — 在 McpControlCenter 服务器卡片中显示：
   - 内存使用量（如 "12.5 MB"）
   - CPU 使用率（如 "2.3%"）
   - 定期刷新（随健康检查一起）

---

## 文件修改清单

| 文件 | 阶段 | 修改内容 |
|------|------|----------|
| `src-tauri/src/mcp/types.rs` | 1.1, 2.3, 3.1 | 新增 `tool_timeout_secs` 字段、`McpGlobalConfig`、`ServerResourceUsage` |
| `src-tauri/src/mcp/manager.rs` | 1.1, 2.1, 2.2, 2.3, 3.1, 3.2 | 新增持久化/健康检查/超时/并发/资源方法 |
| `src-tauri/src/mcp/commands.rs` | 1.1, 2.1, 2.2, 2.3, 3.1, 3.2 | 新增 Tauri 命令 |
| `src-tauri/src/mcp/client.rs` | 2.1, 2.3 | 新增 stderr/超时方法 |
| `src-tauri/src/mcp/transport.rs` | 2.3, 3.2 | 新增超时读取/PID/资源方法 |
| `src-tauri/src/lib.rs` | 1.1 | 注册新命令 |
| `src-tauri/Cargo.toml` | 3.2 | 添加 sysinfo 依赖 |
| `src/agent/mcp/McpService.ts` | 1.1, 2.1 | 新增持久化/stderr 方法 |
| `src/components/AddMcpModal.tsx` | 1.2, 1.3, 2.3 | 环境变量/预设/超时 UI |
| `src/components/McpControlCenter.tsx` | 1.2, 2.1, 2.2, 2.3, 3.2 | 环境变量显示/日志/健康检查/资源 |
| `src/data/mcpPresets.ts` | 1.3 | 新建预设数据文件 |
| `src/App.tsx` | 1.1 | 启动时加载配置+自动重连 |
| `src/types.ts` | 2.3 | 新增 `toolTimeoutSecs` 字段 |

---

## 实施顺序

按以下顺序逐步实施，每完成一个功能点即验证编译通过：

1. **1.1 配置持久化**（后端 → 前端 → 验证）
2. **1.2 环境变量配置**（UI → 逻辑 → 验证）
3. **1.3 预设模板**（数据 → UI → 验证）
4. **2.1 服务器日志**（后端 → 前端 → 验证）
5. **2.2 崩溃检测与自动重连**（后端 → 前端 → 验证）
6. **2.3 工具执行超时**（后端 → 前端 → 验证）
7. **3.1 并发控制**（架构重构 → 验证）
8. **3.2 资源管理**（依赖 → 后端 → 前端 → 验证）
