import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Plus, Command, PanelRightOpen, PanelRightClose, X, FileText, Code, Save, RotateCcw, FolderOpen, Eye, Pencil } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';
import { useTranslation } from '../hooks/useTranslation';
import { useFileViewer, FileTab } from '../context/FileViewerContext';
import ReactMarkdown from 'react-markdown';
import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { json } from '@codemirror/lang-json';
import { rust } from '@codemirror/lang-rust';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { sql } from '@codemirror/lang-sql';
import { yaml } from '@codemirror/lang-yaml';
import { xml } from '@codemirror/lang-xml';
import { php } from '@codemirror/lang-php';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine } from '@codemirror/view';
import { history, indentWithTab } from '@codemirror/commands';
import { syntaxTree, indentUnit, foldGutter, bracketMatching, indentOnInput, syntaxHighlighting, defaultHighlightStyle, HighlightStyle, foldKeymap } from '@codemirror/language';
import { highlightSelectionMatches } from '@codemirror/search';
import { autocompletion } from '@codemirror/autocomplete';
import { Tag, tags as t, highlightTree, type Highlighter } from '@lezer/highlight';
import { EditorState, Extension, StateEffect } from '@codemirror/state';

interface CanvasWorkspaceProps {
  isDarkMode: boolean;
  isToolPanelOpen: boolean;
  setIsToolPanelOpen: (open: boolean) => void;
}

const LANGUAGE_LABELS: Record<string, string> = {
  typescript: 'TypeScript', javascript: 'JavaScript', python: 'Python',
  rust: 'Rust', go: 'Go', java: 'Java', c: 'C', cpp: 'C++',
  csharp: 'C#', ruby: 'Ruby', html: 'HTML', css: 'CSS',
  json: 'JSON', yaml: 'YAML', xml: 'XML', markdown: 'Markdown',
  bash: 'Shell', sql: 'SQL', plaintext: 'Text', toml: 'TOML',
  ini: 'INI', dockerfile: 'Dockerfile', makefile: 'Makefile',
  php: 'PHP', swift: 'Swift', kotlin: 'Kotlin', scala: 'Scala',
  scss: 'SCSS', less: 'Less', text: 'Text',
};

const UI_FONT = '"Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const vsCodeDarkTheme = EditorView.theme({
  '&': {
    backgroundColor: '#27272a',
    color: '#d4d4d4',
    fontSize: '13px',
    fontFamily: UI_FONT,
    height: '100%',
  },
  '.cm-scroller': {
    fontFamily: UI_FONT,
    overflow: 'auto',
    willChange: 'scroll-position',
  },
  '.cm-content': {
    fontFamily: UI_FONT,
    padding: '0',
    caretColor: '#aeafad',
    contain: 'layout style',
  },
  '.cm-line': {
    contain: 'style paint',
  },
  '.cm-cursor': {
    borderLeftColor: '#aeafad',
  },
  '.cm-selectionBackground': {
    background: 'rgba(38, 79, 120, 0.45) !important',
  },
  '.cm-focused .cm-selectionBackground': {
    background: 'rgba(38, 79, 120, 0.45) !important',
  },
  '.cm-searchMatch': {
    backgroundColor: '#613214 !important',
    outline: '1px solid #b7792c',
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: '#494a36 !important',
    outline: '1px solid #b7792c',
  },
  '.cm-activeLine': {
    backgroundColor: '#2a2d2e !important',
  },
  '.cm-activeLineGutter': {
    backgroundColor: '#2a2d2e !important',
  },
  '.cm-gutters': {
    backgroundColor: '#27272a',
    color: '#71717a',
    borderRight: 'none',
    fontFamily: UI_FONT,
    fontSize: '13px',
    userSelect: 'none',
  },
  '.cm-gutterElement': {
    fontFamily: UI_FONT,
    cursor: 'pointer',
    padding: '0 6px 0 12px',
    minWidth: '40px',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    minWidth: '50px',
    display: 'flex',
    justifyContent: 'flex-end',
  },
  '.cm-gutterElement.cm-activeLineGutter': {
    color: '#a1a1aa',
  },
  '.cm-foldPlaceholder': {
    backgroundColor: '#27272a',
    border: 'none',
    color: '#71717a',
    padding: '0 4px',
  },
  '.cm-tooltip': {
    border: '1px solid #3f3f46',
    backgroundColor: '#3f3f46',
    color: '#d4d4d4',
  },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: '#062f4a',
    color: '#ffffff',
  },
  '.cm-panels': {
    backgroundColor: '#27272a',
    color: '#d4d4d4',
  },
  '.cm-panels.cm-panels-top': {
    borderBottom: '1px solid #3f3f46',
  },
  '.cm-panel.cm-search label': {
    fontSize: '80%',
  },
  '.cm-foldGutter': {
    width: '16px',
  },
  '.cm-foldGutter .cm-gutterElement': {
    padding: '0 4px',
    cursor: 'pointer',
    fontSize: '14px',
    minWidth: '16px',
  },
  '.cm-foldGutter .cm-gutterElement span': {
    display: 'block',
    textAlign: 'center',
  },
}, { dark: true });

const vsCodeLightTheme = EditorView.theme({
  '&': {
    backgroundColor: '#fafafa',
    color: '#18181b',
    fontSize: '13px',
    fontFamily: UI_FONT,
    height: '100%',
  },
  '.cm-scroller': {
    fontFamily: UI_FONT,
    overflow: 'auto',
    willChange: 'scroll-position',
  },
  '.cm-content': {
    fontFamily: UI_FONT,
    padding: '0',
    caretColor: '#18181b',
    contain: 'layout style',
  },
  '.cm-line': {
    contain: 'style paint',
  },
  '.cm-cursor': {
    borderLeftColor: '#18181b',
  },
  '.cm-selectionBackground': {
    background: 'rgba(173, 214, 255, 0.45) !important',
  },
  '.cm-focused .cm-selectionBackground': {
    background: 'rgba(173, 214, 255, 0.45) !important',
  },
  '.cm-searchMatch': {
    backgroundColor: '#fef08a !important',
    outline: '1px solid #ca8a04',
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: '#fde68a !important',
    outline: '1px solid #ca8a04',
  },
  '.cm-activeLine': {
    backgroundColor: '#f0f0f0 !important',
  },
  '.cm-activeLineGutter': {
    backgroundColor: '#f0f0f0 !important',
  },
  '.cm-gutters': {
    backgroundColor: '#fafafa',
    color: '#71717a',
    borderRight: '1px solid #e4e4e7',
    fontFamily: UI_FONT,
    fontSize: '13px',
    userSelect: 'none',
  },
  '.cm-gutterElement': {
    fontFamily: UI_FONT,
    cursor: 'pointer',
    padding: '0 6px 0 12px',
    minWidth: '40px',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    minWidth: '50px',
    display: 'flex',
    justifyContent: 'flex-end',
  },
  '.cm-gutterElement.cm-activeLineGutter': {
    color: '#3f3f46',
  },
  '.cm-foldPlaceholder': {
    backgroundColor: '#fafafa',
    border: '1px solid #d4d4d8',
    color: '#71717a',
    padding: '0 4px',
  },
  '.cm-tooltip': {
    border: '1px solid #d4d4d8',
    backgroundColor: '#ffffff',
    color: '#18181b',
  },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: '#dbeafe',
    color: '#18181b',
  },
  '.cm-panels': {
    backgroundColor: '#f4f4f5',
    color: '#18181b',
  },
  '.cm-panels.cm-panels-top': {
    borderBottom: '1px solid #e4e4e7',
  },
  '.cm-panel.cm-search label': {
    fontSize: '80%',
  },
  '.cm-foldGutter': {
    width: '16px',
  },
  '.cm-foldGutter .cm-gutterElement': {
    padding: '0 4px',
    cursor: 'pointer',
    fontSize: '14px',
    minWidth: '16px',
  },
  '.cm-foldGutter .cm-gutterElement span': {
    display: 'block',
    textAlign: 'center',
  },
}, { dark: false });

