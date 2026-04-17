# Canvas 工作区实现与优化 - 开发记录

> 本文档记录了 Canvas 工作区（CanvasWorkspace）的完整实现过程、架构演进及关键技术决策。

***

## 一、功能概述

Canvas 工作区是应用的右侧面板，用于查看和编辑文件内容。支持多标签页、语法高亮、Markdown 预览、文件编辑与保存。

### 核心功能

| 功能 | 说明 |
|------|------|
| 多标签页 | 同时打开多个文件，标签切换，关闭标签 |
| 语法高亮 | 基于 CodeMirror 6 Lezer 语法，VS Code Dark+/Light+ 自定义主题，覆盖 15+ 语言 |
| 行号显示 | 原生行号，点击行号选中该行（DOM 事件监听实现） |
| 自动换行 | `EditorView.lineWrapping` 长行自动折行显示 |
| 代码折叠 | `foldGutter()` 折叠/展开代码块，自定义 ▾/▸ 图标 |
| 粘性滚动 | 多层 Sticky Scroll，基于花括号计数的嵌套作用域检测，带语法高亮和点击跳转 |
| Markdown 预览 | ReactMarkdown 渲染，源码/预览切换 |
| 编辑模式 | 可编辑 + 语法高亮 + 括号匹配 + 自动缩进 |
| 保存退出 | 保存后自动退出编辑模式，退出按钮放弃更改 |
| 文件浏览 | 通过 Tauri 对话框或手动输入路径打开文件 |
| Minimap | Canvas 渲染代码缩略图，基于 CodeMirror 语法树着色，自适应宽度(60-170px)，视口指示器 + 点击跳转 + 拖拽滚动 |

***

## 二、架构演进

### 2.1 第一版：react-syntax-highlighter（Prism）

初始实现使用 `react-syntax-highlighter`（Prism 引擎）作为查看器，`<textarea>` 作为编辑器。

**方案**：

```
查看模式: SyntaxHighlighter (Prism) + showLineNumbers + wrapLongLines
编辑模式: <textarea> (纯文本，无高亮)
```

**问题**：

1. **语法覆盖度不足**：Prism 的语法覆盖度远不如 VS Code 使用的 TextMate/Lezer 语法，很多语言的 token 只能部分着色
2. **编辑模式无高亮**：纯 textarea 无法显示语法高亮
3. **Markdown 标题颜色错误**：Prism 使用 `title important` 类名标记标题，`oneDark` 主题中 `important` token 为红色，导致 Markdown 标题显示为红色而非蓝色
4. **`#` 符号无高亮**：`.language-markdown .token.title.important > .token.punctuation` 也被设为红色

### 2.2 第二版：Overlay 技术（SyntaxHighlighter + 透明 textarea）

尝试在编辑模式下叠加透明 textarea + SyntaxHighlighter 背景层实现编辑时高亮。

**方案**：

```
查看模式: SyntaxHighlighter (Prism) + showLineNumbers + wrapLongLines
编辑模式: 透明 textarea (输入) + SyntaxHighlighter 背景层 (高亮) + 手动行号栏
```

**问题**：

1. **换行错位**：textarea 使用 `pre-wrap` 自动换行，但 SyntaxHighlighter 背景层的换行位置与 textarea 不一致
2. **选区错乱**：框选文本时，textarea 的选区高亮与 SyntaxHighlighter 渲染的文本不匹配
3. **行号不可靠**：手动测量行高（隐藏 div + getBoundingClientRect）在窗口大小变化后失效，点击行号选择错乱

### 2.3 第三版：纯 textarea + 动态行高测量

移除 overlay，编辑模式使用纯 textarea + 隐藏测量 div 计算每行视觉高度。

**方案**：

```
查看模式: SyntaxHighlighter (Prism) + showLineNumbers + wrapLongLines
编辑模式: 纯 textarea (可见文本) + 动态行高测量 (ResizeObserver)
```

**问题**：

1. **编辑模式无语法高亮**：纯 textarea 无法显示任何语法高亮
2. **行高测量不精确**：隐藏 div 的文本渲染与 textarea 的文本渲染存在微小差异，窗口变化后测量结果可能滞后
3. **Prism 语法覆盖度仍然不足**：与第一版相同的问题

### 2.4 第四版（当前）：CodeMirror 6 + 自定义 VS Code 主题

彻底替换为 CodeMirror 6，查看和编辑共用同一个编辑器实例。自定义 VS Code Dark+/Light+ 主题替代 GitHub 主题。

**方案**：

```
查看模式: CodeMirror (readOnly=true) + VS Code Dark+/Light+ 自定义主题 + Lezer 语法
编辑模式: CodeMirror (editable=true) + VS Code Dark+/Light+ 自定义主题 + Lezer 语法 + keymap
Markdown 预览: ReactMarkdown 渲染
```

**优势**：

| 对比项 | Prism + textarea | CodeMirror 6 |
|--------|-----------------|--------------|
| 语法覆盖度 | ~30% token 着色 | 与 VS Code 相当 |
| 编辑时高亮 | ❌ 无 | ✅ 完整高亮 |
| 行号 + 点击选择 | 手动测量，窗口变化后失效 | ✅ 原生支持 |
| 自动换行 | 需手动同步 textarea 和背景层 | ✅ 原生支持 |
| Ctrl+S 保存 | 外层 keydown 监听 | ✅ CodeMirror keymap |
| 括号匹配 | ❌ 无 | ✅ 原生支持 |
| 代码折叠 | ❌ 无 | ✅ 已开启 |
| 粘性滚动 | ❌ 无 | ✅ 多层嵌套 + 语法高亮 + 点击跳转 |

***

## 三、当前实现

### 3.1 依赖清单

```
@uiw/react-codemirror           React 封装
@codemirror/view                EditorView、drawSelection、lineNumbers、foldGutter 等
@codemirror/state               EditorState、Extension
@codemirror/commands            history、indentWithTab
@codemirror/language            syntaxTree、HighlightStyle、foldGutter、foldKeymap
@codemirror/search              highlightSelectionMatches
@codemirror/autocomplete        autocompletion
@lezer/highlight                tags、highlightTree（粘性滚动语法高亮）
@codemirror/lang-markdown       Markdown 语法
@codemirror/lang-javascript     JavaScript/TypeScript 语法
@codemirror/lang-python         Python 语法
@codemirror/lang-css            CSS 语法
@codemirror/lang-html           HTML 语法
@codemirror/lang-json           JSON 语法
@codemirror/lang-rust           Rust 语法
@codemirror/lang-java           Java 语法
@codemirror/lang-cpp            C/C++ 语法
@codemirror/lang-sql            SQL 语法
@codemirror/lang-yaml           YAML 语法
@codemirror/lang-xml            XML 语法
@codemirror/lang-php            PHP 语法
```

> **注意**：已移除 `@uiw/codemirror-theme-github` 依赖，改用自定义 VS Code Dark+/Light+ 主题。

### 3.2 语言映射

