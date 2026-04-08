import { ChatSession, Message } from '../types';
import { getSessionStorage } from './sessionStorage';

export type ExportFormat = 'json' | 'markdown';

export interface ExportOptions {
  format: ExportFormat;
  includeAttachments?: boolean;
}

export interface BatchExportData {
  version: 1;
  exportedAt: number;
  sessions: ChatSession[];
  attachments: { [sessionId: string]: { [key: string]: string } };
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function getRoleLabel(role: string): string {
  switch (role) {
    case 'user': return '👤 用户';
    case 'assistant': return '🤖 助手';
    case 'system': return '⚙️ 系统';
    default: return role;
  }
}

function escapeMarkdown(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|');
}

function messageToMarkdown(message: Message): string {
  const lines: string[] = [];

  lines.push(`## ${getRoleLabel(message.role)}`);
  lines.push('');

  if (message.thinking) {
    lines.push(`> 💡 思考过程:`);
    lines.push(`> `);
    for (const line of message.thinking.split('\n')) {
      lines.push(`> ${escapeMarkdown(line)}`);
    }
    lines.push('');
  }

  lines.push(escapeMarkdown(message.content));
  lines.push('');

  if (message.attachments && message.attachments.length > 0) {
    lines.push(`📎 附件:`);
    for (const att of message.attachments) {
      lines.push(`- [${att.name}] (${att.type})`);
    }
    lines.push('');
  }

  if (message.searchResults && message.searchResults.length > 0) {
    lines.push(`🔍 搜索结果 (${message.searchResults.length} 个):`);
    for (const result of message.searchResults.slice(0, 5)) {
      lines.push(`- [${result.title}](${result.url})`);
    }
    if (message.searchResults.length > 5) {
      lines.push(`- ...及其他 ${message.searchResults.length - 5} 个结果`);
    }
    lines.push('');
  }

  if (message.fileEdits && message.fileEdits.length > 0) {
    lines.push(`📝 文件修改:`);
    for (const edit of message.fileEdits) {
      lines.push(`- ${edit.file} (${edit.status})`);
    }
    lines.push('');
  }

  if (message.todos && message.todos.length > 0) {
    lines.push(`📋 任务列表:`);
    for (const todo of message.todos) {
      const statusIcon = todo.status === 'completed' ? '✅' : todo.status === 'working' ? '🔄' : '⏳';
      lines.push(`- ${statusIcon} ${todo.title} (${todo.progress}%)`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  return lines.join('\n');
}

export async function exportSessionAsMarkdown(sessionId: string): Promise<string> {
  const storage = await getSessionStorage();
  const session = await storage.getSession(sessionId);

  if (!session) {
    throw new Error('Session not found');
  }

  const lines: string[] = [];

  lines.push(`# ${escapeMarkdown(session.title)}`);
  lines.push('');
  lines.push(`> 导出时间: ${formatDate(Date.now())}`);
  lines.push(`> 消息数量: ${session.messages.length}`);
  if (session.activeAgents && session.activeAgents.length > 0) {
    lines.push(`> 活跃 Agent: ${session.activeAgents.join(', ')}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const message of session.messages) {
    lines.push(messageToMarkdown(message));
  }

  return lines.join('\n');
}

export async function exportSessionAsJSON(sessionId: string): Promise<string> {
  const storage = await getSessionStorage();
  return storage.exportSession(sessionId);
}

export async function exportSession(sessionId: string, format: ExportFormat): Promise<string> {
  switch (format) {
    case 'json':
      return exportSessionAsJSON(sessionId);
    case 'markdown':
      return exportSessionAsMarkdown(sessionId);
    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
}

export async function batchExportAsJSON(sessionIds: string[]): Promise<string> {
  const storage = await getSessionStorage();
  const sessions: ChatSession[] = [];
  const attachments: { [sessionId: string]: { [key: string]: string } } = {};

  for (const id of sessionIds) {
    const session = await storage.getSession(id);
    if (session) {
      sessions.push(session);
      try {
        const exportData = JSON.parse(await storage.exportSession(id));
        if (exportData.attachments) {
          attachments[id] = exportData.attachments;
        }
      } catch {
        attachments[id] = {};
      }
    }
  }

  const batchData: BatchExportData = {
    version: 1,
    exportedAt: Date.now(),
    sessions,
    attachments,
  };

  return JSON.stringify(batchData, null, 2);
}

export async function batchExportAsMarkdown(sessionIds: string[]): Promise<string> {
  const parts: string[] = [];

  for (const id of sessionIds) {
    parts.push(await exportSessionAsMarkdown(id));
  }

  return parts.join('\n');
}

export async function batchExportSessions(sessionIds: string[], format: ExportFormat): Promise<string> {
  switch (format) {
    case 'json':
      return batchExportAsJSON(sessionIds);
    case 'markdown':
      return batchExportAsMarkdown(sessionIds);
    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
}

export function detectExportFormat(data: string): 'json' | 'markdown' | 'unknown' {
  const trimmed = data.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return 'json';
  }
  if (trimmed.startsWith('#')) {
    return 'markdown';
  }
  return 'unknown';
}

export async function importSessionFromData(data: string): Promise<ChatSession[]> {
  const format = detectExportFormat(data);

  if (format === 'json') {
    return importFromJSON(data);
  }

  if (format === 'markdown') {
    return importFromMarkdown(data);
  }

  throw new Error('无法识别的文件格式，请使用 JSON 或 Markdown 格式');
}

async function importFromJSON(data: string): Promise<ChatSession[]> {
  const parsed = JSON.parse(data);
  const storage = await getSessionStorage();

  if (parsed.sessions && Array.isArray(parsed.sessions)) {
    const imported: ChatSession[] = [];
    for (const sessionData of parsed.sessions) {
      const singleExport = JSON.stringify({
        version: parsed.version || 1,
        exportedAt: parsed.exportedAt,
        session: sessionData,
        attachments: parsed.attachments?.[sessionData.id] || {},
      });
      const session = await storage.importSession(singleExport);
      imported.push(session);
    }
    return imported;
  }

  if (parsed.session) {
    const session = await storage.importSession(data);
    return [session];
  }

  throw new Error('无效的 JSON 导出文件格式');
}

async function importFromMarkdown(data: string): Promise<ChatSession[]> {
  const lines = data.split('\n');
  const title = lines[0]?.replace(/^#\s+/, '') || '导入的会话';
  const messages: Message[] = [];

  let currentRole: string = '';
  let currentContent: string = '';
  let currentThinking: string = '';
  let inThinking = false;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('## 👤 用户') || line.startsWith('## 🤖 助手') || line.startsWith('## ⚙️ 系统')) {
      if (currentRole) {
        messages.push({
          id: Date.now().toString() + Math.random().toString(36).substring(2, 9) + '-' + messages.length,
          role: currentRole as 'user' | 'assistant' | 'system',
          content: currentContent.trim(),
          timestamp: Date.now() - (messages.length > 0 ? messages.length * 1000 : 0),
          ...(currentThinking ? { thinking: currentThinking.trim() } : {}),
        });
      }

      if (line.includes('👤')) currentRole = 'user';
      else if (line.includes('🤖')) currentRole = 'assistant';
      else currentRole = 'system';

      currentContent = '';
      currentThinking = '';
      inThinking = false;
      continue;
    }

    if (line.startsWith('> 💡 思考过程:')) {
      inThinking = true;
      continue;
    }

    if (inThinking) {
      if (line.startsWith('> ') || line === '>') {
        currentThinking += line.replace(/^> /, '') + '\n';
      } else if (line.trim() === '') {
        inThinking = false;
      } else {
        currentThinking += line + '\n';
      }
      continue;
    }

    if (line === '---') {
      continue;
    }

    if (line.startsWith('> ') && !inThinking) {
      continue;
    }

    if (line.startsWith('📎') || line.startsWith('🔍') || line.startsWith('📝') || line.startsWith('📋')) {
      continue;
    }

    if (line.startsWith('- ') && (currentContent === '' || currentContent.endsWith('\n'))) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('- [') || trimmedLine.startsWith('- ✅') || trimmedLine.startsWith('- 🔄') || trimmedLine.startsWith('- ⏳')) {
        continue;
      }
    }

    currentContent += line + '\n';
  }

  if (currentRole && currentContent.trim()) {
    messages.push({
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9) + '-' + messages.length,
      role: currentRole as 'user' | 'assistant' | 'system',
      content: currentContent.trim(),
      timestamp: Date.now(),
      ...(currentThinking ? { thinking: currentThinking.trim() } : {}),
    });
  }

  const storage = await getSessionStorage();
  const session: ChatSession = {
    id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
    title,
    messages,
    updatedAt: Date.now(),
  };

  await storage.saveSession(session);
  return [session];
}

export function getFileExtension(format: ExportFormat): string {
  switch (format) {
    case 'json': return '.json';
    case 'markdown': return '.md';
  }
}

export function getMimeType(format: ExportFormat): string {
  switch (format) {
    case 'json': return 'application/json';
    case 'markdown': return 'text/markdown';
  }
}
