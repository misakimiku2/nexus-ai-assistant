# MCP (Model Context Protocol) 协议实现开发记录

## 概述

本文档记录了 MCP 协议的完整实现过程，包括 Rust 后端协议通信层、前端集成层、MCP 优先级逻辑、配置持久化、UI 更新等，以及在开发和测试过程中遇到的问题和解决方案。

---

## 一、架构设计

### 1.1 整体架构

```
┌─────────────────────────────────────────────────────┐
│                    前端 (React)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ McpControl   │  │ AddMcpModal  │  │ AgentConfig│ │
│  │ Center.tsx   │  │ .tsx         │  │ Modal.tsx  │ │
│  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘ │
│         │                 │                 │        │
│  ┌──────┴─────────────────┴─────────────────┴──────┐ │
│  │              McpService.ts                       │ │
│  │  (前端 MCP 管理服务，封装 Tauri 命令调用)         │ │
│  └──────────────────┬──────────────────────────────┘ │
│                     │ invoke()                        │
│  ┌──────────────────┴──────────────────────────────┐ │
│  │           McpToolAdapter.ts                      │ │
│  │  (MCP 工具适配器，命名规则 mcp__{server}__{tool})│ │
│  └──────────────────┬──────────────────────────────┘ │
│                     │                                 │
│  ┌──────────────────┴──────────────────────────────┐ │
│  │           ToolRegistry.ts                        │ │
│  │  (工具注册中心，支持 builtin/mcp 双来源)          │ │
│  └──────────────────┬──────────────────────────────┘ │
│                     │                                 │
│  ┌──────────────────┴──────────────────────────────┐ │
│  │           toolMapping.ts                         │ │
│  │  (工具能力映射，MCP 优先级逻辑)                   │ │
│  └─────────────────────────────────────────────────┘ │
├───────────────────── Tauri Bridge ────────────────────┤
│                     │                                 │
│  ┌──────────────────┴──────────────────────────────┐ │
│  │              commands.rs                         │ │
│  │  (15 个 Tauri 命令，全部 async + spawn_blocking)  │ │
│  └──────────────────┬──────────────────────────────┘ │
│                     │                                 │
│  ┌──────────────────┴──────────────────────────────┐ │
│  │              manager.rs                          │ │
│  │  (MCP 服务器管理器，全局单例 + 唯一性校验)        │ │
│  └──────────────────┬──────────────────────────────┘ │
│                     │                                 │
│  ┌──────────────────┴──────────────────────────────┐ │
│  │              client.rs                           │ │
│  │  (MCP JSON-RPC 客户端，带超时控制)               │ │
│  └──────────────────┬──────────────────────────────┘ │
│                     │                                 │
│  ┌──────────────────┴──────────────────────────────┐ │
│  │              transport.rs                        │ │
│  │  (Stdio 传输层，子进程 stdin/stdout + 超时读取)    │ │
│  └──────────────────┬──────────────────────────────┘ │
│                     │ stdin/stdout                    │
│  ┌──────────────────┴──────────────────────────────┐ │
│  │         MCP Server 进程 (npx/uvx/...)            │
│  │  (@modelcontextprotocol/server-filesystem 等)    │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### 1.2 MCP 工具命名规则

为避免与内置工具冲突，MCP 工具采用 `mcp__{server_id}__{tool_name}` 的命名规则：

| 来源 | 工具名示例 | 说明 |
|------|-----------|------|
| 内置 | `read_file` | 原生内置工具 |
| MCP | `mcp__fs-server__read_file` | 来自 fs-server 的 read_file |
| MCP | `mcp__github-server__create_issue` | 来自 github-server 的 create_issue |

### 1.3 MCP 优先级逻辑

当 MCP 工具与内置工具功能重叠时，优先使用 MCP 版本：

```
内置工具: [read_file, write_file, list_directory, calculate, web_search, ...]
MCP 工具: [mcp__fs-server__read_file, mcp__fs-server__write_file, ...]
                                      ↓
工具能力映射: read_file ↔ [read_file, read, read_multiple_files]
                                      ↓
buildOpenAITools() 输出: [mcp__fs-server__read_file, write_file, calculate, ...]
                          ↑ MCP 版本替代了内置 read_file
```

---

## 二、Rust 后端实现

### 2.1 MCP 协议类型定义

**文件**：`src-tauri/src/mcp/types.rs`

定义了完整的 MCP 协议类型系统：

| 类型 | 用途 |
|------|------|
| `McpServerConfig` | 服务器配置（id, name, command, args, env, enabled, toolTimeoutSecs, connectTimeoutSecs） |
| `JsonRpcRequest` / `JsonRpcResponse` | JSON-RPC 2.0 请求/响应 |
| `JsonRpcError` | JSON-RPC 错误 |
| `InitializeParams` / `InitializeResult` | MCP 握手参数/结果 |
| `ClientCapabilities` / `ServerCapabilities` | 客户端/服务器能力声明 |
| `McpToolDefinition` | MCP 工具定义（name, description, inputSchema） |
| `CallToolParams` / `CallToolResult` | 工具调用参数/结果 |
| `ToolContent` | 工具返回内容 |
| `McpServerStatus` | 服务器状态枚举（Connecting/Connected/Disconnected/Error），使用 `#[serde(rename_all = "lowercase")]` |
| `McpServerInfo` | 服务器完整信息（含 toolTimeoutSecs 和 connectTimeoutSecs） |
| `ServerResourceUsage` | 服务器资源使用情况（pid, memoryKb, cpuPercent） |