```typescript
function getLanguageExtension(lang: string) {
  switch (lang) {
    case 'javascript': return javascript();
    case 'typescript': return javascript({ jsx: true, typescript: true });
    case 'python': return python();
    case 'css': return css();
    case 'html': return html();
    case 'json': return json();
    case 'rust': return rust();
    case 'java': return java();
    case 'c':
    case 'cpp': return cpp();
    case 'sql': return sql();
    case 'yaml': return yaml();
    case 'xml': return xml();
    case 'php': return php();
    case 'markdown': return markdown({ base: markdownLanguage });
    default: return [];
  }
}
```

### 3.3 自定义 VS Code 主题

使用 `EditorView.theme()` + `HighlightStyle.define()` 自定义 VS Code Dark+/Light+ 主题，替代 `@uiw/codemirror-theme-github`。

**主题系统架构**：

```
vsCodeDarkTheme / vsCodeLightTheme   ← EditorView.theme() 定义背景色、前景色、选区色、gutter 样式等
vsCodeDarkHighlightStyle / vsCodeLightHighlightStyle  ← HighlightStyle.define() 定义语法 token 颜色映射
```

**字体统一**：

```typescript
const UI_FONT = '"Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
```

**深色主题关键配色**（VS Code Dark+）：

| 元素 | 颜色 |
|------|------|
| 背景色 | `#27272a`（zinc-800，与应用主题一致） |
| 前景色 | `#d4d4d4` |
| 选区背景 | `#264f78` |
| 当前行高亮 | `#2a2d2e` |
| 注释 | `#6a9955` italic |
| 关键字 | `#569cd6` |
| 字符串 | `#ce9178` |
| 变量名 | `#9cdcfe` |
| 函数名 | `#dcdcaa` |
| 类型名 | `#4ec9b0` |
| 数字 | `#b5cea8` |

**浅色主题关键配色**（VS Code Light+）：

| 元素 | 颜色 |
|------|------|
| 背景色 | `#fafafa`（zinc-50，与应用主题一致） |
| 前景色 | `#18181b` |
| 选区背景 | `#add6ff` |
| 当前行高亮 | `#f0f0f0` |
| 注释 | `#008000` italic |
| 关键字 | `#0000ff` |
| 字符串 | `#a31515` |
| 变量名 | `#001080` |
| 函数名 | `#795e26` |
| 类型名 | `#267f99` |
| 数字 | `#098658` |

**主题切换**：通过 `theme` prop 传入 `vsCodeDarkTheme` 或 `vsCodeLightTheme`，配合 `syntaxHighlighting()` 扩展传入对应的 HighlightStyle。

### 3.4 模式切换

| 模式 | CodeMirror 配置 | 说明 |
|------|----------------|------|
| 查看 | `readOnly={true}` `editable={false}` | 可滚动查看，不可编辑，有语法高亮 |
| 编辑 | `readOnly={false}` `editable={true}` | 可编辑，有语法高亮，括号匹配，自动缩进 |
| Markdown 预览 | 隐藏 CodeMirror，显示 ReactMarkdown | 渲染 Markdown 为富文本 |

### 3.5 按钮设计

| 按钮 | 图标 | 功能 |
|------|------|------|
| 预览/源码 | Eye | Markdown 文件专属，切换预览和源码视图 |
| 编辑 | Pencil | 进入编辑模式 |
| 退出 | X | 放弃更改并退出编辑模式 |
| 还原 | RotateCcw | 恢复到 originalContent，保持编辑状态 |
| 保存 | Save | 保存文件并退出编辑模式 |

### 3.6 快捷键

- **Ctrl+S**：通过 CodeMirror `keymap.of([{ key: 'Mod-s', run: ... }])` 在编辑器内部拦截保存
- **Escape**：退出编辑模式（通过外层 `onKeyDown` 监听）

### 3.7 扩展配置（basicSetup=false，手动组装）

由于 `basicSetup=true` 会引入默认主题和不需要的扩展，当前使用 `basicSetup={false}` 并手动组装所有扩展：

```typescript
const exts: Extension[] = [
  syntaxHighlighting(isDarkMode ? vsCodeDarkHighlightStyle : vsCodeLightHighlightStyle),
  highlightSpecialChars(),
  history(),
  drawSelection(),                // 自定义选区渲染（替代浏览器原生选区）
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentUnit.of('  '),
  EditorView.lineWrapping,        // 自动换行
  selectionFixer,                 // 修复选区层 z-index（见 3.9）
  // 语言扩展...
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightActiveLine(),
  highlightSelectionMatches(),
  bracketMatching(),
  autocompletion(),
  rectangularSelection(),
  crosshairCursor(),
  foldGutter({                    // 代码折叠
    openText: '▾',
    closedText: '▸',
    markerDOM: (open) => { /* 自定义折叠图标 */ },
  }),
  keymap.of(foldKeymap),
];
// 编辑模式额外扩展:
if (isEditing) {
  exts.push(indentOnInput());
  exts.push(keymap.of([{ key: 'Mod-s', run: () => { handleSave(); return true; } }]));
}
```

***

### 3.8 粘性滚动（Sticky Scroll）

多层粘性滚动，滚动时在编辑器顶部固定显示当前代码所在的外层作用域。

**实现方式**：通过 `onCreateEditor` 回调 + 直接 DOM 操作，不使用 CodeMirror 的 ViewPlugin（ViewPlugin 的 `update()` 回调中不能调用 `lineBlockAtHeight()` 等布局测量方法，会抛出 "Reading the editor layout isn't allowed during an update" 错误）。

**作用域检测算法**（花括号计数法）：

```typescript
function findEnclosingScopes(view: EditorView, currentLineNum: number): number[] {
  const stack: { lineNum: number; depthAfter: number }[] = [];
  let depth = 0;
  for (let i = 1; i <= currentLineNum; i++) {
    const text = doc.line(i).text;
    // 统计 { 和 } 的数量
    let opens = 0, closes = 0;
    for (const ch of text) {
      if (ch === '{') opens++;
      else if (ch === '}') closes++;
    }
    depth = depth - closes + opens;
    // 当深度降低时，弹出已关闭的作用域
    while (stack.length > 0 && stack[stack.length - 1].depthAfter > depth) {
      stack.pop();
    }
    // 当前行打开了新作用域且是作用域起始行
    if (opens > closes && isScopeStarter(trimmed)) {
      stack.push({ lineNum: i, depthAfter: depth });
    }
  }
  return stack.slice(-5).map(s => s.lineNum); // 最多 5 层
}
```

**`isScopeStarter()` 支持的语言**：

| 语言 | 识别模式 |
|------|---------|
| JS/TS | `function`, `class`, `interface`, `type`, `enum`, `const = (`, `if/else/for/while/switch/try/catch/finally` |
| Python | `def`, `class`, `if/elif/else`, `for/while`, `try/except/finally`, `with` |
| Rust | `fn`, `struct`, `enum`, `trait`, `impl`, `if/else/loop/while/for/match` |
| Java | `public/private/protected class/interface/enum`, 方法声明 |
| 通用 | 以 `{` 结尾的行，以 `:` 结尾的非注释行 |

