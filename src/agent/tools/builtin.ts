import { invoke } from '@tauri-apps/api/core';
import { setPendingWrite, getPendingWrite } from '../../lib/pendingWrites';
import {
  ToolDefinition,
  ToolExecutionResult,
  BuiltinToolConfig,
  DEFAULT_BUILTIN_TOOL_CONFIG,
  FetchResult,
} from './types';
import { ToolRegistry, createTool } from './ToolRegistry';
import { fetchMemoryManager } from '../memory';

export function initializeBuiltinTools(config: Partial<BuiltinToolConfig> = {}): void {
  const finalConfig = { ...DEFAULT_BUILTIN_TOOL_CONFIG, ...config };

  if (finalConfig.searchEnabled) {
    ToolRegistry.register(createWebSearchTool());
    ToolRegistry.register(createWebExtractTool());
    ToolRegistry.register(createWebCrawlTool());
    ToolRegistry.register(createWebMapTool());
  }

  if (finalConfig.filesystemEnabled) {
    ToolRegistry.register(createReadFileTool());
    ToolRegistry.register(createWriteFileTool(finalConfig));
    ToolRegistry.register(createListDirectoryTool());
  }

  if (finalConfig.shellEnabled) {
    ToolRegistry.register(createExecuteShellTool(finalConfig));
  }

  if (finalConfig.networkEnabled) {
    ToolRegistry.register(createFetchUrlTool());
  }

  ToolRegistry.register(createCalculateTool());
  ToolRegistry.register(createGetCurrentTimeTool());
}

interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
  raw_content?: string;
}

interface TavilySearchResponse {
  results: TavilySearchResult[];
  query: string;
  answer?: string;
  images?: string[];
  response_time: number;
}

async function searchWithTavily(query: string, maxResults: number): Promise<TavilySearchResponse> {
  const tavilyApiKey = localStorage.getItem('nexus_tavily_api_key');
  const tavilySearchDepth = localStorage.getItem('nexus_tavily_search_depth') || 'basic';
  const tavilyIncludeAnswer = localStorage.getItem('nexus_tavily_include_answer') === 'true';

  if (!tavilyApiKey) {
    throw new Error('Tavily API Key not configured');
  }

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: tavilyApiKey,
      query,
      max_results: Math.min(maxResults, 20),
      search_depth: tavilySearchDepth,
      include_answer: tavilyIncludeAnswer,
    }),
  });

  if (!response.ok) {
    throw new Error(`Tavily API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function createWebSearchTool(): ToolDefinition {
  return createTool({
    name: 'web_search',
    description: `Search the web for current information. Returns a list of search results with titles, URLs, and snippets.

IMPORTANT: Write concise, natural search queries like a human would. 
- Use 2-4 keywords maximum, focusing on the core topic
- Do NOT include year numbers unless specifically asked about a specific year
- Do NOT stack multiple similar keywords
- Examples of good queries: "Python教程", "北京天气", "iPhone价格"
- Examples of bad queries: "2026年 北京 天气 预报 明天 后天"

**注意**：如果用户消息中包含 URL 或 URL 占位符（如 \`__URL_PLACEHOLDER_1__\`），请使用 \`fetch_url\` 工具获取网页内容，而不是 \`web_search\`。`,
    category: 'network',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query (2-4 keywords, natural language)',
        },
        max_results: {
          type: 'integer',
          description: 'Maximum number of results to return (default: 5)',
          default: 5,
          minimum: 1,
          maximum: 20,
        },
      },
      required: ['query'],
    },
    execute: async (params): Promise<ToolExecutionResult> => {
      try {
        const query = params.query as string;
        const searchEngine = localStorage.getItem('nexus_search_engine') || 'auto';
        const tavilyApiKey = localStorage.getItem('nexus_tavily_api_key');
        const maxResults = (params.max_results as number) || 5;

        console.log(`[web_search] Query: "${query}", Engine: "${searchEngine}"`);

        const shouldUseTavily = (searchEngine === 'tavily' || (searchEngine === 'auto' && tavilyApiKey));
        if (shouldUseTavily && tavilyApiKey) {
          try {
            console.log('[web_search] Using Tavily SDK');
            const tavilyResponse = await searchWithTavily(query, maxResults);
            
            const formattedResults = tavilyResponse.results.map(r => ({
              title: r.title,
              url: r.url,
              snippet: r.content,
              score: r.score,
            }));

            let output = JSON.stringify(formattedResults, null, 2);
            
            if (tavilyResponse.answer) {
              output = `AI Answer: ${tavilyResponse.answer}\n\nSearch Results:\n${output}`;
            }

            return {
              success: true,
              output,
              metadata: { 
                resultCount: formattedResults.length, 
                query, 
                source: 'tavily',
                answer: tavilyResponse.answer,
                responseTime: tavilyResponse.response_time
              },
            };
          } catch (tavilyError) {
            console.warn('[web_search] Tavily failed, falling back to backend:', tavilyError);
          }
        }

        console.log('[web_search] Using backend search');
        const results = await invoke<{ results: Array<{ title: string; url: string; snippet: string }>; source?: string }>('search', {
          query,
          engine: searchEngine === 'tavily' ? 'auto' : searchEngine,
        });

        console.log(`[web_search] Results from backend:`, results);
        const limitedResults = results.results.slice(0, maxResults);

        return {
          success: true,
          output: JSON.stringify(limitedResults, null, 2),
          metadata: { resultCount: limitedResults.length, query: query, source: results.source },
        };
      } catch (error) {
        return {
          success: false,
          output: '',
          error: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
      }
    },
  });
}