**关键设计决策**：
- 所有结构体使用 `#[serde(rename_all = "camelCase")]` 以匹配 MCP 协议的 JSON 字段命名
- `CallToolResult.is_error` 使用 `#[serde(rename = "isError")]` 单独重命名
- `McpServerConfig` 的 `args` 和 `env` 使用 `#[serde(default)]` 提供默认值
- `enabled` 字段使用 `default_enabled()` 函数默认为 `true`
- `tool_timeout_secs` 使用 `default_tool_timeout()` 默认为 **60 秒**
- `connect_timeout_secs` 使用 `default_connect_timeout()` 默认为 **30 秒**

### 2.2 Stdio 传输层

**文件**：`src-tauri/src/mcp/transport.rs`

管理 MCP 服务器子进程的 stdin/stdout 通信：

```rust
pub struct StdioTransport {
    child: Option<Child>,                    // 子进程句柄
    reader: Option<BufReader<ChildStdout>>,  // stdout 读取器
    writer: Option<ChildStdin>,               // stdin 写入器
    stderr_buffer: Arc<Mutex<String>>,       // stderr 输出捕获缓冲区
}
```

**核心方法**：

| 方法 | 功能 |
|------|------|
| `spawn(command, args, env)` | 启动 MCP 服务器进程 |
| `send(request)` | 发送 JSON-RPC 请求到 stdin |
| `read_response()` | 从 stdout 读取 JSON-RPC 响应（委托给 read_response_with_timeout(30)） |
| `read_response_with_timeout(timeout_secs)` | 从 stdout 读取响应，支持超时控制（默认30秒） |
| `send_notification(method, params)` | 发送 JSON-RPC 通知（无 id） |
| `kill()` | 终止子进程 |
| `is_alive()` | 检查子进程是否存活 |
| `get_stderr()` | 获取 stderr 缓冲区内容 |
| `clear_stderr()` | 清空 stderr 缓冲区 |
| `get_pid()` | 获取子进程 PID |

**Windows 兼容性处理**：
- 在 Windows 上，`npx` 等命令实际上是 `.cmd` 批处理文件，`Command::new("npx")` 无法直接执行
- 解决方案：在 Windows 上使用 `cmd /C npx ...` 包装命令
- 使用 `CREATE_NO_WINDOW` 标志（`0x08000000`）避免弹出命令行窗口

```rust
let (cmd_name, cmd_args) = if cfg!(windows) {
    let mut all_args = vec![command.to_string()];
    all_args.extend(args.iter().cloned());
    ("cmd", vec!["/C".to_string()].into_iter().chain(all_args).collect())
} else {
    (command, args.to_vec())
};
```

**超时机制**：
- `read_response_with_timeout(timeout_secs)` 使用 `Instant::elapsed()` 循环检查超时
- 超时后返回包含 stderr 最后500字符的错误信息
- 支持跳过空行和非JSON行（最多1000行）

### 2.3 MCP JSON-RPC 客户端

**文件**：`src-tauri/src/mcp/client.rs`

封装 MCP 协议通信逻辑：

```rust
pub struct McpClient {
    transport: StdioTransport,
    initialized: bool,
    server_info: Option<Implementation>,
    server_capabilities: Option<ServerCapabilities>,
    cached_tools: Option<Vec<McpToolDefinition>>,
}
```

**MCP 协议握手流程**：

```
客户端                                    服务器
  │                                         │
  │──── initialize ────────────────────────>│
  │<─── InitializeResult ──────────────────│
  │                                         │
  │──── notifications/initialized ────────>│
  │                                         │
  │──── tools/list ────────────────────────>│
  │<─── ListToolsResult ───────────────────│
  │                                         │
  │──── tools/call {name, arguments} ──────>│
  │<─── CallToolResult ────────────────────│
  │                                         │
```

**核心方法**：