**粘性行语法高亮**：使用 `highlightTree()` 从 `@lezer/highlight` 将语法树渲染为带 CSS 类的 HTML，复用编辑器的 HighlightStyle。

**点击跳转**：粘性行点击后通过 `EditorView.scrollIntoView()` 跳转到对应代码位置。

**主题适配**：`setupStickyScroll` 根据 `isDarkMode` 使用不同的背景色、边框色、文字色，并在主题切换时重新初始化。

***

### 3.9 选区高亮修复（进行中，尚未解决）

**问题描述**：鼠标拖选文本时，选区高亮不显示（只能看到整行高亮，看不到字符范围高亮）。点击行号选择行后，也没有选区高亮。

**根因分析**：

CodeMirror 的 `drawSelection()` 扩展通过 `LayerView` 在 `.cm-scroller` 内创建 `.cm-selectionLayer`，使用绝对定位的 `div` 元素绘制选区矩形。但存在以下问题：

1. **选区层 z-index 是内联样式**：`LayerView.setOrder()` 通过 `this.dom.style.zIndex = String((this.layer.above ? 150 : -1) - pos)` 设置选区层 z-index 为 `-1`（内联样式）。CSS 主题规则无法覆盖内联样式（除非 `!important`，但 `EditorView.theme()` 不添加 `!important`）。

2. **`hideNativeSelection` 与自定义 `::selection` 冲突**：`drawSelection()` 包含 `hideNativeSelection`（使用 `Prec.highest` 强制 `::selection { background: transparent !important }`），但自定义主题中的 `::selection` 规则会覆盖它，导致原生选区可见但 `drawSelection()` 层被隐藏。

3. **`.cm-content` 堆叠上下文**：设置 `position: relative; z-index: 1` 创建了新的堆叠上下文，将内容层绘制在选区层之上。

**当前修复尝试**：

- 移除主题中的 `::selection` CSS 规则和 `.cm-selectionLayer { zIndex }` / `.cm-content { position; zIndex }` CSS 规则
- 通过 `fixSelectionLayer()` 在 `onCreateEditor` 回调中用 JavaScript 直接设置 DOM 元素的 z-index：
  ```typescript
  selectionLayer.style.zIndex = '0';    // 覆盖 CodeMirror 的 -1
  contentEl.style.position = 'relative';
  contentEl.style.zIndex = '1';         // 确保文本在选区之上
  cursorLayer.style.zIndex = '150';     // 确保光标在最上层
  ```
- 添加 `selectionFixer` updateListener 在每次编辑器更新时检查并重新应用 z-index 修复

**状态**：❌ 尚未解决，修复后选区高亮仍然不显示。可能需要进一步排查：
- 检查 `.cm-scroller` 的 `position: relative; z-index: 0` 是否创建了堆叠上下文
- 检查 `drawSelection()` 的 `RectangleMarker` 是否正确计算了选区矩形位置
- 考虑完全移除 `drawSelection()`，改用原生 `::selection` 样式

***

### 3.10 行号点击选择

**实现方式**：通过 `onCreateEditor` 回调在 `.cm-gutters` DOM 元素上添加 `click` 事件监听器。

```typescript
const handleGutterClick = (e: MouseEvent) => {
  if (!target.closest('.cm-lineNumbers')) return;
  const y = e.clientY - editorRect.top + view.scrollDOM.scrollTop;
  const block = view.lineBlockAtHeight(y);
  const line = view.state.doc.lineAt(block.from);
  view.dispatch({ selection: { anchor: line.from, head: line.to } });
  view.focus();
};
```

**注意**：CodeMirror 的 `lineNumbers({ domEventHandlers: { click } })` API 不生效（`EditorView.domEventHandlers` 只监听 `contentDOM` 事件，不监听 gutter 事件），因此改用直接 DOM 事件监听。

**状态**：选区 dispatch 正常，但选区高亮不显示（与 3.9 选区高亮问题相同）。

***

### 3.11 Minimap（代码缩略图）

编辑器右侧的 Canvas 渲染代码缩略图，基于 CodeMirror Lezer 语法树进行着色。

**架构**：

```
setupMinimap() 函数（在 onCreateEditor 回调中调用）
├── capturedTabId：创建时捕获的 tab ID，用于 onScroll 中保存滚动位置
├── forcedTree：ensureSyntaxTree 返回的完整语法树缓存
├── 颜色定义：暗色/亮色两套颜色值，与 HighlightStyle 完全一致
├── tagColorMap：Map<string, string>，tag.toString() → 颜色值
├── minimapHighlighter：自定义 Highlighter 接口，将语法 tag 映射为颜色字符串
├── renderContent()：核心渲染函数
│   ├── 计算可见区域行范围（highlightFirstLine ~ highlightLastLine）
│   ├── Canvas 全文档高度，所有行绘制 defaultColor 色块
│   ├── forcedTree || syntaxTree(view.state) 优先使用强制解析树
│   ├── highlightTree() 仅处理可见区域（性能优化）
│   ├── 构建 lineTokenMap（按行分组的 from/to/color 区间）
│   └── 可见区域行叠加语法高亮色块
├── scheduleProgressiveParse()：大文件异步完整解析
│   ├── ensureSyntaxTree(view.state, doc.length, timeout) 渐进超时
│   ├── TIMEOUTS = [50, 100, 200, 500, 1000, 2000, 5000]
│   └── 解析成功后设置 forcedTree 并重绘
├── updateOverlay()：更新视口指示器位置 + innerWrapper 偏移
├── scrollToY()：点击跳转（内容坐标映射）
└── 鼠标事件处理：mousedown/mousemove/mouseup（拖拽 + 点击跳转）
```

**布局常量**：

| 常量 | 值 | 说明 |
|------|-----|------|
| `MINIMAP_WIDTH_MIN` | `60` | 最小宽度 |
| `MINIMAP_WIDTH_MAX` | `170` | 最大宽度 |
| `BLOCK_HEIGHT` | `3` | 每个色块高度 |
| `LINE_GAP` | `2` | 行间距 |
| `LINE_PITCH` | `5` | = BLOCK_HEIGHT + LINE_GAP |
| `CHAR_WIDTH` | `1.15` | 每字符像素宽 |
| `PADDING` | `6` | 内边距 |
| `MIN_VP_HEIGHT` | `30` | 视口最小高度 |

**颜色体系**（暗色模式）：

| 用途 | 颜色 | 对应 Tag |
|------|------|----------|
| 默认色（无高亮token） | `#3d3d42`（近背景色） | — |
| 注释 | `#6a9955` | t.comment, t.lineComment, t.blockComment, t.docComment |
| 变量名 | `#9cdcfe` | t.variableName, t.propertyName |
| 字符串 | `#ce9178` | t.string, t.character, t.docString, special(string) |
| 关键字 | `#569cd6` | t.keyword, t.bool, t.null, t.atom, controlKeyword 等 |
| 类型名 | `#4ec9b0` | t.typeName, t.className, t.namespace |
| 函数名 | `#dcdcaa` | function modifier (动态检测) |
| 数字 | `#b5cea8` | t.number, t.integer, t.float |
| 运算符 | `#d4d4d4` | t.operator, derefOperator, definitionOperator 等 |
| 标点 | `#d4d4d4` | t.punctuation, t.separator, paren, brace, squareBracket |