const vsCodeDarkHighlightStyle = HighlightStyle.define([
  { tag: t.comment, color: '#6a9955', fontStyle: 'italic' },
  { tag: [t.variableName], color: '#9cdcfe' },
  { tag: [t.typeName, t.className, t.namespace], color: '#4ec9b0' },
  { tag: t.function(t.variableName), color: '#dcdcaa' } as any,
  { tag: t.propertyName, color: '#9cdcfe' },
  { tag: t.string, color: '#ce9178' },
  { tag: t.number, color: '#b5cea8' },
  { tag: t.bool, color: '#569cd6' },
  { tag: t.null, color: '#569cd6' },
  { tag: [t.keyword, t.operatorKeyword, t.modifier, t.controlKeyword], color: '#569cd6' },
  { tag: t.operator, color: '#d4d4d4' },
  { tag: t.punctuation, color: '#d4d4d4' },
  { tag: t.tagName, color: '#569cd6' },
  { tag: t.attributeName, color: '#9cdcfe' },
  { tag: t.attributeValue, color: '#ce9178' },
  { tag: t.regexp, color: '#d16969' },
  { tag: t.escape, color: '#d7ba7d' },
  { tag: t.definition(t.variableName), color: '#9cdcfe' },
  { tag: t.local, color: '#9cdcfe' },
  { tag: t.meta, color: '#d4d4d4' },
  { tag: t.processingInstruction, color: '#569cd6' },
  { tag: t.monospace, color: '#ce9178' },
  { tag: t.link, color: '#569cd6', textDecoration: 'underline' },
  { tag: t.heading, color: '#569cd6', fontWeight: 'bold' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strong, fontWeight: 'bold' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.deleted, color: '#ce9178' },
  { tag: t.inserted, color: '#b5cea8' },
  { tag: t.invalid, color: '#f44747' },
  { tag: t.list, color: '#d4d4d4' },
]);

const vsCodeLightHighlightStyle = HighlightStyle.define([
  { tag: t.comment, color: '#008000', fontStyle: 'italic' },
  { tag: [t.variableName], color: '#001080' },
  { tag: [t.typeName, t.className, t.namespace], color: '#267f99' },
  { tag: t.function(t.variableName), color: '#795e26' } as any,
  { tag: t.propertyName, color: '#001080' },
  { tag: t.string, color: '#a31515' },
  { tag: t.number, color: '#098658' },
  { tag: t.bool, color: '#0000ff' },
  { tag: t.null, color: '#0000ff' },
  { tag: [t.keyword, t.operatorKeyword, t.modifier, t.controlKeyword], color: '#0000ff' },
  { tag: t.operator, color: '#000000' },
  { tag: t.punctuation, color: '#000000' },
  { tag: t.tagName, color: '#800000' },
  { tag: t.attributeName, color: '#0000ff' },
  { tag: t.attributeValue, color: '#a31515' },
  { tag: t.regexp, color: '#800000' },
  { tag: t.escape, color: '#098658' },
  { tag: t.definition(t.variableName), color: '#001080' },
  { tag: t.local, color: '#001080' },
  { tag: t.meta, color: '#000000' },
  { tag: t.processingInstruction, color: '#800000' },
  { tag: t.monospace, color: '#a31515' },
  { tag: t.link, color: '#0000ff', textDecoration: 'underline' },
  { tag: t.heading, color: '#000080', fontWeight: 'bold' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strong, fontWeight: 'bold' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.deleted, color: '#a31515' },
  { tag: t.inserted, color: '#098658' },
  { tag: t.invalid, color: '#ff0000' },
  { tag: t.list, color: '#000000' },
]);

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