function createWebExtractTool(): ToolDefinition {
  return createTool({
    name: 'web_extract',
    description: `Extract content from web pages. Returns the cleaned and parsed content from the given URLs.

Use this tool when you need to:
- Get the full content of a web page
- Extract text from specific URLs
- Retrieve structured content from articles or documentation`,
    category: 'network',
    parameters: {
      type: 'object',
      properties: {
        urls: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of URLs to extract content from (max 20)',
        },
        format: {
          type: 'string',
          description: 'Output format: "markdown" or "text"',
          enum: ['markdown', 'text'],
          default: 'markdown',
        },
        include_images: {
          type: 'boolean',
          description: 'Include images extracted from the URLs',
          default: false,
        },
      },
      required: ['urls'],
    },
    execute: async (params): Promise<ToolExecutionResult> => {
      try {
        const tavilyApiKey = localStorage.getItem('nexus_tavily_api_key');
        
        if (!tavilyApiKey) {
          return {
            success: false,
            output: '',
            error: 'Tavily API Key not configured. Please configure it in Settings.',
          };
        }

        const urls = params.urls as string[];
        const format = (params.format as string) || 'markdown';
        const includeImages = params.include_images as boolean;

        console.log(`[web_extract] Extracting from ${urls.length} URLs`);

        const response = await fetch('https://api.tavily.com/extract', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            api_key: tavilyApiKey,
            urls,
            format,
            include_images: includeImages,
          }),
        });

        if (!response.ok) {
          throw new Error(`Tavily API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const results = data.results.map((r: any) => ({
          url: r.url,
          content: r.raw_content || r.rawContent,
          images: r.images || [],
        }));

        return {
          success: true,
          output: JSON.stringify(results, null, 2),
          metadata: { 
            urlCount: urls.length,
            successCount: results.length,
            failedCount: (data.failed_results || data.failedResults || []).length
          },
        };
      } catch (error) {
        return {
          success: false,
          output: '',
          error: `Extract failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
      }
    },
  });
}