| 方法 | 对应 MCP 方法 | 功能 |
|------|-------------|------|
| `connect()` | - | 启动子进程 |
| `initialize()` | `initialize` | 协议握手（委托给 initialize_with_timeout(30)） |
| `initialize_with_timeout(timeout)` | `initialize` | 带超时的协议握手 |
| `list_tools()` | `tools/list` | 获取可用工具列表（带缓存，委托给 list_tools_with_timeout(30)） |
| `list_tools_with_timeout(timeout)` | `tools/list` | 带超时的工具列表获取 |
| `call_tool(name, arguments)` | `tools/call` | 执行工具调用（委托给 call_tool_with_timeout(tool_timeout, 60)） |
| `call_tool_with_timeout(name, arguments, timeout)` | `tools/call` | 带超时的工具调用 |
| `list_resources()` | `resources/list` | 获取资源列表 |
| `read_resource(uri)` | `resources/read` | 读取资源内容 |
| `shutdown()` | - | 关闭连接 |
| `get_stderr()` | - | 获取 stderr 输出 |
| `clear_stderr()` | - | 清空 stderr |
| `get_pid()` | - | 获取进程 PID |
| `is_alive()` | - | 检查进程存活状态 |

**三层超时体系**：
- **连接超时** (`connectTimeoutSecs`)：初始化和工具发现的超时时间，默认30秒，可配置（10-120秒）
- **工具执行超时** (`toolTimeoutSecs`)：单次工具调用的超时时间，默认60秒，可配置（10-300秒）
- **传输层读取超时**：底层 `read_response_with_timeout` 的实际超时值，由上层传入

**工具列表缓存**：`list_tools()` 首次调用后缓存结果到 `cached_tools`，后续直接返回缓存，避免重复请求。可通过 `invalidate_tools_cache()` 手动清除。

### 2.4 MCP 服务器管理器

**文件**：`src-tauri/src/mcp/manager.rs`

管理所有 MCP 服务器实例，使用全局单例模式：

```rust
pub struct McpServerManager {
    servers: HashMap<String, ManagedServer>,
    active_calls: usize,
    max_concurrent_calls: usize,     // 并发控制上限，默认5
}

pub struct ManagedServer {
    pub config: McpServerConfig,
    pub client: McpClient,
    pub status: McpServerStatus,
    pub error: Option<String>,
    pub cached_tools: Vec<McpToolDefinition>,
}

pub fn get_global_manager() -> &'static Mutex<McpServerManager> {
    static MANAGER: OnceLock<Mutex<McpServerManager>> = OnceLock::new();
    MANAGER.get_or_init(|| Mutex::new(McpServerManager::new()))
}
```

**核心方法**：

| 方法 | 功能 |
|------|------|
| `check_duplicate(config)` | 检查服务唯一性（名称+命令组合重复检测） |
| `add_server(config)` | 添加并启动 MCP 服务器（含唯一性校验+连接超时控制） |
| `remove_server(id)` | 停止并移除服务器 |
| `connect_server(id)` | 重新连接已有配置的服务器（含连接超时控制） |
| `disconnect_server(id)` | 断开服务器连接 |
| `list_servers()` | 列出所有服务器及状态 |
| `list_tools(server_id?)` | 列出工具（可按服务器过滤） |
| `call_tool(server_id, name, args)` | 调用指定服务器的工具（含并发控制+工具超时） |
| `get_server_configs()` | 获取所有服务器配置（用于持久化） |
| `load_configs(configs)` | 加载配置（仅加载不连接，状态为 Disconnected） |
| `connect_all_enabled()` | 连接所有已启用的非 Connected 服务器 |
| `find_server_for_tool(tool_name)` | 根据工具名查找所属服务器 |
| `get_stderr(id)` | 获取服务器 stderr 输出 |
| `clear_stderr(id)` | 清空服务器 stderr |
| `check_all_health()` | 健康检查所有服务器进程存活状态 |
| `get_resource_usage()` | 获取所有服务器的资源使用情况（内存/CPU） |

**唯一性校验机制**：

`check_duplicate()` 在添加前检查：
1. **名称重复**：若已有同名服务器（排除编辑自身），返回 `"已存在同名MCP服务: {name}"`
2. **命令重复**：若已有相同 command + args 组合的服务器，返回 `"已存在相同命令的MCP服务: {command} {args}"`

**并发控制**：

`call_tool()` 在执行前检查 `active_calls >= max_concurrent_calls`（默认5），超出时拒绝执行并返回错误。

**添加服务器流程**：
1. 调用 `check_duplicate()` 进行唯一性校验
2. 启动子进程（`client.connect()`）
3. MCP 握手（`client.initialize_with_timeout(connect_timeout)`）
4. 发现工具（`client.list_tools_with_timeout(connect_timeout)`）
5. 缓存工具列表到 `cached_tools`
6. 返回 `McpServerInfo`（包含状态、工具列表、错误信息、超时配置）

### 2.5 Tauri 命令

**文件**：`src-tauri/src/mcp/commands.rs`

定义了 15 个 Tauri 命令，**全部为 async fn + tokio::task::spawn_blocking**，确保不阻塞主线程：

