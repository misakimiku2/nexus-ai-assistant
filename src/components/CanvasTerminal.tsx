import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { invoke } from '@tauri-apps/api/core';
import { cn } from '../lib/utils';
import { useTerminal, TerminalEntry } from '../context/TerminalContext';
import '@xterm/xterm/css/xterm.css';

interface CanvasTerminalProps {
  isDarkMode: boolean;
}

interface SystemInfo {
  os: string;
  home_dir: string;
  current_dir: string;
  username: string;
  hostname: string;
}

const DARK_THEME = {
  background: '#18181b',
  foreground: '#d4d4d4',
  cursor: '#d4d4d4',
  selectionBackground: 'rgba(38, 79, 120, 0.45)',
  black: '#18181b',
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#eab308',
  blue: '#3b82f6',
  magenta: '#a855f7',
  cyan: '#06b6d4',
  white: '#d4d4d4',
  brightBlack: '#71717a',
  brightRed: '#f87171',
  brightGreen: '#4ade80',
  brightYellow: '#facc15',
  brightBlue: '#60a5fa',
  brightMagenta: '#c084fc',
  brightCyan: '#22d3ee',
  brightWhite: '#f4f4f5',
};

const LIGHT_THEME = {
  background: '#fafafa',
  foreground: '#27272a',
  cursor: '#27272a',
  selectionBackground: 'rgba(38, 79, 120, 0.3)',
  black: '#27272a',
  red: '#dc2626',
  green: '#16a34a',
  yellow: '#ca8a04',
  blue: '#2563eb',
  magenta: '#9333ea',
  cyan: '#0891b2',
  white: '#27272a',
  brightBlack: '#a1a1aa',
  brightRed: '#ef4444',
  brightGreen: '#22c55e',
  brightYellow: '#eab308',
  brightBlue: '#3b82f6',
  brightMagenta: '#a855f7',
  brightCyan: '#06b6d4',
  brightWhite: '#18181b',
};

function copyTextToClipboard(text: string): boolean {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '-9999px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function formatPrompt(sysInfo: SystemInfo | null): string {
  if (!sysInfo) return '$ ';
  if (sysInfo.os === 'Windows') {
    return `PS ${sysInfo.current_dir}> `;
  }
  const dir = sysInfo.current_dir.replace(sysInfo.home_dir, '~');
  return `${sysInfo.username}@${sysInfo.hostname}:${dir}$ `;
}

