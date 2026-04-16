# Canvas 工作区扩展实现计划

## 概述

根据 `docs/CANVAS_WORKSPACE.md` 第 6.1 节和 6.2 节的规划，实现以下两个核心功能：

1. **AI 代码变更 Diff 视图** — AI 修改文件后自动展示 Diff 对比，支持 Accept/Reject
2. **终端输出面板** — AI 执行 Shell 命令后在 Canvas 底部展示终端输出

---

## 功能一：AI 代码变更 Diff 视图

### 1.1 实现策略

采用"先写入后审查"模式：
- AI 调用 `write_file` 时正常执行写入（不阻塞 ReAct 循环）
- 写入成功后，自动在 Canvas 中打开 Diff 视图展示变更
- 用户 Accept → 关闭 Diff 标签（文件已写入，无需操作）
- 用户 Reject → 用原始内容覆盖回写文件，关闭 Diff 标签

### 1.2 数据模型扩展

**文件**: `src/context/FileViewerContext.tsx`

扩展 `FileTab` 接口：

```typescript
export interface FileTab {
  id: string;
  path: string;
  title: string;
  content: string;
  originalContent: string;
  isDirty: boolean;
  language: string;
  readOnly: boolean;
  // 新增字段
  type: 'file' | 'diff';
  diffData?: {
    originalContent: string;
    newContent: string;
  };
}
```

新增 Context 方法：
- `openDiffView(path: string, originalContent: string, newContent: string): void` — 打开 Diff 视图标签
- `acceptDiff(tabId: string): Promise<void>` — 接受变更（关闭标签）
- `rejectDiff(tabId: string): Promise<void>` — 拒绝变更（回写原始内容并关闭标签）

### 1.3 Diff 视图组件

**新建文件**: `src/components/DiffView.tsx`

基于 `diff-match-patch` 库实现并排 Diff 视图：

- 左侧面板：原始内容（红色高亮删除行）
- 右侧面板：新内容（绿色高亮新增行）
- 同步滚动（左右面板联动）
- 行号对齐
- 顶部工具栏：Accept / Reject 按钮 + 变更统计（+N/-N）
- 复用现有 CodeMirror 主题（vsCodeDarkTheme / vsCodeLightTheme）

**依赖安装**: `npm install diff-match-patch` + `@types/diff-match-patch`

**核心实现**：
- 使用 `diff-match-patch` 计算 diff 结果
- 将 diff 结果映射为左右两侧的行数据（含行类型：added/removed/unchanged）
- 使用 CodeMirror 的 `Decoration.widget` 和 `Decoration.line` 实现行级着色
- 或者使用更简单的方案：自定义 CSS 渲染的行级 Diff 视图（基于 div 渲染，非 CodeMirror）

**推荐方案**：使用 CodeMirror 6 的 `ViewPlugin` + `Decoration` 实现 Diff 高亮，两侧各一个 CodeMirror 实例，通过 `scrollTo` 同步滚动。这样可以复用现有的语法高亮、主题等。

### 1.4 CanvasWorkspace 集成

**文件**: `src/components/CanvasWorkspace.tsx`

修改点：
1. Tab 标签栏：Diff 类型标签显示特殊图标（如 Git diff 图标）和"Diff"标识
2. 文件信息栏：Diff 模式显示"原始 → 修改"路径 + 变更统计
3. 编辑器区域：当 `activeTab.type === 'diff'` 时，渲染 `DiffView` 组件替代 CodeMirror
4. 工具栏按钮：Diff 模式显示 Accept（绿色）/ Reject（红色）按钮替代编辑/保存按钮

### 1.5 write_file 工具改造

**文件**: `src/agent/tools/builtin.ts`（`createWriteFileTool` 函数）

修改 `execute` 方法：
1. 写入前先尝试读取文件原有内容（通过 `invoke('read_file', ...)`）
2. 执行写入操作
3. 在返回结果的 `metadata` 中附带 `originalContent` 和 `newContent`

```typescript
// 伪代码
const originalContent = await tryReadFile(params.path); // 新增：读取原始内容
await invoke('write_file', { path, content, encoding }); // 原有写入逻辑
return {
  success: true,
  output: `File written successfully to ${params.path}`,
  metadata: { originalContent, newContent: params.content }, // 新增
};
```

### 1.6 onToolCall 回调集成

**文件**: `src/hooks/useAgentExecution.ts`

在 `onToolCall` 回调中增加对 `write_file` 成功结果的处理：

