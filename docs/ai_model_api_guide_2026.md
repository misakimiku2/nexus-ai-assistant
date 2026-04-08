---
AIGC:
    ContentProducer: Minimax Agent AI
    ContentPropagator: Minimax Agent AI
    Label: AIGC
    ProduceID: 600a59647603b77f36a9d29182b7bcd8
    PropagateID: 600a59647603b77f36a9d29182b7bcd8
    ReservedCode1: 304402200b0ad2963fbeb69962655fd7ab64de5e312983ba4a5e1db8843aa0e49d9f3b3402203b5ba7ff884a8331f7da4357123a37c93547bfeddfea86028edb34af8ece1083
    ReservedCode2: 304502203885ad139450261d7be7914a51c70d12488ab9367054253f81779ea4917da7d8022100cbaf2eb7a3c18573c41ccb490eff4550a5825dc5b0355f6abb8a8e999dfcbade
---

# AI模型厂商API开发使用指南（2026年4月版）

## 概述

本文档汇集了当前主流AI模型厂商的**最新API开发规范**（截至2026年4月），涵盖Google Gemini、OpenAI、Anthropic Claude、智谱AI GLM、Kimi Moonshot、MiniMAX、Deepseek和小米MiMo八大平台。每个章节提供官方文档链接、API端点、认证方式、支持模型、调用示例、定价信息和常见错误处理，为开发者提供一站式API集成参考。

---

## 目录

