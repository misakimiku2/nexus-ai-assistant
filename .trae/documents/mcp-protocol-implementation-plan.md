# MCP 协议实现计划

## 现状分析

### 已就绪部分（UI 层）
- `McpControlCenter.tsx` - MCP 服务器管理界面（添加、查看、断开）
- `AddMcpModal.tsx` - 添加 MCP 服务器弹窗（名称、命令、参数）
- `AgentConfigModal.tsx` - Agent 配置中可选择 MCP 服务器
- `AgentClusterView.tsx` - Agent 卡片展示 MCP 服务器
- i18n 翻译字符串已存在
- `McpServer` / `McpTool` 类型定义已存在
- `Agent.mcpServers` 字段已存在
- GlobalState 中 `mcpServers` 状态已存在

### 缺失部分（协议通信层）
- **MCP 客户端实现**：无 JSON-RPC 客户端
- **MCP 服务器进程管理**：无法启动/管理 MCP 服务器进程
- **MCP 工具注册**：MCP 工具未注册到 ToolRegistry
- **MCP 工具执行**：无法将工具调用路由到 MCP 服务器
- **MCP 配置持久化**：当前为硬编码 mock 数据
- **MCP 优先级逻辑**：无 MCP 优先于内置工具的逻辑

### 内置工具与 MCP 工具重叠分析

| 内置工具 | 功能 | MCP 可替代方案 |
|---------|------|--------------|
| `web_search` | 网络搜索 | brave-search, google-search MCP server |
| `fetch_url` | 获取网页内容 | fetch MCP server |
| `read_file` | 读取文件 | filesystem MCP server |
| `write_file` | 写入文件 | filesystem MCP server |
| `list_directory` | 列出目录 | filesystem MCP server |
| `execute_shell` | 执行命令 | shell MCP server |
| `calculate` | 数学计算 | - |
| `get_current_time` | 获取时间 | - |
| `web_extract` | Tavily 提取 | - |
| `web_crawl` | Tavily 爬取 | - |
| `web_map` | Tavily 站点地图 | - |

## 实现计划

### 阶段 1：Rust 后端 MCP 协议客户端

**目标**：在 Rust 后端实现完整的 MCP JSON-RPC 客户端和进程管理。

#### 1.1 MCP 协议类型定义
- 新建 `src-tauri/src/mcp/mod.rs`
- 新建 `src-tauri/src/mcp/types.rs`
  - JSON-RPC 请求/响应类型（`JsonRpcRequest`, `JsonRpcResponse`）
  - MCP 协议消息类型（`InitializeRequest`, `InitializeResponse`）
  - 工具类型（`McpToolDefinition`, `McpToolCallRequest`, `McpToolCallResponse`）
  - 服务器配置类型（`McpServerConfig` - 包含 name, command, args, env）

#### 1.2 Stdio 传输层
- 新建 `src-tauri/src/mcp/transport.rs`
  - `StdioTransport` 结构体：管理子进程的 stdin/stdout 通信
  - `spawn()` - 启动 MCP 服务器进程
  - `send()` - 发送 JSON-RPC 消息到 stdin
  - `read_response()` - 从 stdout 读取 JSON-RPC 响应
  - `kill()` - 终止进程
  - 处理进程生命周期（启动、重启、超时）

#### 1.3 MCP 客户端
- 新建 `src-tauri/src/mcp/client.rs`
  - `McpClient` 结构体：封装 MCP 协议通信
  - `initialize()` - 发送 `initialize` 请求，完成握手
  - `list_tools()` - 发送 `tools/list` 请求，获取可用工具
  - `call_tool()` - 发送 `tools/call` 请求，执行工具
  - `list_resources()` - 发送 `resources/list` 请求
  - `read_resource()` - 发送 `resources/read` 请求
  - `shutdown()` - 关闭连接

#### 1.4 MCP 服务器管理器
- 新建 `src-tauri/src/mcp/manager.rs`
  - `McpServerManager` 结构体：管理所有 MCP 服务器实例
  - `add_server()` - 添加并启动 MCP 服务器
  - `remove_server()` - 停止并移除 MCP 服务器
  - `connect_server()` - 连接已有配置的服务器
  - `disconnect_server()` - 断开服务器
  - `get_server_status()` - 获取服务器状态
  - `get_all_tools()` - 获取所有已连接服务器的工具列表
  - `call_tool()` - 根据工具名路由到正确的 MCP 服务器执行
  - 使用 `tokio` 异步运行时管理并发

