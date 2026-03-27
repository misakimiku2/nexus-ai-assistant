# 文件上传功能改进计划

## 问题分析

当前对话模式中的文件上传功能存在以下问题：

1. **单文件限制**：只能选择单个文件上传
2. **文档预览缺失**：上传文档文件时，预览区域没有对应的预览效果
3. **图片/文档分离处理**：图片和文档使用相同的处理逻辑，但预览只针对图片

## 目标

- 支持多文件上传（上限10个，包括图片和文档）
- 添加文档文件的预览卡片（图标+文件名）
- 统一图片和文档的预览展示

## 实施步骤

### 1. 类型定义修改 (`src/types.ts`)

新增 `AttachmentFile` 接口：

```typescript
export interface AttachmentFile {
  id: string;
  name: string;
  type: 'image' | 'document';
  mimeType: string;
  data: string; // base64 data URL
  size?: number;
}
```

### 2. App.tsx 修改

#### 2.1 状态管理
- 将 `attachedImage: string | null` 改为 `attachedFiles: AttachmentFile[]`
- 添加文件数量上限常量 `MAX_ATTACHMENTS = 10`

#### 2.2 handleImageUpload 函数重构
- 支持多文件选择
- 区分图片和文档类型
- 添加文件数量验证
- 为每个文件生成唯一ID

#### 2.3 handleSendMessage 函数修改
- 更新消息创建逻辑以支持多附件
- 处理附件数据传递给AI

#### 2.4 requestAI 函数修改
- 支持多图片/文档发送给AI API
- 构建多模态消息格式

### 3. ChatInput.tsx 修改

#### 3.1 Props 接口更新
- `attachedImage` → `attachedFiles`
- `setAttachedImage` → `setAttachedFiles`
- `handleImageUpload` → `handleFileUpload`

#### 3.2 预览区域重构
- 显示所有附件的预览列表
- 图片显示缩略图
- 文档显示图标+文件名卡片
- 每个附件有删除按钮

#### 3.3 文件输入修改
- 添加 `multiple` 属性支持多选
- 合并图片和文档的 accept 类型

### 4. Message 类型扩展

在 `Message` 接口中添加 `attachments` 字段：

```typescript
export interface Message {
  // ... 现有字段
  attachments?: AttachmentFile[];
}
```

### 5. ChatView 组件修改

- 更新消息渲染逻辑以显示附件
- 支持图片和文档的展示

## 文件修改清单

| 文件 | 修改内容 |
|------|----------|
| `src/types.ts` | 新增 `AttachmentFile` 接口，扩展 `Message` 接口 |
| `src/App.tsx` | 重构状态管理和文件上传逻辑 |
| `src/components/ChatInput.tsx` | 重构预览区域和文件选择逻辑 |
| `src/components/ChatView.tsx` | 更新消息渲染以显示附件 |

## 技术细节

### 文件类型判断
```typescript
const isImage = (mimeType: string) => mimeType.startsWith('image/');
```

### 文档图标映射
根据文件扩展名显示对应图标：
- PDF: FileText (红色)
- Word: FileText (蓝色)
- Excel: FileText (绿色)
- TXT: FileText (灰色)
- 其他: FileText (默认)

### 预览卡片样式
- 图片：缩略图 + 删除按钮
- 文档：文件类型图标 + 文件名 + 删除按钮

## 注意事项

1. 文件大小限制：需要考虑大文件上传的性能影响
2. API兼容性：确保多模态消息格式与后端API兼容
3. 用户体验：添加文件上传进度提示
