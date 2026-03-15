import React, { useState, useRef, useEffect } from 'react';
import { Plus, Command } from 'lucide-react';
import { cn } from './lib/utils';
import { Message, SearchResult, AppMode, McpServer, PendingAction, TabType, SearchGroup, ModelProvider } from './types';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { ChatView } from './components/ChatView';
import { ChatInput } from './components/ChatInput';
import { SearchView } from './components/SearchView';
import { TerminalView } from './components/TerminalView';
import { SettingsView } from './components/SettingsView';
import { McpControlCenter } from './components/McpControlCenter';
import { AgentClusterView } from './components/AgentClusterView';
import { ToolPanel } from './components/ToolPanel';
import { AddMcpModal } from './components/AddMcpModal';
import { CanvasWorkspace } from './components/CanvasWorkspace';
import { useGlobalState } from './context/GlobalStateContext';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const { 
    messages, setMessages, 
    logs, setLogs, 
    currentTokenCount, 
    isStreaming, setIsStreaming,
    addLog,
    createNewSessionWithAgent,
    currentSessionId,
    sessions,
    agents,
    setSearchGroups,
    setSearchResults,
    updateSessionTitle,
    fontFamily,
    mcpServers,
    setMcpServers
  } = useGlobalState();

  const [isDarkMode, setIsDarkMode] = useState(() => 
    typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)').matches : true
  );
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  const [input, setInput] = useState('');
  const [isToolPanelOpen, setIsToolPanelOpen] = useState(true);
  const [appMode, setAppMode] = useState<AppMode>('chat');
  const [isWebSearchEnabled, setIsWebSearchEnabled] = useState(false);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);

  // Resizing State
  const [commandChatWidth, setCommandChatWidth] = useState(350);
  const [isResizing, setIsResizing] = useState(false);
  const isResizingRef = useRef(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = React.useCallback((e: MouseEvent) => {
    if (!isResizingRef.current || !chatContainerRef.current) return;
    const rect = chatContainerRef.current.getBoundingClientRect();
    const newWidth = e.clientX - rect.left;
    setCommandChatWidth(Math.min(Math.max(newWidth, 350), 580));
  }, []);

  const handleMouseUp = React.useCallback(() => {
    isResizingRef.current = false;
    setIsResizing(false);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = '';
  }, [handleMouseMove]);

  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    setIsResizing(true);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
  };

  // Settings State
  const [lmStudioUrl, setLmStudioUrl] = useState('http://localhost:1234/v1/chat/completions');
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434/api/chat');
  const [modelName, setModelName] = useState('local-model');
  const [systemPrompt, setSystemPrompt] = useState('你是一个专业、简洁的 AI 助手。请务必使用标准的 Markdown 格式进行回复，包括代码块（需指定语言，如 ```javascript）、列表、加粗等。');
  const [temperature, setTemperature] = useState(0.7);
  const [maxContextLength, setMaxContextLength] = useState(4096);
  const [modelProvider, setModelProvider] = useState<ModelProvider>('lm-studio');

  // MCP State
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  // Add MCP Modal State
  const [isAddMcpModalOpen, setIsAddMcpModalOpen] = useState(false);
  const [newMcpName, setNewMcpName] = useState('');
  const [newMcpCommand, setNewMcpCommand] = useState('');
  const [newMcpArgs, setNewMcpArgs] = useState('');

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Token estimation (1 token ≈ 3 characters)
  const estimateTokens = (text: string) => Math.ceil((text || '').length / 3);

  // Clean content by removing <think> tags for API payload
  const cleanContentForApi = (text: string) => {
    if (!text) return '';
    return text
      .replace(/<think>[\s\S]*?<\/think>/g, '') // Remove closed think blocks
      .replace(/<think>[\s\S]*/g, '')           // Remove unclosed think blocks at the end
      .trim();
  };

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setIsDarkMode(e.matches);
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const toggleDarkMode = () => setIsDarkMode(!isDarkMode);

  const handleStopAI = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsStreaming(false);
      addLog('用户已强制停止 AI 生成', 'info');
    }
  };

  const handleApproveAction = () => {
    if (!pendingAction) return;
    addLog(`[MCP] 用户已授权执行: ${pendingAction.tool}`, 'command');
    setMessages(prev => [...prev, {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
      role: 'assistant',
      content: `已成功执行工具 \`${pendingAction.tool}\`。系统配置已更新。`,
      timestamp: Date.now()
    }]);
    setPendingAction(null);
  };

  const handleRejectAction = () => {
    if (!pendingAction) return;
    addLog(`[MCP] 用户拒绝了执行: ${pendingAction.tool}`, 'error');
    setMessages(prev => [...prev, {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
      role: 'assistant',
      content: `已取消执行工具 \`${pendingAction.tool}\`。`,
      timestamp: Date.now()
    }]);
    setPendingAction(null);
  };

  const handleAddMcpServer = () => {
    if (!newMcpName || !newMcpCommand) return;
    
    const newServer: McpServer = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
      name: newMcpName,
      status: 'disconnected', // 模拟初始状态为未连接，实际中这里会触发 Tauri 后端去启动进程
      tools: [] 
    };
    
    setMcpServers(prev => [...prev, newServer]);
    addLog(`[MCP] 已添加新服务器配置: ${newMcpName} (命令: ${newMcpCommand} ${newMcpArgs})`, 'info');
    
    setIsAddMcpModalOpen(false);
    setNewMcpName('');
    setNewMcpCommand('');
    setNewMcpArgs('');
  };

  const requestAI = async (currentMsgs: Message[], systemPromptToUse: string, originalInput: string, existingAssistantId?: string) => {
    setIsStreaming(true);
    
    // Determine the API URL, Model Name, and API Key to use
    let currentApiUrl = lmStudioUrl;
    let currentModelName = modelName;
    let currentApiKey = '';
    
    const currentSession = sessions.find(s => s.id === currentSessionId);
    if (currentSession && currentSession.activeAgents && currentSession.activeAgents.length > 0) {
      const activeAgent = agents.find(a => a.id === currentSession.activeAgents![0]);
      if (activeAgent) {
        if (activeAgent.apiUrl) currentApiUrl = activeAgent.apiUrl;
        if (activeAgent.modelId) currentModelName = activeAgent.modelId;
        if (activeAgent.apiKey) currentApiKey = activeAgent.apiKey;
        if (activeAgent.systemPrompt) systemPromptToUse = activeAgent.systemPrompt;
      }
    } else {
      if (modelProvider === 'ollama') currentApiUrl = ollamaUrl;
      else if (modelProvider === 'lm-studio') currentApiUrl = lmStudioUrl;
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (currentApiKey) {
      headers['Authorization'] = `Bearer ${currentApiKey}`;
    }

    if (!existingAssistantId) {
      setMessages(currentMsgs);
    }

    if (appMode === 'command') {
      addLog(`执行命令: ${originalInput}`, 'command');
    }

    let searchContext = '';
    if (isWebSearchEnabled && (originalInput.toLowerCase().includes('搜索') || originalInput.toLowerCase().includes('查询') || originalInput.length > 5)) {
      addLog(`[MCP] 调用工具: mcp-server-google-search -> web_search`, 'info');
      setIsSearching(true);
      
      try {
        const queryMatch = originalInput.match(/(?:搜索|查询)\s*(.+)/i);
        const query = queryMatch ? queryMatch[1].trim() : originalInput;
        
        const searchRes = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query })
        });
        
        if (searchRes.ok) {
          const data = await searchRes.json();
          setSearchResults(data.results);
          
          const newGroup: SearchGroup = {
            id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
            query: query,
            results: data.results,
            timestamp: Date.now(),
            sessionId: currentSessionId
          };
          setSearchGroups(prev => [newGroup, ...prev]);
          
          searchContext = `\n\n[Web Search Results]\n${JSON.stringify(data.results)}`;
          addLog(`[MCP] 搜索完成，找到 ${data.results.length} 条结果`, 'info');
        } else {
          addLog(`[MCP] 搜索失败: ${searchRes.statusText}`, 'error');
        }
      } catch (error) {
        addLog(`[MCP] 搜索出错: ${error instanceof Error ? error.message : '未知错误'}`, 'error');
      } finally {
        setIsSearching(false);
      }
    }

    if (searchContext) {
      systemPromptToUse += searchContext;
    }

    if (originalInput.toLowerCase().includes('修改') && (originalInput.toLowerCase().includes('smb') || originalInput.toLowerCase().includes('配置'))) {
      setPendingAction({
        id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
        tool: 'modify_smb_config',
        serverName: 'mcp-server-system-ops',
        description: '修改系统 SMB 共享配置',
        originalInput: originalInput
      });
      setIsStreaming(false);
      return; // Halt execution until authorized
    }

    try {
      const assistantMessageId = existingAssistantId || (Date.now().toString() + Math.random().toString(36).substring(2, 9));
      
      if (existingAssistantId) {
        // Regenerating: prepare the message for a new version
        setMessages(prev => prev.map(m => {
          if (m.id === existingAssistantId) {
            return {
              ...m,
              content: '',
              thinking: '',
              timestamp: Date.now(),
              tokenCount: 0,
              tokenSpeed: 0,
              executionTime: 0,
              agentId: currentSession?.activeAgents?.[0]
            };
          }
          return m;
        }));
      } else {
        setMessages([...currentMsgs, {
          id: assistantMessageId,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          agentId: currentSession?.activeAgents?.[0]
        }]);
      }

      const startTime = performance.now();
      abortControllerRef.current = new AbortController();

      const processThinking = (text: string) => {
        // Clean GLM specific tags and other potential model noise
        const cleanedText = text
          .replace(/<\|begin_of_box\|>/g, '')
          .replace(/<\|end_of_box\|>/g, '')
          .replace(/<\|assistant\|>/g, '')
          .replace(/<\|user\|>/g, '')
          .replace(/<\|system\|>/g, '');

        const thinkStartTag = '<think>';
        const thinkEndTag = '</think>';
        
        const startIndex = cleanedText.indexOf(thinkStartTag);
        const endIndex = cleanedText.indexOf(thinkEndTag);
        
        if (startIndex !== -1) {
          if (endIndex !== -1) {
            const thinking = cleanedText.substring(startIndex + thinkStartTag.length, endIndex).trim();
            const content = (cleanedText.substring(0, startIndex) + cleanedText.substring(endIndex + thinkEndTag.length)).trim();
            return { thinking, content };
          } else {
            const thinking = cleanedText.substring(startIndex + thinkStartTag.length).trim();
            const content = cleanedText.substring(0, startIndex).trim();
            return { thinking, content };
          }
        }
        return { thinking: '', content: cleanedText };
      };

      // --- 超长文本无感滑动窗口处理 ---
      const inputTokens = estimateTokens(originalInput);
      if (inputTokens > maxContextLength * 0.6) {
        addLog(`[系统信息] 检测到超长文本 (约 ${inputTokens} Tokens)，自动启用无感滑动窗口分块处理...`, 'info');
        
        const chunkSizeChars = Math.floor(maxContextLength * 1.5); // 大约占用一半的上下文
        const overlapChars = 200;
        
        const chunkTextWithOverlap = (text: string, chunkSize: number, overlap: number): string[] => {
          const result: string[] = [];
          let i = 0;
          while (i < text.length) {
            let end = Math.min(i + chunkSize, text.length);
            if (end < text.length) {
              const nextPeriod = text.lastIndexOf('。', end);
              const nextNewline = text.lastIndexOf('\n', end);
              const bestBreak = Math.max(nextPeriod, nextNewline);
              if (bestBreak > i + overlap) {
                end = bestBreak + 1;
              }
            }
            result.push(text.slice(i, end));
            i = end - overlap;
            if (i < 0) i = 0;
            if (end >= text.length) break;
          }
          return result;
        };

        const chunks = chunkTextWithOverlap(originalInput, chunkSizeChars, overlapChars);
        let accumulatedContent = '';

        addLog(`[系统进程] 文本已切分为 ${chunks.length} 块，准备串行处理...`, 'command');

        for (let i = 0; i < chunks.length; i++) {
          if (abortControllerRef.current?.signal.aborted) {
            addLog(`[系统进程] 处理被用户中断。`, 'error');
            break;
          }
          
          addLog(`[系统进程] 开始处理第 ${i + 1}/${chunks.length} 块 (长度: ${chunks[i].length} 字符)...`, 'info');
          
          let chunkSystemPrompt = systemPromptToUse;
          if (i > 0) {
            const previousOutput = accumulatedContent.slice(-200);
            chunkSystemPrompt += `\n\n[系统提示] 这是超长文档的第 ${i + 1}/${chunks.length} 部分。为了保证上下文连贯，上一段的结尾输出是：“${previousOutput}”。请继续处理下一段，保持语境连贯，不要重复上一段的内容。**注意：请直接输出正文，严禁使用 \`\`\`markdown 等代码块包裹，严禁输出任何解释性前言或后语。**`;
          } else {
            chunkSystemPrompt += `\n\n[系统提示] 这是超长文档的第 1/${chunks.length} 部分。**注意：请直接输出正文，严禁使用 \`\`\`markdown 等代码块包裹，严禁输出任何解释性前言或后语。**`;
          }

          const apiMessages = [{ role: 'user', content: chunks[i] }];

          const response = await fetch(currentApiUrl, {
            method: 'POST',
            headers,
            signal: abortControllerRef.current.signal,
            body: JSON.stringify({
              model: currentModelName,
              messages: [
                { role: 'system', content: chunkSystemPrompt },
                ...apiMessages
              ],
              temperature: temperature,
              stream: true
            })
          });

          if (!response.ok) throw new Error('无法连接到 API');
          
          const reader = response.body?.getReader();
          const decoder = new TextDecoder();
          
          let previousAccumulatedContent = accumulatedContent;
          let chunkOutput = '';
          let hasMarkdownWrapper = false;
          let wrapperLength = 0;
          
          if (reader) {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              
              const chunkData = decoder.decode(value, { stream: true });
              const lines = chunkData.split('\n');
              
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6);
                  if (data === '[DONE]') break;
                  try {
                    const json = JSON.parse(data);
                    const contentChunk = json.choices[0]?.delta?.content || '';
                    chunkOutput += contentChunk;
                    
                    if (!hasMarkdownWrapper) {
                      const match = chunkOutput.match(/^```(?:markdown|md|text)?\n/i);
                      if (match) {
                        hasMarkdownWrapper = true;
                        wrapperLength = match[0].length;
                      }
                    }

                    let displayChunkOutput = chunkOutput;
                    if (hasMarkdownWrapper) {
                      displayChunkOutput = chunkOutput.substring(wrapperLength);
                      if (displayChunkOutput.endsWith('\n```')) {
                        displayChunkOutput = displayChunkOutput.substring(0, displayChunkOutput.length - 4);
                      } else if (displayChunkOutput.endsWith('```')) {
                        displayChunkOutput = displayChunkOutput.substring(0, displayChunkOutput.length - 3);
                      }
                    }

                    accumulatedContent = previousAccumulatedContent + displayChunkOutput;
                    
                    const { thinking, content } = processThinking(accumulatedContent);
                    
                    setMessages(prev => prev.map(m => 
                      m.id === assistantMessageId ? { ...m, content: content || (thinking ? '' : ''), thinking } : m
                    ));
                  } catch (e) {}
                }
              }
            }
          }
          
          // 确保最终状态正确更新
          let finalDisplayChunkOutput = chunkOutput;
          if (hasMarkdownWrapper) {
            finalDisplayChunkOutput = chunkOutput.substring(wrapperLength);
            if (finalDisplayChunkOutput.endsWith('\n```')) {
              finalDisplayChunkOutput = finalDisplayChunkOutput.substring(0, finalDisplayChunkOutput.length - 4);
            } else if (finalDisplayChunkOutput.endsWith('```')) {
              finalDisplayChunkOutput = finalDisplayChunkOutput.substring(0, finalDisplayChunkOutput.length - 3);
            }
          }
          accumulatedContent = previousAccumulatedContent + finalDisplayChunkOutput;
          
          addLog(`[系统进程] 第 ${i + 1}/${chunks.length} 块处理完成。`, 'info');
        }

        addLog(`[系统进程] 超长文本全部分块处理完毕。`, 'command');

        const endTime = performance.now();
        const executionTime = Math.round(endTime - startTime);
        const { thinking, content } = processThinking(accumulatedContent);
        const tokenCount = estimateTokens(accumulatedContent);
        const tokenSpeed = Math.round((tokenCount / (executionTime / 1000)) * 10) / 10;

        setMessages(prev => prev.map(m => {
          if (m.id === assistantMessageId) {
            const newVersion = {
              content: content,
              thinking,
              timestamp: Date.now(),
              executionTime,
              tokenCount,
              tokenSpeed
            };
            const existingVersions = m.versions || [];
            let updatedVersions = [...existingVersions];
            if (existingAssistantId) {
              updatedVersions.push(newVersion);
            } else {
              updatedVersions = [newVersion];
            }

            return { 
              ...m, 
              content: content,
              thinking,
              executionTime,
              tokenCount,
              tokenSpeed,
              versions: updatedVersions,
              currentVersionIndex: updatedVersions.length - 1
            };
          }
          return m;
        }));

        setIsStreaming(false);
        abortControllerRef.current = null;
        return;
      }

      // --- 8GB VRAM 深度上下文压缩策略 ---
      let apiMessages = currentMsgs.map(m => ({ 
        role: m.role, 
        content: cleanContentForApi(m.content) 
      }));

      let totalTokens = estimateTokens(systemPromptToUse) + apiMessages.reduce((acc, m) => acc + estimateTokens(m.content), 0);
      addLog(`[AI 请求] 开始处理，当前上下文总计: ${totalTokens} tokens (最大限制: ${maxContextLength} tokens)`, 'info');

      if (totalTokens > maxContextLength * 0.85) {
        addLog(`[系统信息] 触发深度上下文压缩策略 (防 OOM)，当前: ${totalTokens} tokens, 阈值: ${Math.floor(maxContextLength * 0.85)} tokens`, 'info');

        // 策略 1: 历史代码块骨架化 (保留当前最新消息)
        apiMessages = apiMessages.map((msg, index) => {
          if (index === apiMessages.length - 1) return msg; // 不压缩当前输入
          if (!msg.content.includes('```')) return msg;

          return {
            ...msg,
            content: msg.content.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
              const lines = code.split('\n').length;
              if (lines > 15) {
                return `\`\`\`${lang}\n/* [代码块已折叠: ${lines}行代码，为节省显存 VRAM 已省略] */\n\`\`\``;
              }
              return match;
            })
          };
        });

        const compressedTokens1 = estimateTokens(systemPromptToUse) + apiMessages.reduce((acc, m) => acc + estimateTokens(m.content), 0);
        if (compressedTokens1 < totalTokens) {
          addLog(`[系统信息] 历史代码块骨架化完成，释放了 ${totalTokens - compressedTokens1} tokens`, 'info');
        }
        totalTokens = compressedTokens1;

        // 策略 2: Head + Tail 滑动窗口 (保留首条指令和最近2条对话)
        if (totalTokens > maxContextLength * 0.85 && apiMessages.length > 3) {
          const head = apiMessages[0];
          const tail = apiMessages.slice(-2);
          apiMessages = [
            head,
            { role: 'system', content: '[...为防止显存溢出，中间历史对话已释放...]' },
            ...tail
          ];
          const compressedTokens2 = estimateTokens(systemPromptToUse) + apiMessages.reduce((acc, m) => acc + estimateTokens(m.content), 0);
          addLog(`[系统信息] 已执行首尾保留策略 (Head+Tail)，压缩后总计: ${compressedTokens2} tokens`, 'info');
          totalTokens = compressedTokens2;
        }
      }
      // -----------------------------------

      addLog(`[AI 请求] 正在请求模型 (${currentModelName})，Temperature: ${temperature}...`, 'info');
      setIsWaitingForResponse(true);
      const response = await fetch(currentApiUrl, {
        method: 'POST',
        headers,
        signal: abortControllerRef.current.signal,
        body: JSON.stringify({
          model: currentModelName,
          messages: [
            { role: 'system', content: systemPromptToUse },
            ...apiMessages
          ],
          temperature: temperature,
          stream: true
        })
      });

      if (!response.ok) {
        setIsWaitingForResponse(false);
        throw new Error('无法连接到 API');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let accumulatedContent = '';
      let isFirstChunk = true;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          if (isFirstChunk) {
            setIsWaitingForResponse(false);
            isFirstChunk = false;
          }

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') break;
              try {
                const json = JSON.parse(data);
                const contentChunk = json.choices[0]?.delta?.content || '';
                accumulatedContent += contentChunk;
                
                const { thinking, content } = processThinking(accumulatedContent);
                
                setMessages(prev => prev.map(m => 
                  m.id === assistantMessageId ? { ...m, content: content || (thinking ? '' : ''), thinking } : m
                ));
              } catch (e) {}
            }
          }
        }
      }

      const endTime = performance.now();
      const executionTime = Math.round(endTime - startTime);
      const { thinking, content } = processThinking(accumulatedContent);
      const tokenCount = estimateTokens(accumulatedContent);
      const tokenSpeed = Math.round((tokenCount / (executionTime / 1000)) * 10) / 10;

      addLog(`[AI 响应] 处理完成，耗时 ${executionTime}ms，生成 ${tokenCount} tokens (${tokenSpeed} t/s)`, 'info');

      setMessages(prev => prev.map(m => {
        if (m.id === assistantMessageId) {
          const newVersion = {
            content: content,
            thinking,
            timestamp: Date.now(),
            executionTime,
            tokenCount,
            tokenSpeed
          };
          
          const existingVersions = m.versions || [
            // If it's the first time we're adding versions, the current state is version 0
            // But wait, if we are regenerating, we should have captured the OLD state before clearing it
            // Let's simplify: always maintain versions
          ];

          // If it's a new message, versions will be empty.
          // If it's a regeneration, we already have versions.
          
          let updatedVersions = [...existingVersions];
          if (existingAssistantId) {
            // It was a regeneration, so we add a new version
            updatedVersions.push(newVersion);
          } else {
            // It was a new message, so this is the first version
            updatedVersions = [newVersion];
          }

          return { 
            ...m, 
            content: content,
            thinking,
            executionTime,
            tokenCount,
            tokenSpeed,
            versions: updatedVersions,
            currentVersionIndex: updatedVersions.length - 1
          };
        }
        return m;
      }));

      // 如果是第一轮对话，根据用户的提问和AI的回答生成标题
      const userMessages = currentMsgs.filter(m => m.role === 'user');
      if (userMessages.length === 1) {
        generateSessionTitle(originalInput, content, currentSessionId);
      }

    } catch (error) {
      console.error(error);
      setIsWaitingForResponse(false);
      setMessages(prev => prev.map(m => 
        m.role === 'assistant' && m.content === '' 
          ? { ...m, content: `错误: 无法连接到 API (${currentApiUrl})。请检查网络连接或 API 配置。` } 
          : m
      ));
      addLog('连接失败: API 不可用。', 'error');
    } finally {
      setIsStreaming(false);
      setIsWaitingForResponse(false);
      abortControllerRef.current = null;
    }
  };

  const generateSessionTitle = async (firstUserMessage: string, firstAssistantMessage: string, sessionId: string) => {
    try {
      let currentApiUrl = lmStudioUrl;
      let currentModelName = modelName;
      let currentApiKey = '';
      
      const currentSession = sessions.find(s => s.id === sessionId);
      if (currentSession && currentSession.activeAgents && currentSession.activeAgents.length > 0) {
        const activeAgent = agents.find(a => a.id === currentSession.activeAgents![0]);
        if (activeAgent) {
          if (activeAgent.apiUrl) currentApiUrl = activeAgent.apiUrl;
          if (activeAgent.modelId) currentModelName = activeAgent.modelId;
          if (activeAgent.apiKey) currentApiKey = activeAgent.apiKey;
        }
      } else {
        if (modelProvider === 'ollama') currentApiUrl = ollamaUrl;
        else if (modelProvider === 'lm-studio') currentApiUrl = lmStudioUrl;
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (currentApiKey) {
        headers['Authorization'] = `Bearer ${currentApiKey}`;
      }

      const response = await fetch(currentApiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: currentModelName,
          messages: [
            { role: 'system', content: '你是一个帮助用户总结对话标题的助手。请根据以下用户的提问和AI的回答，总结出一个能概括讨论内容的对话标题，长度控制在12个字以内。不要包含标点符号、引号或多余的解释。直接输出最终的标题内容。' },
            { role: 'user', content: `用户提问：${firstUserMessage}\n\nAI回答：${firstAssistantMessage}` }
          ],
          temperature: 0.3,
          stream: false
        })
      });

      if (response.ok) {
        const data = await response.json();
        let title = data.choices[0]?.message?.content?.trim();
        if (title) {
          // 移除思考模型可能输出的 <think>...</think> 标签及其内容
          title = title.replace(/<think>[\s\S]*?(<\/think>|$)/gi, '').trim();
          
          // 移除 GLM 等模型可能输出的特殊 token，例如 <|begin_of_box|> 和 <|end_of_box|>
          title = title.replace(/<\|.*?\|>/g, '').trim();
          
          // 移除可能带有的引号、Markdown加粗符号以及“标题：”前缀
          title = title.replace(/^["']|["']$/g, '').replace(/\*\*/g, '').trim();
          title = title.replace(/^(标题：|标题:|Title:\s*)/i, '').trim();
          
          // 兜底截断，防止模型不听话输出过长
          if (title.length > 12) {
            title = title.substring(0, 12);
          }
          
          if (title) {
            updateSessionTitle(sessionId, title);
            addLog(`[系统信息] 已自动生成会话标题: ${title}`, 'info');
          }
        }
      }
    } catch (error) {
      console.error('Failed to generate title:', error);
      addLog(`[系统信息] 自动生成标题失败`, 'error');
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() && !attachedImage) return;

    const userMessage: Message = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
      role: 'user',
      content: input.trim() || (attachedImage ? '[图片]' : ''),
      timestamp: Date.now(),
      mode: appMode
    };

    addLog(`[用户交互] 发送新消息，长度: ${input.trim().length} 字符`, 'info');

    let currentMsgs = [...messages, userMessage];

    const originalInput = input;
    setInput('');
    setAttachedImage(null);

    await requestAI(currentMsgs, systemPrompt, originalInput);
  };

  const handleEditMessage = async (messageId: string, newContent: string) => {
    const msgIndex = messages.findIndex(m => m.id === messageId);
    if (msgIndex === -1) return;

    const msg = messages[msgIndex];

    if (msg.role === 'user') {
      addLog(`[用户交互] 编辑历史消息，重新发起请求`, 'info');
      const updatedUserMessage = { ...msg, content: newContent };
      let currentMsgs = [...messages.slice(0, msgIndex), updatedUserMessage];
      
      await requestAI(currentMsgs, systemPrompt, newContent);
    } else {
      // Edit assistant message - just update content
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: newContent } : m));
      addLog('[用户交互] 已手动编辑 AI 回复', 'info');
    }
  };

  const handleRegenerateMessage = async (messageId: string) => {
    const msgIndex = messages.findIndex(m => m.id === messageId);
    if (msgIndex === -1) return;

    // Find the user prompt before this assistant message
    const historyBefore = messages.slice(0, msgIndex);
    const lastUserMsg = [...historyBefore].reverse().find(m => m.role === 'user');
    
    if (!lastUserMsg) return;

    addLog('[用户交互] 正在重新生成回答...', 'info');
    await requestAI(historyBefore, systemPrompt, lastUserMsg.content, messageId);
  };

  const handleSwitchVersion = (messageId: string, index: number) => {
    setMessages(prev => prev.map(m => {
      if (m.id === messageId && m.versions && m.versions[index]) {
        const version = m.versions[index];
        return {
          ...m,
          content: version.content,
          thinking: version.thinking,
          timestamp: version.timestamp,
          tokenCount: version.tokenCount,
          tokenSpeed: version.tokenSpeed,
          executionTime: version.executionTime,
          currentVersionIndex: index
        };
      }
      return m;
    }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAttachedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className={cn(
      "flex h-screen w-full overflow-hidden transition-colors duration-300",
      isDarkMode ? "dark bg-zinc-900 text-zinc-200" : "bg-[#f5f5f5] text-zinc-800"
    )} style={{ fontFamily }}>
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        isDarkMode={isDarkMode} 
        toggleDarkMode={toggleDarkMode} 
        isExpanded={isSidebarExpanded}
        openSettings={() => setIsSettingsOpen(true)}
      />

      <main className="flex-1 flex flex-col min-w-0 relative overflow-hidden">
        <AnimatePresence>
          {!(activeTab === 'chat' && appMode === 'command') && (
            <motion.div
              key="global-header"
              layout
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="overflow-hidden shrink-0"
            >
              <Header 
                maxContextLength={maxContextLength}
                isToolPanelOpen={isToolPanelOpen}
                setIsToolPanelOpen={setIsToolPanelOpen}
                isSidebarExpanded={isSidebarExpanded}
                setIsSidebarExpanded={setIsSidebarExpanded}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <div className={cn("flex-1 flex flex-col overflow-hidden relative", isDarkMode ? "bg-zinc-800" : "bg-zinc-50")}>
          {activeTab === 'chat' && (
            <div className="h-full flex flex-row w-full overflow-hidden relative">
              <motion.div 
                ref={chatContainerRef}
                layout
                initial={false}
                animate={{ 
                  width: appMode === 'command' ? commandChatWidth : '100%'
                }}
                transition={isResizing ? { duration: 0 } : { duration: 0.3, ease: "easeInOut" }}
                className={cn(
                  "flex flex-col h-full shrink-0 relative",
                  appMode === 'command' && "border-r",
                  isDarkMode ? "border-zinc-700" : "border-zinc-200"
                )}
              >
                {appMode === 'command' && (
                  <div 
                    onMouseDown={startResizing}
                    className={cn(
                      "absolute top-0 right-0 w-1.5 h-full cursor-col-resize z-10 hover:bg-indigo-500/50 transition-colors",
                      isResizing && "bg-indigo-500/50"
                    )}
                    style={{ transform: 'translateX(50%)' }}
                  />
                )}
                <ChatView 
                  pendingAction={pendingAction}
                  handleApproveAction={handleApproveAction}
                  handleRejectAction={handleRejectAction}
                  scrollRef={scrollRef}
                  isDarkMode={isDarkMode}
                  handleEditMessage={handleEditMessage}
                  handleRegenerateMessage={handleRegenerateMessage}
                  handleSwitchVersion={handleSwitchVersion}
                  isWaitingForResponse={isWaitingForResponse}
                  isSearching={isSearching}
                  appMode={appMode}
                  modelName={modelName}
                  isSidebarExpanded={isSidebarExpanded}
                  setIsSidebarExpanded={setIsSidebarExpanded}
                />
                <ChatInput 
                  input={input}
                  setInput={setInput}
                  appMode={appMode}
                  setAppMode={setAppMode}
                  isDarkMode={isDarkMode}
                  attachedImage={attachedImage}
                  setAttachedImage={setAttachedImage}
                  handleSendMessage={handleSendMessage}
                  handleStopAI={handleStopAI}
                  fileInputRef={fileInputRef}
                  handleImageUpload={handleImageUpload}
                  maxContextLength={maxContextLength}
                  isWebSearchEnabled={isWebSearchEnabled}
                  setIsWebSearchEnabled={setIsWebSearchEnabled}
                />
              </motion.div>

              <AnimatePresence>
                {appMode === 'command' && (
                  <CanvasWorkspace 
                    isDarkMode={isDarkMode} 
                    isToolPanelOpen={isToolPanelOpen}
                    setIsToolPanelOpen={setIsToolPanelOpen}
                  />
                )}
              </AnimatePresence>
            </div>
          )}

          <AnimatePresence mode="wait">
            {activeTab === 'search' && (
              <motion.div
                key="search-view"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="flex-1 overflow-hidden"
              >
                <SearchView isDarkMode={isDarkMode} />
              </motion.div>
            )}
            {activeTab === 'terminal' && (
              <motion.div
                key="terminal-view"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2 }}
                className="flex-1 overflow-hidden"
              >
                <TerminalView isDarkMode={isDarkMode} />
              </motion.div>
            )}
            {activeTab === 'mcp' && (
              <motion.div
                key="mcp-view"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="flex-1 overflow-hidden"
              >
                <McpControlCenter 
                  mcpServers={mcpServers}
                  setIsAddMcpModalOpen={setIsAddMcpModalOpen}
                  isDarkMode={isDarkMode}
                />
              </motion.div>
            )}
            {activeTab === 'agents' && (
              <motion.div
                key="agents-view"
                initial={{ opacity: 0, scale: 1.02 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.02 }}
                transition={{ duration: 0.2 }}
                className="flex-1 flex flex-col min-h-0"
              >
                <AgentClusterView 
                  isDarkMode={isDarkMode}
                  onStartChatWithAgent={(agentId) => {
                    createNewSessionWithAgent(agentId);
                    setActiveTab('chat');
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      <SettingsView 
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        isDarkMode={isDarkMode}
        lmStudioUrl={lmStudioUrl}
        setLmStudioUrl={setLmStudioUrl}
        ollamaUrl={ollamaUrl}
        setOllamaUrl={setOllamaUrl}
        modelName={modelName}
        setModelName={setModelName}
        maxContextLength={maxContextLength}
        setMaxContextLength={setMaxContextLength}
        temperature={temperature}
        setTemperature={setTemperature}
        systemPrompt={systemPrompt}
        setSystemPrompt={setSystemPrompt}
        modelProvider={modelProvider}
        setModelProvider={setModelProvider}
        onReset={() => {
          setLmStudioUrl('http://localhost:1234/v1/chat/completions');
          setOllamaUrl('http://localhost:11434/api/chat');
          setModelName('local-model');
          setSystemPrompt('你是一个专业、简洁的 AI 助手。');
          setTemperature(0.7);
          setMaxContextLength(4096);
          setModelProvider('lm-studio');
        }}
      />

      <ToolPanel 
        isOpen={isToolPanelOpen}
        onClose={() => setIsToolPanelOpen(false)}
        isDarkMode={isDarkMode}
        temperature={temperature}
        setTemperature={setTemperature}
        systemPrompt={systemPrompt}
        setSystemPrompt={setSystemPrompt}
      />

      <AddMcpModal 
        isOpen={isAddMcpModalOpen}
        onClose={() => setIsAddMcpModalOpen(false)}
        newMcpName={newMcpName}
        setNewMcpName={setNewMcpName}
        newMcpCommand={newMcpCommand}
        setNewMcpCommand={setNewMcpCommand}
        newMcpArgs={newMcpArgs}
        setNewMcpArgs={setNewMcpArgs}
        onAdd={handleAddMcpServer}
        isDarkMode={isDarkMode}
      />
    </div>
  );
}

