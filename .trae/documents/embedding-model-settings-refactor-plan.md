# Embedding 模型设置模块重构与功能增强计划

## 项目概述

对设置→AI模型设置→Embedding模型的相关设置模块进行重构与功能增强，实现下载进度显示、文件完整性校验、打开模型文件夹、下载控制等功能。

## 涉及文件

### 后端 (Rust)
- `src-tauri/src/memory/embedding.rs` - 核心下载和模型加载逻辑
- `src-tauri/src/commands/memory.rs` - Tauri 命令接口
- `src-tauri/src/lib.rs` - 注册新命令

### 前端 (TypeScript/React)
- `src/components/SettingsView.tsx` - 设置页面组件
- `src/agent/memory/TauriMemoryClient.ts` - API 客户端
- `src/i18n/locales/zh.json` - 中文国际化
- `src/i18n/locales/en.json` - 英文国际化

---

## 实施步骤

### 第一阶段：后端基础设施改造

#### 1.1 创建下载状态管理模块
**文件**: `src-tauri/src/memory/embedding.rs`

- 新增 `DownloadState` 枚举类型：
  - `Idle` - 空闲
  - `Downloading` - 下载中
  - `Paused` - 已暂停
  - `Completed` - 已完成
  - `Error` - 错误

- 新增 `DownloadProgress` 结构体：
  ```rust
  pub struct DownloadProgress {
      pub model_id: String,
      pub filename: String,
      pub downloaded_bytes: u64,
      pub total_bytes: u64,
      pub percentage: f32,
      pub speed_bps: u64,
      pub eta_seconds: u64,
      pub state: DownloadState,
      pub error_message: Option<String>,
  }
  ```

- 新增全局下载状态管理器 `DownloadManager`：
  - 使用 `Arc<Mutex<...>>` 存储当前下载状态
  - 支持暂停/继续/取消操作
  - 支持并发安全的状态查询

#### 1.2 改造下载函数支持进度回调
**文件**: `src-tauri/src/memory/embedding.rs`

- 重构 `download_from_modelscope` 函数：
  - 改用异步下载（async）
  - 支持分块下载和进度追踪
  - 支持暂停/恢复机制
  - 使用临时文件（`.downloading` 后缀）存储
  - 下载完成后重命名为正式文件名

- 新增进度事件发送：
  - 通过 Tauri 的 `emit` 发送进度事件
  - 事件名：`embedding-download-progress`
  - 包含完整的 `DownloadProgress` 数据

#### 1.3 实现文件完整性校验
**文件**: `src-tauri/src/memory/embedding.rs`

- 新增 `verify_file_integrity` 函数：
  - 计算下载文件的 SHA256 哈希值
  - 从 ModelScope 获取预期的哈希值（如果可用）
  - 或使用文件大小作为基本校验
  - 校验失败时删除损坏文件

- 新增 `ModelFileManifest` 结构体：
  ```rust
  struct ModelFileManifest {
      filename: String,
      expected_size: u64,
      expected_sha256: Option<String>,
  }
  ```

#### 1.4 新增 Tauri 命令接口
**文件**: `src-tauri/src/commands/memory.rs`

新增以下命令：

```rust
#[tauri::command]
pub async fn download_embedding_model(
    model_id: String,
    app: AppHandle,
) -> Result<(), String>

#[tauri::command]
pub async fn pause_embedding_download(model_id: String) -> Result<(), String>

#[tauri::command]
pub async fn resume_embedding_download(model_id: String) -> Result<(), String>

#[tauri::command]
pub async fn cancel_embedding_download(model_id: String) -> Result<(), String>

#[tauri::command]
pub async fn get_download_progress(model_id: String) -> Result<Option<DownloadProgress>, String>

#[tauri::command]
pub async fn open_model_folder(model_id: String) -> Result<(), String>

#[tauri::command]
pub async fn check_model_exists(model_id: String) -> Result<bool, String>

#[tauri::command]
pub async fn delete_model_files(model_id: String) -> Result<(), String>

#[tauri::command]
pub async fn verify_model_integrity(model_id: String) -> Result<bool, String>
```

