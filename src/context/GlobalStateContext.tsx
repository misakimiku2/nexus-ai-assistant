import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Message, LogEntry, ChatSession, ChatFolder, Agent, TodoItem, SearchGroup, SearchResult, McpServer } from '../types';
import { AGENTS as INITIAL_AGENTS } from '../data/agents';
import { generateMockConversation, generateClusterMockConversation } from '../utils/mockData';

interface GlobalState {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  logs: LogEntry[];
  setLogs: React.Dispatch<React.SetStateAction<LogEntry[]>>;
  currentTokenCount: number;
  setCurrentTokenCount: React.Dispatch<React.SetStateAction<number>>;
  isStreaming: boolean;
  setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>;
  addLog: (message: string, type?: 'info' | 'error' | 'command') => void;
  simulateSmbCheck: () => void;
  simulateTest: () => void;
  simulateClusterTest: () => void;
  clearHistory: () => void;
  compressMessages: () => void;
  
  // Session Management
  sessions: ChatSession[];
  currentSessionId: string;
  createNewSession: () => void;
  createNewSessionWithAgent: (agentId: string) => void;
  switchSession: (id: string) => void;
  updateSessionTitle: (id: string, title: string) => void;
  updateSessionAgents: (id: string, agentIds: string[]) => void;
  deleteSession: (id: string) => void;
  batchDeleteSessions: (ids: string[]) => void;
  
  // Folder Management
  folders: ChatFolder[];
  createFolder: (name: string) => void;
  updateFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;
  toggleFolder: (id: string) => void;
  moveSessionToFolder: (sessionId: string, folderId?: string) => void;

  // Agent Management
  agents: Agent[];
  addAgent: (agent: Agent) => void;
  updateAgent: (id: string, agent: Partial<Agent>) => void;
  deleteAgent: (id: string) => void;
  
  // Presets
  systemPromptPresets: { id: string; name: string; content: string }[];
  addPreset: (name: string, content: string, id?: string) => void;
  updatePreset: (id: string, name: string, content: string) => void;
  deletePreset: (id: string) => void;
  
  // Derived State
  todos: TodoItem[];

  // Search Management
  searchGroups: SearchGroup[];
  setSearchGroups: React.Dispatch<React.SetStateAction<SearchGroup[]>>;
  searchResults: SearchResult[];
  setSearchResults: React.Dispatch<React.SetStateAction<SearchResult[]>>;
  deleteSearchGroup: (id: string) => void;
  batchDeleteSearchGroups: (ids: string[]) => void;

  // MCP State
  mcpServers: McpServer[];
  setMcpServers: React.Dispatch<React.SetStateAction<McpServer[]>>;

  // User Settings
  userName: string;
  setUserName: (name: string) => void;
  aiName: string;
  setAiName: (name: string) => void;
  userAvatar: string;
  setUserAvatar: (avatar: string) => void;
  aiAvatar: string;
  setAiAvatar: (avatar: string) => void;
  language: string;
  setLanguage: (lang: string) => void;
  fontFamily: string;
  setFontFamily: (font: string) => void;
}

export const GlobalStateContext = createContext<GlobalState | undefined>(undefined);

export const useGlobalState = () => {
  const context = useContext(GlobalStateContext);
  if (!context) {
    throw new Error('useGlobalState must be used within a GlobalStateProvider');
  }
  return context;
};

const estimateTokens = (text: string) => Math.ceil(text.length * 0.5);

const createInitialSession = (): ChatSession => ({
  id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
  title: '新对话',
  messages: [],
  updatedAt: Date.now(),
});