function createWebCrawlTool(): ToolDefinition {
  return createTool({
    name: 'web_crawl',
    description: `Crawl a website starting from a URL and extract content from multiple pages.

Use this tool when you need to:
- Crawl multiple pages of a website
- Extract content following links
- Get structured content from documentation sites`,
    category: 'network',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The starting URL to crawl',
        },
        max_depth: {
          type: 'integer',
          description: 'Maximum crawl depth (default: 1)',
          default: 1,
          minimum: 1,
          maximum: 5,
        },
        max_breadth: {
          type: 'integer',
          description: 'Maximum number of links to follow per page (default: 20)',
          default: 20,
        },
        limit: {
          type: 'integer',
          description: 'Total number of pages to crawl (default: 50)',
          default: 50,
        },
        instructions: {
          type: 'string',
          description: 'Natural language instructions for what to look for',
        },
      },
      required: ['url'],
    },
    execute: async (params): Promise<ToolExecutionResult> => {
      try {
        const tavilyApiKey = localStorage.getItem('nexus_tavily_api_key');
        
        if (!tavilyApiKey) {
          return {
            success: false,
            output: '',
            error: 'Tavily API Key not configured. Please configure it in Settings.',
          };
        }

        const url = params.url as string;
        const maxDepth = (params.max_depth as number) || 1;
        const maxBreadth = (params.max_breadth as number) || 20;
        const limit = (params.limit as number) || 50;
        const instructions = params.instructions as string | undefined;

        console.log(`[web_crawl] Crawling ${url} with depth ${maxDepth}`);

        const response = await fetch('https://api.tavily.com/crawl', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            api_key: tavilyApiKey,
            url,
            max_depth: maxDepth,
            max_breadth: maxBreadth,
            limit,
            instructions,
          }),
        });

        if (!response.ok) {
          throw new Error(`Tavily API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const results = data.results.map((r: any) => ({
          url: r.url,
          content: r.raw_content || r.rawContent,
          images: r.images || [],
        }));

        return {
          success: true,
          output: JSON.stringify(results, null, 2),
          metadata: { 
            baseUrl: url,
            pageCount: results.length,
            responseTime: data.response_time || data.responseTime
          },
        };
      } catch (error) {
        return {
          success: false,
          output: '',
          error: `Crawl failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
      }
    },
  });
}

function createWebMapTool(): ToolDefinition {
  return createTool({
    name: 'web_map',
    description: `Discover all URLs on a website. Returns a list of URLs found on the site.

Use this tool when you need to:
- Map out the structure of a website
- Find all available pages
- Discover documentation pages`,
    category: 'network',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The starting URL to map',
        },
        max_depth: {
          type: 'integer',
          description: 'Maximum mapping depth (default: 1)',
          default: 1,
          minimum: 1,
          maximum: 5,
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of URLs to discover (default: 50)',
          default: 50,
        },
        instructions: {
          type: 'string',
          description: 'Natural language instructions for what types of URLs to look for',
        },
      },
      required: ['url'],
    },
    execute: async (params): Promise<ToolExecutionResult> => {
      try {
        const tavilyApiKey = localStorage.getItem('nexus_tavily_api_key');
        
        if (!tavilyApiKey) {
          return {
            success: false,
            output: '',
            error: 'Tavily API Key not configured. Please configure it in Settings.',
          };
        }

        const url = params.url as string;
        const maxDepth = (params.max_depth as number) || 1;
        const limit = (params.limit as number) || 50;
        const instructions = params.instructions as string | undefined;

        console.log(`[web_map] Mapping ${url} with depth ${maxDepth}`);

        const response = await fetch('https://api.tavily.com/map', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            api_key: tavilyApiKey,
            url,
            max_depth: maxDepth,
            limit,
            instructions,
          }),
        });

        if (!response.ok) {
          throw new Error(`Tavily API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        return {
          success: true,
          output: JSON.stringify(data.results, null, 2),
          metadata: { 
            baseUrl: url,
            urlCount: data.results.length,
            responseTime: data.response_time || data.responseTime
          },
        };
      } catch (error) {
        return {
          success: false,
          output: '',
          error: `Map failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
      }
    },
  });
}

