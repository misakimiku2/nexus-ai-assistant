import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
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
import type { Extension } from '@codemirror/state';

const UI_FONT = '"Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const CODE_FONT = '"Cascadia Code", "Fira Code", "JetBrains Mono", Consolas, monospace';

export const vsCodeDarkTheme = EditorView.theme({
  '&': {
    backgroundColor: '#27272a',
    color: '#d4d4d4',
    fontSize: '13px',
    fontFamily: CODE_FONT,
    height: '100%',
  },
  '.cm-scroller': {
    fontFamily: CODE_FONT,
    overflow: 'auto',
    willChange: 'scroll-position',
  },
  '.cm-content': {
    fontFamily: CODE_FONT,
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
  '.cm-gutters': {
    backgroundColor: '#27272a',
    color: '#71717a',
    borderRight: 'none',
    fontFamily: CODE_FONT,
    fontSize: '13px',
    userSelect: 'none',
  },
  '.cm-gutterElement': {
    fontFamily: CODE_FONT,
    cursor: 'pointer',
    padding: '0 6px 0 12px',
    minWidth: '40px',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    minWidth: '50px',
    display: 'flex',
    justifyContent: 'flex-end',
  },
  '.cm-activeLine': {
    backgroundColor: '#2a2d2e !important',
  },
  '.cm-activeLineGutter': {
    backgroundColor: '#2a2d2e !important',
  },
}, { dark: true });

export const vsCodeLightTheme = EditorView.theme({
  '&': {
    backgroundColor: '#fafafa',
    color: '#18181b',
    fontSize: '13px',
    fontFamily: CODE_FONT,
    height: '100%',
  },
  '.cm-scroller': {
    fontFamily: CODE_FONT,
    overflow: 'auto',
    willChange: 'scroll-position',
  },
  '.cm-content': {
    fontFamily: CODE_FONT,
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
  '.cm-gutters': {
    backgroundColor: '#fafafa',
    color: '#71717a',
    borderRight: '1px solid #e4e4e7',
    fontFamily: CODE_FONT,
    fontSize: '13px',
    userSelect: 'none',
  },
  '.cm-gutterElement': {
    fontFamily: CODE_FONT,
    cursor: 'pointer',
    padding: '0 6px 0 12px',
    minWidth: '40px',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    minWidth: '50px',
    display: 'flex',
    justifyContent: 'flex-end',
  },
  '.cm-activeLine': {
    backgroundColor: '#f0f0f0 !important',
  },
  '.cm-activeLineGutter': {
    backgroundColor: '#f0f0f0 !important',
  },
}, { dark: false });

export const vsCodeDarkHighlightStyle = HighlightStyle.define([
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

export const vsCodeLightHighlightStyle = HighlightStyle.define([
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

export function getLanguageExtension(lang: string): Extension {
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