export const GlobalStateProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { i18n } = useTranslation();
  const [sessions, setSessions] = useState<ChatSession[]>([createInitialSession()]);
  const [currentSessionId, setCurrentSessionId] = useState<string>(sessions[0].id);
  const [messages, setMessages] = useState<Message[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [currentTokenCount, setCurrentTokenCount] = useState(0);
  const [isStreaming, setIsStreaming] = useState(false);
  const [folders, setFolders] = useState<ChatFolder[]>([]);
  const [agents, setAgents] = useState<Agent[]>(INITIAL_AGENTS);
  const [searchGroups, setSearchGroups] = useState<SearchGroup[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  
  // MCP State
  const [mcpServers, setMcpServers] = useState<McpServer[]>([
    {
      id: 'google-search',
      name: 'mcp-server-google-search',
      status: 'connected',
      tools: [{ name: 'web_search', description: 'Search the web for current information', requiresAuth: false }]
    },
    {
      id: 'system-ops',
      name: 'mcp-server-system-ops',
      status: 'connected',
      tools: [{ name: 'modify_smb_config', description: 'Modify system SMB configuration', requiresAuth: true }]
    }
  ]);

  // User Settings State
  const [userName, setUserName] = useState<string>(() => localStorage.getItem('nexus_user_name') || 'Nexus User');
  const [aiName, setAiName] = useState<string>(() => localStorage.getItem('nexus_ai_name') || 'Nexus AI');
  const [userAvatar, setUserAvatar] = useState<string>(() => localStorage.getItem('nexus_user_avatar') || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix');
  const [aiAvatar, setAiAvatar] = useState<string>(() => localStorage.getItem('nexus_ai_avatar') || 'https://api.dicebear.com/7.x/bottts/svg?seed=Aneka');
  const [language, setLanguage] = useState<string>(() => localStorage.getItem('nexus_language') || 'zh');
  const [fontFamily, setFontFamily] = useState<string>(() => localStorage.getItem('nexus_font_family') || 'Inter');

  // Persist User Settings
  useEffect(() => { localStorage.setItem('nexus_user_name', userName); }, [userName]);
  useEffect(() => { localStorage.setItem('nexus_ai_name', aiName); }, [aiName]);
  useEffect(() => { localStorage.setItem('nexus_user_avatar', userAvatar); }, [userAvatar]);
  useEffect(() => { localStorage.setItem('nexus_ai_avatar', aiAvatar); }, [aiAvatar]);
  useEffect(() => { localStorage.setItem('nexus_language', language); }, [language]);
  useEffect(() => { localStorage.setItem('nexus_font_family', fontFamily); }, [fontFamily]);

  // Sync i18next with global state language
  useEffect(() => {
    if (language) {
      i18n.changeLanguage(language);
    }
  }, [language, i18n]);

  const [systemPromptPresets, setSystemPromptPresets] = useState<{ id: string; name: string; content: string }[]>([
    { id: '1', name: '默认助手', content: '你是一个专业、简洁的 AI 助手。请务必使用标准的 Markdown 格式进行回复，包括代码块（需指定语言，如 ```javascript）、列表、加粗等。' },
    { id: '2', name: '代码专家', content: '你是一个精通全栈开发的专家。在回答时，请优先提供高质量、可运行的代码示例，并详细解释核心逻辑。' },
    { id: '3', name: '创意写作', content: '你是一个富有想象力的作家。请使用生动、优美的语言进行创作，注重情感表达和细节描写。' }
  ]);

  // Derived todos from all messages in current session
  const todos = messages.flatMap(m => m.todos || []);

  // Sync messages to current session
  useEffect(() => {
    setSessions(prev => prev.map(session => {
      if (session.id === currentSessionId) {
        // Auto-generate title for new sessions based on first message
        let newTitle = session.title;
        if (session.title === '新对话' && messages.length > 0 && messages[0].role === 'user') {
          newTitle = messages[0].content.slice(0, 15) + (messages[0].content.length > 15 ? '...' : '');
        }
        return { ...session, messages, updatedAt: Date.now(), title: newTitle };
      }
      return session;
    }));
  }, [messages, currentSessionId]);

  // Sync current session messages to state when switching sessions
  useEffect(() => {
    const currentSession = sessions.find(s => s.id === currentSessionId);
    if (currentSession) {
      setMessages(currentSession.messages);
    }
  }, [currentSessionId]);

  useEffect(() => {
    if (!isStreaming) {
      const count = messages.reduce((acc, msg) => acc + estimateTokens(msg.content), 0);
      setCurrentTokenCount(count);
    }
  }, [messages, isStreaming]);

  const addLog = (message: string, type: 'info' | 'error' | 'command' = 'info') => {
    setLogs(prev => [...prev, { 
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9), 
      timestamp: Date.now(), 
      message, 
      type 
    }]);
  };

  const clearHistory = () => {
    setMessages([]);
    setCurrentTokenCount(0);
    addLog('上下文已手动清除', 'info');
  };

  const compressMessages = () => {
    if (messages.length === 0) return;
    
    const beforeTokens = messages.reduce((acc, msg) => acc + estimateTokens(msg.content), 0);
    addLog(`正在执行手动上下文压缩... (压缩前: ${beforeTokens} tokens)`, 'info');
    
    let compressedCount = 0;

    // 1. 骨架化所有历史代码块，并截断超长文本 (保留最后一条消息不压缩，以免影响当前阅读)
    let newMessages = messages.map((msg, index) => {
      if (index === messages.length - 1) return msg;
      
      let newContent = msg.content;
      let isModified = false;

      // 压缩代码块
      if (newContent.includes('```')) {
        const originalLength = newContent.length;
        newContent = newContent.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
          const lines = code.split('\n').length;
          if (lines > 15) {
            return `\`\`\`${lang}\n/* [代码块已手动折叠: ${lines}行代码] */\n\`\`\``;
          }
          return match;
        });
        if (newContent.length < originalLength) isModified = true;
      }

      // 截断超长纯文本 (例如长文档翻译的原文)
      if (newContent.length > 1500) {
        newContent = newContent.substring(0, 500) + 
          '\n\n> ***[...中间部分内容过长，已手动截断以释放上下文...]***\n\n' + 
          newContent.substring(newContent.length - 500);
        isModified = true;
      }

      if (isModified) compressedCount++;

      return {
        ...msg,
        content: newContent
      };
    });

    // 2. 如果消息过多，执行 Head + Tail 策略 (保留首条和最后两条)
    if (newMessages.length > 4) {
      const head = newMessages[0];
      const tail = newMessages.slice(-2);
      newMessages = [
        head,
        { 
          id: 'system-compressed-' + Date.now() + Math.random().toString(36).substring(2, 9), 
          role: 'assistant', 
          content: '> ***[系统提示: 中间历史对话已手动压缩释放以节省显存]***', 
          timestamp: Date.now() 
        },
        ...tail
      ];
      compressedCount++;
    }

    if (compressedCount > 0) {
      setMessages(newMessages);
      const afterTokens = newMessages.reduce((acc, msg) => acc + estimateTokens(msg.content), 0);
      addLog(`上下文压缩完成 (处理了 ${compressedCount} 处内容)，压缩后: ${afterTokens} tokens，释放了 ${beforeTokens - afterTokens} tokens`, 'info');
    } else {
      addLog('当前上下文已是最佳状态，无需压缩', 'info');
    }
  };

  const createNewSession = () => {
    const newSession = createInitialSession();
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    setMessages([]);
  };

  const createNewSessionWithAgent = (agentId: string) => {
    // Find or create "Agent 集群" folder
    let folderId = folders.find(f => f.name === 'Agent 集群')?.id;
    if (!folderId) {
      folderId = Date.now().toString() + Math.random().toString(36).substring(2, 9) + '-folder';
      setFolders(prev => [{ id: folderId!, name: 'Agent 集群', isExpanded: true }, ...prev]);
    }

    const agent = agents.find(a => a.id === agentId);
    const title = agent ? `与 ${agent.name} 对话` : '与 Agent 对话';

    const newSession: ChatSession = {
      ...createInitialSession(),
      title,
      activeAgents: [agentId],
      folderId
    };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    setMessages([]);
  };

  const switchSession = (id: string) => {
    if (id !== currentSessionId) {
      setCurrentSessionId(id);
    }
  };

  const updateSessionTitle = (id: string, title: string) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, title } : s));
  };

  const updateSessionAgents = (id: string, agentIds: string[]) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, activeAgents: agentIds } : s));
  };

  const deleteSession = (id: string) => {
    setSessions(prev => {
      const newSessions = prev.filter(s => s.id !== id);
      if (newSessions.length === 0) {
        const newSession = createInitialSession();
        setCurrentSessionId(newSession.id);
        return [newSession];
      }
      if (id === currentSessionId) {
        setCurrentSessionId(newSessions[0].id);
      }
      return newSessions;
    });
    // Clean up associated search groups
    setSearchGroups(prev => prev.filter(g => g.sessionId !== id));
  };

  const batchDeleteSessions = (ids: string[]) => {
    setSessions(prev => {
      const newSessions = prev.filter(s => !ids.includes(s.id));
      if (newSessions.length === 0) {
        const newSession = createInitialSession();
        setCurrentSessionId(newSession.id);
        return [newSession];
      }
      if (ids.includes(currentSessionId)) {
        setCurrentSessionId(newSessions[0].id);
      }
      return newSessions;
    });
    // Clean up associated search groups
    setSearchGroups(prev => prev.filter(g => !g.sessionId || !ids.includes(g.sessionId)));
  };

  const deleteSearchGroup = (id: string) => {
    setSearchGroups(prev => prev.filter(g => g.id !== id));
  };

  const batchDeleteSearchGroups = (ids: string[]) => {
    setSearchGroups(prev => prev.filter(g => !ids.includes(g.id)));
  };

  const createFolder = (name: string) => {
    setFolders(prev => [{ id: Date.now().toString() + Math.random().toString(36).substring(2, 9), name, isExpanded: true }, ...prev]);
  };

  const updateFolder = (id: string, name: string) => {
    setFolders(prev => prev.map(f => f.id === id ? { ...f, name } : f));
  };

  const deleteFolder = (id: string) => {
    setFolders(prev => prev.filter(f => f.id !== id));
    setSessions(prev => prev.map(s => s.folderId === id ? { ...s, folderId: undefined } : s));
  };

  const toggleFolder = (id: string) => {
    setFolders(prev => prev.map(f => f.id === id ? { ...f, isExpanded: !f.isExpanded } : f));
  };

  const moveSessionToFolder = (sessionId: string, folderId?: string) => {
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, folderId } : s));
  };

  const addAgent = (agent: Agent) => {
    setAgents(prev => [...prev, agent]);
  };

  const updateAgent = (id: string, agent: Partial<Agent>) => {
    setAgents(prev => prev.map(a => a.id === id ? { ...a, ...agent } : a));
  };

  const deleteAgent = (id: string) => {
    setAgents(prev => prev.filter(a => a.id !== id));
  };

  const addPreset = (name: string, content: string, id?: string) => {
    setSystemPromptPresets(prev => [...prev, { id: id || (Date.now().toString() + Math.random().toString(36).substring(2, 9)), name, content }]);
  };

  const updatePreset = (id: string, name: string, content: string) => {
    setSystemPromptPresets(prev => prev.map(p => p.id === id ? { ...p, name, content } : p));
  };

  const deletePreset = (id: string) => {
    setSystemPromptPresets(prev => prev.filter(p => p.id !== id));
  };

  const simulateSmbCheck = () => {
    const userMsg: Message = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
      role: 'user',
      content: '/check-smb',
      timestamp: Date.now(),
      mode: 'command'
    };
    
    setMessages(prev => [...prev, userMsg]);
    setIsStreaming(true);
    addLog('执行命令: /check-smb', 'command');

    setTimeout(() => {
      addLog('正在调用系统接口...', 'info');
      setCurrentTokenCount(prev => prev + 15);
    }, 800);

    setTimeout(() => {
      addLog('发现 445 端口未响应', 'error');
      setCurrentTokenCount(prev => prev + 20);
    }, 2000);

    setTimeout(() => {
      addLog('正在生成修复建议...', 'info');
      setCurrentTokenCount(prev => prev + 35);
    }, 3500);

    setTimeout(() => {
      const aiMsg: Message = {
        id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
        role: 'assistant',
        content: 'SMB_REPAIR_CARD',
        timestamp: Date.now(),
        mode: 'command'
      };
      setMessages(prev => [...prev, aiMsg]);
      setIsStreaming(false);
      addLog('修复建议已生成', 'info');
    }, 5000);
  };

  const simulateTest = () => {
    const now = Date.now();
    const mockMessages: Message[] = [
      {
        id: 'm1',
        role: 'user',
        content: '帮我分析一下这个项目的依赖，并尝试升级过时的包。',
        timestamp: now - 60000,
        mode: 'chat'
      },
      {
        id: 'm2',
        role: 'assistant',
        content: '好的，我正在扫描项目目录并检查 package.json。我已经识别出几个可以升级的依赖项。',
        timestamp: now - 50000,
        mode: 'chat',
        thinking: '用户想要升级依赖。我需要：\n1. 读取 package.json\n2. 运行 npm outdated\n3. 逐个分析风险并升级',
        todos: [
          {
            id: 's-todo-1',
            title: '依赖项扫描与风险评估',
            status: 'completed',
            progress: 100,
            description: '已完成对 node_modules 的全量扫描，发现 5 个主要版本过时。',
            steps: [
              { label: '读取 package.json', status: 'completed' },
              { label: '运行依赖审计', status: 'completed' }
            ]
          },
          {
            id: 's-todo-2',
            title: '执行版本升级',
            status: 'working',
            progress: 40,
            description: '正在尝试将 vite 从 v4 升级到 v5，并处理潜在的配置冲突。',
            steps: [
              { label: '备份配置文件', status: 'completed' },
              { label: '执行 npm install vite@latest', status: 'working' },
              { label: '验证构建流程', status: 'pending' }
            ]
          }
        ]
      }
    ];
    setMessages(mockMessages);
    addLog('已加载单体测试模拟数据', 'info');
  };

  const simulateClusterTest = () => {
    const now = Date.now();
    const folderId = now.toString() + '-cluster-folder';
    const newFolder: ChatFolder = {
      id: folderId,
      name: '集群任务：系统重构',
      isExpanded: true,
      isClusterTask: true
    };
    
    setFolders(prev => [newFolder, ...prev]);

    const architectSessionId = Date.now().toString() + Math.random().toString(36).substring(2, 9) + '-arch';
    const uiSessionId = Date.now().toString() + Math.random().toString(36).substring(2, 9) + '-ui';
    const secSessionId = Date.now().toString() + Math.random().toString(36).substring(2, 9) + '-sec';

    const architectSession: ChatSession = {
      id: architectSessionId,
      title: '系统架构规划 (Nexus 架构师)',
      messages: [
        {
          id: 'c-msg-1',
          role: 'user',
          content: '我想开发一个带深色模式的个人博客前端页面，需要用到 React 和 Tailwind CSS。请帮我规划并实现。',
          timestamp: now - 120000,
          mode: 'chat'
        },
        {
          id: 'c-msg-2',
          role: 'assistant',
          agentId: 'nexus-architect',
          content: '我已经为你规划了个人博客的整体架构，并启动了子任务。我们将采用 React + Vite + Tailwind CSS 的技术栈。',
          timestamp: now - 110000,
          mode: 'chat',
          todos: [
            {
              id: 'todo-1',
              title: '基础架构搭建与配置',
              status: 'completed',
              progress: 100,
              description: '初始化 Vite 项目并配置 Tailwind CSS 环境变量。',
              steps: [
                { label: '初始化 Vite 项目', status: 'completed' },
                { label: '安装 Tailwind CSS', status: 'completed' },
                { label: '配置 tailwind.config.js', status: 'completed' }
              ]
            },
            {
              id: 'todo-2',
              title: '前端 UI 组件开发',
              status: 'working',
              progress: 65,
              description: '正在由 @ui-weaver 实现响应式布局和深色模式切换。',
              targetSessionId: uiSessionId,
              steps: [
                { label: '设计深色模式配色方案', status: 'completed' },
                { label: '实现 Header 组件', status: 'completed' },
                { label: '实现文章列表组件', status: 'working' },
                { label: '响应式适配', status: 'pending' }
              ]
            },
            {
              id: 'todo-3',
              title: '安全合规性审查',
              status: 'pending',
              progress: 0,
              description: '待 UI 开发完成后由 @sec-guard 进行代码审计。',
              targetSessionId: secSessionId
            }
          ]
        }
      ],
      updatedAt: Date.now(),
      folderId,
      activeAgents: ['nexus-architect', 'ui-weaver', 'sec-guard']
    };

    const uiSession: ChatSession = {
      id: uiSessionId,
      title: '前端组件实现 (界面编织者)',
      messages: generateClusterMockConversation('ui'),
      updatedAt: Date.now() - 1000,
      folderId,
      activeAgents: ['ui-weaver']
    };

    const secSession: ChatSession = {
      id: secSessionId,
      title: '安全合规审查 (安全卫士)',
      messages: generateClusterMockConversation('security'),
      updatedAt: Date.now() - 2000,
      folderId,
      activeAgents: ['sec-guard']
    };

    setSessions(prev => [architectSession, uiSession, secSession, ...prev]);
    setCurrentSessionId(architectSession.id);
    setMessages(architectSession.messages);
    setIsStreaming(true);
    
    addLog('已加载集群测试模拟数据，并创建任务文件夹', 'info');
  };

  return (
    <GlobalStateContext.Provider value={{
      messages, setMessages,
      logs, setLogs,
      currentTokenCount, setCurrentTokenCount,
      isStreaming, setIsStreaming,
      addLog, simulateSmbCheck, simulateTest, simulateClusterTest, clearHistory, compressMessages,
      sessions, currentSessionId, createNewSession, createNewSessionWithAgent, switchSession, updateSessionTitle, updateSessionAgents, deleteSession, batchDeleteSessions,
      folders, createFolder, updateFolder, deleteFolder, toggleFolder, moveSessionToFolder,
      agents, addAgent, updateAgent, deleteAgent,
      systemPromptPresets, addPreset, updatePreset, deletePreset,
      todos,
      searchGroups, setSearchGroups,
      searchResults, setSearchResults,
      deleteSearchGroup, batchDeleteSearchGroups,
      mcpServers, setMcpServers,
      userName, setUserName,
      aiName, setAiName,
      userAvatar, setUserAvatar,
      aiAvatar, setAiAvatar,
      language, setLanguage,
      fontFamily, setFontFamily
    }}>
      {children}
    </GlobalStateContext.Provider>
  );
};