| 命令 | 参数 | 返回值 | 功能 |
|------|------|--------|------|
| `mcp_check_duplicate` | `config: McpServerConfig` | `Option<String>` | 检查服务唯一性 |
| `mcp_add_server` | `config: McpServerConfig` | `McpServerInfo` | 添加 MCP 服务器 |
| `mcp_remove_server` | `id: String` | `()` | 移除服务器 |
| `mcp_connect_server` | `id: String` | `McpServerInfo` | 连接服务器 |
| `mcp_disconnect_server` | `id: String` | `McpServerInfo` | 断开服务器 |
| `mcp_list_servers` | - | `Vec<McpServerInfo>` | 列出所有服务器 |
| `mcp_list_tools` | `server_id: Option<String>` | `Vec<serde_json::Value>` | 列出工具 |
| `mcp_call_tool` | `server_id, tool_name, arguments` | `serde_json::Value` | 执行工具 |
| `mcp_get_server_configs` | - | `Vec<McpServerConfig>` | 获取配置 |
| `mcp_save_configs` | `app_handle: AppHandle` | `()` | 保存配置到 tauri-plugin-store |
| `mcp_load_configs` | `app_handle: AppHandle` | `Vec<McpServerInfo>` | 加载配置（仅加载不连接） |
| `mcp_get_server_stderr` | `id: String` | `String` | 获取服务器日志 |
| `mcp_clear_server_stderr` | `id: String` | `()` | 清空服务器日志 |
| `mcp_check_health` | - | `Vec<serde_json::Value>` | 批量健康检查 |
| `mcp_get_resource_usage` | - | `HashMap<String, serde_json::Value>` | 获取资源使用情况 |

**异步化设计原则**：

所有命令统一模式：
```rust
#[tauri::command]
pub async fn mcp_xxx(params) -> Result<ReturnType, String> {
    tokio::task::spawn_blocking(move || {
        let manager = get_global_manager();
        let mut manager = manager.lock().map_err(|e| format!("Lock error: {}", e))?;
        manager.xxx_method(params)
    }).await.map_err(|e| format!("Task error: {}", e))?
}
```

**配置持久化**（`mcp_save_configs` / `mcp_load_configs`）：
- 使用 `tauri-plugin-store` 存储到 `mcp-servers.json`
- key 为 `mcp-server-configs`，value 为 `Vec<McpServerConfig>` 的 JSON 序列化
- `load_configs` 只加载配置到 manager（状态为 Disconnected），由前端负责触发并行连接

**注册命令**（`src-tauri/src/lib.rs`）：

```rust
.invoke_handler(tauri::generate_handler![
    // ... 其他命令
    mcp::commands::mcp_check_duplicate,
    mcp::commands::mcp_add_server,
    mcp::commands::mcp_remove_server,
    mcp::commands::mcp_connect_server,
    mcp::commands::mcp_disconnect_server,
    mcp::commands::mcp_list_servers,
    mcp::commands::mcp_list_tools,
    mcp::commands::mcp_call_tool,
    mcp::commands::mcp_get_server_configs,
    mcp::commands::mcp_save_configs,
    mcp::commands::mcp_load_configs,
    mcp::commands::mcp_get_server_stderr,
    mcp::commands::mcp_clear_server_stderr,
    mcp::commands::mcp_check_health,
    mcp::commands::mcp_get_resource_usage
])
```

---

## 三、前端实现

### 3.1 MCP 类型扩展

**文件**：`src/types.ts`

扩展了 `McpServer` 和 `McpTool` 类型，新增 `McpServerConfig` 和 `McpCallToolResult`：

```typescript
export interface McpTool {
  name: string;
  description: string;
  requiresAuth: boolean;
  inputSchema?: Record<string, unknown>;
}

export interface McpServer {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  tools: McpTool[];
  error?: string;
  enabled: boolean;
  toolTimeoutSecs?: number;          // 工具执行超时（秒），默认60
  connectTimeoutSecs?: number;       // 连接超时（秒），默认30
}

export interface McpServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
  toolTimeoutSecs?: number;          // 工具执行超时
  connectTimeoutSecs?: number;       // 连接超时
}

export interface McpCallToolResult {
  content: string;
  isError: boolean;
}
```

### 3.2 MCP 管理服务

**文件**：`src/agent/mcp/McpService.ts`

前端 MCP 管理服务，封装所有 Tauri 命令调用：

```typescript
class McpServiceImpl {
  private servers: Map<string, McpServerInfo> = new Map();
  private listeners: Set<() => void> = new Set();

  async checkDuplicate(config: McpServerConfig): Promise<string | null>;
  async addServer(config: McpServerConfig): Promise<McpServer>;
  async removeServer(id: string): Promise<void>;
  async connectServer(id: string): Promise<McpServer>;
  async disconnectServer(id: string): Promise<McpServer>;
  async refreshServers(): Promise<McpServer[]>;
  async listTools(serverId?: string): Promise<McpToolWithServer[]>;
  async callTool(serverId: string, toolName: string, arguments_?: Record<string, unknown>): Promise<McpCallToolResult>;
  async getServerConfigs(): Promise<McpServerConfig[]>;
  async saveConfigs(): Promise<void>;
  async loadConfigs(): Promise<McpServer[]>;
  async getServerStderr(id: string): Promise<string>;
  async clearServerStderr(id: string): Promise<void>;
  async checkHealth(): Promise<Array<{ id: string; status: string }>>;
  async getResourceUsage(): Promise<Record<string, { pid: number; memoryKb: number; cpuPercent: number }>>;
  getServers(): McpServer[];
  getConnectedServers(): McpServer[];
}
```