#### 1.5 Tauri 命令
- 在 `src-tauri/src/mcp/commands.rs` 中定义 Tauri 命令：
  - `mcp_add_server(config)` - 添加 MCP 服务器
  - `mcp_remove_server(id)` - 移除 MCP 服务器
  - `mcp_connect_server(id)` - 连接服务器
  - `mcp_disconnect_server(id)` - 断开服务器
  - `mcp_list_servers()` - 列出所有服务器及状态
  - `mcp_list_tools(server_id?)` - 列出工具
  - `mcp_call_tool(tool_name, arguments)` - 执行 MCP 工具
  - `mcp_get_server_configs()` - 获取所有服务器配置（用于持久化）
- 在 `src-tauri/src/lib.rs` 中注册这些命令
- 在 `Cargo.toml` 中添加必要依赖：`tokio`（已有）、`uuid`

---

### 阶段 2：前端 MCP 集成层

**目标**：创建前端 MCP 服务，将 MCP 工具集成到 ToolRegistry 中。

#### 2.1 MCP 类型扩展
- 更新 `src/types.ts`：
  - 扩展 `McpServer` 类型，增加 `command`, `args`, `env`, `status` 细化
  - 扩展 `McpTool` 类型，增加 `inputSchema`（JSON Schema 参数定义）
  - 新增 `McpServerConfig` 类型（用于持久化）

#### 2.2 MCP 服务
- 新建 `src/agent/mcp/mod.rs` → `src/agent/mcp/index.ts`
- 新建 `src/agent/mcp/McpService.ts`
  - `McpService` 类：前端 MCP 管理服务
  - `addServer(config)` - 调用 Tauri 命令添加服务器
  - `removeServer(id)` - 移除服务器
  - `connectServer(id)` - 连接服务器
  - `disconnectServer(id)` - 断开服务器
  - `refreshTools()` - 刷新所有 MCP 工具列表
  - `callTool(name, args)` - 执行 MCP 工具
  - `syncToGlobalState()` - 同步服务器状态到 GlobalState

#### 2.3 MCP 工具适配器
- 新建 `src/agent/mcp/McpToolAdapter.ts`
  - `adaptMcpTool()` - 将 MCP 工具定义转换为 `ToolDefinition` 格式
  - MCP 工具命名规则：`mcp__{server_id}__{tool_name}`（避免与内置工具冲突）
  - 适配 `inputSchema` 到 `JSONSchema` 格式
  - 适配工具执行：调用 Tauri `mcp_call_tool` 命令

#### 2.4 MCP 工具注册到 ToolRegistry
- 更新 `src/agent/tools/ToolRegistry.ts`：
  - 增加 `source` 字段到 `ToolRegistryEntry`：`'builtin' | 'mcp'`
  - 增加 `mcpServerId` 字段：标识工具来源的 MCP 服务器
  - 增加 `builtinToolName` 字段：MCP 工具对应的内置工具名（用于优先级映射）
  - `registerMcpTools(serverId, tools)` - 批量注册 MCP 工具
  - `unregisterMcpTools(serverId)` - 批量移除 MCP 服务器的工具
  - `getMcpToolsForServer(serverId)` - 获取指定服务器的工具
  - `getToolsBySource(source)` - 按来源获取工具

---

### 阶段 3：MCP 优先级逻辑

**目标**：当 MCP 提供类似功能的工具时，优先使用 MCP 工具。

#### 3.1 工具能力映射
- 新建 `src/agent/mcp/toolMapping.ts`
  - 定义内置工具与 MCP 工具的能力映射关系：
    ```typescript
    const TOOL_CAPABILITY_MAP = {
      'read_file': ['read_file', 'read', 'read_file_multiple'],
      'write_file': ['write_file', 'write', 'create_file'],
      'list_directory': ['list_directory', 'list', 'directory_listing'],
      'execute_shell': ['run_command', 'execute_command', 'shell_exec'],
      'web_search': ['search', 'web_search', 'brave_search', 'google_search'],
      'fetch_url': ['fetch', 'fetch_url', 'scrape'],
    };
    ```
  - `findOverlappingBuiltinTools(mcpToolName)` - 查找 MCP 工具重叠的内置工具
  - `isMcpPreferred(builtinToolName, mcpTools)` - 判断 MCP 工具是否应优先

#### 3.2 工具选择策略
- 更新 `ToolRegistry.buildOpenAITools()`：
  - 构建 LLM 工具列表时，如果 MCP 提供了与内置工具功能相同的工具：
    - 排除对应的内置工具
    - 只保留 MCP 版本的工具
  - 保留 MCP 工具的描述中标注来源信息
- 更新 `ReActEngine.handleToolCall()`：
  - 工具名可能是 `mcp__server__tool` 格式，需要正确路由
  - MCP 工具执行走 `invoke('mcp_call_tool')` 路径

#### 3.3 Agent 工具配置
- 更新 `AgentRuntime.initialize()`：
  - 根据 Agent 的 `mcpServers` 配置，只启用对应的 MCP 工具
  - 应用优先级逻辑：MCP 工具覆盖重叠的内置工具

---