#### 1.5 注册新命令
**文件**: `src-tauri/src/lib.rs`

在 `invoke_handler` 中注册所有新增命令。

---

### 第二阶段：前端 UI 改造

#### 2.1 新增状态管理
**文件**: `src/components/SettingsView.tsx`

新增以下状态：
```typescript
interface DownloadProgress {
  modelId: string;
  filename: string;
  downloadedBytes: number;
  totalBytes: number;
  percentage: number;
  speedBps: number;
  etaSeconds: number;
  state: 'idle' | 'downloading' | 'paused' | 'completed' | 'error';
  errorMessage?: string;
}

const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
const [modelExists, setModelExists] = useState<boolean>(false);
const [isDownloading, setIsDownloading] = useState<boolean>(false);
```

#### 2.2 监听下载进度事件
**文件**: `src/components/SettingsView.tsx`

- 使用 `listen<DownloadProgress>('embedding-download-progress', ...)` 监听事件
- 在组件挂载时注册监听器
- 在组件卸载时取消监听
- 根据进度更新 UI 状态

#### 2.3 重构 Embedding 模型设置 UI
**文件**: `src/components/SettingsView.tsx`

改造现有 UI 结构：

```
┌─────────────────────────────────────────────────────────┐
│ Embedding 模型                                          │
├─────────────────────────────────────────────────────────┤
│ 当前状态:                                               │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ ● 状态指示灯 + 模型名称 + 维度信息                   │ │
│ │ [打开模型文件夹] (如果模型已下载)                    │ │
│ └─────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────┤
│ 模型选择:                                               │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ [下拉选择框]                                        │ │
│ │                                                     │ │
│ │ 状态显示区域:                                       │ │
│ │ - 未选择模型: 显示默认提示                          │ │
│ │ - 已选择但未下载: 显示醒目的"下载模型"按钮          │ │
│ │ - 下载中: 显示进度条 + 百分比 + 剩余时间            │ │
│ │           + [暂停] [取消] 按钮                      │ │
│ │ - 已暂停: 显示暂停状态 + [继续] [取消] 按钮         │ │
│ │ - 下载完成: 显示"模型已就绪" + [加载模型] 按钮      │ │
│ │ - 下载错误: 显示错误信息 + [重新下载] 按钮          │ │
│ └─────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────┤
│ 模型信息:                                               │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ [重新计算向量] [清除向量]                           │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

#### 2.4 实现下载进度条组件
**文件**: `src/components/SettingsView.tsx`

新增进度条组件：
- 使用 Tailwind CSS 样式
- 显示百分比进度
- 显示下载速度（格式化为 KB/s 或 MB/s）
- 显示预计剩余时间（格式化为 分:秒 或 时:分:秒）
- 动画效果

#### 2.5 实现下载控制按钮
**文件**: `src/components/SettingsView.tsx`

- **下载按钮**: 醒目的主色调按钮，点击开始下载
- **暂停按钮**: 暂停当前下载
- **继续按钮**: 继续暂停的下载
- **取消按钮**: 取消下载并清理临时文件
- **重新下载按钮**: 删除不完整文件后重新开始

---

### 第三阶段：API 客户端更新

#### 3.1 更新 TauriMemoryClient
**文件**: `src/agent/memory/TauriMemoryClient.ts`

新增以下方法：
```typescript
static async downloadEmbeddingModel(modelId: string): Promise<void>
static async pauseEmbeddingDownload(modelId: string): Promise<void>
static async resumeEmbeddingDownload(modelId: string): Promise<void>
static async cancelEmbeddingDownload(modelId: string): Promise<void>
static async getDownloadProgress(modelId: string): Promise<DownloadProgress | null>
static async openModelFolder(modelId: string): Promise<void>
static async checkModelExists(modelId: string): Promise<boolean>
static async deleteModelFiles(modelId: string): Promise<void>
static async verifyModelIntegrity(modelId: string): Promise<boolean>
```

---

### 第四阶段：国际化支持

#### 4.1 更新中文语言包
**文件**: `src/i18n/locales/zh.json`

在 `settings.ai.embedding` 下新增：
```json
{
  "downloadModel": "下载模型",
  "downloadingModel": "正在下载模型...",
  "downloadProgress": "下载进度",
  "downloadSpeed": "下载速度",
  "remainingTime": "剩余时间",
  "pauseDownload": "暂停",
  "resumeDownload": "继续",
  "cancelDownload": "取消",
  "retryDownload": "重新下载",
  "downloadComplete": "下载完成",
  "downloadPaused": "已暂停",
  "downloadError": "下载失败",
  "verifyingFile": "正在校验文件完整性...",
  "verifySuccess": "文件校验通过",
  "verifyFailed": "文件校验失败，请重新下载",
  "openModelFolder": "打开模型文件夹",
  "modelNotDownloaded": "模型未下载",
  "modelReadyToLoad": "模型已下载，点击加载使用",
  "selectModelFirst": "请先选择一个模型",
  "deletingModel": "正在删除模型文件...",
  "modelDeleted": "模型文件已删除",
  "errorNetworkError": "网络连接失败",
  "errorDiskFull": "磁盘空间不足",
  "errorFileCorrupted": "文件已损坏",
  "errorUnknown": "未知错误"
}
```

#### 4.2 更新英文语言包
**文件**: `src/i18n/locales/en.json`

添加对应的英文翻译。

---

## 技术要点

### 下载进度计算
```rust
// 计算下载速度
let elapsed = start_time.elapsed().as_secs_f64();
let speed = if elapsed > 0.0 {
    (downloaded_bytes as f64 / elapsed) as u64
} else {
    0
};