**着色方案演进**：

1. **第一版**：自定义 `tokenizeLine()` 简易分词器（正则+关键字集合匹配）
   - 问题：无法精确识别所有 token 类型，HTML/Python 等语言覆盖差

2. **第二版（当前）**：使用 `highlightTree()` + 自定义 `minimapHighlighter`
   - 复用 CodeMirror 的 Lezer 语法树，token 分类与编辑器完全一致
   - 使用 `tag.toString()` 字符串作为 Map 键（解决 Vite 预打包导致的多实例引用不一致问题）
   - 动态检测修饰标签（function/definition/constant/local）通过检查 `tag.modified` 数组

**视口指示器（范围框）**：

- 全宽显示：`vpW = minimapWidth - PADDING * 2`
- 高度计算：`max(naturalVpH, containerH * 8%)`，naturalVpH = (scrollerH / scrollH) × containerH
- 位置映射：`vpY = (scrollTop / maxScroll) × (containerH - logicalVpH)`
- **renderContent 和 updateOverlay 必须使用完全一致的 vpH/vpY 计算**，否则会导致空白区域

**双坐标系系统**：

```
容器坐标系（viewportDiv 位置）：绝对定位在 container 内
内容坐标系（innerWrapper translateY）：整个文档的缩略图偏移

minimapScrollTop = clamp(vpYInContent - vpY, 0, maxMinimapScroll)
innerWrapper.style.transform = translateY(-minimapScrollTop)
currentMinimapScrollTop = minimapScrollTop  // 供 scrollToY 使用
```

**点击跳转算法**（scrollToY）：

```typescript
// 内容坐标映射：补偿 innerWrapper 偏移
contentY = relY + currentMinimapScrollTop;
targetScrollTop = (contentY / contentH) * scrollH;
view.scrollDOM.scrollTop = clamp(targetScrollTop, 0, maxScroll);
```

关键设计决策：
- 不使用 skipMinimapScroll 机制（会导致 stale currentMinimapScrollTop 和未渲染内容）
- 点击范围框不跳转，仅记录起始位置用于 delta-based 拖拽滚动
- 拖拽滚动：`scrollDelta = (deltaY / scrollRange) × maxScroll`

**自适应宽度**：

```typescript
minimapWidth = clamp(round(view.dom.clientWidth * 0.08), MINIMAP_WIDTH_MIN, MAX);
// ResizeObserver + RAF 节流监听 view.dom 尺寸变化
```

**已知问题（待解决）**：

1. **语言特有标签**：部分语言的特殊 Tag（如 Python 的 `moduleKeyword`、`definitionKeyword`）不在标准 `t.*` 集合中，需要手动补充到 `addStrTag()`
2. **highlightTree 多实例问题**：Vite 预打包可能导致 `@lezer/highlight` 存在多个模块实例，Tag 对象引用和 ID 都不一致，只能用 `toString()` 字符串匹配

**大文件性能优化（已解决）**：

| 优化项 | 方案 |
|--------|------|
| highlightTree 范围 | 仅处理可见区域行（±15 行缓冲），非可见区域用 defaultColor 色块 |
| 语法树完整解析 | `ensureSyntaxTree(view.state, doc.length, timeout)` 渐进超时强制解析 |
| 语法树缓存 | `forcedTree` 变量存储 ensureSyntaxTree 返回的完整树，优先于 `syntaxTree(view.state)` |
| 首次渲染 | 先绘制全文档 defaultColor 色块（立即可见），再异步解析语法树并重绘 |

> **关键发现**：CodeMirror 的 Lezer 解析器使用惰性增量解析，打开大文件（如 202K / 4978 行）时仅解析视口附近约 1.5% 的内容。`ensureSyntaxTree()` 是官方的强制解析 API，但返回的树是独立对象，不会自动更新到 `syntaxTree(view.state)` 的缓存中，必须手动存储并在 `renderContent()` 中优先使用。

***

### 3.12 Tab 切换滚动位置保持

**问题描述**：在多个文件标签之间切换时，页面自动滚动到文件顶部，而非停留在之前的位置。

**根因**：CodeMirror 组件使用 `key={activeTabId}`，每次 tab 切换都会销毁旧组件并创建新组件。React 的卸载顺序是先销毁旧 CodeMirror（scrollTop 重置为 0），再创建新 CodeMirror。到 `handleCreateEditor` 回调执行时，旧 view 的 `scrollDOM.scrollTop` 已经是 0，如果此时保存会覆盖 `onScroll` 中持续保存的正确值。

**修复方案**：

```
tabScrollPositions: Map<string, number>   ← 每个 tab 的滚动位置缓存
activeTabIdRef: Ref<string>               ← 当前 tab ID 的 ref（供闭包访问）
capturedTabId: string                     ← setupMinimap 创建时捕获的 tab ID
```

1. **onScroll 持续保存**：`setupMinimap` 中使用 `capturedTabId`（创建时捕获，不随 tab 切换变化）在每次滚动时保存 `tabScrollPositions[capturedTabId] = scrollTop`
2. **handleCreateEditor 不保存**：移除了旧 view 的 scrollTop 保存逻辑（避免用 0 覆盖正确值）
3. **handleCreateEditor 恢复**：从 `tabScrollPositions` 读取新 tab 的保存位置，通过双层 `requestAnimationFrame` 延迟恢复（等待 CodeMirror 完成内部布局后再设置 `scrollTop`）

```typescript
// 双层 RAF：确保 CodeMirror 完成内部布局后再恢复
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    view.scrollDOM.scrollTop = savedScrollTop;
  });
});
```

***

## 四、数据模型

### 4.1 FileTab（FileViewerContext）

```typescript
interface FileTab {
  id: string;
  path: string;
  title: string;
  content: string;
  originalContent: string;  // 用于判断是否修改和还原
  isDirty: boolean;         // content !== originalContent
  language: string;         // 由文件扩展名推断
  readOnly: boolean;        // 读取失败时标记为只读
}
```

### 4.2 文件路径链接（ChatView / TodoCard）

在对话气泡和任务看板中，文件路径显示为可点击链接，点击后在 Canvas 工作区打开对应文件。

**路径提取**（ReActEngine.extractFilePath）：

```typescript
// 支持内置工具 + MCP 工具
// 1. 内置文件工具: write_file, read_file, list_directory 等 → params.path
// 2. MCP 工具: params.path 匹配绝对路径格式 → params.path
// 3. 通用: params.file_path, params.destination
```

**路径链接化**（linkifyFilePaths）：