```typescript
onToolCall: (record) => {
  // ... 现有逻辑

  // 新增：write_file 成功后打开 Diff 视图
  if (record.toolName === 'write_file' && record.status === 'success' && record.result?.metadata) {
    const { originalContent, newContent } = record.result.metadata;
    const filePath = record.parameters?.path as string;
    if (originalContent !== undefined && newContent !== undefined && originalContent !== newContent) {
      // 通过回调通知 App 打开 Diff 视图
      callbacksRef.current?.onDiffOpen?.(filePath, originalContent, newContent);
    }
  }
}
```

**文件**: `src/App.tsx`

- 新增 `onDiffOpen` 回调处理，调用 `FileViewerContext.openDiffView()`
- 确保 Canvas 面板可见（切换到 command 模式）

### 1.7 ToolExecutionResult 类型扩展

**文件**: `src/agent/types.ts`

确保 `ToolExecutionResult` 的 `metadata` 字段类型支持 `originalContent` 和 `newContent`。

---

## 功能二：终端输出面板

### 2.1 实现策略

采用"结果展示"模式（第一版不支持流式输出）：
- AI 执行 `execute_shell` 后，命令输出在 Canvas 底部终端面板展示
- 支持 ANSI 颜色渲染
- 面板可折叠/展开，AI 执行命令时自动展开
- 命令历史保留在面板中供回看

### 2.2 依赖安装

```bash
npm install @xterm/xterm @xterm/addon-fit
```

> 注意：xterm.js v5+ 使用 `@xterm/xterm` 包名，`@xterm/addon-fit` 用于自适应尺寸

### 2.3 终端面板组件

**新建文件**: `src/components/CanvasTerminal.tsx`

功能：
- 使用 xterm.js 渲染终端输出
- 支持 ANSI 颜色码渲染
- 自动滚动到底部
- 面板可拖拽调整高度（最小 100px，最大 Canvas 高度的 60%）
- 折叠/展开按钮
- 清空按钮
- 命令输出格式：`$ <command>` + 输出内容 + 退出码

Props 接口：
```typescript
interface CanvasTerminalProps {
  isDarkMode: boolean;
  isOpen: boolean;
  onToggle: () => void;
}
```

内部状态：
- `entries: TerminalEntry[]` — 命令输出条目列表
- `height: number` — 面板高度

```typescript
interface TerminalEntry {
  id: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  timestamp: number;
}
```

### 2.4 终端状态管理

**新建文件**: `src/context/TerminalContext.tsx`

提供全局终端状态管理：
- `entries: TerminalEntry[]` — 所有命令输出条目
- `addEntry(entry: Omit<TerminalEntry, 'id'>): void` — 添加命令输出
- `clearEntries(): void` — 清空所有条目
- `isOpen: boolean` — 面板是否展开
- `setIsOpen(open: boolean): void` — 控制面板展开/折叠

### 2.5 CanvasWorkspace 集成

**文件**: `src/components/CanvasWorkspace.tsx`

布局变更：
```
┌─────────────────────────────────────────┐
│  标签栏 (h-12)                           │
├─────────────────────────────────────────┤
│  文件信息栏                              │
├─────────────────────────────────────────┤
│                                         │
│  编辑器 / DiffView / Markdown 预览       │  ← flex-1
│                                         │
├─────────────────────────────────────────┤
│  终端面板 (可折叠)                        │  ← 新增
│  $ npm run build                        │
│  > Build completed successfully         │
│  [展开/折叠] [清空]                       │
└─────────────────────────────────────────┘
```

- 编辑器区域从 `flex-1` 改为 `flex-1 min-h-0`（允许被终端面板压缩）
- 终端面板默认折叠（高度 0），有内容时自动展开
- 终端面板和编辑器之间有可拖拽的分隔线

### 2.6 execute_shell 工具集成

**文件**: `src/hooks/useAgentExecution.ts`

在 `onToolCall` 回调中增加对 `execute_shell` 结果的处理：

```typescript
onToolCall: (record) => {
  // ... 现有逻辑

  // 新增：execute_shell 完成后添加到终端面板
  if (record.toolName === 'execute_shell' && record.status === 'success') {
    const command = record.parameters?.command as string;
    const stdout = record.result?.output || '';
    const stderr = record.result?.error || '';
    const exitCode = (record.result?.metadata as any)?.exitCode ?? 0;
    callbacksRef.current?.onShellOutput?.(command, stdout, stderr, exitCode);
  }
  // 错误情况也要展示
  if (record.toolName === 'execute_shell' && record.status === 'error') {
    const command = record.parameters?.command as string;
    const stdout = record.result?.output || '';
    const stderr = record.result?.error || '';
    const exitCode = (record.result?.metadata as any)?.exitCode ?? 1;
    callbacksRef.current?.onShellOutput?.(command, stdout, stderr, exitCode);
  }
}
```

**文件**: `src/App.tsx`

- 新增 `onShellOutput` 回调处理，调用 `TerminalContext.addEntry()`
- 自动展开终端面板