// 计算预计剩余时间
let remaining_bytes = total_bytes.saturating_sub(downloaded_bytes);
let eta = if speed > 0 {
    remaining_bytes / speed
} else {
    0
};
```

### 临时文件处理
```rust
// 下载时使用临时文件
let temp_path = file_path.with_extension("downloading");
// 下载完成后重命名
std::fs::rename(&temp_path, &file_path)?;
```

### 取消下载时清理
```rust
// 取消时删除临时文件
if temp_path.exists() {
    std::fs::remove_file(&temp_path)?;
}
```

### 打开文件夹
```rust
#[cfg(target_os = "windows")]
std::process::Command::new("explorer")
    .arg(&model_dir)
    .spawn()?;

#[cfg(target_os = "macos")]
std::process::Command::new("open")
    .arg(&model_dir)
    .spawn()?;

#[cfg(target_os = "linux")]
std::process::Command::new("xdg-open")
    .arg(&model_dir)
    .spawn()?;
```

---

## 实施顺序

1. **后端基础设施** (优先级最高)
   - 创建下载状态管理模块
   - 改造下载函数支持进度回调
   - 实现文件完整性校验
   - 新增 Tauri 命令接口

2. **API 客户端更新**
   - 更新 TauriMemoryClient

3. **前端 UI 改造**
   - 新增状态管理
   - 监听下载进度事件
   - 重构 UI 组件
   - 实现进度条和控制按钮

4. **国际化支持**
   - 更新语言包

---

## 测试要点

1. **下载功能测试**
   - 正常下载流程
   - 暂停/继续功能
   - 取消下载并清理临时文件
   - 网络中断后重新下载

2. **文件完整性测试**
   - 下载完成后校验
   - 损坏文件检测
   - 重新下载损坏文件

3. **UI 测试**
   - 各种状态的正确显示
   - 进度条动画
   - 按钮状态切换
   - 错误信息展示

4. **跨平台测试**
   - Windows 打开文件夹
   - macOS 打开文件夹
   - Linux 打开文件夹
