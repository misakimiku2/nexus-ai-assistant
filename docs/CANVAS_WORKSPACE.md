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
| 迭代 9（当前） | **Tab 切换滚动位置保持**：修复多文件切换时页面自动滚动到顶部的问题。根因是 `key={activeTabId}` 导致 React 先卸载旧 CodeMirror（scrollTop 重置为 0），再创建新 CodeMirror。修复方案：(1) setupMinimap 中用 capturedTabId 在 onScroll 时持续保存滚动位置；(2) 移除 handleCreateEditor 中的旧 view scrollTop 保存（避免用 0 覆盖正确值）；(3) handleCreateEditor 中通过双层 RAF 延迟恢复保存的滚动位置 |
