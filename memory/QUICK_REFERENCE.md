# Nexus AI Assistant - 快速参考

## 常用命令

### 开发命令

```bash
# 启动 Web 开发服务器
npm run dev

# 启动 Tauri 桌面应用
npm run tauri:dev

# 构建前端
npm run build

# 构建 Tauri 应用
npm run tauri:build

# 类型检查
npm run lint

# 清理构建产物
npm run clean
```

### 安装依赖

```bash
# 安装项目依赖
npm install

# 安装 Tauri CLI (已包含在 devDependencies)
npm install -D @tauri-apps/cli
```

---

## 快速配置

### 1. 配置 AI 模型

#### LM Studio (推荐本地开发)

1. 下载并安装 [LM Studio](https://lmstudio.ai/)
2. 在 LM Studio 中加载模型
3. 启动本地服务器 (默认端口 1234)
4. 在应用设置中选择 "LM Studio"

#### Ollama

1. 下载并安装 [Ollama](https://ollama.ai/)
2. 拉取模型: `ollama pull llama3`
3. 在应用设置中选择 "Ollama"

#### 在线模型

在设置中选择 "在线模型"，然后：
1. 选择提供商 (OpenAI, DeepSeek, Gemini 等)
2. 输入 API Key
3. 选择模型

---

### 2. 环境变量

创建 `.env.local` 文件:

```env
# 可选：Gemini API Key (如果使用 Gemini)
GEMINI_API_KEY=your_api_key

# 应用 URL (生产环境)
APP_URL=http://localhost:3000
```

---

## 核心文件速查

| 需求 | 文件 |
|------|------|
| 修改主应用逻辑 | `src/App.tsx` |
| 添加新组件 | `src/components/` |
| 修改全局状态 | `src/context/GlobalStateContext.tsx` |
| 添加类型定义 | `src/types.ts` |
| 修改后端 API | `server.ts` |
| 修改 Tauri 配置 | `src-tauri/tauri.conf.json` |
| 添加翻译 | `src/i18n/locales/zh.json` |
| 修改样式 | `src/index.css` 或组件内 Tailwind |

---

## 常用代码片段

### 使用全局状态

```typescript
import { useGlobalState } from './context/GlobalStateContext';

const MyComponent = () => {
  const { 
    messages, 
    addLog, 
    agents,
    userName 
  } = useGlobalState();
  
  // ...
};
```

### 添加日志

```typescript
const { addLog } = useGlobalState();

addLog('操作成功', 'info');      // 信息日志
addLog('发生错误', 'error');     // 错误日志
addLog('执行命令', 'command');   // 命令日志
```

### 发送 AI 请求

```typescript
const response = await fetch(apiUrl, {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}` // 可选
  },
  body: JSON.stringify({
    model: modelName,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ],
    temperature: 0.7,
    stream: true
  })
});
```

### 合并 CSS 类名

```typescript
import { cn } from './lib/utils';

<div className={cn(
  'base-class',
  isActive && 'active-class',
  isDarkMode ? 'dark-class' : 'light-class'
)}>
```

### 国际化

```typescript
import { useTranslation } from '../hooks/useTranslation';

const { t } = useTranslation();

// 使用翻译
<h1>{t.common.title}</h1>
<button>{t.settings.save}</button>
```

---

## 预置 Agent

| Agent ID | 名称 | 角色 |
|----------|------|------|
| `nexus-architect` | Nexus 架构师 | 系统架构师 |
| `data-oracle` | 数据先知 | 数据科学家 |
| `web-scouter` | 网络侦察兵 | 研究专家 |
| `sec-guard` | 安全卫士 | 安全专家 |
| `ui-weaver` | 界面编织者 | 前端开发 |
| `ops-commander` | 运维指挥官 | DevOps 工程师 |

---

## 键盘快捷键

| 快捷键 | 功能 |
|--------|------|
| `Enter` | 发送消息 |
| `Shift + Enter` | 换行 |
| `Esc` | 关闭弹窗 |

---

## 故障排除

### 白屏问题

1. 检查控制台错误
2. 确认依赖已安装: `npm install`
3. 清理并重新构建: `npm run clean && npm run build`

### API 连接失败

1. 确认 LM Studio/Ollama 已启动
2. 检查端口是否正确
3. 检查防火墙设置

### Tauri 构建失败

1. 确认 Rust 已安装: `rustc --version`
2. 更新 Rust: `rustup update`
3. 清理构建: `cargo clean`

### 热更新不工作

1. 检查 `DISABLE_HMR` 环境变量
2. 重启开发服务器

---

## 项目结构速览

```
nexus-ai-assistant/
├── src/                    # 前端源码
│   ├── components/         # React 组件
│   ├── context/            # 状态管理
│   ├── i18n/               # 国际化
│   └── types.ts            # 类型定义
├── src-tauri/              # Tauri 配置
├── server.ts               # 后端服务
├── memory/                 # 项目文档
└── package.json            # 依赖配置
```

---

## 相关链接

- [React 文档](https://react.dev/)
- [Tailwind CSS 文档](https://tailwindcss.com/)
- [Tauri 文档](https://tauri.app/)
- [Vite 文档](https://vitejs.dev/)
- [LM Studio](https://lmstudio.ai/)
- [Ollama](https://ollama.ai/)