function createReadFileTool(): ToolDefinition {
  return createTool({
    name: 'read_file',
    description: 'Read the contents of a file from the local filesystem. This tool has no directory restrictions and can read from any path. If MCP read_file fails due to directory restrictions, use this tool instead.',
    category: 'filesystem',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The absolute path to the file to read',
        },
        encoding: {
          type: 'string',
          description: 'File encoding (default: utf-8)',
          default: 'utf-8',
          enum: ['utf-8', 'base64'],
        },
      },
      required: ['path'],
    },
    execute: async (params): Promise<ToolExecutionResult> => {
      try {
        const pending = getPendingWrite(params.path as string);
        if (pending) {
          return {
            success: true,
            output: pending.newContent,
            metadata: { size: pending.newContent.length },
          };
        }

        const result = await invoke<{ content: string; size: number }>('read_file', {
          path: params.path,
          encoding: params.encoding || 'utf-8',
        });

        return {
          success: true,
          output: result.content,
          metadata: { size: result.size },
        };
      } catch (error) {
        return {
          success: false,
          output: '',
          error: `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
      }
    },
  });
}

function createWriteFileTool(config: BuiltinToolConfig): ToolDefinition {
  return createTool({
    name: 'write_file',
    description: 'Write content to a file on the local filesystem. Creates the file if it does not exist, overwrites if it does. This tool has no directory restrictions and can write to any path. If MCP write_file fails due to directory restrictions, use this tool instead.',
    category: 'filesystem',
    requiresAuth: true,
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The absolute path where the file should be written',
        },
        content: {
          type: 'string',
          description: 'The content to write to the file',
        },
        encoding: {
          type: 'string',
          description: 'File encoding (default: utf-8)',
          default: 'utf-8',
          enum: ['utf-8', 'base64'],
        },
      },
      required: ['path', 'content'],
    },
    execute: async (params): Promise<ToolExecutionResult> => {
      try {
        if (config.allowedPaths && config.allowedPaths.length > 0) {
          const isAllowed = config.allowedPaths.some((allowed) =>
            (params.path as string).startsWith(allowed)
          );
          if (!isAllowed) {
            return {
              success: false,
              output: '',
              error: `Path "${params.path}" is not in the allowed paths list`,
            };
          }
        }

        let originalContent = '';
        const pending = getPendingWrite(params.path as string);
        if (pending) {
          originalContent = pending.originalContent;
        } else {
          try {
            const readResult = await invoke<{ content: string; size: number }>('read_file', {
              path: params.path,
              encoding: 'utf-8',
            });
            originalContent = readResult.content;
          } catch {
            // File doesn't exist yet
          }
        }

        setPendingWrite(params.path as string, originalContent, params.content as string);

        const isNewFile = originalContent.length === 0;

        if (isNewFile) {
          try {
            await invoke('write_file', {
              path: params.path,
              content: params.content,
              encoding: 'utf-8',
            });
          } catch (writeError) {
            console.error('[write_file] Failed to write new file to disk immediately:', writeError);
          }
        }

        return {
          success: true,
          output: isNewFile
            ? `文件已保存至 ${params.path}`
            : `文件修改已暂存: ${params.path}`,
          metadata: {
            originalContent,
            newContent: params.content,
          },
        };
      } catch (error) {
        return {
          success: false,
          output: '',
          error: `Failed to write file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
      }
    },
  });
}