### 阶段 4：MCP 配置持久化

**目标**：MCP 服务器配置持久保存，应用重启后自动恢复。

#### 4.1 配置存储
- 使用 Tauri Store 存储 MCP 服务器配置
- 存储内容：服务器 ID、名称、命令、参数、环境变量、启用状态
- 在 `McpService` 中实现 `saveConfigs()` 和 `loadConfigs()`

#### 4.2 自动重连
- 应用启动时，从存储加载 MCP 配置
- 自动连接所有已启用的 MCP 服务器
- 连接失败的服务器标记为 `error` 状态，不阻塞其他服务器

---

### 阶段 5：UI 更新

**目标**：将 UI 从 mock 数据切换到真实 MCP 连接。

#### 5.1 McpControlCenter 更新
- 显示真实的连接状态（connected / disconnected / error / connecting）
- 显示从 MCP 服务器获取的真实工具列表
- 支持编辑、删除、重连操作
- 添加环境变量配置区域
- 添加服务器日志/错误信息展示

#### 5.2 AddMcpModal 增强
- 添加环境变量配置（key-value 对）
- 添加常用 MCP 服务器预设模板（filesystem, github, brave-search 等）
- 连接测试：添加后自动尝试连接并显示结果
- 验证命令和参数的合法性

#### 5.3 GlobalState 更新
- 移除硬编码的 mock MCP 服务器数据
- 改为从 `McpService` 同步真实数据
- 添加 MCP 相关的 loading / error 状态

#### 5.4 Agent 配置更新
- AgentConfigModal 中 MCP 服务器选择显示真实状态
- 只有 `connected` 状态的服务器可被选择
- 显示每个 MCP 服务器提供的工具数量

---

### 阶段 6：错误处理与稳定性

**目标**：确保 MCP 集成的健壮性。

#### 6.1 错误处理
- MCP 服务器启动失败：显示错误信息，标记为 error 状态
- MCP 工具执行超时：设置超时时间，超时后返回错误
- MCP 服务器崩溃：自动检测并标记为 disconnected，提供重连按钮
- JSON-RPC 协议错误：解析错误响应并展示

#### 6.2 性能优化
- MCP 工具列表缓存：避免每次请求都调用 `tools/list`
- 工具执行并发控制：限制同时执行的 MCP 工具数量
- 进程资源管理：限制 MCP 服务器进程的内存和 CPU 使用

---

## 文件变更清单

### 新增文件

| 文件路径 | 功能 |
|---------|------|
| `src-tauri/src/mcp/mod.rs` | MCP 模块入口 |
| `src-tauri/src/mcp/types.rs` | MCP 协议类型定义 |
| `src-tauri/src/mcp/transport.rs` | Stdio 传输层 |
| `src-tauri/src/mcp/client.rs` | MCP JSON-RPC 客户端 |
| `src-tauri/src/mcp/manager.rs` | MCP 服务器管理器 |
| `src-tauri/src/mcp/commands.rs` | Tauri 命令定义 |
| `src/agent/mcp/index.ts` | 前端 MCP 模块入口 |
| `src/agent/mcp/McpService.ts` | 前端 MCP 管理服务 |
| `src/agent/mcp/McpToolAdapter.ts` | MCP 工具适配器 |
| `src/agent/mcp/toolMapping.ts` | 工具能力映射与优先级 |

### 修改文件

| 文件路径 | 修改内容 |
|---------|---------|
| `src-tauri/src/lib.rs` | 注册 MCP Tauri 命令 |
| `src-tauri/Cargo.toml` | 添加 uuid 等依赖 |
| `src/types.ts` | 扩展 McpServer/McpTool 类型 |
| `src/agent/tools/ToolRegistry.ts` | 增加 source/mcpServerId 字段和 MCP 注册方法 |
| `src/agent/tools/types.ts` | 增加 ToolRegistryEntry 的 MCP 相关字段 |
| `src/agent/runtime/ReActEngine.ts` | 支持 MCP 工具路由执行 |
| `src/agent/runtime/AgentRuntime.ts` | 集成 MCP 工具初始化和优先级逻辑 |
| `src/components/McpControlCenter.tsx` | 切换到真实 MCP 数据 |
| `src/components/AddMcpModal.tsx` | 增强配置选项 |
| `src/context/GlobalStateContext.tsx` | 移除 mock 数据，集成 McpService |

## 实施顺序

1. **阶段 1** → Rust 后端 MCP 协议实现（核心，其他都依赖此）
2. **阶段 2** → 前端 MCP 集成层（连接前后端）
3. **阶段 3** → MCP 优先级逻辑（用户核心需求）
4. **阶段 4** → 配置持久化（用户体验）
5. **阶段 5** → UI 更新（完善交互）
6. **阶段 6** → 错误处理与稳定性（生产就绪）
