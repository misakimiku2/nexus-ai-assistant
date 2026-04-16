import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import DiffMatchPatch from 'diff-match-patch';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView, Decoration, ViewPlugin, ViewUpdate, lineNumbers } from '@codemirror/view';
import { EditorState, Extension, RangeSet, Range } from '@codemirror/state';
import { syntaxHighlighting } from '@codemirror/language';
import { cn } from '../lib/utils';
import { useTranslation } from '../hooks/useTranslation';
import {
  vsCodeDarkTheme,
  vsCodeLightTheme,
  vsCodeDarkHighlightStyle,
  vsCodeLightHighlightStyle,
  getLanguageExtension,
} from '../lib/codemirror-theme';

type DiffLineType = 'added' | 'removed' | 'unchanged';

interface DiffLine {
  type: DiffLineType;
  content: string;
  leftLineNum?: number;
  rightLineNum?: number;
}

interface DiffViewProps {
  originalContent: string;
  newContent: string;
  language: string;
  isDarkMode: boolean;
  onAccept: () => void;
  onReject: () => void;
}

const dmp = new DiffMatchPatch();

function computeDiffLines(original: string, modified: string): { lines: DiffLine[]; addedCount: number; removedCount: number } {
  const diffs = dmp.diff_main(original, modified);
  dmp.diff_cleanupSemantic(diffs);

  const lines: DiffLine[] = [];
  let leftLineNum = 0;
  let rightLineNum = 0;
  let addedCount = 0;
  let removedCount = 0;

  let leftBuffer: string[] = [];
  let rightBuffer: string[] = [];

  const flushBuffers = () => {
    const maxLen = Math.max(leftBuffer.length, rightBuffer.length);
    for (let i = 0; i < maxLen; i++) {
      const leftContent = i < leftBuffer.length ? leftBuffer[i] : undefined;
      const rightContent = i < rightBuffer.length ? rightBuffer[i] : undefined;

      if (leftContent !== undefined && rightContent !== undefined) {
        leftLineNum++;
        rightLineNum++;
        lines.push({
          type: 'unchanged',
          content: leftContent,
          leftLineNum,
          rightLineNum,
        });
      } else if (leftContent !== undefined) {
        leftLineNum++;
        removedCount++;
        lines.push({
          type: 'removed',
          content: leftContent,
          leftLineNum,
        });
      } else if (rightContent !== undefined) {
        rightLineNum++;
        addedCount++;
        lines.push({
          type: 'added',
          content: rightContent!,
          rightLineNum,
        });
      }
    }
    leftBuffer = [];
    rightBuffer = [];
  };

  for (const [op, text] of diffs) {
    const textLines = text.split('\n');
    if (text.endsWith('\n')) {
      textLines.pop();
    }

    if (op === 0) {
      flushBuffers();
      for (const line of textLines) {
        leftLineNum++;
        rightLineNum++;
        lines.push({
          type: 'unchanged',
          content: line,
          leftLineNum,
          rightLineNum,
        });
      }
    } else if (op === -1) {
      leftBuffer.push(...textLines);
    } else if (op === 1) {
      rightBuffer.push(...textLines);
    }
  }
  flushBuffers();

  return { lines, addedCount, removedCount };
}

function buildDiffLineNumbers(side: 'left' | 'right', lines: DiffLine[]): (number | string)[] {
  const nums: (number | string)[] = [];
  for (const line of lines) {
    if (side === 'left') {
      nums.push(line.type === 'added' ? '' : (line.leftLineNum ?? ''));
    } else {
      nums.push(line.type === 'removed' ? '' : (line.rightLineNum ?? ''));
    }
  }
  return nums;
}