```typescript
// 前瞻正则，支持含空格的路径
const FILE_PATH_REGEX = /[A-Za-z]:\\(?:[^\s<>|*?"'。，！？；：（）、\]]| (?=[^\s<>|*?"'。，！？；：（）、\]]))+|\/(?:home|Users|usr|tmp|var|etc|opt)\/(?:[^\s<>|*?"'。，！？；：（）、\]]| (?=[^\s<>|*?"'。，！？；：（）、\]]))+/g;

// 样式: text-blue-500 hover:text-blue-600 hover:underline cursor-pointer break-all text-xs
```

***

## 五、修改历史时间线

| 阶段 | 内容 |
|------|------|
| 初始实现 | 基于 react-syntax-highlighter (Prism) 的纯文本查看器 + textarea 编辑器 |
| 迭代 1 | 字体统一（移除 font-mono，使用 Inter）、行号显示、自动换行、Markdown 预览按钮、编辑模式 overlay 高亮、保存退出编辑模式 |
| 迭代 2 | 编辑模式改为不换行（解决行号对齐问题）、添加退出编辑按钮、语法高亮主题改为 GitHub（ghcolors + oneDark） |
| 迭代 3 | 自定义 GitHub 风格主题覆盖 Markdown token（标题蓝色、#符号灰色、列表橙色等）、编辑模式移除 overlay 改为纯 textarea + 动态行高测量 |
| 迭代 4 | 彻底重构为 CodeMirror 6，解决所有语法覆盖度、编辑高亮、行号选择问题 |
| 迭代 5 | 自定义 VS Code Dark+/Light+ 主题替代 GitHub 主题，修复深色模式背景色不匹配（zinc-800 #27272a）、添加代码折叠（foldGutter）、添加多层粘性滚动（Sticky Scroll，花括号计数法作用域检测 + highlightTree 语法高亮 + 点击跳转）、行号点击选择（DOM 事件监听）、自动换行（EditorView.lineWrapping） |
| 迭代 6 | 修复选区高亮不显示问题（进行中）：分析 CodeMirror drawSelection/LayerView/hideNativeSelection 源码，发现选区层 z-index 内联样式无法通过 CSS 覆盖，尝试通过 JavaScript DOM 操作修复 z-index 堆叠顺序，但问题尚未解决 |
| 迭代 7 | **Minimap 功能开发**：Canvas 渲染代码缩略图，经历多轮迭代：(1) 调整色块颜色与语法高亮一致、增加2px行间距、自适应宽度60-170px；(2) 视口指示器尺寸/位置修复（全宽+最小高度、双坐标系系统）；(3) 点击行为优化（范围框点击不跳转仅拖拽滚动、标点符号近背景色处理）；(4) 点击跳转精度修复（内容坐标映射 contentY=relY+currentMinimapScrollTop）；(5) 空白区域修复（统一 renderContent/updateOverlay 的 vpH 计算）；(6) **着色引擎重构**：从自定义 tokenizeLine() 正则分词器迁移到 highlightTree() + 自定义 minimapHighlighter，复用 CodeMirror Lezer 语法树实现与编辑器完全一致的 token 分类；(7) 解决 Vite 预打包导致的 Tag 多实例引用不一致问题（Map 键从对象引用→tag.id→tag.toString() 三次演进）；(8) 补充语言特有标签（paren/brace/derefOperator 等） |
| 迭代 8 | **Minimap 大文件性能优化**：(1) 可见区域语法高亮优化 — highlightTree 仅处理可见区域行（±15行缓冲），非可见区域用 defaultColor 色块，Canvas 保持全文档高度；(2) Lezer 惰性解析问题 — 发现 CodeMirror 打开大文件时仅解析 ~1.5% 内容，`syntaxTree(view.state)` 返回不完整树；(3) ensureSyntaxTree 强制解析 — 使用 `ensureSyntaxTree(view.state, doc.length, timeout)` 渐进超时策略（50ms→100ms→200ms→...→5000ms）强制完整解析；(4) forcedTree 缓存 — 发现 ensureSyntaxTree 返回的树不会自动更新到 syntaxTree(view.state)，需手动存储到 forcedTree 变量并在 renderContent 中优先使用；(5) 首次渲染两阶段 — 先绘制全文档 defaultColor 色块（立即可见），再异步解析语法树并重绘 |
| 迭代 9 | **Tab 切换滚动位置保持**：修复多文件切换时页面自动滚动到顶部的问题。根因是 `key={activeTabId}` 导致 React 先卸载旧 CodeMirror（scrollTop 重置为 0），再创建新 CodeMirror。修复方案：(1) setupMinimap 中用 capturedTabId 在 onScroll 时持续保存滚动位置；(2) 移除 handleCreateEditor 中的旧 view scrollTop 保存（避免用 0 覆盖正确值）；(3) handleCreateEditor 中通过双层 RAF 延迟恢复保存的滚动位置 |
| 迭代 10 | **Markdown 预览全面增强**：将 Markdown 预览效果升级至接近 Trae IDE 水平，经历多轮迭代解决多个技术难题：(1) **GFM 表格支持** — 安装 `remark-gfm` 插件，添加完整表格样式（边框、斑马纹行、表头高亮、暗色/浅色模式适配）；(2) **居中布局 + 最大宽度** — 内容区域 `max-w-[900px] mx-auto` 居中显示，窗口 >1000px 时自动居中；(3) **语法高亮** — 集成 `react-syntax-highlighter`（Prism 引擎），自定义 `code` 组件区分代码块/行内代码，`oneDark`/`ghcolors` 主题适配暗色/浅色模式；(4) **Token 背景色移除** — 创建 `cleanTheme` useMemo 遍历 Prism 主题对象，递归移除所有 token 的 `backgroundColor` 和 `background` 属性，配合 CSS `!important` 覆盖内联样式；(5) **代码块卡片样式优化** — 浅色模式背景从蓝色调 `#f6f8fa` 改为纯灰 `#f3f4f6`（zinc-100），移除阴影和描边；(6) **代码块描边修复** — 发现 ReactMarkdown 将代码包裹在 `<pre>` 标签中继承 Tailwind prose 默认边框，自定义 `pre` 组件返回 `{children}` 直接剥离 `<pre>` 包装层；(7) **自动预览切换** — 打开 `.md` 文件时自动设置 `isPreviewing=true`；(8) **本地图片加载（核心难点）** — 经历 5 轮迭代解决 Tauri WebView 安全限制下的本地文件读取问题：(8a) `convertFileSrc()` 返回空字符串 → 改用 `@tauri-apps/plugin-fs` readFile → base64 data URL；(8b) Windows 反斜杠路径 `\` 被 Markdown 解析器作为转义符消耗 → `processedContent` useMemo 预处理正则替换 `\` 为 `/`；(8c) ReactMarkdown 内置 sanitize 过滤器剥离 `file://` 协议 src → 改用 `asset-local://` 自定义协议 → 同样被过滤；(8d) 最终方案：**alt 文本隐式传参** — 将文件路径编码到 `alt` 属性中（`|||LOCAL-FILE:` 分隔符），src 使用合法的 placeholder URL，img 组件从 alt 中解码真实路径再调用 readFile；(8e) 空字节 `\x00` 分隔符被 HTML 解析器剥离 → 改用纯文本 `|||LOCAL-FILE:` 分隔符；(8f) 带双引号路径 `"C:\path"` 处理 — 预处理和组件两端均添加引号剥离逻辑；(9) **权限不足友好提示** — Tauri `allow-read-file` 权限范围外的路径不再显示裂开图标，改为带 🖼️ 图标的错误提示卡片（含图片名+错误原因），使用 `<span display="block">` 替代 `<div>` 避免 DOM 嵌套警告（`<p>` 不能包含 `<div>`）；(10) **性能优化（4项）** — (10a) 提取 `MarkdownImage` 为独立 `React.memo` 组件（替代内联函数，滚动时保持状态不重新加载）；(10b) `URL.createObjectURL(Blob)` 替代 base64 字符串（单张 166KB 图片状态从 ~224K 字符缩减到 ~50 字符，减少 99.98%）；(10c) 模块级 `imageCache: Map<string, string>` 缓存已加载图片（同路径不重复读取文件）；(10d) 所有 `<img>` 添加 `loading="lazy"` 浏览器原生懒加载；(11) **图片居中** — `.prose img` CSS 规则添加 `!important` 确保 `margin-left/right: auto` 生效 |
| 迭代 11（当前） | **AI 代码 Diff 视图 + 终端输出面板**：实现 Canvas 工作区两个 P0 级功能，经历多轮迭代修复多个架构和交互问题。**(1) Diff 视图**：(1a) 初始实现 — 安装 `diff-match-patch`，扩展 FileViewerContext 支持 type='diff' 标签，创建 DiffView 组件（双面板 diff + Accept/Reject 按钮），修改 write_file 工具返回 metadata，添加 onDiffOpen 回调，App.tsx 中 CanvasBridgeInner 桥接；(1b) CanvasBridge 修复 — useCallback 内调用 React Hooks 违规，改为 CanvasBridgeInner 正确的 React 组件；(1c) ReActEngine metadata 透传修复 — record.result 赋值时未包含 metadata 字段；(1d) **架构重构"Review Before Write"** — 发现 Accept/Reject 无意义（文件已写入磁盘），创建 `pendingWrites.ts` 内存暂存缓存，write_file 不再直接写磁盘而是暂存，read_file 优先读取缓存，Accept 才写磁盘 + 更新已打开文件标签，Reject 丢弃暂存；(1e) 多次 write_file 处理 — 同一文件多次写入保留首次 originalContent，新任务开始时自动 flush 未处理的暂存写入；(1f) Diff 视图重写 — 从 div 渲染改为双 CodeMirror 实例（解决滚动掉帧和语法高亮问题），提取 `codemirror-theme.ts` 共享主题/语言扩展；(1g) i18n — Diff 视图所有 UI 文本国际化。**(2) 终端输出面板**：(2a) 初始实现 — 安装 `@xterm/xterm` + `@xterm/addon-fit`，创建 TerminalContext 和 CanvasTerminal 组件，集成到 CanvasWorkspace 底部，添加 onShellOutput 回调；(2b) 每行2字符修复 — 条件渲染导致 xterm 在 div 不存在时创建失败，改为始终渲染 div + CSS height 控制显隐 + ResizeObserver 自动 fit；(2c) **Windows 中文乱码修复** — cmd 输出 GBK 编码，添加 `encoding_rs` 依赖，`decode_output()` 先 UTF-8 后 GBK 回退解码；(2d) 文本复制修复 — keydown 挂在容器 div 上被 xterm 内部 textarea 拦截，改用 `attachCustomKeyEventHandler` + 临时 textarea `execCommand('copy')`；(2e) 提示符格式 — Windows 显示 `PS C:\Users\xxx>`，Linux 显示 `user@host:~$`；(2f) 动画抖动修复 — 动画层/渲染层分离（外层 overflow-hidden + transition，内层固定 height），延迟 320ms 后 fit |

