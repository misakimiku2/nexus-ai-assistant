export interface McpPreset {
  id: string;
  name: string;
  description: string;
  command: string;
  args: string[];
  envKeys: string[];
}

export const MCP_PRESETS: McpPreset[] = [
  {
    id: 'filesystem',
    name: 'Filesystem',
    description: '本地文件系统访问（读写文件、目录操作）',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem'],
    envKeys: [],
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'GitHub API（仓库、Issue、PR、搜索）',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    envKeys: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
  },
  {
    id: 'brave-search',
    name: 'Brave Search',
    description: 'Brave 搜索引擎集成',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    envKeys: ['BRAVE_API_KEY'],
  },
  {
    id: 'sqlite',
    name: 'SQLite',
    description: 'SQLite 数据库读写操作',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sqlite'],
    envKeys: [],
  },
  {
    id: 'memory',
    name: 'Memory',
    description: '知识图谱记忆系统（存储和检索信息）',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    envKeys: [],
  },
  {
    id: 'puppeteer',
    name: 'Puppeteer',
    description: '浏览器自动化（导航、截图、执行脚本）',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-puppeteer'],
    envKeys: [],
  },
  {
    id: 'fetch',
    name: 'Fetch',
    description: 'HTTP 请求（获取网页内容和 API 数据）',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-fetch'],
    envKeys: [],
  },
  {
    id: 'sequential-thinking',
    name: 'Sequential Thinking',
    description: '结构化思维推理（逐步分析和解决问题）',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
    envKeys: [],
  },
];