function createDiffLineDecorationPlugin(side: 'left' | 'right', lines: DiffLine[], isDarkMode: boolean): Extension {
  const removedLineDeco = Decoration.line({
    attributes: {
      class: 'diff-line-removed',
      style: `background-color: ${isDarkMode ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)'}`,
    },
  });
  const addedLineDeco = Decoration.line({
    attributes: {
      class: 'diff-line-added',
      style: `background-color: ${isDarkMode ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.1)'}`,
    },
  });

  return ViewPlugin.fromClass(class {
    decorations: RangeSet<Decoration>;

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.buildDecorations(update.view);
      }
    }

    buildDecorations(view: EditorView): RangeSet<Decoration> {
      const decos: Range<Decoration>[] = [];
      for (const { from, to } of view.visibleRanges) {
        for (let pos = from; pos <= to;) {
          const line = view.state.doc.lineAt(pos);
          const lineIdx = line.number - 1;
          if (lineIdx >= 0 && lineIdx < lines.length) {
            const diffLine = lines[lineIdx];
            if (side === 'left' && diffLine.type === 'removed') {
              decos.push(removedLineDeco.range(line.from));
            } else if (side === 'right' && diffLine.type === 'added') {
              decos.push(addedLineDeco.range(line.from));
            }
          }
          pos = line.to + 1;
          if (pos > view.state.doc.length) break;
        }
      }
      return Decoration.set(decos, true);
    }
  }, {
    decorations: v => v.decorations,
  });
}

function createDiffGutterExtension(side: 'left' | 'right', lines: DiffLine[], isDarkMode: boolean): Extension {
  const nums = buildDiffLineNumbers(side, lines);

  return lineNumbers({
    formatNumber: (n: number) => {
      if (n >= 1 && n <= nums.length) {
        return String(nums[n - 1]);
      }
      return String(n);
    },
    domEventHandlers: {
      mousedown: () => true,
    },
  });
}

function buildSideContent(side: 'left' | 'right', lines: DiffLine[]): string {
  return lines
    .filter(line => {
      if (side === 'left') return line.type !== 'added';
      return line.type !== 'removed';
    })
    .map(line => line.content)
    .join('\n');
}