### 2.7 Tauri 后端流式输出支持（后续增强）

当前 `execute_command` 和 `execute_powershell` 使用 `.output()` 同步等待，不支持流式输出。

**后续增强方案**（本次不实现，但预留接口）：
- 新增 `execute_command_streaming` Tauri 命令
- 使用 `Command::new().stdout(Stdio::piped()).stderr(Stdio::piped()).spawn()`
- 通过 Tauri 事件系统（`app.emit()`）逐行推送 stdout/stderr
- 前端通过 `listen()` 接收事件并实时写入 xterm.js

本次实现仅展示命令完成后的完整输出。

---

## 实现步骤

### Phase 1: Diff 视图

| 步骤 | 文件 | 操作 |
|------|------|------|
| 1.1 | `package.json` | 安装 `diff-match-patch` 和 `@types/diff-match-patch` |
| 1.2 | `src/context/FileViewerContext.tsx` | 扩展 `FileTab` 类型，新增 `openDiffView`、`acceptDiff`、`rejectDiff` 方法 |
| 1.3 | `src/components/DiffView.tsx` | 新建 Diff 视图组件（并排对比、行级着色、同步滚动） |
| 1.4 | `src/components/CanvasWorkspace.tsx` | 集成 DiffView，修改标签栏/信息栏/工具栏/编辑器区域 |
| 1.5 | `src/agent/tools/builtin.ts` | 修改 `write_file` 工具，写入前读取原始内容并在 metadata 中返回 |
| 1.6 | `src/hooks/useAgentExecution.ts` | 在 `onToolCall` 中处理 `write_file` 成功结果，触发 Diff 视图打开 |
| 1.7 | `src/App.tsx` | 连接 `onDiffOpen` 回调到 `FileViewerContext.openDiffView()` |

### Phase 2: 终端输出面板

| 步骤 | 文件 | 操作 |
|------|------|------|
| 2.1 | `package.json` | 安装 `@xterm/xterm` 和 `@xterm/addon-fit` |
| 2.2 | `src/context/TerminalContext.tsx` | 新建终端状态 Context |
| 2.3 | `src/components/CanvasTerminal.tsx` | 新建终端面板组件（xterm.js 渲染、可折叠、可拖拽高度） |
| 2.4 | `src/components/CanvasWorkspace.tsx` | 集成终端面板到底部布局 |
| 2.5 | `src/hooks/useAgentExecution.ts` | 在 `onToolCall` 中处理 `execute_shell` 结果，触发终端输出 |
| 2.6 | `src/App.tsx` | 连接 `onShellOutput` 回调到 `TerminalContext.addEntry()`，包裹 TerminalProvider |

### Phase 3: 集成测试与优化

| 步骤 | 操作 |
|------|------|
| 3.1 | 测试 Diff 视图：AI 修改文件 → 自动弹出 Diff → Accept/Reject |
| 3.2 | 测试终端面板：AI 执行命令 → 自动展开终端 → 显示输出 |
| 3.3 | 测试深色/浅色主题适配 |
| 3.4 | 性能优化：大文件 Diff 渲染、终端输出大量内容时的处理 |
| 3.5 | 运行 lint 和 typecheck |

---

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `package.json` | 修改 | 添加 diff-match-patch、@xterm/xterm、@xterm/addon-fit 依赖 |
| `src/context/FileViewerContext.tsx` | 修改 | 扩展 FileTab 类型，新增 diff 相关方法 |
| `src/components/DiffView.tsx` | **新建** | Diff 视图组件 |
| `src/components/CanvasTerminal.tsx` | **新建** | 终端面板组件 |
| `src/context/TerminalContext.tsx` | **新建** | 终端状态管理 |
| `src/components/CanvasWorkspace.tsx` | 修改 | 集成 DiffView 和终端面板 |
| `src/agent/tools/builtin.ts` | 修改 | write_file 工具返回原始内容 |
| `src/hooks/useAgentExecution.ts` | 修改 | 处理 write_file 和 execute_shell 回调 |
| `src/App.tsx` | 修改 | 连接回调、包裹 TerminalProvider |

---

## 风险与注意事项

1. **大文件 Diff 性能**：diff-match-patch 对超大文件可能较慢，需要考虑文件大小限制或增量 diff
2. **并发写入**：AI 可能连续调用多次 write_file，需要确保 Diff 视图能正确处理多个文件变更
3. **xterm.js 样式冲突**：xterm.js 自带 CSS 需要正确引入，避免与 Tailwind 冲突
4. **Tauri 事件系统**：当前后端仅有一个 `close-requested` 事件，流式输出需要新增事件通道（本次不实现）
5. **FileTab 向后兼容**：新增 `type` 字段需要默认值为 `'file'`，确保现有逻辑不受影响