***

## 六、Canvas 工作区未来愿景

> 当前 Canvas 工作区仅作为文件查看/编辑器使用，但其作为 AI 助手的"操作台"具有巨大潜力。以下是基于 Nexus AI Assistant 现有架构（ReAct 引擎、内置/MCP 工具、Tauri Rust 后端）的扩展构想。

### 6.1 AI 代码变更 Diff 视图 ✅ 已实现

**场景**：AI 调用 `write_file` 修改代码后，用户需要直观看到改了什么。

**当前问题**：AI 修改文件后，聊天区只显示"已写入 xxx"，用户需要手动打开文件对比，无法直观感知变更。

**方案**：
- 当 AI 执行 `write_file` 时，Canvas 自动打开该文件的 Diff 视图
- 左侧显示原始内容（绿色高亮删除行），右侧显示新内容（红色高亮新增行）
- 用户可直接在 Diff 视图中 Accept/Reject 变更
- 基于 CodeMirror 的 `ChangeSet` / `ChangeDesc` 实现，或使用 `diff-match-patch` 库

**与现有架构的集成**：
- `FileViewerContext` 扩展 `diffTab` 类型，存储 originalContent 和 newContent
- Agent Runtime 的 `write_file` 工具执行后，触发 `openDiffView` 事件
- 用户 Accept 后调用 Tauri `write_file`，Reject 后恢复原内容

#### 实现详情

**核心架构："Review Before Write"（先审后写）**

AI 调用 `write_file` 时，文件**不会立即写入磁盘**，而是暂存到内存缓存中。用户在 Diff 视图中点击 Accept 才真正写入磁盘，点击 Reject 则丢弃修改。

**关键文件**：

| 文件 | 说明 |
|------|------|
| `src/lib/pendingWrites.ts` | 内存暂存缓存，Map<path, {originalContent, newContent}> |
| `src/components/DiffView.tsx` | Diff 视图组件，双 CodeMirror 实例 + diff-match-patch |
| `src/lib/codemirror-theme.ts` | 共享的 CodeMirror 主题/语言扩展（DiffView 和 CanvasWorkspace 共用） |
| `src/context/FileViewerContext.tsx` | 扩展 FileTab 支持 type='diff'、openDiffView/acceptDiff/rejectDiff |
| `src/agent/tools/builtin.ts` | write_file 改为暂存到 pendingWrites，read_file 优先读取缓存 |
| `src/hooks/useAgentExecution.ts` | onDiffOpen 回调 + 新任务开始时自动 flush 暂存写入 |
| `src/agent/runtime/ReActEngine.ts` | metadata 字段透传（修复 result.metadata 丢失问题） |
| `src/agent/runtime/AgentRuntime.ts` | onToolCall 类型签名扩展 metadata |
| `src/App.tsx` | CanvasBridgeInner 桥接组件 + diffOpenRef/shellOutputRef |

**数据流**：

```
AI 调用 write_file
  → builtin.ts: 读取原文件内容 → setPendingWrite(path, original, new)
  → 返回 ToolExecutionResult { metadata: { originalContent, newContent } }
  → ReActEngine: record.result.metadata = result.metadata (透传)
  → useAgentExecution: onToolCall 拦截 write_file → onDiffOpen(path, original, new)
  → App.tsx: diffOpenRef → CanvasBridgeInner → openDiffView()
  → FileViewerContext: 创建 type='diff' 的 FileTab，Diff 视图展示
  → 用户 Accept → write_file 写入磁盘 + 更新已打开的同路径文件标签
  → 用户 Reject → 丢弃暂存，不写入磁盘
```