export const CanvasTerminal: React.FC<CanvasTerminalProps> = ({ isDarkMode }) => {
  const { entries, isOpen, setIsOpen, clearEntries } = useTerminal();
  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const prevEntryCountRef = useRef(0);
  const [xtermReady, setXtermReady] = useState(false);
  const sysInfoRef = useRef<SystemInfo | null>(null);

  useEffect(() => {
    invoke<SystemInfo>('get_system_info')
      .then(info => { sysInfoRef.current = info; })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const container = termRef.current;
    if (!container) return;

    const xterm = new Terminal({
      theme: isDarkMode ? DARK_THEME : LIGHT_THEME,
      fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.3,
      cursorBlink: false,
      disableStdin: true,
      convertEol: true,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);
    xterm.open(container);

    requestAnimationFrame(() => {
      try {
        fitAddon.fit();
      } catch {}
    });

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;
    setXtermReady(true);

    xterm.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      if (event.type === 'keydown') {
        const isCtrlOrMeta = event.ctrlKey || event.metaKey;
        if (isCtrlOrMeta && event.key === 'c' && !event.shiftKey) {
          const selection = xterm.getSelection();
          if (selection) {
            event.preventDefault();
            copyTextToClipboard(selection);
            return false;
          }
        }
        if (isCtrlOrMeta && event.shiftKey && event.key === 'C') {
          const selection = xterm.getSelection();
          if (selection) {
            event.preventDefault();
            copyTextToClipboard(selection);
            return false;
          }
        }
      }
      return true;
    });

    xterm.element?.addEventListener('copy', (e: ClipboardEvent) => {
      const selection = xterm.getSelection();
      if (selection) {
        e.preventDefault();
        (e.clipboardData as DataTransfer)?.setData('text/plain', selection);
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
      } catch {}
    });
    resizeObserver.observe(container);

    const handleWindowResize = () => {
      try {
        fitAddon.fit();
      } catch {}
    };
    window.addEventListener('resize', handleWindowResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleWindowResize);
      xterm.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
      setXtermReady(false);
    };
  }, []);

  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.theme = isDarkMode ? DARK_THEME : LIGHT_THEME;
    }
  }, [isDarkMode]);

  useEffect(() => {
    const xterm = xtermRef.current;
    if (!xterm || !xtermReady) return;

    const newEntries = entries.slice(prevEntryCountRef.current);
    for (const entry of newEntries) {
      writeEntry(xterm, entry, sysInfoRef.current);
    }
    prevEntryCountRef.current = entries.length;
  }, [entries, xtermReady]);

  useEffect(() => {
    if (isOpen && fitAddonRef.current) {
      const timer = setTimeout(() => {
        try {
          fitAddonRef.current?.fit();
        } catch {}
      }, 320);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    if (entries.length === 0) {
      prevEntryCountRef.current = 0;
    }
  }, [entries.length]);

  return (
    <div className={cn(
      "flex flex-col border-t transition-all duration-200",
      isDarkMode ? "border-zinc-700" : "border-zinc-200"
    )}>
      <div className={cn(
        "flex items-center gap-2 px-3 py-1 text-xs shrink-0",
        isDarkMode ? "bg-zinc-800/80 text-zinc-400" : "bg-zinc-100 text-zinc-500"
      )}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "p-0.5 rounded hover:bg-zinc-500/20 transition-colors",
            isOpen ? "rotate-0" : "rotate-180"
          )}
          style={{ transition: "transform 0.2s" }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
            <path d="M2 7L5 4L8 7" stroke="currentColor" strokeWidth="1.5" fill="none" />
          </svg>
        </button>
        <span className="font-medium">终端</span>
        {entries.length > 0 && (
          <span className={cn(
            "px-1.5 rounded text-[9px]",
            isDarkMode ? "bg-zinc-700 text-zinc-400" : "bg-zinc-200 text-zinc-500"
          )}>{entries.length}</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => {
              clearEntries();
              xtermRef.current?.clear();
              prevEntryCountRef.current = 0;
            }}
            className={cn(
              "px-1.5 py-0.5 rounded text-[10px] hover:bg-zinc-500/20 transition-colors",
            )}
          >
            清空
          </button>
        </div>
      </div>

      <div
        className="overflow-hidden transition-[height] duration-300 ease-in-out"
        style={{ height: isOpen ? '200px' : '0px' }}
      >
        <div
          ref={termRef}
          tabIndex={0}
          className={cn(
            "w-full outline-none",
            isDarkMode ? "bg-zinc-900" : "bg-zinc-50"
          )}
          style={{ height: '200px' }}
        />
      </div>
    </div>
  );
};

function writeEntry(xterm: Terminal, entry: TerminalEntry, sysInfo: SystemInfo | null) {
  const prompt = formatPrompt(sysInfo);
  xterm.writeln(`\x1b[1;36m${prompt}\x1b[0m\x1b[1;37m${entry.command}\x1b[0m`);

  if (entry.stdout) {
    xterm.write(entry.stdout);
    if (!entry.stdout.endsWith('\n')) {
      xterm.writeln('');
    }
  }

  if (entry.stderr) {
    xterm.writeln(`\x1b[31m${entry.stderr}\x1b[0m`);
  }

  if (entry.exitCode === 0) {
    xterm.writeln(`\x1b[32m✓ 退出码: 0\x1b[0m`);
  } else {
    xterm.writeln(`\x1b[31m✗ 退出码: ${entry.exitCode}\x1b[0m`);
  }

  xterm.writeln('');
}