**特点**：
- 维护本地服务器状态缓存，减少 Tauri 命令调用
- 支持状态变更监听（`onStateChange`），供 UI 组件响应式更新
- `infoToServer()` 方法将后端 `McpServerInfo` 转换为前端 `McpServer` 类型，映射 `toolTimeoutSecs` 和 `connectTimeoutSecs`

### 3.3 AddMcpModal 组件

**文件**：`src/components/AddMcpModal.tsx`

MCP 服务器添加/编辑弹窗组件，提供完整的服务器配置界面：

**Props 接口**：

```typescript
interface AddMcpModalProps {
  isOpen: boolean;
  onClose: () => void;
  newMcpName: string;
  setNewMcpName: (name: string) => void;
  newMcpCommand: string;
  setNewMcpCommand: (command: string) => void;
  newMcpArgs: string;
  setNewMcpArgs: (args: string) => void;
  envVars: EnvVar[];
  setEnvVars: (vars: EnvVar[]) => void;
  toolTimeout: number;
  setToolTimeout: (timeout: number) => void;
  connectTimeout: number;
  setConnectTimeout: (timeout: number) => void;
  isConnecting: boolean;
  isEditing: boolean;
  error: string | null;            // 错误提示（重复检测失败等）
  onAdd: () => void;
  isDarkMode: boolean;
}
```

**功能特性**：
- **预设模板选择器**：8 个常用 MCP 服务器预设（Filesystem, GitHub, Brave Search, SQLite, Memory, Puppeteer, Fetch, Sequential Thinking），一键填充配置
- **环境变量编辑器**：key-value 对形式，支持动态增删
- **参数输入框**：textarea 自适应高度（最高10行/240px）
- **工具执行超时配置**：10-300秒，默认60秒
- **连接超时配置**：10-120秒，默认30秒
- **加载状态**：`Loader2` 旋转图标 + "连接中..."/"保存中..." 文字，按钮禁用防重复点击
- **错误提示**：红色 AlertCircle 图标 + 错误文字动画展示（重复检测失败、连接失败等）
- **编辑模式**：标题切换为"编辑 MCP 服务器"，按钮文字切换为"保存并重连"

### 3.4 McpControlCenter 组件

**文件**：`src/components/McpControlCenter.tsx`

MCP 控制中心主界面，采用两列瀑布流布局：

**UI 特性**：
- **两列瀑布流布局**：`columns-2 gap-4` CSS + `break-inside-avoid` 实现卡片均匀分布
- **工具列表折叠**：默认全部折叠（`expandedTools` Set 为空），点击 ChevronDown/ChevronUp 图标展开/收起
- **编辑按钮**：每个卡片上的 Pencil 图标，触发编辑流程
- **环境变量显示**：支持 Eye/EyeOff 切换显示/隐藏敏感值
- **服务器日志面板**：可展开查看 stderr 输出，2秒自动刷新轮询
- **健康检查定时器**：每10秒检查一次进程存活状态，崩溃时自动重连（最多3次，延迟递增 5s→10s→20s）
- **资源监控**：显示每个服务器的内存占用（MB）和 CPU 使用率（%）
- **手动重连加载态**：`manualReconnecting` Set 追踪，按钮显示旋转 RefreshCw + "重连中..." 文字，禁用防止重复点击
- **自动重连状态区分**：手动重连显示"重连中..."，自动重连显示"自动重连中..."

**状态颜色映射**：

| 状态 | 圆点颜色 | 文字 |
|------|---------|------|
| connected | bg-emerald-500 | 已连接 |
| connecting | bg-amber-500 | 连接中 |
| error | bg-red-500 | 错误 |
| disconnected | bg-zinc-500 | 已断开 |

### 3.5 App.tsx 集成逻辑

**文件**：`src/App.tsx`

**新增 State**：
```typescript
const [connectTimeout, setConnectTimeout] = useState(30);      // 连接超时
const [mcpAddError, setMcpAddError] = useState<string | null>(null);  // 弹窗错误提示
```

**启动时并行连接流程**（两阶段渲染优化）：