export const CanvasWorkspace: React.FC<CanvasWorkspaceProps> = ({
  isDarkMode,
  isToolPanelOpen,
  setIsToolPanelOpen
}) => {
  const { t } = useTranslation();
  const { tabs, activeTabId, openFile, closeTab, setActiveTab, updateTabContent, saveTab } = useFileViewer();
  const [isEditing, setIsEditing] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const cmRef = useRef<ReactCodeMirrorRef>(null);
  const stickyRef = useRef<HTMLElement | null>(null);
  const minimapRef = useRef<{ canvas: HTMLCanvasElement; container: HTMLElement } | null>(null);
  const minimapRafRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const viewReadyRef = useRef<EditorView | null>(null);
  const cleanupFns = useRef<(() => void)[]>([]);

  function getLineIndent(text: string): number {
    let indent = 0;
    for (const ch of text) {
      if (ch === ' ') indent++;
      else if (ch === '\t') indent += 2;
      else break;
    }
    return indent;
  }

  function isScopeStarter(text: string): boolean {
    if (!text || text.startsWith('}') || text.startsWith(']') || text.startsWith(')')) return false;
    if (/^#{1,6}\s/.test(text)) return true;
    if (/^(export\s+)?(default\s+)?(async\s+)?function\s/.test(text)) return true;
    if (/^(export\s+)?(default\s+)?class\s/.test(text)) return true;
    if (/^(export\s+)?(abstract\s+)?class\s/.test(text)) return true;
    if (/^(export\s+)?interface\s/.test(text)) return true;
    if (/^(export\s+)?type\s+\w+\s*=/.test(text)) return true;
    if (/^(export\s+)?enum\s/.test(text)) return true;
    if (/^(export\s+)?(const|let|var)\s+\w+\s*=\s*(async\s+)?(\(|function|\[|React\.)/.test(text)) return true;
    if (/^(export\s+)?(const|let|var)\s+\w+\s*=\s*\{/.test(text)) return true;
    if (/^(if|else\s+if|else)\s*[\({]/.test(text)) return true;
    if (/^else\s*\{/.test(text)) return true;
    if (/^(for|while|do)\s*[\({]/.test(text)) return true;
    if (/^switch\s*\(/.test(text)) return true;
    if (/^case\s/.test(text)) return true;
    if (/^try\s*\{?/.test(text)) return true;
    if (/^catch\s*[\({]/.test(text)) return true;
    if (/^finally\s*\{?/.test(text)) return true;
    if (/^(def|class)\s/.test(text)) return true;
    if (/^(if|elif|else)\s.*:/.test(text)) return true;
    if (/^(for|while)\s.*:/.test(text)) return true;
    if (/^(try|except|finally)\s*:/.test(text)) return true;
    if (/^with\s.*:/.test(text)) return true;
    if (/^(pub\s+)?(async\s+)?fn\s/.test(text)) return true;
    if (/^(pub\s+)?(struct|enum|trait|impl)\s/.test(text)) return true;
    if (/^(if|else|loop|while|for|match)\b/.test(text)) return true;
    if (/^(public|private|protected)\s+(static\s+)?(class|interface|enum)\s/.test(text)) return true;
    if (/^(public|private|protected)\s+(static\s+)?(void|int|String|boolean|long|double|float)\s+\w+\s*\(/.test(text)) return true;
    if (text.endsWith('{')) return true;
    if (text.endsWith(':') && !text.startsWith('//') && !text.startsWith('/*') && !text.startsWith('*')) return true;
    return false;
  }

  function findEnclosingScopes(view: EditorView, currentLineNum: number): number[] {
    const doc = view.state.doc;
    const maxStickyLines = 5;
    const stack: { lineNum: number; depthAfter: number }[] = [];
    let depth = 0;

    for (let i = 1; i <= currentLineNum; i++) {
      const line = doc.line(i);
      const text = line.text;
      const trimmed = text.trim();

      let opens = 0, closes = 0;
      for (const ch of text) {
        if (ch === '{') opens++;
        else if (ch === '}') closes++;
      }

      const prevDepth = depth;
      depth = depth - closes + opens;

      while (stack.length > 0 && stack[stack.length - 1].depthAfter > depth) {
        stack.pop();
      }

      if (opens > closes && trimmed && isScopeStarter(trimmed)) {
        stack.push({ lineNum: i, depthAfter: depth });
      }
    }

    return stack.slice(-maxStickyLines).map(s => s.lineNum);
  }

  function escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getHighlightedLineHTML(view: EditorView, from: number, to: number, highlightStyle: HighlightStyle): string {
    const tree = syntaxTree(view.state);
    const parts: { from: number; to: number; cls: string }[] = [];

    highlightTree(tree, highlightStyle, (from, to, cls) => {
      if (cls) parts.push({ from, to, cls });
    }, from, to);

    parts.sort((a, b) => a.from - b.from || a.to - b.to);

    let html = '';
    let pos = from;
    const doc = view.state.doc;

    for (const part of parts) {
      if (part.from > pos) {
        html += escapeHtml(doc.sliceString(pos, part.from));
      }
      html += `<span class="${part.cls}">${escapeHtml(doc.sliceString(part.from, part.to))}</span>`;
      pos = part.to;
    }
    if (pos < to) {
      html += escapeHtml(doc.sliceString(pos, to));
    }

    return html;
  }

  const setupLineNumberClick = useCallback((view: EditorView) => {
    const gutters = view.dom.querySelector('.cm-gutters');
    if (!gutters) return;

    let isDragging = false;
    let startLineNum = 0;

    const getLineAtY = (clientY: number): number | null => {
      const editorRect = view.dom.getBoundingClientRect();
      const y = clientY - editorRect.top + view.scrollDOM.scrollTop;
      try {
        const block = view.lineBlockAtHeight(y);
        if (block && block.from !== undefined) {
          return view.state.doc.lineAt(block.from).number;
        }
      } catch {}
      return null;
    };

    const selectLines = (fromLine: number, toLine: number) => {
      const doc = view.state.doc;
      const minLine = Math.min(fromLine, toLine);
      const maxLine = Math.max(fromLine, toLine);
      const from = doc.line(minLine).from;
      const to = doc.line(maxLine).to;
      view.dispatch({
        selection: { anchor: from, head: to },
        effects: EditorView.scrollIntoView(from, { y: 'nearest' }),
      });
      view.focus();
    };

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.cm-lineNumbers')) return;
      e.preventDefault();
      const lineNum = getLineAtY(e.clientY);
      if (lineNum === null) return;
      isDragging = true;
      startLineNum = lineNum;
      selectLines(lineNum, lineNum);
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const lineNum = getLineAtY(e.clientY);
      if (lineNum === null) return;
      selectLines(startLineNum, lineNum);
    };

    const handleMouseUp = () => {
      isDragging = false;
    };

    gutters.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    cleanupFns.current.push(() => {
      gutters.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    });
  }, []);

  const setupStickyScroll = useCallback((view: EditorView) => {
    const highlightStyle = isDarkMode ? vsCodeDarkHighlightStyle : vsCodeLightHighlightStyle;
    const bgColor = isDarkMode ? '#27272a' : '#fafafa';
    const bgColorHover = isDarkMode ? '#3f3f46' : '#e4e4e7';
    const borderColor = isDarkMode ? '#3f3f46' : '#d4d4d8';
    const lineColor = isDarkMode ? '#d4d4d4' : '#18181b';

    const container = document.createElement('div');
    Object.assign(container.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      right: '0',
      zIndex: '20',
      display: 'none',
      userSelect: 'none',
    });

    view.dom.style.position = 'relative';
    view.dom.appendChild(container);
    stickyRef.current = container;

    const updateSticky = () => {
      const scrollTop = view.scrollDOM.scrollTop;
      if (scrollTop <= 20) {
        container.style.display = 'none';
        return;
      }

      try {
        const block = view.lineBlockAtHeight(scrollTop);
        if (!block || block.from === undefined) {
          container.style.display = 'none';
          return;
        }

        const currentLine = view.state.doc.lineAt(block.from);
        const scopeLines = findEnclosingScopes(view, currentLine.number);

        if (scopeLines.length === 0) {
          container.style.display = 'none';
          return;
        }

        const guttersEl = view.dom.querySelector('.cm-gutters');
        const gutterWidth = guttersEl ? guttersEl.getBoundingClientRect().width : 50;

        container.innerHTML = '';

        for (const lineNum of scopeLines) {
          const line = view.state.doc.line(lineNum);
          const indent = getLineIndent(line.text);
          const lineEl = document.createElement('div');
          Object.assign(lineEl.style, {
            background: bgColor,
            borderBottom: `1px solid ${borderColor}`,
            padding: `1px 12px 1px ${gutterWidth + indent * 4}px`,
            fontSize: '13px',
            color: lineColor,
            fontFamily: UI_FONT,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            lineHeight: '1.5',
            cursor: 'pointer',
            transition: 'background-color 0.15s ease',
          });

          lineEl.dataset.lineNum = String(lineNum);

          lineEl.addEventListener('mouseenter', () => {
            lineEl.style.backgroundColor = bgColorHover;
          });
          lineEl.addEventListener('mouseleave', () => {
            lineEl.style.backgroundColor = bgColor;
          });
          lineEl.addEventListener('click', () => {
            const targetLine = view.state.doc.line(lineNum);
            view.dispatch({
              effects: EditorView.scrollIntoView(targetLine.from, { y: 'center' }),
              selection: { anchor: targetLine.from },
            });
            view.focus();
          });

          const html = getHighlightedLineHTML(view, line.from, line.to, highlightStyle);
          lineEl.innerHTML = html;
          container.appendChild(lineEl);
        }

        container.style.display = 'block';
      } catch {
        container.style.display = 'none';
      }
    };

    let lastStickyScrollTop = 0;

    const handleScroll = () => {
      const currentScrollTop = view.scrollDOM.scrollTop;
      if (Math.abs(currentScrollTop - lastStickyScrollTop) > 300) {
        container.style.display = 'none';
        lastStickyScrollTop = currentScrollTop;
        return;
      }
      lastStickyScrollTop = currentScrollTop;
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        updateSticky();
      });
    };

    view.scrollDOM.addEventListener('scroll', handleScroll, { passive: true });
    cleanupFns.current.push(() => view.scrollDOM.removeEventListener('scroll', handleScroll));
    cleanupFns.current.push(() => {
      if (container.parentNode) container.parentNode.removeChild(container);
      stickyRef.current = null;
    });
  }, [isDarkMode]);

  const setupMinimap = useCallback((view: EditorView) => {
    const bgColor = isDarkMode ? '#27272a' : '#fafafa';
    const viewportColor = isDarkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)';
    const viewportBorderColor = isDarkMode ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.18)';
    const selectionColor = isDarkMode ? 'rgba(100, 150, 255, 0.3)' : 'rgba(50, 100, 255, 0.25)';
    const MINIMAP_WIDTH_MIN = 60;
    const MINIMAP_WIDTH_MAX = 170;
    let minimapWidth = Math.min(MINIMAP_WIDTH_MAX, Math.max(MINIMAP_WIDTH_MIN, Math.round(view.dom.clientWidth * 0.08)));
    const BLOCK_HEIGHT = 3;
    const LINE_GAP = 2;
    const LINE_PITCH = BLOCK_HEIGHT + LINE_GAP;
    const CHAR_WIDTH = 1.15;
    const PADDING = 6;

    const existingContainer = view.dom.querySelector('.cm-minimap-container') as HTMLElement | null;
    if (existingContainer) existingContainer.remove();

    const container = document.createElement('div');
    container.className = 'cm-minimap-container';
    Object.assign(container.style, {
      position: 'absolute',
      top: '0',
      right: '0',
      bottom: '0',
      width: `${minimapWidth}px`,
      backgroundColor: bgColor,
      borderLeft: isDarkMode ? '1px solid #3f3f46' : '1px solid #e4e4e7',
      overflow: 'hidden',
      cursor: 'default',
      zIndex: '25',
    });

    const innerWrapper = document.createElement('div');
    Object.assign(innerWrapper.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      willChange: 'transform',
    });
    container.appendChild(innerWrapper);

    const contentCanvas = document.createElement('canvas');
    contentCanvas.style.display = 'block';
    innerWrapper.appendChild(contentCanvas);

    const selectionDiv = document.createElement('div');
    Object.assign(selectionDiv.style, {
      position: 'absolute',
      left: `${PADDING}px`,
      width: `${minimapWidth - PADDING * 2}px`,
      backgroundColor: selectionColor,
      pointerEvents: 'none',
      display: 'none',
    });
    innerWrapper.appendChild(selectionDiv);

    const viewportDiv = document.createElement('div');
    Object.assign(viewportDiv.style, {
      position: 'absolute',
      left: `${PADDING}px`,
      width: `${minimapWidth - PADDING * 2}px`,
      backgroundColor: viewportColor,
      border: `0.5px solid ${viewportBorderColor}`,
      pointerEvents: 'none',
      borderRadius: '2px',
    });
    container.appendChild(viewportDiv);

    view.dom.appendChild(container);
    view.scrollDOM.style.paddingRight = `${minimapWidth}px`;

    minimapRef.current = { canvas: contentCanvas, container };

    let isDragging = false;
    let isDraggingViewport = false;
    let dragStartClientY = 0;
    let dragStartScrollTop = 0;
    let currentMinimapScrollTop = 0;
    let dragRafId = 0;
    const MIN_VP_HEIGHT = 30;

    const defaultColor = isDarkMode ? '#3d3d42' : '#d8d8db';
    const commentColor = isDarkMode ? '#6a9955' : '#008000';
    const variableColor = isDarkMode ? '#9cdcfe' : '#001080';
    const stringColor = isDarkMode ? '#ce9178' : '#a31515';
    const keywordColor = isDarkMode ? '#569cd6' : '#0000ff';
    const typeColor = isDarkMode ? '#4ec9b0' : '#267f99';
    const funcColor = isDarkMode ? '#dcdcaa' : '#795e26';
    const numberColor = isDarkMode ? '#b5cea8' : '#098658';
    const regexpColor = isDarkMode ? '#d16969' : '#800000';
    const escapeColor = isDarkMode ? '#d7ba7d' : '#098658';
    const operatorColor = isDarkMode ? '#d4d4d4' : '#000000';
    const punctuationColor = isDarkMode ? '#d4d4d4' : '#000000';
    const tagNameColor = isDarkMode ? '#569cd6' : '#800000';
    const attributeNameColor = isDarkMode ? '#9cdcfe' : '#0000ff';
    const attributeValueColor = isDarkMode ? '#ce9178' : '#a31515';
    const metaColor = isDarkMode ? '#d4d4d4' : '#000000';
    const invalidColor = isDarkMode ? '#f44747' : '#ff0000';
    const deletedColor = isDarkMode ? '#ce9178' : '#a31515';
    const insertedColor = isDarkMode ? '#b5cea8' : '#098658';

    const tagColorMap = new Map<string, string>();
    const addTag = (tag: Tag, color: string) => { if (tag) tagColorMap.set(tag.toString(), color); };
    const addStrTag = (name: string, color: string) => { tagColorMap.set(name, color); };
    addTag(t.comment, commentColor);
    addTag(t.lineComment, commentColor);
    addTag(t.blockComment, commentColor);
    addTag(t.docComment, commentColor);
    addTag(t.variableName, variableColor);
    addTag(t.typeName, typeColor);
    addTag(t.className, typeColor);
    addTag(t.namespace, typeColor);
    addTag(t.tagName, tagNameColor);
    addTag(t.propertyName, variableColor);
    addTag(t.attributeName, attributeNameColor);
    addTag(t.attributeValue, attributeValueColor);
    addTag(t.string, stringColor);
    addTag(t.docString, stringColor);
    addTag(t.character, stringColor);
    addTag(t.number, numberColor);
    addTag(t.integer, numberColor);
    addTag(t.float, numberColor);
    addTag(t.bool, keywordColor);
    addTag(t.null, keywordColor);
    addTag(t.atom, keywordColor);
    addTag(t.keyword, keywordColor);
    addTag(t.self, keywordColor);
    addTag(t.operatorKeyword, keywordColor);
    addTag(t.modifier, keywordColor);
    addTag(t.controlKeyword, keywordColor);
    addTag(t.definitionKeyword, keywordColor);
    addTag(t.moduleKeyword, keywordColor);
    addTag(t.operator, operatorColor);
    addTag(t.punctuation, punctuationColor);
    addTag(t.separator, punctuationColor);
    addTag(t.bracket, punctuationColor);
    addTag(t.regexp, regexpColor);
    addTag(t.escape, escapeColor);
    addTag(t.meta, metaColor);
    addTag(t.processingInstruction, keywordColor);
    addTag(t.monospace, stringColor);
    addTag(t.link, keywordColor);
    addTag(t.heading, keywordColor);
    addTag(t.deleted, deletedColor);
    addTag(t.inserted, insertedColor);
    addTag(t.invalid, invalidColor);
    addTag(t.list, metaColor);

    addStrTag('paren', punctuationColor);
    addStrTag('squareBracket', punctuationColor);
    addStrTag('brace', punctuationColor);
    addStrTag('derefOperator', operatorColor);
    addStrTag('definitionOperator', operatorColor);
    addStrTag('arithmeticOperator', operatorColor);
    addStrTag('special(string)', stringColor);

    const minimapHighlighter: Highlighter = {
      style(tagList: readonly Tag[]): string | null {
        for (const tag of tagList) {
          const color = tagColorMap.get(tag.toString());
          if (color) return color;
          if ((tag as any).modified && (tag as any).modified.length > 0) {
            const hasFuncMod = (tag as any).modified.some((m: any) => m.name === 'function');
            if (hasFuncMod) return funcColor;
            const base = (tag as any).base;
            if (base) {
              const baseColor = tagColorMap.get(base.toString());
              if (baseColor) return baseColor;
            }
          }
        }
        return null;
      }
    };

    const renderContent = () => {
      const doc = view.state.doc;
      const lineCount = typeof doc.lines === 'number' ? doc.lines : 1;
      const displayWidth = minimapWidth - PADDING * 2;
      const contentH = Math.max(lineCount * LINE_PITCH + PADDING * 2, container.clientHeight);
      const containerH = container.clientHeight;
      const dpr = window.devicePixelRatio || 1;

      const scrollH = view.scrollDOM.scrollHeight;
      const scrollTop = view.scrollDOM.scrollTop;
      const scrollerH = view.scrollDOM.clientHeight;
      const maxScroll = Math.max(0, scrollH - scrollerH);

      const naturalVpH = scrollH > 0
        ? (scrollerH / scrollH) * containerH
        : containerH;
      const minVpH = Math.max(MIN_VP_HEIGHT, containerH * 0.08);
      const logicalVpH = Math.max(naturalVpH, minVpH);
      const vpY = maxScroll > 0
        ? (scrollTop / maxScroll) * (containerH - logicalVpH)
        : 0;
      const vpYInContent = scrollH > 0
        ? (scrollTop / scrollH) * contentH
        : 0;
      const maxMinimapScroll = Math.max(0, contentH - containerH);
      const minimapScrollTop = maxMinimapScroll > 0
        ? Math.max(0, Math.min(maxMinimapScroll, vpYInContent - vpY))
        : 0;

      let firstLine = 1;
      let lastLine = lineCount;

      contentCanvas.width = displayWidth * dpr;
      contentCanvas.height = contentH * dpr;
      contentCanvas.style.width = `${displayWidth}px`;
      contentCanvas.style.height = `${contentH}px`;
      contentCanvas.style.marginLeft = `${PADDING}px`;
      const ctx = contentCanvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, displayWidth, contentH);
      const tree = syntaxTree(view.state);
      const rangeFrom = doc.line(firstLine).from;
      const rangeTo = doc.line(lastLine).to;

      const colorRanges: { from: number; to: number; color: string }[] = [];
      highlightTree(tree, minimapHighlighter, (from, to, color) => {
        if (color && from < rangeTo && to > rangeFrom) {
          colorRanges.push({ from, to, color });
        }
      }, rangeFrom, rangeTo);
      colorRanges.sort((a, b) => a.from - b.from || a.to - b.to);

      const lineTokenMap = new Map<number, { from: number; to: number; color: string }[]>();
      for (const range of colorRanges) {
        const fromLine = doc.lineAt(range.from).number;
        const toLine = doc.lineAt(Math.max(range.from, range.to - 1)).number;
        for (let ln = fromLine; ln <= toLine; ln++) {
          if (ln < firstLine || ln > lastLine) continue;
          if (!lineTokenMap.has(ln)) lineTokenMap.set(ln, []);
          const ls = doc.line(ln).from;
          const le = doc.line(ln).to;
          lineTokenMap.get(ln)!.push({
            from: Math.max(range.from, ls),
            to: Math.min(range.to, le),
            color: range.color
          });
        }
      }

      for (let i = firstLine; i <= lastLine; i++) {
        const line = doc.line(i);
        const y = PADDING + (i - 1) * LINE_PITCH;
        const lineLen = line.text.length;
        if (lineLen === 0) continue;
        const ranges = lineTokenMap.get(i);
        if (!ranges || ranges.length === 0) {
          ctx.fillStyle = defaultColor;
          ctx.fillRect(0, y, Math.min(lineLen * CHAR_WIDTH, displayWidth), BLOCK_HEIGHT);
          continue;
        }
        let pos = line.from;
        let x = 0;
        for (const range of ranges) {
          if (range.from > pos) {
            const gapLen = range.from - pos;
            ctx.fillStyle = defaultColor;
            ctx.fillRect(x, y, gapLen * CHAR_WIDTH, BLOCK_HEIGHT);
            x += gapLen * CHAR_WIDTH;
            pos = range.from;
          }
          const len = range.to - range.from;
          ctx.fillStyle = range.color;
          ctx.fillRect(x, y, len * CHAR_WIDTH, BLOCK_HEIGHT);
          x += len * CHAR_WIDTH;
          pos = range.to;
          if (x > displayWidth) break;
        }
        if (pos < line.to && x <= displayWidth) {
          const len = line.to - pos;
          ctx.fillStyle = defaultColor;
          ctx.fillRect(x, y, len * CHAR_WIDTH, BLOCK_HEIGHT);
        }
      }
      return contentH;
    };

    const updateOverlay = () => {
      const contentH = parseFloat(contentCanvas.style.height) || container.clientHeight;
      const containerH = container.clientHeight;
      const scrollerH = view.scrollDOM.clientHeight;
      const scrollH = view.scrollDOM.scrollHeight;
      const scrollTop = view.scrollDOM.scrollTop;
      const maxScroll = Math.max(0, scrollH - scrollerH);

      const naturalVpH = scrollH > 0
        ? (scrollerH / scrollH) * containerH
        : containerH;

      const vpW = minimapWidth - PADDING * 2;
      const minVpH = Math.max(MIN_VP_HEIGHT, containerH * 0.08);
      const vpH = Math.max(naturalVpH, minVpH);

      const logicalVpH = Math.max(naturalVpH, minVpH);
      const vpY = maxScroll > 0
        ? (scrollTop / maxScroll) * (containerH - logicalVpH)
        : 0;

      viewportDiv.style.left = `${PADDING}px`;
      viewportDiv.style.width = `${vpW}px`;
      viewportDiv.style.top = `${vpY}px`;
      viewportDiv.style.height = `${vpH}px`;

      const vpYInContent = scrollH > 0
        ? (scrollTop / scrollH) * contentH
        : 0;
      const maxMinimapScroll = Math.max(0, contentH - containerH);
      const minimapScrollTop = maxMinimapScroll > 0
        ? Math.max(0, Math.min(maxMinimapScroll, vpYInContent - vpY))
        : 0;
      innerWrapper.style.transform = `translateY(${-minimapScrollTop}px)`;
      currentMinimapScrollTop = minimapScrollTop;

      const doc = view.state.doc;
      const sel = view.state.selection.main;
      if (!sel.empty) {
        const startLine = doc.lineAt(sel.from).number;
        const endLine = doc.lineAt(sel.to).number;
        selectionDiv.style.display = 'block';
        selectionDiv.style.top = `${PADDING + (startLine - 1) * LINE_PITCH}px`;
        selectionDiv.style.height = `${(endLine - startLine + 1) * LINE_PITCH}px`;
      } else {
        selectionDiv.style.display = 'none';
      }
    };

    const onScroll = () => {
      if (minimapRafRef.current !== null) return;
      minimapRafRef.current = requestAnimationFrame(() => {
        minimapRafRef.current = null;
        const lineCount = typeof view.state.doc.lines === 'number' ? view.state.doc.lines : 1;
        if (lineCount > 1500) {
          renderContent();
        }
        updateOverlay();
      });
    };

    const scheduleFullRender = () => {
      if (minimapRafRef.current !== null) cancelAnimationFrame(minimapRafRef.current);
      minimapRafRef.current = requestAnimationFrame(() => {
        minimapRafRef.current = null;
        renderContent();
        updateOverlay();
      });
    };

    const scrollToY = (clientY: number) => {
      const rect = container.getBoundingClientRect();
      const relY = clientY - rect.top;
      const contentH = parseFloat(contentCanvas.style.height) || container.clientHeight;
      const scrollH = view.scrollDOM.scrollHeight;
      const contentY = relY + currentMinimapScrollTop;
      const targetScrollTop = contentH > 0 ? (contentY / contentH) * scrollH : 0;
      const maxScroll = Math.max(0, scrollH - view.scrollDOM.clientHeight);
      view.scrollDOM.scrollTop = Math.max(0, Math.min(maxScroll, targetScrollTop));
    };

    const handleMinimapMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const relY = e.clientY - rect.top;
      const vpTop = parseFloat(viewportDiv.style.top) || 0;
      const vpHeight = parseFloat(viewportDiv.style.height) || 0;
      const clickedOnViewport = relY >= vpTop && relY <= vpTop + vpHeight;
      isDragging = true;
      isDraggingViewport = clickedOnViewport;
      dragStartClientY = e.clientY;
      dragStartScrollTop = view.scrollDOM.scrollTop;
      if (!clickedOnViewport) {
        scrollToY(e.clientY);
      }
    };

    const handleMinimapMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      if (dragRafId) return;
      const currentClientY = e.clientY;
      dragRafId = requestAnimationFrame(() => {
        dragRafId = 0;
        if (isDraggingViewport) {
          const deltaY = currentClientY - dragStartClientY;
          const containerH = container.clientHeight;
          const scrollerH = view.scrollDOM.clientHeight;
          const scrollH = view.scrollDOM.scrollHeight;
          const maxScroll = Math.max(0, scrollH - scrollerH);
          const naturalVpH = scrollH > 0 ? (scrollerH / scrollH) * containerH : containerH;
          const minVpH = Math.max(MIN_VP_HEIGHT, containerH * 0.08);
          const logicalVpH = Math.max(naturalVpH, minVpH);
          const scrollRange = containerH - logicalVpH;
          if (scrollRange > 0 && maxScroll > 0) {
            const scrollDelta = (deltaY / scrollRange) * maxScroll;
            view.scrollDOM.scrollTop = Math.max(0, Math.min(maxScroll, dragStartScrollTop + scrollDelta));
          }
        } else {
          scrollToY(currentClientY);
        }
      });
    };

    const handleMinimapMouseUp = () => {
      isDragging = false;
      isDraggingViewport = false;
      if (dragRafId) {
        cancelAnimationFrame(dragRafId);
        dragRafId = 0;
      }
    };

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged || update.geometryChanged) {
        scheduleFullRender();
      } else if (update.selectionSet) {
        updateOverlay();
      }
    });

    renderContent();
    updateOverlay();

    view.dispatch({ effects: StateEffect.appendConfig.of([updateListener]) });
    view.scrollDOM.addEventListener('scroll', onScroll, { passive: true });
    container.addEventListener('mousedown', handleMinimapMouseDown);
    window.addEventListener('mousemove', handleMinimapMouseMove);
    window.addEventListener('mouseup', handleMinimapMouseUp);

    let resizeRafId = 0;
    const resizeObserver = new ResizeObserver(() => {
      const newWidth = Math.min(MINIMAP_WIDTH_MAX, Math.max(MINIMAP_WIDTH_MIN, Math.round(view.dom.clientWidth * 0.08)));
      if (newWidth === minimapWidth) return;
      if (resizeRafId) return;
      resizeRafId = requestAnimationFrame(() => {
        resizeRafId = 0;
        if (newWidth === minimapWidth) return;
        minimapWidth = newWidth;
        container.style.width = `${minimapWidth}px`;
        selectionDiv.style.width = `${minimapWidth - PADDING * 2}px`;
        viewportDiv.style.width = `${minimapWidth - PADDING * 2}px`;
        view.scrollDOM.style.paddingRight = `${minimapWidth}px`;
        scheduleFullRender();
      });
    });
    resizeObserver.observe(view.dom);

    cleanupFns.current.push(() => {
      view.scrollDOM.removeEventListener('scroll', onScroll);
      container.removeEventListener('mousedown', handleMinimapMouseDown);
      window.removeEventListener('mousemove', handleMinimapMouseMove);
      window.removeEventListener('mouseup', handleMinimapMouseUp);
      resizeObserver.disconnect();
      if (resizeRafId) cancelAnimationFrame(resizeRafId);
      if (minimapRafRef.current !== null) cancelAnimationFrame(minimapRafRef.current);
      if (dragRafId) cancelAnimationFrame(dragRafId);
      if (container.parentNode) container.parentNode.removeChild(container);
      view.scrollDOM.style.paddingRight = '';
      minimapRef.current = null;
    });
  }, [isDarkMode]);

  const fixSelectionLayer = useCallback((view: EditorView) => {
    const selectionLayer = view.scrollDOM.querySelector('.cm-selectionLayer') as HTMLElement | null;
    if (selectionLayer) {
      selectionLayer.style.removeProperty('z-index');
    }
    const contentEl = view.scrollDOM.querySelector('.cm-content') as HTMLElement | null;
    if (contentEl) {
      contentEl.style.removeProperty('position');
      contentEl.style.removeProperty('z-index');
    }
  }, []);

  const handleCreateEditor = useCallback((view: EditorView) => {
    viewReadyRef.current = view;
    cleanupFns.current.forEach(fn => fn());
    cleanupFns.current = [];
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (minimapRafRef.current !== null) {
      cancelAnimationFrame(minimapRafRef.current);
      minimapRafRef.current = null;
    }
    if (stickyRef.current?.parentNode) {
      stickyRef.current.parentNode.removeChild(stickyRef.current);
    }
    stickyRef.current = null;
    if (minimapRef.current?.container.parentNode) {
      minimapRef.current.container.parentNode.removeChild(minimapRef.current.container);
    }
    minimapRef.current = null;
    fixSelectionLayer(view);
    setupLineNumberClick(view);
    setupStickyScroll(view);
    setupMinimap(view);
  }, [fixSelectionLayer, setupLineNumberClick, setupStickyScroll, setupMinimap]);

  useEffect(() => {
    const view = viewReadyRef.current;
    if (!view) return;
    cleanupFns.current.forEach(fn => fn());
    cleanupFns.current = [];
    if (stickyRef.current?.parentNode) {
      stickyRef.current.parentNode.removeChild(stickyRef.current);
    }
    stickyRef.current = null;
    if (minimapRef.current?.container.parentNode) {
      minimapRef.current.container.parentNode.removeChild(minimapRef.current.container);
    }
    minimapRef.current = null;
    if (minimapRafRef.current !== null) {
      cancelAnimationFrame(minimapRafRef.current);
      minimapRafRef.current = null;
    }
    fixSelectionLayer(view);
    setupStickyScroll(view);
    setupMinimap(view);
  }, [isDarkMode, fixSelectionLayer, setupStickyScroll, setupMinimap]);

  useEffect(() => {
    return () => {
      cleanupFns.current.forEach(fn => fn());
      cleanupFns.current = [];
      viewReadyRef.current = null;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (minimapRafRef.current !== null) {
        cancelAnimationFrame(minimapRafRef.current);
        minimapRafRef.current = null;
      }
    };
  }, []);

  const activeTab = tabs.find(tab => tab.id === activeTabId) || null;
  const isMarkdown = activeTab?.language === 'markdown';

  useEffect(() => {
    setIsEditing(false);
    setIsPreviewing(false);
  }, [activeTabId, activeTab?.path]);

  const handleEdit = useCallback(() => {
    if (!activeTab || activeTab.readOnly) return;
    setIsEditing(true);
    setIsPreviewing(false);
  }, [activeTab]);

  const handleSave = useCallback(async () => {
    if (!activeTab || activeTab.readOnly) return;
    setSaving(true);
    try {
      await saveTab(activeTab.id);
      setIsEditing(false);
    } catch (error) {
      console.error('Save failed:', error);
    } finally {
      setSaving(false);
    }
  }, [activeTab, saveTab]);

  const handleRevert = useCallback(() => {
    if (!activeTab) return;
    updateTabContent(activeTab.id, activeTab.originalContent);
  }, [activeTab, updateTabContent]);

  const handleExit = useCallback(() => {
    if (!activeTab) return;
    updateTabContent(activeTab.id, activeTab.originalContent);
    setIsEditing(false);
  }, [activeTab, updateTabContent]);

  const handleOpenFile = useCallback(async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        multiple: false,
        directory: false,
      });
      if (selected && typeof selected === 'string') {
        await openFile(selected);
      }
    } catch {
      const path = prompt('输入文件路径:');
      if (path) {
        await openFile(path.trim());
      }
    }
  }, [openFile]);

  const handleChange = useCallback((value: string) => {
    if (activeTab) {
      updateTabContent(activeTab.id, value);
    }
  }, [activeTab, updateTabContent]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
    }
  }, [handleSave]);

  const getTabIcon = (tab: FileTab) => {
    const lang = tab.language;
    if (['typescript', 'javascript', 'python', 'rust', 'go', 'java', 'c', 'cpp', 'csharp', 'ruby', 'php', 'swift', 'kotlin', 'scala'].includes(lang)) {
      return <Code size={14} />;
    }
    return <FileText size={14} />;
  };

  const formatFileSize = (content: string) => {
    const bytes = new TextEncoder().encode(content).length;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const extensions = useMemo(() => {
    if (!activeTab) return [];
    const isMarkdown = activeTab.language === 'markdown';
    const lineCount = activeTab.content.split('\n').length;
    const isLargeFile = lineCount > 1000;
    const exts: Extension[] = [
      syntaxHighlighting(isDarkMode ? vsCodeDarkHighlightStyle : vsCodeLightHighlightStyle),
      highlightSpecialChars(),
      history(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentUnit.of('  '),
    ];
    if (isMarkdown) {
      exts.push(EditorView.lineWrapping);
    }
    const langExt = getLanguageExtension(activeTab.language);
    if (langExt) exts.push(langExt);
    exts.push(
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
    );
    if (!isLargeFile) {
      exts.push(highlightSelectionMatches());
    }
    exts.push(
      bracketMatching(),
    );
    if (!isLargeFile) {
      exts.push(autocompletion());
    }
    exts.push(
      rectangularSelection(),
      crosshairCursor(),
      foldGutter({
        openText: '▾',
        closedText: '▸',
        markerDOM: (open) => {
          const span = document.createElement('span');
          span.textContent = open ? '▾' : '▸';
          span.style.color = isDarkMode ? '#858585' : '#6e6e6e';
          span.style.fontSize = '12px';
          span.style.cursor = 'pointer';
          return span;
        },
      }),
      keymap.of(foldKeymap),
    );
    if (isEditing) {
      exts.push(indentOnInput());
      exts.push(keymap.of([{
        key: 'Mod-s',
        run: () => { handleSave(); return true; },
      }]));
    }
    return exts;
  }, [activeTab?.language, activeTab?.content, isEditing, isDarkMode, handleSave]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      className={cn(
        "flex flex-col min-w-0 h-full overflow-hidden flex-1",
        isDarkMode ? "bg-zinc-800" : "bg-zinc-50"
      )}
    >
      <div
        data-tauri-drag-region
        className={cn(
          "h-12 border-b flex items-center px-2 gap-1 shrink-0 overflow-x-auto no-scrollbar",
          isDarkMode ? "border-zinc-600 bg-zinc-700/50" : "border-zinc-200 bg-white",
          !isToolPanelOpen && "pr-[90px]"
        )}
      >
        <div className="flex items-center gap-0.5">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-all group max-w-[160px]",
                activeTabId === tab.id
                  ? (isDarkMode ? "bg-zinc-700 text-zinc-200" : "bg-zinc-100 text-zinc-800")
                  : "text-zinc-500 hover:bg-zinc-500/5"
              )}
            >
              <div className={cn(
                "w-1.5 h-1.5 rounded-full shrink-0",
                tab.isDirty ? "bg-amber-500" : (activeTabId === tab.id ? "bg-emerald-500" : "bg-zinc-500/30")
              )} />
              {getTabIcon(tab)}
              <span className="truncate">{tab.title}</span>
              <button
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded-sm hover:bg-zinc-500/20 transition-all shrink-0"
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={handleOpenFile}
          className="p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-600 text-zinc-500 transition-colors shrink-0"
          title={t.canvas.openFile || '打开文件'}
        >
          <FolderOpen size={14} />
        </button>

        <button
          onClick={() => openFile('untitled')}
          className="p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-600 text-zinc-500 transition-colors shrink-0"
          title={t.canvas.createWorkspace}
        >
          <Plus size={14} />
        </button>

        <div className="ml-auto flex items-center gap-1 shrink-0">
          <button
            onClick={() => setIsToolPanelOpen(!isToolPanelOpen)}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              isDarkMode ? "hover:bg-zinc-700 text-zinc-400" : "hover:bg-zinc-100 text-zinc-500"
            )}
            title={isToolPanelOpen ? t.canvas.closeToolbar : t.canvas.openToolbar}
          >
            {isToolPanelOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {activeTab ? (
          <>
            <div className={cn(
              "flex items-center gap-2 px-4 py-1.5 border-b text-xs shrink-0",
              isDarkMode ? "border-zinc-700 bg-zinc-800/80 text-zinc-400" : "border-zinc-200 bg-white text-zinc-500"
            )}>
              <span className="truncate" title={activeTab.path}>{activeTab.path}</span>
              <span className="shrink-0 opacity-50">|</span>
              <span className="shrink-0">{LANGUAGE_LABELS[activeTab.language] || activeTab.language}</span>
              <span className="shrink-0 opacity-50">|</span>
              <span className="shrink-0">{formatFileSize(activeTab.content)}</span>
              {activeTab.isDirty && (
                <span className="shrink-0 text-amber-500 font-medium">已修改</span>
              )}
              {activeTab.readOnly && (
                <span className="shrink-0 text-red-400 font-medium">只读</span>
              )}
              <div className="ml-auto flex items-center gap-1">
                {isMarkdown && !isEditing && (
                  <button
                    onClick={() => setIsPreviewing(!isPreviewing)}
                    className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-medium transition-colors flex items-center gap-1",
                      isPreviewing
                        ? (isDarkMode ? "bg-zinc-700 text-blue-400" : "bg-blue-50 text-blue-600")
                        : (isDarkMode ? "hover:bg-zinc-700 text-zinc-300" : "hover:bg-zinc-100 text-zinc-600")
                    )}
                  >
                    <Eye size={10} /> {isPreviewing ? '源码' : '预览'}
                  </button>
                )}
                {!activeTab.readOnly && !isEditing && !isPreviewing && (
                  <button
                    onClick={handleEdit}
                    className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-medium transition-colors flex items-center gap-1",
                      isDarkMode ? "hover:bg-zinc-700 text-zinc-300" : "hover:bg-zinc-100 text-zinc-600"
                    )}
                  >
                    <Pencil size={10} /> 编辑
                  </button>
                )}
                {isEditing && (
                  <>
                    <button
                      onClick={handleExit}
                      className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-medium transition-colors flex items-center gap-1",
                        isDarkMode ? "hover:bg-zinc-700 text-zinc-300" : "hover:bg-zinc-100 text-zinc-600"
                      )}
                    >
                      <X size={10} /> 退出
                    </button>
                    <button
                      onClick={handleRevert}
                      className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-medium transition-colors flex items-center gap-1",
                        isDarkMode ? "hover:bg-zinc-700 text-zinc-300" : "hover:bg-zinc-100 text-zinc-600"
                      )}
                    >
                      <RotateCcw size={10} /> 还原
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-medium transition-colors flex items-center gap-1",
                        saving ? "opacity-50" : "",
                        isDarkMode ? "hover:bg-zinc-700 text-emerald-400" : "hover:bg-zinc-100 text-emerald-600"
                      )}
                    >
                      <Save size={10} /> {saving ? '保存中...' : '保存'}
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-hidden relative" onKeyDown={handleKeyDown}>
              {isPreviewing && isMarkdown ? (
                <div className={cn(
                  "h-full overflow-auto p-6",
                  isDarkMode ? "prose prose-sm prose-invert max-w-none" : "prose prose-sm max-w-none"
                )}>
                  <ReactMarkdown>{activeTab.content}</ReactMarkdown>
                </div>
              ) : (
                <CodeMirror
                  key={activeTabId}
                  ref={cmRef}
                  value={activeTab.content}
                  onChange={handleChange}
                  extensions={extensions}
                  readOnly={!isEditing}
                  editable={isEditing}
                  basicSetup={false}
                  theme={isDarkMode ? vsCodeDarkTheme : vsCodeLightTheme}
                  onCreateEditor={handleCreateEditor}
                  className="h-full w-full"
                  style={{
                    height: '100%',
                    width: '100%',
                    fontSize: '13px',
                  }}
                />
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-6">
            <div className={cn("w-20 h-20 rounded-full flex items-center justify-center mb-4 border border-transparent", isDarkMode ? "bg-zinc-700 border-zinc-600/50" : "bg-zinc-200")}>
              <Command size={32} className={cn(isDarkMode ? "text-zinc-400" : "text-zinc-500")} />
            </div>
            <h3 className="text-lg font-medium mb-1">{t.canvas.workspace}</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-sm text-center mb-4">
              {t.canvas.placeholder}
            </p>
            <button
              onClick={handleOpenFile}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors",
                isDarkMode ? "bg-zinc-700 hover:bg-zinc-600 text-zinc-200" : "bg-zinc-100 hover:bg-zinc-200 text-zinc-700"
              )}
            >
              <FolderOpen size={16} />
              {t.canvas.openFile || '打开文件'}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
};
