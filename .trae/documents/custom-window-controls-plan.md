# 实施计划：自定义窗口控制按钮

## 目标
去掉系统默认的窗口控制按钮（标题栏），使用项目中已有的自定义窗口控制按钮，并为其绑定实际的窗口操作功能。

## 当前状态分析

### 1. Tauri 配置 (`src-tauri/tauri.conf.json`)
- 当前没有设置 `decorations: false`，使用系统默认窗口装饰
- 需要添加此配置来隐藏系统标题栏

### 2. 窗口控制按钮位置 (`src/components/ToolPanel.tsx:275-283`)
```tsx
<button className="w-3 h-3 rounded-full bg-amber-500/80 hover:bg-amber-500 transition-colors" title="最小化" />
<button className="w-3 h-3 rounded-full bg-emerald-500/80 hover:bg-emerald-500 transition-colors" title="最大化" />
<button onClick={onClose} className="w-3 h-3 rounded-full bg-red-500/80 hover:bg-red-500 transition-colors" title="关闭" />
```
- 按钮已存在但功能不完整
- 只有关闭按钮绑定了 `onClose`（关闭 ToolPanel，不是窗口）
- 最小化和最大化按钮没有绑定任何事件

### 3. 依赖情况 (`package.json`)
- 有 `@tauri-apps/cli` (devDependencies)
- **缺少** `@tauri-apps/api` 包（需要安装）

### 4. Tauri Capabilities (`src-tauri/capabilities/default.json`)
- 只有 `core:default` 权限
- 需要添加窗口操作权限

## 实施步骤

### 步骤 1: 安装 Tauri API 包
```bash
npm install @tauri-apps/api
```

### 步骤 2: 更新 Tauri 配置
在 `src-tauri/tauri.conf.json` 的 `windows[0]` 中添加：
```json
"decorations": false,
"titleBarStyle": "overlay"
```

### 步骤 3: 更新 Tauri Capabilities
在 `src-tauri/capabilities/default.json` 中添加窗口操作权限：
```json
"core:window:allow-minimize",
"core:window:allow-maximize",
"core:window:allow-unmaximize",
"core:window:allow-close",
"core:window:allow-start-dragging"
```

### 步骤 4: 创建窗口控制组件
创建 `src/components/WindowControls.tsx`，封装窗口控制逻辑：
- 导入 `@tauri-apps/api/window` 中的 `appWindow`
- 实现最小化、最大化/还原、关闭功能
- 处理非 Tauri 环境的降级方案

### 步骤 5: 更新 ToolPanel.tsx
将现有的窗口控制按钮替换为新的 `WindowControls` 组件

### 步骤 6: 添加窗口拖拽区域
为标题栏区域添加 `data-tauri-drag-region` 属性，允许用户拖拽窗口

### 步骤 7: 测试验证
- 在 Tauri 环境中测试窗口控制功能
- 验证最小化、最大化、关闭功能正常
- 验证窗口拖拽功能正常

## 文件修改清单

| 文件 | 操作 |
|------|------|
| `package.json` | 添加 `@tauri-apps/api` 依赖 |
| `src-tauri/tauri.conf.json` | 添加 `decorations: false` |
| `src-tauri/capabilities/default.json` | 添加窗口操作权限 |
| `src/components/WindowControls.tsx` | 新建组件 |
| `src/components/ToolPanel.tsx` | 替换窗口控制按钮 |

## 注意事项

1. **非 Tauri 环境**：需要处理在浏览器中运行时的降级方案
2. **窗口拖拽**：隐藏系统标题栏后，需要提供拖拽区域
3. **跨平台兼容**：macOS 和 Windows 的窗口控制按钮位置习惯不同（macOS 在左侧，Windows 在右侧）
