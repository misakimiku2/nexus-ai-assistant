# Minimap 大文件性能优化计划

## 问题分析

当前 `renderContent()` 函数存在以下性能问题：

1. **全量渲染**：`firstLine = 1`, `lastLine = lineCount`，每次渲染都处理整个文档的所有行
2. **highlightTree 全量遍历**：对整个语法树调用 `highlightTree()`，大文件（如 4977 行）会产生大量 colorRanges
3. **Canvas 尺寸过大**：`contentCanvas.height = contentH * dpr`，整个文档高度的 Canvas 消耗大量 GPU 内存
4. **滚动时全量重渲染**：`onScroll` 在 `lineCount > 1500` 时每次滚动都调用 `renderContent()`，导致掉帧

## Rust 高性能特性是否对 Minimap 有用？

### 分析结论：**收益有限，不推荐使用**

#### 理论上可行的方案

将 `highlightTree` 语法树遍历 + 颜色区间计算移到 Rust 侧（通过 Tauri command），因为 Rust 的 CPU 密集计算比 JS 快 10-50x，且可在独立线程执行不阻塞 UI。

#### 实际不推荐的原因

1. **IPC 开销**：Tauri command 涉及 JS→Rust 序列化 + Rust→JS 反序列化，高频滚动场景下 IPC 开销可能抵消计算收益
2. **数据传输成本**：需将文档文本传给 Rust，再将颜色区间结果（可能数千个 {from, to, color} 对象）传回 JS，数据量可观
3. **语法树无法共享**：CodeMirror 的 `syntaxTree(view.state)` 是内部数据结构，无法直接传给 Rust；Rust 侧需引入 tree-sitter 等独立解析器，增加复杂度和依赖
4. **Canvas 绘制仍在 JS 主线程**：即使 Rust 计算出颜色区间，最终 Canvas `fillRect` 绘制仍需在 JS 主线程执行，这是不可卸载的
5. **架构复杂度**：引入 Rust 侧的语法解析意味着维护两套解析器（CodeMirror Lezer + Rust tree-sitter），token 分类逻辑需要同步

#### 更优方案：纯 JS 可见区域渲染

minimap 的性能瓶颈本质上是**渲染策略问题**（全量渲染 vs 可见区域渲染），而非**计算速度问题**。通过只渲染可见区域的行，可以将计算量降低 95%+，无需引入 Rust。

## 优化方案：可见区域渲染 + 增量更新

### 核心思路

只渲染 minimap 视口内可见的行，而非整个文档。滚动时只更新可见区域的 Canvas 内容。

### 具体实现步骤

#### 步骤 1：引入可见区域计算

在 `renderContent()` 中，根据 `minimapScrollTop` 和 `containerH` 计算当前可见的行范围：

```typescript
const visibleTop = minimapScrollTop;
const visibleBottom = minimapScrollTop + containerH;
const firstVisibleLine = Math.max(1, Math.floor((visibleTop - PADDING) / LINE_PITCH) + 1);
const lastVisibleLine = Math.min(lineCount, Math.ceil((visibleBottom - PADDING) / LINE_PITCH) + 1);
```

#### 步骤 2：Canvas 尺寸改为容器高度

将 Canvas 的逻辑高度从 `contentH`（整个文档高度）改为 `containerH`（容器高度），避免创建超大 Canvas：

```typescript
// 之前：contentCanvas.height = contentH * dpr
// 之后：contentCanvas.height = containerH * dpr
contentCanvas.style.height = `${containerH}px`;
```

#### 步骤 3：行绘制坐标映射

由于 Canvas 高度变为容器高度，行的 Y 坐标需要从"文档绝对坐标"映射为"视口相对坐标"：

```typescript
const y = PADDING + (i - 1) * LINE_PITCH - minimapScrollTop;
```

只有 `y + BLOCK_HEIGHT > 0 && y < containerH` 的行才需要绘制。

#### 步骤 4：highlightTree 限定范围

将 `highlightTree` 的范围限定为可见行对应的文档区间：

```typescript
const rangeFrom = doc.line(firstVisibleLine).from;
const rangeTo = doc.line(lastVisibleLine).to;
highlightTree(tree, minimapHighlighter, callback, rangeFrom, rangeTo);
```

#### 步骤 5：滚动时增量渲染

`onScroll` 中不再调用完整的 `renderContent()`，而是只更新可见区域：

- 计算 `minimapScrollTop` 的变化量
- 如果变化量较小（< 半屏），使用 `ctx.drawImage()` 滚动已有内容，只重绘新暴露的区域
- 如果变化量较大（>= 半屏），直接重绘整个可见区域

#### 步骤 6：移除 innerWrapper 的 translateY 偏移

由于 Canvas 现在只渲染可见区域且坐标已映射，`innerWrapper` 不再需要 `translateY` 偏移。视口指示器的位置计算也需要相应调整。

> **注意**：这一步需要仔细处理。当前架构中 `innerWrapper` 的 `translateY` 用于实现 minimap 内部的滚动偏移。改为可见区域渲染后，Canvas 内容本身就是"视口对齐"的，所以 `innerWrapper` 应该固定在 `translateY(0)`，不再需要偏移。

#### 步骤 7：updateOverlay 适配

`updateOverlay()` 中的视口指示器位置计算需要适配新的渲染模式：

- `viewportDiv` 的 `top` 仍然基于 `scrollTop / maxScroll` 的比例计算
- 但不再需要 `innerWrapper` 的 `translateY` 偏移
- `selectionDiv` 的位置也需要映射到视口相对坐标

#### 步骤 8：scrollToY 适配

`scrollToY()` 中的坐标映射需要适配：

- 点击 minimap 的 Y 坐标直接映射到文档滚动位置
- 不再需要 `currentMinimapScrollTop` 补偿（因为 Canvas 内容与视口对齐）

### 性能预期

| 场景 | 优化前 | 优化后 |
|------|--------|--------|
| 4977 行文件首次渲染 | highlightTree 全量 + Canvas 全量 | highlightTree 可见区域 + Canvas 可见区域 |
| 滚动时重渲染 | 全量 renderContent() | 增量滚动或可见区域重绘 |
| Canvas 内存 | ~25000px × dpr 高度 | ~800px × dpr 高度 |
| 掉帧 | 明显 | 基本消除 |

### 风险与注意事项

1. **语法树缓存**：CodeMirror 的 `syntaxTree` 在大文件中可能只解析了部分内容，需要处理 `tree.length < doc.length` 的情况
2. **快速滚动**：快速滚动时可能出现短暂的白屏，需要在 `onScroll` 中确保 RAF 回调及时执行
3. **编辑时更新**：文档变更时需要重绘可见区域，`scheduleFullRender` 逻辑保持不变
4. **视口指示器精度**：移除 `innerWrapper` 偏移后，视口指示器的位置计算需要验证正确性