```typescript
useEffect(() => {
  const loadMcpConfigs = async () => {
    const servers = await McpService.loadConfigs();
    
    if (servers.length === 0) {
      setMcpServers([]);
      return;
    }

    // 阶段1：立即显示列表（enabled服务器标记为"连接中"，避免空白或闪烁"已断开"）
    const connectingServers = servers.map(s =>
      s.enabled && s.status !== 'connected' ? { ...s, status: 'connecting' as const } : s
    );
    setMcpServers(connectingServers);

    // 阶段2：并行连接所有需要连接的服务器
    const enabledServerIds = servers.filter(s => s.enabled && s.status !== 'connected').map(s => s.id);
    if (enabledServerIds.length > 0) {
      const results = await Promise.all(
        enabledServerIds.map(id => McpService.connectServer(id).then(
          server => ({ id, server }),
          error => ({ id, server: { ...original, status: 'error', error } })
        )
      );
      
      // 逐个更新状态（connected 或 error）
      setMcpServers(prev => prev.map(s => {
        const result = results.find(r => r.id === s.id);
        return result ? result.server : s;
      }));
    }
    
    // 有任何 connected 服务器才刷新工具列表
    await agentExecution.refreshTools();
  };
  loadMcpConfigs();
}, []);
```

**handleAddMcpServer 流程**：
1. 校验必填字段（name, command）
2. 设置 `isMcpConnecting=true`，清除旧错误
3. 编辑模式下先删除旧服务器
4. 构建 `McpServerConfig`（含 toolTimeoutSecs 和 connectTimeoutSecs）
5. **调用 `checkDuplicate()` 前置校验** → 失败则设置 `mcpAddError` 显示在弹窗中
6. 调用 `addServer()` 实际添加
7. 更新本地状态 + 刷新工具列表 + 保存配置
8. 失败时设置 `mcpAddError` 显示在弹窗中
9. 清理表单状态，关闭弹窗

**onReconnect 回调增强**：
- 成功：更新状态 + 刷新工具列表
- 失败：更新该服务器状态为 error + 设置错误信息（确保 UI 正确反映失败状态）

---

## 四、UI 更新总结

### 4.1 已实现的 UI 功能

| 功能 | 文件 | 说明 |
|------|------|------|
| 两列瀑布流布局 | McpControlCenter.tsx | `columns-2 gap-4` + `break-inside-avoid` |
| 工具列表折叠（默认折叠） | McpControlCenter.tsx | `expandedTools` Set 控制，ChevronDown/Up 图标 |
| 编辑按钮 | McpControlCenter.tsx | Pencil 图标触发编辑模式 |
| 环境变量隐藏/显示 | McpControlCenter.tsx | Eye/EyeOff 图标切换 |
| 服务器日志面板 | McpControlCenter.tsx | 可展开，2s轮询刷新 |
| 资源使用监控 | McpControlCenter.tsx | 内存(MB) + CPU(%) 显示 |
| 预设模板选择器 | AddMcpModal.tsx | 8个预设，一键填充 |
| 环境变量编辑器 | AddMcpModal.tsx | key-value 动态增删 |
| 参数自适应输入框 | AddMcpModal.tsx | textarea 自动高度，最高240px |
| 工具执行超时配置 | AddMcpModal.tsx | 10-300秒输入框 |
| 连接超时配置 | AddMcpModal.tsx | 10-120秒输入框 |
| 添加/编辑加载状态 | AddMcpModal.tsx | Loader2 旋转 + 按钮禁用 |
| 弹窗内错误提示 | AddMcpModal.tsx | AlertCircle 红色提示框 |
| 手动重连加载态 | McpControlCenter.tsx | 旋转RefreshCw + "重连中..." + 禁用 |
| 自动重连状态区分 | McpControlCenter.tsx | "重连中..." vs "自动重连中..." |
| 健康检查+自动重连 | McpControlCenter.tsx | 10s定时器，崩溃后3次递增延迟重连 |
| 两阶段渲染 | App.tsx | 先显示"连接中"，再更新最终状态 |

---

## 五、文件变更清单

### 新增文件

| 文件路径 | 行数 | 功能 |
|---------|------|------|
| `src-tauri/src/mcp/mod.rs` | 5 | MCP 模块入口 |
| `src-tauri/src/mcp/types.rs` | ~360 | MCP 协议类型定义 + 单元测试（含 connectTimeoutSecs/toolTimeoutSecs） |
| `src-tauri/src/mcp/transport.rs` | ~223 | Stdio 传输层（含 Windows 兼容 + 超时读取 + stderr 捕获 + PID 获取） |
| `src-tauri/src/mcp/client.rs` | ~238 | MCP JSON-RPC 客户端（含超时版本的方法） |
| `src-tauri/src/mcp/manager.rs` | ~550 | MCP 服务器管理器（含唯一性校验 + 并发控制 + 超时 + 健康检查 + 资源监控） |
| `src-tauri/src/mcp/commands.rs` | ~200 | 15 个 Tauri 命令（全部 async + spawn_blocking） |
| `src/agent/mcp/index.ts` | 4 | 前端 MCP 模块入口 |
| `src/agent/mcp/McpService.ts` | ~165 | 前端 MCP 管理服务（含 checkDuplicate/saveConfigs/loadConfigs/getServerStderr/clearServerStderr/checkHealth/getResourceUsage） |
| `src/agent/mcp/McpToolAdapter.ts` | 75 | MCP 工具适配器 |
| `src/agent/mcp/toolMapping.ts` | 42 | 工具能力映射与优先级 |
| `src/data/mcpPresets.ts` | ~120 | 8 个 MCP 服务器预设模板 |
| `src/components/AddMcpModal.tsx` | ~320 | 添加/编辑 MCP 服务器弹窗（预设、环境变量、超时配置、加载态、错误提示） |
| `src/components/McpControlCenter.tsx` | ~420 | MCP 控制中心（两列瀑布流、折叠、编辑、日志、健康检查、资源监控、重连加载态） |
| `src/agent/mcp/__tests__/mcp.test.ts` | 187 | 前端 MCP 模块测试（23 个用例） |
| `src/agent/tools/__tests__/ToolRegistry.mcp.test.ts` | 130 | ToolRegistry MCP 测试（5 个用例） |

