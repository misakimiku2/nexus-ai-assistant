# 多文件上传功能改进计划

## 问题分析

当前实现存在以下问题：

1. **单文件限制**：`attachedImage` 状态只支持单个图片（`string | null`），无法支持多文件
2. **文档上传无预览**：点击上传文档时，没有对应的预览效果
3. **文档上传逻辑错误**：文档 input 调用了 `handleImageUpload`，但该函数只处理图片
4. **消息发送不完整**：发送消息时没有将文档内容传递给 AI

## 改进目标

1. 支持最多 10 个文件上传（图片/文档混合）
2. 添加文档文件的预览卡片（图标 + 文件名）
3. 正确处理图片和文档的上传和发送

## 实现步骤

### 步骤 1：扩展类型定义

**文件**: `src/types.ts`

新增 `Attachment` 接口：

```typescript
export interface Attachment {
  id: string;
  type: 'image' | 'document';
  name: string;
  data: string; // base64 data URL
  mimeType: string;
  size?: number;
}
```

修改 `Message` 接口，添加 `attachments` 字段：

```typescript
export interface Message {
  // ... 现有字段
  attachments?: Attachment[];
}
```

### 步骤 2：修改 App.tsx 中的状态和处理函数

**文件**: `src/App.tsx`

1. 将 `attachedImage` 状态改为 `attachments` 数组：
   ```typescript
   const [attachments, setAttachments] = useState<Attachment[]>([]);
   ```

2. 修改 `handleImageUpload` 为 `handleFileUpload`，支持多文件和文档：
   - 添加 `multiple` 属性支持
   - 根据文件类型区分图片和文档
   - 限制文件数量上限为 10
   - 为每个文件生成唯一 ID

3. 修改 `handleSendMessage`：
   - 将附件信息添加到消息中
   - 在发送给 AI 时，将图片和文档内容正确格式化

### 步骤 3：修改 ChatInput.tsx 组件

**文件**: `src/components/ChatInput.tsx`

1. 更新 props 接口：
   ```typescript
   interface ChatInputProps {
     // ... 现有 props
     attachments: Attachment[];
     setAttachments: (attachments: Attachment[]) => void;
     handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'document') => void;
   }
   ```

2. 修改预览区域：
   - 图片预览：显示缩略图
   - 文档预览：显示文件图标 + 文件名

3. 为文件 input 添加 `multiple` 属性

4. 添加删除单个附件的功能

5. 添加附件数量限制提示（当达到 10 个时禁用上传按钮）

### 步骤 4：创建文件预览组件

**文件**: `src/components/AttachmentPreview.tsx`（新建）

创建独立的附件预览组件：

```tsx
interface AttachmentPreviewProps {
  attachment: Attachment;
  onRemove: (id: string) => void;
  isDarkMode: boolean;
}
```

功能：
- 图片类型：显示缩略图预览
- 文档类型：显示文件图标 + 文件名
- 每个预览卡片都有删除按钮

### 步骤 5：修改 ChatView.tsx 消息显示

**文件**: `src/components/ChatView.tsx`

在用户消息中显示附件：
- 图片：显示缩略图
- 文档：显示文件图标 + 文件名

## 文件修改清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/types.ts` | 修改 | 添加 Attachment 接口，Message 添加 attachments 字段 |
| `src/App.tsx` | 修改 | 修改状态和处理函数 |
| `src/components/ChatInput.tsx` | 修改 | 支持多文件预览和上传 |
| `src/components/AttachmentPreview.tsx` | 新建 | 附件预览组件 |
| `src/components/ChatView.tsx` | 修改 | 消息中显示附件 |

## 技术细节

### 文件类型判断

```typescript
const isImage = (mimeType: string) => mimeType.startsWith('image/');
```

### 支持的文档类型

**办公文档**：
- PDF: `.pdf` (application/pdf)
- Word: `.doc`, `.docx` (application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document)
- 文本: `.txt` (text/plain)
- CSV: `.csv` (text/csv)
- Excel: `.xlsx` (application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)

**代码文件**：
- JavaScript/TypeScript: `.js`, `.jsx`, `.ts`, `.tsx` (text/javascript, text/typescript)
- Python: `.py` (text/x-python)
- Java: `.java` (text/x-java)
- C/C++: `.c`, `.cpp`, `.h`, `.hpp` (text/x-c, text/x-c++)
- C#: `.cs` (text/x-csharp)
- Go: `.go` (text/x-go)
- Rust: `.rs` (text/x-rust)
- PHP: `.php` (text/x-php)
- Ruby: `.rb` (text/x-ruby)
- Swift: `.swift` (text/x-swift)
- Kotlin: `.kt`, `.kts` (text/x-kotlin)
- HTML/CSS: `.html`, `.css`, `.scss`, `.less` (text/html, text/css)
- JSON/XML: `.json`, `.xml` (application/json, application/xml)
- YAML: `.yaml`, `.yml` (text/yaml)
- Markdown: `.md` (text/markdown)
- Shell: `.sh`, `.bash` (text/x-shellscript)
- SQL: `.sql` (application/sql)

### 文件大小限制

建议单个文件最大 10MB，总附件大小最大 50MB

### UI 设计

预览卡片样式：
- 水平排列，支持换行
- **图片预览**：
  - 48x48 像素卡片，图片完全填充（object-cover）
  - 圆角边框
  - **抗锯齿效果实现**：
    ```css
    img {
      image-rendering: auto;           /* 标准属性，浏览器自动选择最佳缩放算法 */
      image-rendering: high-quality;   /* 高质量缩放（非标准，部分浏览器支持） */
      image-rendering: -webkit-optimize-contrast; /* Safari/Chrome 优化 */
      image-rendering: crisp-edges;    /* 备选：保持边缘锐利 */
    }
    ```
    - 推荐使用 `image-rendering: auto`，浏览器会自动使用双线性或双三次插值算法进行平滑缩放
    - 对于小尺寸缩略图，浏览器默认会进行抗锯齿处理
    - 如果需要更高质量，可考虑使用 Canvas 预处理缩略图
  - 鼠标悬停时显示关闭按钮（右上角）
  - 关闭按钮样式与当前保持一致
- **文档预览**：
  - 48x48 像素卡片
  - 显示文件图标（根据文件类型显示不同图标）+ 文件名（截断显示）
  - 鼠标悬停时显示关闭按钮

## 验证要点

1. 可以同时选择多个文件（最多 10 个）
2. 图片显示缩略图预览
3. 文档显示图标 + 文件名
4. 可以单独删除每个附件
5. 达到 10 个文件上限时，上传按钮禁用
6. 发送消息时，附件正确传递给 AI