const DiffPanel: React.FC<{
  side: 'left' | 'right';
  content: string;
  lines: DiffLine[];
  language: string;
  isDarkMode: boolean;
  scrollSyncRef: React.MutableRefObject<{ left: HTMLDivElement | null; right: HTMLDivElement | null; syncing: boolean }>;
}> = React.memo(({ side, content, lines, language, isDarkMode, scrollSyncRef }) => {
  const cmRef = useRef<HTMLDivElement>(null);

  const extensions = useMemo(() => {
    const exts: Extension[] = [
      getLanguageExtension(language),
      syntaxHighlighting(isDarkMode ? vsCodeDarkHighlightStyle : vsCodeLightHighlightStyle),
      createDiffLineDecorationPlugin(side, lines, isDarkMode),
      createDiffGutterExtension(side, lines, isDarkMode),
      EditorView.editable.of(false),
      EditorState.readOnly.of(true),
      EditorView.theme({
        '&': { height: '100%' },
        '.cm-scroller': { overflow: 'auto' },
        '.cm-gutters': {
          backgroundColor: isDarkMode ? '#27272a' : '#fafafa',
          borderRight: isDarkMode ? 'none' : '1px solid #e4e4e7',
        },
        '.cm-lineNumbers .cm-gutterElement': {
          color: isDarkMode ? '#71717a' : '#a1a1aa',
          minWidth: '50px',
        },
      }),
    ];
    return exts;
  }, [side, lines, language, isDarkMode]);

  const handleScroll = useCallback(() => {
    const refs = scrollSyncRef.current;
    if (refs.syncing) return;
    refs.syncing = true;

    const source = side === 'left' ? refs.left : refs.right;
    const target = side === 'left' ? refs.right : refs.left;

    if (source && target) {
      const scroller = source.querySelector('.cm-scroller') as HTMLElement;
      const targetScroller = target.querySelector('.cm-scroller') as HTMLElement;
      if (scroller && targetScroller) {
        targetScroller.scrollTop = scroller.scrollTop;
      }
    }

    requestAnimationFrame(() => { refs.syncing = false; });
  }, [side, scrollSyncRef]);

  useEffect(() => {
    const container = cmRef.current;
    if (!container) return;

    const observer = new MutationObserver(() => {
      const scroller = container.querySelector('.cm-scroller') as HTMLElement;
      if (scroller && !scroller.dataset.diffScrollBound) {
        scroller.dataset.diffScrollBound = 'true';
        scroller.addEventListener('scroll', handleScroll, { passive: true });
      }
    });

    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [handleScroll]);

  useEffect(() => {
    const key = side === 'left' ? 'left' : 'right';
    scrollSyncRef.current[key] = cmRef.current;
    return () => { scrollSyncRef.current[key] = null; };
  }, [side, scrollSyncRef]);

  return (
    <div ref={cmRef} className="h-full w-full">
      <CodeMirror
        value={content}
        extensions={extensions}
        theme={isDarkMode ? vsCodeDarkTheme : vsCodeLightTheme}
        basicSetup={false}
        editable={false}
        readOnly={true}
        className="h-full w-full"
        style={{ height: '100%', width: '100%' }}
      />
    </div>
  );
});

export const DiffView: React.FC<DiffViewProps> = ({
  originalContent,
  newContent,
  language,
  isDarkMode,
  onAccept,
  onReject,
}) => {
  const { t } = useTranslation();
  const scrollSyncRef = useRef<{ left: HTMLDivElement | null; right: HTMLDivElement | null; syncing: boolean }>({
    left: null,
    right: null,
    syncing: false,
  });

  const { lines, addedCount, removedCount } = useMemo(
    () => computeDiffLines(originalContent, newContent),
    [originalContent, newContent]
  );

  const leftContent = useMemo(() => buildSideContent('left', lines), [lines]);
  const rightContent = useMemo(() => buildSideContent('right', lines), [lines]);

  return (
    <div className="flex flex-col h-full">
      <div className={cn(
        "flex items-center gap-3 px-4 py-1.5 border-b text-xs shrink-0",
        isDarkMode ? "border-zinc-700 bg-zinc-800/80 text-zinc-400" : "border-zinc-200 bg-white text-zinc-500"
      )}>
        <span className="text-green-500 font-medium">{t.canvas.diff.added({ count: addedCount })}</span>
        <span className="text-red-500 font-medium">{t.canvas.diff.removed({ count: removedCount })}</span>
        <span className="opacity-50">|</span>
        <span className="text-xs">{t.canvas.diff.lines({ count: lines.length })}</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={onAccept}
            className={cn(
              "px-3 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1",
              isDarkMode
                ? "bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30"
                : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
            )}
          >
            ✓ {t.canvas.diff.accept}
          </button>
          <button
            onClick={onReject}
            className={cn(
              "px-3 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1",
              isDarkMode
                ? "bg-red-600/20 text-red-400 hover:bg-red-600/30"
                : "bg-red-50 text-red-600 hover:bg-red-100"
            )}
          >
            ✗ {t.canvas.diff.reject}
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0 border-r" style={{ borderRightColor: isDarkMode ? '#3f3f46' : '#e4e4e7' }}>
          <div className={cn(
            "px-3 py-1 text-xs font-medium border-b shrink-0",
            isDarkMode ? "bg-zinc-800 text-red-400 border-zinc-700" : "bg-red-50 text-red-600 border-zinc-200"
          )}>
            {t.canvas.diff.original}
          </div>
          <div className="flex-1 min-h-0">
            <DiffPanel
              side="left"
              content={leftContent}
              lines={lines}
              language={language}
              isDarkMode={isDarkMode}
              scrollSyncRef={scrollSyncRef}
            />
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          <div className={cn(
            "px-3 py-1 text-xs font-medium border-b shrink-0",
            isDarkMode ? "bg-zinc-800 text-green-400 border-zinc-700" : "bg-green-50 text-green-600 border-zinc-200"
          )}>
            {t.canvas.diff.modified}
          </div>
          <div className="flex-1 min-h-0">
            <DiffPanel
              side="right"
              content={rightContent}
              lines={lines}
              language={language}
              isDarkMode={isDarkMode}
              scrollSyncRef={scrollSyncRef}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