### 修改文件

| 文件路径 | 修改内容 |
|---------|---------|
| `src-tauri/src/lib.rs` | 注册 MCP 模块和 15 个 Tauri 命令 |
| `src-tauri/Cargo.toml` | 新增 `sysinfo = "0.33"` 依赖（资源监控） |
| `src/types.ts` | 扩展 McpServer/McpServerConfig 类型，新增 toolTimeoutSecs/connectTimeoutSecs |
| `src/agent/tools/ToolRegistry.ts` | 增加 source/mcpServerId 字段、MCP 注册方法、优先级逻辑 |
| `src/agent/tools/types.ts` | 增加 ToolDefinition/ToolRegistryEntry 的 MCP 相关字段 |
| `src/agent/runtime/AgentRuntime.ts` | 集成 MCP 工具注册和初始化 |
| `src/App.tsx` | 完整 MCP 集成：两阶段并行连接、唯一性校验、弹窗错误提示、重连状态修复、编辑模式、超时配置传递 |
| `src/context/GlobalStateContext.tsx` | 移除 mock 数据 |

---

## 六、开发过程中遇到的问题与解决方案

### 6.1 Windows 上 npx 命令无法执行

**问题**：`Command::new("npx")` 在 Windows 上报错 "Failed to spawn process"

**原因**：Windows 上 `npx` 是 `.cmd` 批处理文件，`std::process::Command` 不会通过 shell 执行 `.cmd` 文件

**解决方案**：在 Windows 上使用 `cmd /C` 包装命令

### 6.2 MCP 协议字段命名不匹配

**问题**：MCP 服务器返回 `Initialize error: protocolVersion expected string, received undefined`

**解决方案**：为所有 MCP 协议结构体添加 `#[serde(rename_all = "camelCase")]`

### 6.3 CallToolResult.isError 反序列化失败

**问题**：`is_error` 字段反序列化后为 `None`

**解决方案**：使用 `#[serde(rename = "isError")]`

### 6.4 MCP 客户端可变借用问题

**问题**：`McpClient` 的方法需要 `&mut self`，但只读方法持有 `&self` 引用

**解决方案**：在 `ManagedServer` 中维护 `cached_tools` 缓存

### 6.5 配置持久化后服务器消失

**问题**：应用重启后 MCP 控制中心为空

**原因**：`mcp_load_configs` 内部调用了 `connect_all_enabled()` 同步阻塞，且 `McpServerStatus` 枚举序列化为 PascalCase 但前端期望 lowercase

**解决方案**：
1. `load_configs()` 只加载配置（状态 Disconnected），不连接
2. 前端异步逐个/并行连接
3. 为 `McpServerStatus` 添加 `#[serde(rename_all = "lowercase")]`

### 6.6 "添加并连接"按钮无加载态

**问题**：可以多次点击，导致重复创建服务器

**解决方案**：添加 `isMcpConnecting` state + Loader2 旋转图标 + 按钮禁用

### 6.7 UI 冻结（添加重型 MCP 服务如 Puppeteer）

**问题**：程序未响应 1-2 分钟

**原因**：Tauri 命令是同步 `fn`，在主线程阻塞

**解决方案**：将 5 个重度命令转换为 `async fn` + `tokio::task::spawn_blocking`

### 6.8 重连操作仍导致短暂冻结

**原因**：剩余 7 个"轻量"同步命令在 Mutex 被异步命令持有时仍会阻塞主线程

**解决方案**：将**全部 14 个** MCP 命令转为 `async fn` + `spawn_blocking`（消除所有 Mutex 主线程竞争）

### 6.9 重连按钮无加载态

**问题**：可以一直点击重连，产生重复日志

**解决方案**：`manualReconnecting` Set + `handleReconnect` 包装方法 + 旋转图标 + "重连中..." + 按钮禁用

### 6.10 启动时 MCP 列表空白或闪烁"已断开"

**问题**：过度延迟导致空白；立即设置导致闪烁