1. [Google Gemini API](#1-google-gemini-api)
2. [OpenAI API](#2-openai-api)
3. [Anthropic Claude API](#3-anthropic-claude-api)
4. [智谱AI GLM API](#4-智谱ai-glm-api)
5. [Kimi Moonshot API](#5-kimi-moonshot-api)
6. [MiniMAX API](#6-minimax-api)
7. [Deepseek API](#7-deepseek-api)
8. [小米MiMo API](#8-小米mimo-api)

---

## 1. Google Gemini API

### 官方文档链接

- 主文档：[Google AI Gemini API Documentation](https://ai.google.dev/gemini-api/docs)
- API参考：[Gemini API Reference](https://ai.google.dev/api)
- 控制台：[Google AI Studio](https://aistudio.google.com/)
- 示例代码库：[Gemini Cookbook](https://github.com/google-gemini/cookbook)

### 最新动态（2026年4月）

2026年4月3日，谷歌更新Gemini API定价策略，引入基于推理使用的分档计费机制。

### 推理服务档位（新）

| 档位 | 价格 | 延迟 | 适用场景 |
|------|------|------|----------|
| **Standard（标准）** | 基础价格 | 秒级 | 一般应用 |
| **Flex（弹性）** | 标准价格5折 | 1-15分钟 | 非实时应用、成本敏感型 |
| **Priority（优先）** | 标准价格+75%-100% | 毫秒-秒级 | 实时客服、欺诈检测 |
| **Batch（批量）** | 标准价格5折 | 最长24小时 | 离线数据处理 |
| **Caching（缓存）** | 按缓存量计费 | - | 复杂系统指令、重复分析 |

### API端点

| 功能 | 端点URL |
|------|---------|
| 基础URL | `https://generativelanguage.googleapis.com/v1beta/` |
| 生成内容 | `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent` |
| 流式生成 | `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent` |

### 认证方式

Gemini API使用API Key进行认证，通过HTTP请求头传递。

```bash
# 请求头格式
x-goog-api-key: YOUR_API_KEY
```

获取API Key：访问 [Google AI Studio API Key页面](https://aistudio.google.com/apikey) 创建。

### 支持的模型（2026年）

| 模型名称 | 描述 | 上下文长度 |
|---------|------|-----------|
| **Gemini 3 Pro** | 旗舰模型，多模态能力最强 | 1M |
| **Gemini 3 Flash** | 高性能、低延迟 | 1M |
| **Gemini 3.1 Flash-Lite** | 2026年3月发布，性价比最高 | 1M |
| **Gemini 2.5 Pro** | 强大推理能力 | 1M |
| **Gemini 2.5 Flash** | 最佳平衡性 | 1M |

### Python调用示例

#### 同步调用

```python
from google import genai

client = genai.Client(api_key="YOUR_API_KEY")
response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents="Explain how AI works in a few words"
)
print(response.text)
```

#### 流式调用

```python
from google import genai

client = genai.Client(api_key="YOUR_API_KEY")
response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents="Write a story about a robot",
    stream=True
)
for chunk in response:
    print(chunk.text, end="")
```

#### 多模态调用（图像输入）

```python
from google import genai
from google.genai.types import Part

client = genai.Client(api_key="YOUR_API_KEY")

with open("image.jpg", "rb") as f:
    image_data = f.read()

response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents=[
        "Describe this image",
        Part.from_bytes(data=image_data, mime_type="image/jpeg")
    ]
)
print(response.text)
```

### cURL调用示例

```bash
# 同步调用
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{
    "contents": [{
      "parts": [{"text": "Explain how AI works in a few words"}]
    }]
  }'
```

### 最新定价参考

| 模型 | 输入（≤200K tokens） | 输入（>200K tokens） | 输出 |
|------|---------------------|---------------------|------|
| Gemini 3 Pro | $2.50/百万tokens | $5.00/百万tokens | $15/百万tokens |
| Gemini 3 Flash | $0.30/百万tokens | $0.60/百万tokens | $1.20/百万tokens |
| Gemini 3.1 Flash-Lite | $0.15/百万tokens | $0.30/百万tokens | $0.60/百万tokens |

### Token限制

- 输入上下文窗口：Gemini 3系列支持最高100万tokens
- 输出限制：单次响应最大8192 tokens
- 速率限制：因账户类型和档位而异

### 常见错误码

| 错误码 | 描述 | 解决方案 |
|--------|------|---------|
| 400 | 请求参数错误 | 检查请求格式和参数 |
| 403 | API Key无效或无权限 | 验证API Key是否正确 |
| 429 | 请求频率超限 | 降低请求频率或切换至弹性档位 |
| 500 | 服务器内部错误 | 重试请求 |
| 503 | 服务暂时不可用 | 稍后重试 |

---

## 2. OpenAI API

### 官方文档链接

- 主文档：[OpenAI API Documentation](https://platform.openai.com/docs)
- API参考：[API Reference](https://platform.openai.com/docs/api-reference)
- 定价页面：[OpenAI Pricing](https://openai.com/api/pricing/)

### 最新动态（2026年3-4月）

| 日期 | 更新内容 |
|------|---------|
| 2026年3月5日 | 发布GPT-5.4，上下文提升至100万tokens |
| 2026年3月3日 | 发布GPT-5.3 Instant，解决语气问题 |
| 2026年2月11日 | 发布GPT-5.2，应对Gemini 3竞争 |
| 2025年12月19日 | 发布GPT-5.2-Codex，智能体编码模型 |

### API端点

| 功能 | 端点URL |
|------|---------|
| 基础URL | `https://api.openai.com/v1` |
| Chat Completions | `https://api.openai.com/v1/chat/completions` |
| Embeddings | `https://api.openai.com/v1/embeddings` |

### 认证方式

OpenAI API使用Bearer Token认证。

```bash
Authorization: Bearer YOUR_API_KEY
```

获取API Key：访问 [OpenAI Platform](https://platform.openai.com/api_keys) 创建。

### 支持的模型（2026年4月）

| 模型名称 | 描述 | 上下文长度 |
|---------|------|-----------|
| **GPT-5.4** | 2026年3月发布，专业工作最强模型 | **1M** |
| **GPT-5.4 Pro** | 仅对ChatGPT Pro/Enterprise开放 | 1M |
| **GPT-5.3 Instant** | 2026年3月发布，优化语气 | 256K |
| **GPT-5.2** | 2025年12月发布 | 256K |
| **GPT-5** | 2026年3月发布旗舰版 | 256K |
| **o3** | 推理模型 | 128K |
| **o4-mini** | 轻量推理模型 | 128K |

### GPT-5.4关键升级

- **上下文窗口**：从128K提升至**100万tokens**（1M）
- **Function Calling**：支持并行调用+嵌套调用，延迟降低约40%
- **Structured Output 2.0**：JSON Schema验证准确率达99.8%
- **原生多模态**：图像、音频、视频理解全内置

### Python调用示例

#### 同步调用

```python
from openai import OpenAI

client = OpenAI(api_key="YOUR_API_KEY")

response = client.chat.completions.create(
    model="gpt-5.4",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Hello!"}
    ]
)
print(response.choices[0].message.content)
```

#### 流式调用

```python
from openai import OpenAI

client = OpenAI(api_key="YOUR_API_KEY")

stream = client.chat.completions.create(
    model="gpt-5.4",
    messages=[
        {"role": "user", "content": "Write a story about a robot"}
    ],
    stream=True
)
for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")
```

#### 多轮对话

```python
from openai import OpenAI

client = OpenAI(api_key="YOUR_API_KEY")

messages = [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "What is the capital of France?"}
]

response = client.chat.completions.create(
    model="gpt-5.4",
    messages=messages
)
messages.append(response.choices[0].message)
messages.append({"role": "user", "content": "What is its population?"})

response = client.chat.completions.create(
    model="gpt-5.4",
    messages=messages
)
print(response.choices[0].message.content)
```

#### Function Calling

```python
from openai import OpenAI

client = OpenAI(api_key="YOUR_API_KEY")

tools = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Get weather for a location",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {"type": "string", "description": "City name"}
                },
                "required": ["location"]
            }
        }
    }
]

response = client.chat.completions.create(
    model="gpt-5.4",
    messages=[{"role": "user", "content": "What's the weather in Tokyo?"}],
    tools=tools
)
print(response.choices[0].message.tool_calls)
```

### cURL调用示例

```bash
# 同步调用
curl https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.4",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'

# 流式调用
curl https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.4",
    "messages": [{"role": "user", "content": "Write a story"}],
    "stream": true
  }'
```

### 最新定价（2026年4月）

#### GPT-5系列

| 模型 | 输入 | 输出 | 备注 |
|------|------|------|------|
| GPT-5.4 | **$2.50/百万** | **$10.00/百万** | 超过272K tokens输入翻倍 |
| GPT-5.4 Pro | 价格更高 | 价格更高 | 仅Pro/Enterprise |
| GPT-5.3 Instant | $1.75/百万 | $7.00/百万 | 语气优化版 |
| GPT-5.2 | $1.75/百万 | $7.00/百万 | 2025年12月发布 |
| GPT-5 | $2.50/百万 | $10.00/百万 | 旗舰版 |

#### o系列推理模型

| 模型 | 输入 | 输出 |
|------|------|------|
| o3 | $15.00/百万 | $60.00/百万 |
| o4-mini | $3.00/百万 | $12.00/百万 |

### Token限制

- GPT-5.4：**100万tokens上下文**（超过272K价格翻倍）
- GPT-5.3：256K上下文
- GPT-5：256K上下文
- o系列：128K上下文

### 常见错误码

| 错误码 | 描述 | 解决方案 |
|--------|------|---------|
| 400 | 无效请求 | 检查请求格式 |
| 401 | 认证失败 | 验证API Key |
| 403 | 无权限 | 检查账户权限 |
| 429 | 请求频率超限 | 实现退避策略 |
| 500 | 服务器错误 | 重试 |

---

## 3. Anthropic Claude API

### 官方文档链接

- 主文档：[Anthropic Documentation](https://docs.anthropic.com/)
- API参考：[Claude API Reference](https://docs.anthropic.com/api/)
- 定价页面：[Anthropic Pricing](https://www.anthropic.com/pricing)

### 最新动态（2026年2月）

| 日期 | 更新内容 |
|------|---------|
| 2026年2月17日 | 发布Claude Sonnet 4.6和Claude Opus 4.6 |
| 2026年2月 | 发布Claude Opus 4.5医疗版 |
| 2025年9月30日 | 发布Claude Sonnet 4.5 |

### API端点

| 功能 | 端点URL |
|------|---------|
| 基础URL | `https://api.anthropic.com/v1` |
| Messages | `https://api.anthropic.com/v1/messages` |

### 认证方式

Anthropic API使用API Key认证，传递方式为：

```bash
x-api-key: YOUR_API_KEY
anthropic-version: 2023-06-01
```

获取API Key：访问 [Anthropic Console](https://console.anthropic.com/) 创建。

### 支持的模型（2026年4月）

| 模型名称 | 描述 | 上下文长度 |
|---------|------|-----------|
| **Claude Opus 4.6** | 2026年2月发布，最强智能 | **1M** |
| **Claude Sonnet 4.6** | 2026年2月发布，平衡性能 | **1M** |
| **Claude Sonnet 4.5** | 2025年9月发布 | 200K |
| **Claude Opus 4.5** | 医疗专业版 | 200K |
| **Claude 3.5 Sonnet** | 高性价比 | 200K |

### Claude Opus 4.6关键升级

- **100万token上下文窗口**：测试版支持
- **编码能力**：SWE-Bench Verified 80.2%
- **电脑操作**：OSWorld测试72.7%
- **Agent Teams**：多智能体协作功能
- **工具调用**：Excel、PPT等Office处理能力

### Python调用示例

#### 同步调用

```python
from anthropic import Anthropic

client = Anthropic(api_key="YOUR_API_KEY")

response = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=1024,
    messages=[
        {"role": "user", "content": "Hello, Claude!"}
    ]
)
print(response.content[0].text)
```

#### 流式调用

```python
from anthropic import Anthropic

client = Anthropic(api_key="YOUR_API_KEY")

with client.messages.stream(
    model="claude-sonnet-4-20250514",
    max_tokens=1024,
    messages=[
        {"role": "user", "content": "Write a story about a robot"}
    ]
) as stream:
    for text in stream.text_stream:
        print(text, end="")
```

#### 多轮对话

```python
from anthropic import Anthropic

client = Anthropic(api_key="YOUR_API_KEY")

messages = []
messages.append({"role": "user", "content": "What is the capital of France?"})
response = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=1024,
    messages=messages
)
messages.append({"role": "assistant", "content": response.content[0].text})
messages.append({"role": "user", "content": "What is its population?"})

response = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=1024,
    messages=messages
)
print(response.content[0].text)
```

#### Tool Use（Function Calling）

```python
from anthropic import Anthropic

client = Anthropic(api_key="YOUR_API_KEY")

response = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=1024,
    messages=[
        {"role": "user", "content": "What's the weather in Tokyo?"}
    ],
    tools=[
        {
            "name": "get_weather",
            "description": "Get weather for a location",
            "input_schema": {
                "type": "object",
                "properties": {
                    "location": {"type": "string", "description": "City name"}
                },
                "required": ["location"]
            }
        }
    ]
)
print(response.content)
```

### cURL调用示例

```bash
# 同步调用
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### 最新定价（2026年）

| 模型 | 输入 | 输出 |
|------|------|------|
| Claude Opus 4.6 | $15.00/百万 | $75.00/百万 |
| Claude Sonnet 4.6 | $3.00/百万 | $15.00/百万 |
| Claude Sonnet 4.5 | $3.00/百万 | $15.00/百万 |
| Claude 3.5 Sonnet | $3.00/百万 | $15.00/百万 |

### Token限制

- **上下文窗口**：Claude 4.6测试版支持**100万tokens**，正式版200K
- 输出限制：可配置max_tokens

### 常见错误码

| 错误码 | 描述 | 解决方案 |
|--------|------|---------|
| 400 | 请求无效 | 检查请求格式 |
| 401 | 认证失败 | 验证API Key |
| 403 | 权限不足 | 检查账户状态 |
| 429 | 速率超限 | 降低请求频率 |
| 500 | 内部错误 | 重试请求 |

---

## 4. 智谱AI GLM API

### 官方文档链接

- 主文档：[智谱AI开放平台文档](https://open.bigmodel.cn/dev/api)
- 控制台：[智谱AI控制台](https://open.bigmodel.cn/console/overview)
- 定价页面：[价格页面](https://open.bigmodel.cn/pricing)

### 最新动态（2026年）

| 日期 | 更新内容 |
|------|---------|
| 2026年3月16日 | 发布GLM-5-Turbo（首个闭源模型），API涨价20% |
| 2026年2月12日 | 发布并开源GLM-5，API涨价30%-67% |
| 2026年1月8日 | 智谱AI登陆港交所主板上市 |

### API端点

| 功能 | 端点URL |
|------|---------|
| 基础URL | `https://open.bigmodel.cn/api/paas/v4` |
| Chat Completions | `https://open.bigmodel.cn/api/paas/v4/chat/completions` |

### 认证方式

智谱AI使用API Key认证：

```bash
Authorization: Bearer YOUR_API_KEY
```

获取API Key：访问 [API Key管理页面](https://open.bigmodel.cn/usercenter/proj-mgmt/apikeys) 创建。

### 支持的模型（2026年4月）

| 模型名称 | 描述 | 上下文长度 |
|---------|------|-----------|
| **GLM-5** | 2026年2月发布，旗舰开源模型，全球第四 | 128K |
| **GLM-5-Turbo** | 2026年3月发布，首个闭源模型 | 128K |
| **GLM-4.7** | Coding专用，编程能力强 | 128K |
| **GLM-4.5** | 2025年7月发布 | 128K |
| **GLM-4.5V** | 视觉理解模型 | 128K |

### GLM-5关键突破

- **性能对标顶级闭源模型**：编程基准测试开源最高分
- **真实编程体验**：接近Claude Opus 4.5
- **核心技术升级**：744B参数，异步强化学习框架"Slime"
- **ZCode工具**：自然语言描述需求，多智能体并发完成编码、调试

### Python调用示例

#### 同步调用

```python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_API_KEY",
    base_url="https://open.bigmodel.cn/api/paas/v4"
)

response = client.chat.completions.create(
    model="glm-5",
    messages=[
        {"role": "user", "content": "你好"}
    ]
)
print(response.choices[0].message.content)
```

#### 流式调用

```python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_API_KEY",
    base_url="https://open.bigmodel.cn/api/paas/v4"
)

stream = client.chat.completions.create(
    model="glm-5",
    messages=[
        {"role": "user", "content": "讲一个故事"}
    ],
    stream=True
)
for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")
```

#### Function Calling

```python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_API_KEY",
    base_url="https://open.bigmodel.cn/api/paas/v4"
)

response = client.chat.completions.create(
    model="glm-5",
    messages=[
        {"role": "user", "content": "北京天气怎么样？"}
    ],
    tools=[
        {
            "type": "function",
            "function": {
                "name": "get_weather",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "location": {"type": "string", "description": "城市名称"}
                    }
                }
            }
        }
    ]
)
print(response.choices[0].message.tool_calls)
```

### cURL调用示例

```bash
# 同步调用
curl https://open.bigmodel.cn/api/paas/v4/chat/completions \
  -H "Authorization: Bearer $ZHIPU_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "glm-5",
    "messages": [{"role": "user", "content": "你好"}]
  }'
```

### 最新定价（2026年4月）

**2026年第一季度累计涨幅达83%**

| 模型 | 输入 | 输出 | 备注 |
|------|------|------|------|
| GLM-5 | ¥1.34/百万tokens | ¥3.34/百万tokens | 涨幅67%-100% |
| GLM-5-Turbo | ¥1.60/百万tokens | ¥4.00/百万tokens | 涨幅20% |
| GLM-4.7 | ¥1.04/百万tokens | ¥2.60/百万tokens | Coding版 |

### Token限制

- 上下文窗口：128K tokens
- GLM-5系列token与字数换算比例约1:1.6

### 常见错误码

| 错误码 | 描述 | 解决方案 |
|--------|------|---------|
| 10001 | 系统错误 | 重试 |
| 10002 | 权限验证失败 | 检查API Key |
| 10003 | 请求参数错误 | 检查请求格式 |
| 10004 | 账户余额不足 | 充值 |
| 10005 | 频率超限 | 降低请求频率 |

---

## 5. Kimi Moonshot API

### 官方文档链接

- 主文档：[Kimi API开放平台](https://platform.moonshot.cn/docs)
- 控制台：[Kimi控制台](https://platform.moonshot.cn/console)
- 定价页面：[模型推理定价](https://platform.moonshot.cn/docs/pricing/chat)

### 最新动态（2026年1月）

| 日期 | 更新内容 |
|------|---------|
| 2026年1月27日 | 发布并开源Kimi K2.5模型 |
| 2025年11月 | 开源K2 Thinking模型 |
| 2025年9月 | K2上下文扩展至256K |

### API端点

| 功能 | 端点URL |
|------|---------|
| 基础URL | `https://api.moonshot.cn/v1` |
| Chat Completions | `https://api.moonshot.cn/v1/chat/completions` |

### 认证方式

Kimi API使用OpenAI兼容格式认证：

```bash
Authorization: Bearer YOUR_API_KEY
```

获取API Key：访问 [Kimi控制台](https://platform.moonshot.cn/console/api-keys) 创建。

### 支持的模型（2026年4月）

| 模型名称 | 描述 | 上下文长度 |
|---------|------|-----------|
| **Kimi K2.5** | 2026年1月发布，原生多模态，Agent集群 | 256K |
| **Kimi K2** | 高性能生成模型 | 128K |
| **Kimi K2 Thinking** | 长思考模型 | 128K |
| moonshot-v1-128k | 128K上下文版本 | 128K |

### Kimi K2.5关键突破

- **原生多模态架构**：同时支持视觉与文本输入
- **四种工作模式**：Instant/Thinking/Agent/Agent Swarm
- **Agent集群**：最多调度100个子Agent，支持1500次工具调用
- **视觉编程**：截图/录屏转代码，延迟降低4.5倍

### Python调用示例

#### 同步调用

```python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_API_KEY",
    base_url="https://api.moonshot.cn/v1"
)

response = client.chat.completions.create(
    model="kimi-k2.5",
    messages=[
        {"role": "user", "content": "你好"}
    ]
)
print(response.choices[0].message.content)
```

#### 流式调用

```python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_API_KEY",
    base_url="https://api.moonshot.cn/v1"
)

stream = client.chat.completions.create(
    model="kimi-k2.5",
    messages=[
        {"role": "user", "content": "讲一个故事"}
    ],
    stream=True
)
for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")
```

#### 多模态调用

```python
from openai import OpenAI
import base64

client = OpenAI(
    api_key="YOUR_API_KEY",
    base_url="https://api.moonshot.cn/v1"
)

# 读取图片并转为base64
with open("image.jpg", "rb") as f:
    image_data = base64.b64encode(f.read()).decode()

response = client.chat.completions.create(
    model="kimi-k2.5",
    messages=[
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "描述这张图片"},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_data}"}}
            ]
        }
    ]
)
print(response.choices[0].message.content)
```

### cURL调用示例

```bash
# 同步调用
curl https://api.moonshot.cn/v1/chat/completions \
  -H "Authorization: Bearer $KIMI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "kimi-k2.5",
    "messages": [{"role": "user", "content": "你好"}]
  }'
```

### 最新定价

| 模型 | 输入 | 输出 |
|------|------|------|
| Kimi K2.5 | 详见定价页面 | 详见定价页面 |
| Kimi K2 | 详见定价页面 | 详见定价页面 |
| moonshot-v1-128k | ¥15/百万tokens | ¥60/百万tokens |

### Token限制

- 最大上下文：256K tokens（Kimi K2.5）
- 支持超长上下文处理

### 常见错误码

| 错误码 | 描述 | 解决方案 |
|--------|------|---------|
| 400 | 请求格式错误 | 检查JSON格式 |
| 401 | 认证失败 | 验证API Key |
| 403 | 无权限 | 检查账户权限 |
| 429 | 速率限制 | 降低频率 |
| 500 | 服务器错误 | 重试 |

---

## 6. MiniMAX API

### 官方文档链接

- 主文档：[MiniMax开放平台](https://www.minimaxi.com/document)
- API文档：[platform.minimaxi.com](https://platform.minimaxi.com/docs)
- 定价页面：[产品价格](https://www.minimaxi.com/price)

### 最新动态（2026年2月）

| 日期 | 更新内容 |
|------|---------|
| 2026年2月12日 | 发布M2.5编程模型，对标Claude Opus 4.6 |
| 2026年1月 | MiniMax-Text-01和VL-01开源 |
| 2025年12月 | MiniMax语音模型更新 |

### API端点

| 功能 | 端点URL |
|------|---------|
| 基础URL | `https://api.minimax.chat/v1` |
| Text Chat | `https://api.minimax.chat/v1/text/chatcompletion_v2` |
| Speech T2A | `https://api.minimax.chat/v1/t2a_v2` |

### 认证方式

MiniMAX API使用API Key认证：

```bash
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

获取API Key：访问 [MiniMax平台](https://platform.minimaxi.com/) 创建。

### 支持的模型（2026年4月）

#### 文本模型

| 模型名称 | 描述 | 上下文长度 |
|---------|------|-----------|
| **MiniMax M2.5** | 2026年2月发布，编程与Agent旗舰 | 1000K |
| MiniMax-Text-01 | 长文处理，开源 | 1000K |
| abab6.5s | 通用场景 | 245K |

#### 其他模型

| 类型 | 模型 |
|------|------|
| 视觉 | MiniMax-VL-01 |
| 语音 | speech-01-hd, speech-01-turbo |
| 视频 | Hailuo 2.3 |
| 音乐 | Music 2.5+ |

### M2.5关键突破

- **全球首个Agent原生设计生产级模型**
- **编程性能对标Claude Opus 4.6**：SWE-Bench Verified 80.2%
- **极低激活参数**：仅10B激活参数，100TPS超高吞吐量
- **全栈开发**：PC、App、跨端应用
- **Office核心场景**：Excel高阶处理、深度调研、PPT

### Python调用示例

#### 文本同步调用

```python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_API_KEY",
    base_url="https://api.minimax.chat/v1"
)

response = client.chat.completions.create(
    model="MiniMax-Text-01",
    messages=[
        {"role": "user", "content": "你好"}
    ]
)
print(response.choices[0].message.content)
```

#### 流式调用

```python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_API_KEY",
    base_url="https://api.minimax.chat/v1"
)

stream = client.chat.completions.create(
    model="MiniMax-Text-01",
    messages=[
        {"role": "user", "content": "讲一个故事"}
    ],
    stream=True
)
for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")
```

### cURL调用示例

```bash
curl https://api.minimax.chat/v1/text/chatcompletion_v2 \
  -H "Authorization: Bearer $MINIMAX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "MiniMax-Text-01",
    "messages": [{"role": "user", "content": "你好"}]
  }'
```

### 最新定价

#### 文本模型

| 模型 | 输入 | 输出 |
|------|------|------|
| MiniMax-Text-01 | ¥1/千tokens | ¥8/千tokens |
| MiniMax-VL-01 | ¥1/千tokens | ¥8/千tokens |
| abab6.5s | ¥1/千tokens | ¥1/千tokens |

#### 其他模型

| 类型 | 单价 |
|------|------|
| 语音 (speech-01-hd) | ¥3.5/万字符 |
| 语音 (speech-01-turbo) | ¥2/万字符 |
| 视频 T2V-01 | ¥3/个 |
| 音乐 | ¥0.1/首 |

M2.5价格：输入约$0.3/百万Tokens，输出约$2.4/百万Tokens。

### Token限制

- MiniMax-Text-01：1000K上下文
- abab6.5s：245K上下文

### 常见错误码

| 错误码 | 描述 | 解决方案 |
|--------|------|---------|
| 10001 | 系统错误 | 重试 |
| 10002 | 认证失败 | 检查API Key |
| 10003 | 参数错误 | 检查请求格式 |
| 10004 | 余额不足 | 充值 |
| 10005 | 频率超限 | 降低请求频率 |

---

## 7. Deepseek API

### 官方文档链接

- 主文档：[DeepSeek API文档](https://api-docs.deepseek.com/)
- 控制台：[DeepSeek Platform](https://platform.deepseek.com/api_keys)
- 定价页面：[Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing)

### 最新动态（2026年2月）

| 日期 | 更新内容 |
|------|---------|
| 2026年2月16日 | 发布V3.2-Exp，API大幅降价 |
| 2026年2月11日 | 更新新模型（可能是V4 Preview），上下文1M |
| 2026年2月10日 | 野村证券预测V4发布 |

### API端点

| 功能 | 端点URL |
|------|---------|
| 基础URL | `https://api.deepseek.com` |
| Chat Completions | `https://api.deepseek.com/chat/completions` |
| OpenAI兼容端点 | `https://api.deepseek.com/v1/chat/completions` |

### 认证方式

DeepSeek API使用Bearer Token认证：

```bash
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

获取API Key：访问 [DeepSeek Platform](https://platform.deepseek.com/api_keys) 创建。

### 支持的模型（2026年4月）

| 模型名称 | 描述 | 上下文长度 |
|---------|------|-----------|
| **V3.2-Exp** | 2026年2月发布，实验性版本 | 待定 |
| **V3.2（新模型）** | 2026年2月，上下文1M | **1M** |
| DeepSeek-V3.2 | 正式版 | 128K |
| deepseek-chat | V3.2非思考模式 | 128K |
| deepseek-reasoner | V3.2思考模式 | 128K |

### 新模型关键突破

- **上下文升级至1M**：从128K提升约10倍，可装下完整《三体》
- **知识库更新**：至2025年5月
- **前端能力提升**：可媲美Gemini 3 Pro、K2.5
- **语言风格优化**：更活泼、真实

### Python调用示例

#### 同步调用

```python
from openai import OpenAI

client = OpenAI(
    api_key=os.environ.get("DEEPSEEK_API_KEY"),
    base_url="https://api.deepseek.com"
)

response = client.chat.completions.create(
    model="deepseek-chat",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Hello!"}
    ],
    stream=False
)
print(response.choices[0].message.content)
```

#### 流式调用

```python
from openai import OpenAI

client = OpenAI(
    api_key=os.environ.get("DEEPSEEK_API_KEY"),
    base_url="https://api.deepseek.com"
)

stream = client.chat.completions.create(
    model="deepseek-chat",
    messages=[
        {"role": "user", "content": "Write a story about a robot"}
    ],
    stream=True
)
for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")
```

#### Function Calling

```python
from openai import OpenAI

client = OpenAI(
    api_key=os.environ.get("DEEPSEEK_API_KEY"),
    base_url="https://api.deepseek.com"
)

response = client.chat.completions.create(
    model="deepseek-chat",
    messages=[
        {"role": "user", "content": "What's the weather in Tokyo?"}
    ],
    tools=[
        {
            "type": "function",
            "function": {
                "name": "get_weather",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "location": {"type": "string", "description": "City name"}
                    }
                }
            }
        }
    ]
)
print(response.choices[0].message.tool_calls)
```

### cURL调用示例

```bash
# 同步调用
curl https://api.deepseek.com/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $DEEPSEEK_API_KEY" \
  -d '{
    "model": "deepseek-chat",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Hello!"}
    ],
    "stream": false
  }'
```

### 最新定价（2026年2月降价后）

| 模型 | 输入（缓存命中） | 输入（缓存未命中） | 输出 |
|------|-----------------|------------------|------|
| DeepSeek-V3 | ¥0.25-0.5/百万 | ¥0.5-2/百万 | ¥8/百万 |
| DeepSeek-R1 | ¥0.25-1/百万 | ¥1-4/百万 | ¥16/百万 |

错峰优惠时段（北京00:30-08:30）可享更低价格。

### Token限制

- **新模型上下文**：100万tokens（1M）
- 旧版API：128K tokens
- API与OpenAI SDK完全兼容

### 常见错误码

| 错误码 | 描述 | 解决方案 |
|--------|------|---------|
| 400 | 请求无效 | 检查请求格式 |
| 401 | 认证失败 | 验证API Key |
| 403 | 无权限 | 检查账户权限 |
| 429 | 速率超限 | 降低请求频率 |
| 500 | 服务器错误 | 重试 |

### 支持与资源

- 邮箱：api-service@deepseek.com
- Discord：https://discord.gg/Tc7c45Zzu5
- 状态页：https://status.deepseek.com/

---

## 8. 小米MiMo API

### 官方文档链接

- 主文档：[MiMo开放平台](https://platform.xiaomimimo.com/)
- API文档：[platform.xiaomimimo.com/docs](https://platform.xiaomimimo.com/docs)

### 最新动态（2026年3月）

| 日期 | 更新内容 |
|------|---------|
| 2026年3月26日 | Agent框架限免延长至4月2日 |
| 2026年3月19日 | 发布MiMo-V2-Pro/Omni/TTS |
| 2026年1月20日 | API计费系统启用 |

### API端点

| 功能 | 端点URL |
|------|---------|
| 基础URL | `https://api.mimomodel.io` |
| Chat Completions | `https://api.mimomodel.io/v1/chat/completions` |

### 认证方式

MiMo API使用API Key认证：

```bash
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

获取API Key：访问 [MiMo控制台](https://platform.xiaomimimo.com/#/console/api-keys) 创建。

### 支持的模型（2026年4月）

| 模型名称 | 描述 | 上下文长度 |
|---------|------|-----------|
| **MiMo-V2-Pro** | 2026年3月发布，旗舰模型 | **1M** |
| **MiMo-V2-Omni** | 全能版本 | 1M |
| **MiMo-V2-TTS** | 语音合成 | - |
| MiMo-V2-Flash | 开源版本 | - |

### MiMo-V2-Pro关键突破

- **专为Agent工作场景打造**
- **总参数超1T**：激活参数42B
- **1M超长上下文**
- **创新混合注意力架构**
- **OpenRouter全球调用量排名第一**：日榜、周榜、趋势榜Top1

### Python调用示例

#### 同步调用

```python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_API_KEY",
    base_url="https://api.mimomodel.io/v1"
)

response = client.chat.completions.create(
    model="mimo-v2-pro",
    messages=[
        {"role": "user", "content": "你好"}
    ]
)
print(response.choices[0].message.content)
```

#### 流式调用

```python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_API_KEY",
    base_url="https://api.mimomodel.io/v1"
)

stream = client.chat.completions.create(
    model="mimo-v2-pro",
    messages=[
        {"role": "user", "content": "讲一个故事"}
    ],
    stream=True
)
for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")
```

### cURL调用示例

```bash
curl https://api.mimomodel.io/v1/chat/completions \
  -H "Authorization: Bearer $MIMO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mimo-v2-pro",
    "messages": [{"role": "user", "content": "你好"}]
  }'
```

### 最新定价（2026年3月19日）

**分段计价模式**

| 上下文范围 | 输入 | 输出 |
|-----------|------|------|
| **256K以内** | **$1/百万tokens** | **$3/百万tokens** |
| **1M以内** | **$2/百万tokens** | **$6/百万tokens** |

| 地区 | 输入 | 输入（缓存命中） | 输出 |
|------|------|-----------------|------|
| 国内 | ¥7/百万tokens | ¥0.7/百万tokens | ¥21/百万tokens |
| 海外 | $1/百万tokens | $0.1/百万tokens | $3/百万tokens |

### Token限制

- **最大上下文**：100万tokens（1M）
- 国内用户需完成个人实名认证

### 常见错误码

| 错误码 | 描述 | 解决方案 |
|--------|------|---------|
| 400 | 请求格式错误 | 检查JSON格式 |
| 401 | 认证失败 | 验证API Key |
| 429 | 频率超限 | 降低请求频率 |
| 500 | 服务器错误 | 重试 |

---

## 总结对比表

### 上下文长度对比

| 厂商 | 旗舰模型 | 最大上下文 |
|------|---------|-----------|
| Google Gemini | Gemini 3 Pro | 1M |
| OpenAI | GPT-5.4 | **1M** |
| Anthropic Claude | Claude Opus 4.6 | 1M |
| 智谱AI | GLM-5 | 128K |
| Kimi Moonshot | K2.5 | 256K |
| MiniMAX | M2.5 | 1000K |
| Deepseek | V3.2（新） | **1M** |
| 小米MiMo | MiMo-V2-Pro | **1M** |

### 定价对比（百万Tokens）

| 厂商 | 模型 | 输入 | 输出 |
|------|------|------|------|
| Google | Gemini 3 Flash | $0.30 | $1.20 |
| OpenAI | GPT-5.4 | $2.50 | $10.00 |
| Anthropic | Claude Sonnet 4.6 | $3.00 | $15.00 |
| 智谱AI | GLM-5 | ¥1.34 | ¥3.34 |
| Kimi | K2.5 | 详见定价 | 详见定价 |
| MiniMAX | M2.5 | ~$0.30 | ~$2.40 |
| Deepseek | V3.2 | ¥0.50 | ¥8.00 |
| 小米MiMo | MiMo-V2-Pro (256K) | $1.00 | $3.00 |

### 2026年重大更新一览

| 厂商 | 更新日期 | 重大发布 |
|------|---------|---------|
| Google | 2026年4月3日 | Gemini API分档计费 |
| OpenAI | 2026年3月5日 | GPT-5.4，1M上下文 |
| Anthropic | 2026年2月17日 | Claude Opus/Sonnet 4.6 |
| 智谱AI | 2026年2月12日 | GLM-5开源发布 |
| Kimi | 2026年1月27日 | K2.5开源发布 |
| MiniMAX | 2026年2月12日 | M2.5编程模型 |
| Deepseek | 2026年2月11日 | 新模型1M上下文 |
| 小米MiMo | 2026年3月19日 | MiMo-V2-Pro发布 |

---

## 通用最佳实践

### 认证安全

- 永远不要将API Key硬编码在代码中
- 使用环境变量存储敏感信息
- 定期轮换API Key
- 启用API密钥访问日志监控

### 错误处理

- 实现指数退避重试策略
- 记录错误日志便于调试
- 对关键操作添加超时控制
- 优雅处理429限流错误

### 成本优化

- 使用流式响应减少等待时间
- 合理设置max_tokens避免过度生成
- 利用缓存减少重复请求
- 考虑使用批量API获取折扣
- 关注各厂商的错峰优惠时段

### 多模态集成建议

- 选择原生支持多模态的模型（如GPT-5.4、K2.5、Claude 4.6）
- 注意图像输入的计费方式
- 考虑端到端的Agent框架集成

### Agent开发建议

- 优先选择支持Function Calling/Tool Use的模型
- 关注模型的工具调用准确率
- 使用Agent集群提升复杂任务效率
- 做好任务分解和结果汇总

---

## 更新日志

| 日期 | 更新内容 |
|------|---------|
| 2026-04-07 | 文档创建，汇总八大AI厂商API信息（2026年最新） |
| 2026-04-07 | 更新Google Gemini 4月分档计费定价 |
| 2026-04-07 | 更新OpenAI GPT-5.4最新定价 |
| 2026-04-07 | 更新Anthropic Claude 4.6系列 |
| 2026-04-07 | 更新智谱GLM-5及涨价信息 |
| 2026-04-07 | 更新Kimi K2.5最新模型 |
| 2026-04-07 | 更新MiniMAX M2.5编程模型 |
| 2026-04-07 | 更新Deepseek V3.2新模型 |
| 2026-04-07 | 更新小米MiMo-V2-Pro定价 |

---

## 参考来源

[1] [谷歌更新Gemini API定价按推理使用分档计费-新浪财经](https://finance.sina.com.cn/stock/hkstock/ggscyd/2026-04-03/doc-inhteyhy0398514.shtml)

[2] [GPT-5 API完全指南-掘金](https://juejin.cn/post/7620763883944411170)

[3] [ChatGPT-5.4发布-网易](https://www.163.com/dy/article/KNB518QV05119734.html)

[4] [Anthropic发布Claude Sonnet 4.6-界面新闻](https://www.jiemian.com/article/14022719.html)

[5] [智谱宣布涨价30%起-腾讯新闻](https://news.qq.com/rain/a/20260212A03CL200)

[6] [智谱上调新模型API价格20%-界面新闻](https://www.jiemian.com/article/14117356.html)

[7] [Kimi发布并开源K2.5模型-腾讯新闻](https://news.qq.com/rain/a/20260127A04GB000)

[8] [MiniMax发布M2.5编程模型-太平洋科技](https://news.pconline.com.cn/2093/20937972.html)

[9] [DeepSeek-V3.2-Exp发布-腾讯新闻](https://news.qq.com/rain/a/20260216A05M4T00)

[10] [小米发布MiMo-V2-Pro-腾讯新闻](https://news.qq.com/rain/a/20260319A02OXM00)

[11] [小米MiMo Agent框架限免延长-IT之家](https://www.ithome.com/0/933/060.htm)

[12] [Google Gemini API官方文档](https://ai.google.dev/gemini-api/docs)

[13] [OpenAI API官方文档](https://platform.openai.com/docs)

[14] [Anthropic Documentation](https://docs.anthropic.com/)

[15] [智谱AI开放平台文档](https://open.bigmodel.cn/dev/api)

[16] [Kimi API开放平台](https://platform.moonshot.cn/docs)

[17] [MiniMax开放平台](https://www.minimaxi.com/document)

[18] [DeepSeek API官方文档](https://api-docs.deepseek.com/)

[19] [MiMo开放平台](https://platform.xiaomimimo.com/)

---

*本文档最后更新于2026年4月7日*