function createListDirectoryTool(): ToolDefinition {
  return createTool({
    name: 'list_directory',
    description: 'List the contents of a directory on the local filesystem. This tool has no directory restrictions and can list any path. If MCP list_directory fails due to directory restrictions, use this tool instead.',
    category: 'filesystem',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The absolute path to the directory to list',
        },
      },
      required: ['path'],
    },
    execute: async (params): Promise<ToolExecutionResult> => {
      try {
        const result = await invoke<{ entries: Array<{ name: string; is_dir: boolean; size: number }> }>('list_directory', {
          path: params.path,
        });

        return {
          success: true,
          output: JSON.stringify(result.entries, null, 2),
          metadata: { entryCount: result.entries.length },
        };
      } catch (error) {
        return {
          success: false,
          output: '',
          error: `Failed to list directory: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
      }
    },
  });
}

function createExecuteShellTool(config: BuiltinToolConfig): ToolDefinition {
  return createTool({
    name: 'execute_shell',
    description: 'Execute a shell command on the local system. Use with caution.',
    category: 'system',
    requiresAuth: true,
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The command to execute',
        },
        args: {
          type: 'array',
          items: { type: 'string' },
          description: 'Command arguments',
        },
        timeout: {
          type: 'integer',
          description: 'Timeout in milliseconds (default: 30000)',
          default: 30000,
          maximum: 120000,
        },
      },
      required: ['command'],
    },
    execute: async (params): Promise<ToolExecutionResult> => {
      try {
        const command = params.command as string;
        
        if (config.blockedCommands) {
          const isBlocked = config.blockedCommands.some((blocked) =>
            command.toLowerCase().includes(blocked.toLowerCase())
          );
          if (isBlocked) {
            return {
              success: false,
              output: '',
              error: `Command contains blocked pattern: ${command}`,
            };
          }
        }

        const result = await invoke<{ stdout: string; stderr: string; exit_code: number }>('execute_command', {
          command: params.command,
          args: params.args || [],
          timeout: params.timeout || 30000,
        });

        if (result.exit_code !== 0) {
          return {
            success: false,
            output: result.stdout,
            error: `Command exited with code ${result.exit_code}: ${result.stderr}`,
            metadata: { exitCode: result.exit_code, stderr: result.stderr },
          };
        }

        return {
          success: true,
          output: result.stdout || 'Command executed successfully (no output)',
          metadata: { exitCode: result.exit_code },
        };
      } catch (error) {
        return {
          success: false,
          output: '',
          error: `Failed to execute command: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
      }
    },
  });
}

function createFetchUrlTool(): ToolDefinition {
  return createTool({
    name: 'fetch_url',
    description: `获取网页或 PDF 文档内容并提取正文。

**重要：URL 处理规则**
- URL 必须使用用户提供的原始 URL，不做任何修改
- 禁止对 URL 进行：解码、修改路径、替换关键词、重新拼接
- 如果用户消息中包含 URL 占位符（如 __URL_PLACEHOLDER_1__），必须原样使用该占位符
- 后端会自动处理 URL 编码，无需前端干预

支持的内容类型：
- HTML 网页：自动提取正文，去除广告、导航等噪音
- PDF 文档：提取文本内容

用于：
- 获取网页的主要文本内容
- 阅读文章、博客、文档等
- 提取网页核心信息
- 读取 PDF 文档内容

**自动分块**：
- 当内容超过 8000 字符时，自动分块返回完整内容
- 每块约 4000 字符，在句子边界处切分
- 所有内容块用分隔线连接，一次性返回

**缓存机制**：
- 默认启用缓存，相同 URL 30 分钟内不会重复请求
- 使用 force_refresh: true 可强制刷新缓存`,
    category: 'network',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: '要获取的网页或 PDF URL。必须是用户提供的原始 URL 或 URL 占位符，禁止任何修改。',
        },
        use_cache: {
          type: 'boolean',
          description: '是否使用缓存（默认 true）',
          default: true,
        },
        force_refresh: {
          type: 'boolean',
          description: '是否强制刷新缓存（默认 false）',
          default: false,
        },
        render_js: {
          type: 'boolean',
          description: '是否启用 JS 渲染（用于 SPA 页面，默认 false）',
          default: false,
        },
      },
      required: ['url'],
    },
    execute: async (params): Promise<ToolExecutionResult> => {
      try {
        console.log('[fetch_url] Invoking with params:', params);
        const result = await invoke<FetchResult>('fetch_url', {
          url: params.url,
          options: {
            use_cache: params.use_cache,
            force_refresh: params.force_refresh,
            render_js: params.render_js,
          },
        });
        console.log('[fetch_url] Result:', result);

        if (!result.success) {
          return {
            success: false,
            output: '',
            error: result.error || 'Failed to fetch URL',
          };
        }

        let output = `## ${result.title}\n`;
        output += `来源: ${result.metadata.domain}\n`;
        output += `内容类型: ${result.metadata.content_type}\n`;
        output += `提取方式: ${result.metadata.extraction_method}\n`;
        output += `原文长度: ${result.metadata.length} 字符\n`;

        if (result.metadata.page_count) {
          output += `页数: ${result.metadata.page_count} 页\n`;
        }

        if (result.metadata.chunk_count > 1) {
          output += `分块数量: ${result.metadata.chunk_count} 块\n`;
        }

        if (result.metadata.cached) {
          output += `(来自缓存)\n`;
        }

        output += `\n---\n\n${result.content}`;

        fetchMemoryManager.add({
          url: params.url as string,
          title: result.title,
          content: result.content,
          contentType: result.metadata.content_type,
          pageCount: result.metadata.page_count,
        });

        return {
          success: true,
          output,
          metadata: {
            title: result.title,
            domain: result.metadata.domain,
            contentLength: result.content.length,
            originalLength: result.metadata.length,
            extractionMethod: result.metadata.extraction_method,
            chunkCount: result.metadata.chunk_count,
            contentType: result.metadata.content_type,
            pageCount: result.metadata.page_count,
            cached: result.metadata.cached,
          },
        };
      } catch (error) {
        console.error('[fetch_url] Error:', error);
        console.error('[fetch_url] Error type:', typeof error);
        console.error('[fetch_url] Error constructor:', error?.constructor?.name);
        const errorMessage = error instanceof Error 
          ? error.message 
          : typeof error === 'string' 
            ? error 
            : JSON.stringify(error);
        return {
          success: false,
          output: '',
          error: `Fetch failed: ${errorMessage}`,
        };
      }
    },
  });
}