**Diff 视图渲染**：

- 使用 `diff-match-patch` 计算差异，将结果分为 `added`/`removed`/`unchanged` 行
- 双 CodeMirror 实例：左侧原始内容，右侧修改内容
- `ViewPlugin` + `Decoration.line` 实现行级着色（红色删除、绿色新增、浅色背景）
- 自定义 `lineNumbers` 扩展的 `formatNumber` 实现对齐行号
- `MutationObserver` 监听 `.cm-scroller` 实现双面板同步滚动
- `React.memo` 优化 DiffPanel 子组件

**多次 write_file 处理**：

- 同一文件多次 write_file 时，`openDiffView` 保留第一次的 `originalContent`，只更新 `newContent`
- 新任务开始时，`useAgentExecution.execute()` 自动 flush 所有未处理的暂存写入到磁盘

**i18n 支持**：

Diff 视图所有 UI 文本通过 `useTranslation` hook 国际化，翻译键位于 `canvas.diff.*`。

**已知问题及修复历史**：

| 问题 | 根因 | 修复 |
|------|------|------|
| Diff 视图不触发 | CanvasBridge 使用 useCallback 内调用 React Hooks（违规） | 改为 CanvasBridgeInner 正确的 React 组件 |
| metadata 丢失 | ReActEngine 赋值 record.result 时未包含 metadata | 添加 `metadata: result.metadata` |
| Reject 不恢复文件 | rejectDiff 使用 stale tabs 闭包 | 改用 `setTabs(prev => ...)` 函数式更新 |
| Accept/Reject 无意义（文件已写入） | write_first 架构缺陷 | 重构为 review_before_write + pendingWrites 缓存 |
| Accept 后已打开文件不更新 | acceptDiff 未更新同路径标签 | 添加 `setTabs(prev => prev.map(...))` 更新 |
| 未 Accept 的暂存写入残留 | 新任务开始时未处理旧暂存 | execute() 开始时 flush 所有 pendingWrites |
| 滚动掉帧 + 无语法高亮 | div 渲染无虚拟滚动和语法支持 | 重写为 CodeMirror 实例渲染 |

### 6.2 终端输出面板 ✅ 已实现

**场景**：AI 执行 `execute_shell` 命令后，用户需要查看实时输出。

**当前问题**：Shell 命令输出仅在聊天区以文本形式展示，长输出难以阅读，且无法交互。

**方案**：
- Canvas 底部添加可折叠的终端面板（类似 VS Code 的 Terminal Panel）
- AI 执行命令时，终端面板自动展开并显示实时输出
- 支持 ANSI 颜色渲染（xterm.js）
- 命令执行完成后，输出保留在终端面板中供回看
- 用户可在终端面板中手动输入命令（直接与 Tauri shell 交互）

**与现有架构的集成**：
- 复用现有 `TerminalView` 组件，嵌入 Canvas 底部
- `execute_shell` 工具通过事件总线将输出发送到终端面板
- Tauri 后端的 `execute_command` / `execute_powershell` 支持流式输出

#### 实现详情

**核心架构：xterm.js 终端模拟器 + Tauri IPC**

AI 执行 shell 命令后，输出通过回调链传递到 Canvas 底部的 xterm.js 终端面板，支持 ANSI 颜色渲染和文本选择复制。

**关键文件**：

| 文件 | 说明 |
|------|------|
| `src/components/CanvasTerminal.tsx` | xterm.js 终端面板组件 |
| `src/context/TerminalContext.tsx` | 终端状态管理（entries、isOpen） |
| `src-tauri/src/tools/shell.rs` | Rust 后端命令执行（cmd/powershell/sh） |
| `src/hooks/useAgentExecution.ts` | onShellOutput 回调拦截 execute_shell |
| `src/App.tsx` | CanvasBridgeInner 桥接 shellOutputRef |

**数据流**：

```
AI 调用 execute_shell
  → builtin.ts: invoke('execute_command', { command, args, timeout })
  → Rust shell.rs: cmd /C <command> 或 sh -c <command>
  → 返回 CommandResult { stdout, stderr, exit_code }
  → ReActEngine: record.result = { success, output, error, metadata: { exitCode } }
  → useAgentExecution: onToolCall 拦截 execute_shell → onShellOutput(cmd, stdout, stderr, exitCode)
  → App.tsx: shellOutputRef → CanvasBridgeInner → addEntry() + setIsOpen(true)
  → TerminalContext: entries 追加新 TerminalEntry
  → CanvasTerminal: useEffect 监听 entries → writeEntry() 写入 xterm
```

**终端面板功能**：

- **xterm.js 渲染**：ANSI 转义码颜色支持，虚拟滚动，5000 行回滚缓冲
- **可折叠面板**：CSS height 过渡动画，展开/收起按钮
- **自动打开**：AI 执行命令时自动展开终端面板
- **文本选择复制**：`attachCustomKeyEventHandler` 拦截 Ctrl+C，临时 textarea + `execCommand('copy')` 写入剪贴板
- **提示符格式**：Windows 显示 `PS C:\Users\xxx>` ，Linux/Mac 显示 `user@host:~$`
- **清空按钮**：清除终端内容和 entries 状态

**Windows 中文编码修复**：

Windows 的 `cmd.exe` 输出使用系统代码页（中文系统为 GBK/CP936），而 Rust 的 `String::from_utf8_lossy` 期望 UTF-8，导致中文乱码。

修复方案：
1. 添加 `encoding_rs` 依赖到 `Cargo.toml`
2. 新增 `decode_output()` 函数：先尝试 UTF-8 解码，失败则回退到 GBK 解码
3. `execute_command` 和 `execute_powershell` 都使用 `decode_output()` 替代 `String::from_utf8_lossy`

```rust
fn decode_output(bytes: &[u8]) -> String {
    if bytes.is_empty() { return String::new(); }
    if let Ok(s) = String::from_utf8(bytes.to_vec()) { return s; }
    let (cow, _, _) = encoding_rs::GBK.decode(bytes);
    cow.into_owned()
}
```

**动画抖动修复**：

展开/收起动画时 xterm 内容抖动，根因是 CSS height 过渡期间 `ResizeObserver` 反复触发 `fitAddon.fit()` 重排终端。

修复方案：将动画层和 xterm 渲染层分离
- 外层 div：`overflow-hidden` + `transition-[height]` 负责平滑过渡
- 内层 div（xterm 容器）：固定 `height: 200px`，尺寸永远不变
- `isOpen` 变化后延迟 320ms（动画结束后）再调用 `fitAddon.fit()`

**已知问题及修复历史**：