**解决方案**：两阶段渲染——立即显示列表（标记 enabled 服务器为 `connecting`），并行连接完成后更新为最终状态

---

## 七、测试

### 7.1 Rust 后端测试

**运行命令**：
```bash
cd src-tauri && cargo test --lib mcp -- --test-threads=1
cd src-tauri && cargo test --lib mcp -- --test-threads=1 --ignored
```

**测试覆盖**：

| 测试类别 | 数量 | 覆盖内容 |
|---------|------|---------|
| 类型序列化 | 10+ | 含 connectTimeoutSecs/toolTimeoutSecs 字段 |
| 管理器单元测试 | 12+ | 含重复检测、并发控制边界 |
| 管理器集成测试 | 2 | 真实 MCP 服务器连接 |

### 7.2 前端测试

**运行命令**：
```bash
npx vitest run
```

**测试覆盖**：

| 测试文件 | 数量 | 覆盖内容 |
|---------|------|---------|
| `mcp.test.ts` | 23 | 工具命名规则、解析、适配器、能力映射、优先级逻辑 |
| `ToolRegistry.mcp.test.ts` | 5 | MCP 工具注册/注销、来源过滤、优先级覆盖 |

### 7.3 TypeScript 编译验证

```bash
npm run lint   # tsc --noEmit
cargo check   # Rust 编译检查
```

---

## 八、内置工具与 MCP 工具重叠映射

| 内置工具 | 功能 | MCP 可替代工具名 |
|---------|------|----------------|
| `read_file` | 读取文件 | `read_file`, `read`, `read_file_multiple`, `read_multiple_files` |
| `write_file` | 写入文件 | `write_file`, `write`, `create_file`, `edit_file` |
| `list_directory` | 列出目录 | `list_directory`, `list`, `directory_listing` |
| `execute_shell` | 执行命令 | `run_command`, `execute_command`, `shell_exec`, `execute_shell` |
| `web_search` | 网络搜索 | `search`, `web_search`, `brave_search`, `google_search`, `brave_web_search` |
| `fetch_url` | 获取网页 | `fetch`, `fetch_url`, `scrape`, `scrape_webpage` |
| `calculate` | 数学计算 | - |
| `get_current_time` | 获取时间 | - |
| `web_extract` | Tavily 提取 | - |
| `web_crawl` | Tavily 爬取 | - |
| `web_map` | Tavily 站点地图 | - |

---

## 九、优化完成记录

以下 8 项优化方向已全部实现 ✅：

| # | 优化方向 | 状态 | 实现方案 |
|---|---------|------|---------|
| 1 | 配置持久化 | ✅ | tauri-plugin-store 存储 mcp-servers.json，启动时自动加载+并行重连 |
| 2 | MCP 服务器预设模板 | ✅ | 8 个预设（Filesystem/GitHub/Brave/SQLite/Memory/Puppeteer/Fetch/Sequential Thinking） |
| 3 | 环境变量配置 | ✅ | AddMcpModal 中 key-value 编辑器，支持动态增删 |
| 4 | 服务器日志 | ✅ | stderr 异步线程捕获 + UI 展示面板 + 2s轮询刷新 + 清空功能 |
| 5 | 工具执行超时 | ✅ | `toolTimeoutSecs` 配置项（10-300秒，默认60），client.call_tool_with_timeout |
| 6 | 崩溃检测与自动重连 | ✅ | 10s 健康检查定时器 + 进程存活检测 + 3次递增延迟重连（5s→10s→20s） |
| 7 | 并发控制 | ✅ | `active_calls` 计数器 + `max_concurrent_calls=5` 上限 |
| 8 | 资源管理 | ✅ | sysinfo crate 监控每个 MCP 进程的内存(KB)和CPU(%) |

**额外实现的功能**：

| 功能 | 说明 |
|------|------|
| 服务唯一性校验 | 名称+命令组合去重，弹窗内显示错误提示 |
| 连接超时机制 | `connectTimeoutSecs`（10-120秒，默认30），initialize/list_tools 均受控 |
| 全部命令异步化 | 15 个 Tauri 命令全部 `async fn` + `spawn_blocking`，彻底消除 UI 冻结 |
| 并行启动连接 | `Promise.all` 并行连接所有 enabled 服务器，减少总等待时间 |
| 两阶段渲染 | 先显示"连接中"再更新最终状态，消除空白和闪烁 |
| 弹窗错误提示 | AlertCircle 红色提示框，覆盖重复检测失败和连接失败 |
| 重连加载态 | manualReconnecting Set + 旋转图标 + 按钮禁用 + 失败状态回显 |
| 编辑功能 | Pencil 图标触发编辑模式（删除旧+添加新策略保持 ID 不变） |
| 工具列表折叠 | 默认折叠（expandedTools 空 Set），点击展开 |
| 两列瀑布流 | columns-2 CSS 布局 |
| 参数自适应输入框 | textarea auto-resize 最高 240px |