function createCalculateTool(): ToolDefinition {
  return createTool({
    name: 'calculate',
    description: 'Perform mathematical calculations. Supports basic arithmetic and common math functions.',
    category: 'utility',
    parameters: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'The mathematical expression to evaluate (e.g., "2 + 2", "Math.sqrt(16)", "Math.PI * 2")',
        },
      },
      required: ['expression'],
    },
    execute: async (params): Promise<ToolExecutionResult> => {
      try {
        const expression = params.expression as string;
        
        const safeExpression = expression.replace(/[^0-9+\-*/().Math\s\w]/g, '');
        
        const result = Function(`"use strict"; return (${safeExpression})`)();

        if (typeof result !== 'number' || !isFinite(result)) {
          return {
            success: false,
            output: '',
            error: 'Invalid calculation result',
          };
        }

        return {
          success: true,
          output: String(result),
          metadata: { expression: safeExpression },
        };
      } catch (error) {
        return {
          success: false,
          output: '',
          error: `Calculation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
      }
    },
  });
}

function createGetCurrentTimeTool(): ToolDefinition {
  return createTool({
    name: 'get_current_time',
    description: 'Get the current date and time.',
    category: 'utility',
    parameters: {
      type: 'object',
      properties: {
        timezone: {
          type: 'string',
          description: 'Timezone (e.g., "Asia/Shanghai", "UTC"). Default: local timezone',
        },
        format: {
          type: 'string',
          description: 'Output format: "iso", "locale", or "unix"',
          enum: ['iso', 'locale', 'unix'],
          default: 'locale',
        },
      },
    },
    execute: async (params): Promise<ToolExecutionResult> => {
      try {
        const now = new Date();
        const format = (params.format as string) || 'locale';
        const timezone = params.timezone as string | undefined;

        let output: string;

        switch (format) {
          case 'iso':
            output = now.toISOString();
            break;
          case 'unix':
            output = String(Math.floor(now.getTime() / 1000));
            break;
          case 'locale':
          default:
            output = now.toLocaleString('zh-CN', {
              timeZone: timezone,
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              weekday: 'long',
            });
        }

        return {
          success: true,
          output,
          metadata: { timezone: timezone || 'local' },
        };
      } catch (error) {
        return {
          success: false,
          output: '',
          error: `Failed to get time: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
      }
    },
  });
}

export {
  createWebSearchTool,
  createWebExtractTool,
  createWebCrawlTool,
  createWebMapTool,
  createReadFileTool,
  createWriteFileTool,
  createListDirectoryTool,
  createExecuteShellTool,
  createFetchUrlTool,
  createCalculateTool,
  createGetCurrentTimeTool,
};