| 问题 | 根因 | 修复 |
|------|------|------|
| 每行只显示2个字符 | 条件渲染导致 xterm 在 div 不存在时创建失败 | 始终渲染 div，用 CSS height 控制显隐 |
| 中文乱码 | cmd 输出 GBK 编码，from_utf8_lossy 期望 UTF-8 | encoding_rs GBK 回退解码 |
| 无法复制选中文本 | keydown 挂在容器 div 上，xterm 内部 textarea 拦截事件 | attachCustomKeyEventHandler + execCommand('copy') |
| 展开/收起动画抖动 | ResizeObserver 在动画期间反复触发 fit | 动画层/渲染层分离 + 延迟 fit |

### 6.3 AI 推理步骤可视化 ⭐⭐⭐

**场景**：AI 执行复杂任务时（多步 ReAct 循环），用户需要理解 AI 的推理过程。

**当前问题**：Agent 执行视图（Reasoning Steps、Tool Calls）在聊天区以折叠卡片形式展示，空间有限，无法与代码上下文联动。

**方案**：
- Canvas 右侧或顶部添加可折叠的"推理面板"
- 以时间线/流程图形式展示 ReAct 循环：Thought → Action → Observation → Thought → ...
- 每个步骤可展开查看详细内容（工具参数、返回结果、耗时）
- 点击工具调用步骤，Canvas 自动跳转到相关文件/位置
- 支持步骤级别的"重新执行"和"编辑参数后执行"

**与现有架构的集成**：
- 复用 `ReActEngine` 的 `onStep` 回调数据
- 扩展 `GlobalStateContext` 添加 `activeSteps` 状态
- Canvas 监听步骤变化，自动联动文件打开和位置跳转

### 6.4 Web 内容预览 ⭐⭐

**场景**：AI 抓取网页内容或生成 HTML 代码后，用户需要预览渲染结果。

**当前问题**：`fetch_url` 和 `web_extract` 的结果以原始文本/Markdown 形式展示，无法看到渲染后的网页。AI 生成的 HTML/CSS/JS 代码也无法即时预览。

**方案**：
- Canvas 添加"预览"标签页类型，使用沙箱 iframe 渲染 HTML
- AI 调用 `fetch_url` 后，Canvas 可切换到"网页预览"模式
- AI 生成 HTML 文件后，Canvas 自动检测并提供预览按钮
- 支持 Live Reload：编辑 HTML/CSS/JS 后自动刷新预览

**与现有架构的集成**：
- Tauri 的 WebView 可作为预览容器（比 iframe 更安全）
- `fetch_url` 工具返回的 HTML 内容存入 `FileViewerContext` 的预览标签
- 文件保存后通过 `fs.watch` 触发预览刷新

### 6.5 结构化数据查看器 ⭐⭐

**场景**：AI 读取 JSON/YAML/CSV 文件后，用户需要以结构化方式浏览数据。

**当前问题**：大 JSON/YAML 文件在代码编辑器中以纯文本展示，层级关系不直观。CSV 文件无法以表格形式查看。

**方案**：
- JSON/YAML：树形视图，支持折叠/展开节点、搜索键名、路径复制
- CSV/TSV：表格视图，支持排序、筛选、列宽调整
- 自动检测文件类型并切换视图模式
- 保留代码视图作为"原始数据"模式

**与现有架构的集成**：
- `FileTab` 扩展 `viewMode` 字段（'code' | 'tree' | 'table' | 'preview'）
- JSON 树视图可复用现有 React 树组件库
- CSV 表格视图基于虚拟滚动（处理大文件）

### 6.6 图表/流程图渲染 ⭐⭐

**场景**：AI 生成 Mermaid/PlantUML 图表代码后，用户需要看到渲染结果。

**方案**：
- 检测 Markdown 中的 Mermaid 代码块，在预览模式中渲染为 SVG
- 或添加独立的"图表预览"标签页类型
- 支持 Mermaid、PlantUML、D2 等图表语言
- 编辑图表代码后实时更新渲染

### 6.7 AI 代码注解层 ⭐⭐

**场景**：AI 分析代码后，用户需要在代码上下文中看到 AI 的注释和建议。

**方案**：
- 在 CodeMirror 编辑器中添加"注解层"（类似 IDE 的 Inline Suggestion）
- AI 可在代码行间插入解释性注释、警告标记、优化建议
- 注解以不同颜色/图标区分类型（info/warning/suggestion/error）
- 用户可点击注解展开详情、Accept/Dismiss 建议
- 类似 GitHub Copilot 的 Inline Suggestion，但支持多行注解和富文本

**与现有架构的集成**：
- 使用 CodeMirror 的 `Decoration.widget` / `Decoration.line` 实现注解渲染
- Agent 执行 `read_file` + 分析后，通过事件发送注解数据到 Canvas
- 注解数据结构：`{ line, type, message, suggestion? }`

### 6.8 多文件并排视图 ⭐

**场景**：AI 同时操作多个文件（如重构时修改接口定义 + 实现 + 测试），用户需要同时查看。

**当前问题**：Canvas 只有一个编辑器区域，多文件只能通过标签页切换，无法同时查看。

**方案**：
- 支持水平/垂直分屏，每个分屏可打开不同文件
- AI 修改多个文件时，自动在分屏中展示关联文件
- 拖拽标签页到分屏区域即可创建新分屏

### 6.9 图片/PDF 预览 ⭐

**场景**：AI 读取图片或 PDF 文件，用户需要直接查看内容。

**方案**：
- 图片文件：直接在 Canvas 中渲染（支持缩放、拖拽）
- PDF 文件：使用 `pdf.js` 渲染为页面图像
- 与 Tauri 后端的 `fetch_url` PDF 解析能力联动

### 6.10 Notebook 交互模式 ⭐

**场景**：AI 和用户以"代码单元格"方式交互，类似 Jupyter Notebook。

**方案**：
- Canvas 支持 Notebook 模式，每个单元格包含代码 + 输出
- AI 生成代码后，用户可点击"运行"查看输出
- 输出支持文本、表格、图表、HTML
- 基于 CodeMirror 的多编辑器实例实现

### 优先级排序

| 优先级 | 功能 | 理由 |
|--------|------|------|
| P0 ✅ | AI 代码变更 Diff 视图 | AI 最核心的操作是修改代码，Diff 是最直观的变更感知方式 |
| P0 ✅ | 终端输出面板 | Shell 命令执行是 AI 的核心能力，需要可视化输出 |
| P1 | AI 推理步骤可视化 | 复杂任务的推理过程需要可视化，增强用户信任和理解 |
| P1 | Web 内容预览 | AI 频繁操作网页内容，预览能力是自然延伸 |
| P2 | 结构化数据查看器 | JSON/YAML/CSV 是常见文件类型，树/表视图显著提升体验 |
| P2 | 图表/流程图渲染 | AI 生成图表是常见需求，Mermaid 渲染成本低 |
| P2 | AI 代码注解层 | 增强代码理解，但实现复杂度较高 |
| P3 | 多文件并排视图 | 提升多文件操作效率，但非刚需 |
| P3 | 图片/PDF 预览 | 使用频率较低 |
| P3 | Notebook 交互模式 | 架构变动大，与当前 ReAct 模式差异较大 |
