import { Message } from '../types';

export const generateMockConversation = (): Message[] => {
  const now = Date.now();
  
  return [
    {
      id: 'msg-1',
      role: 'user',
      content: '帮我写一个简单的 React 计数器组件，并解释一下 useState 的原理。另外，查一下 React 19 有什么新特性。',
      timestamp: now - 60000,
      mode: 'chat'
    },
    {
      id: 'msg-2',
      role: 'assistant',
      content: '好的，我已经为你编写了 React 计数器组件，并查阅了 React 19 的新特性。',
      timestamp: now - 50000,
      mode: 'chat',
      thinking: `1. 分析用户需求：
- 编写一个简单的 React 计数器组件
- 解释 useState 的原理
- 搜索 React 19 的新特性

2. 执行计划：
- 使用 MCP 搜索工具查询 "React 19 new features"
- 编写计数器组件代码
- 解释 useState 原理
- 结合搜索结果总结 React 19 新特性

3. 正在调用搜索工具...
4. 正在生成代码和解释...`,
      searchResults: [
        {
          title: 'React 19 RC – React',
          url: 'https://react.dev/blog/2024/04/25/react-19',
          snippet: 'React 19 introduces Actions, new hooks like useActionState, useFormStatus, and useOptimistic, as well as the new use API for reading resources in render.'
        },
        {
          title: 'What is new in React 19?',
          url: 'https://vercel.com/blog/react-19',
          snippet: 'React 19 brings Server Components to the stable release, along with Server Actions, Document Metadata, and Asset Loading improvements.'
        }
      ],
      fileEdits: [
        {
          file: 'src/components/Counter.tsx',
          status: 'success',
          diff: `+ import React, { useState } from 'react';
+ 
+ export const Counter: React.FC = () => {
+   const [count, setCount] = useState(0);
+   
+   return (
+     <div className="p-4 border rounded-lg">
+       <p>Current count: {count}</p>
+       <button onClick={() => setCount(c => c + 1)}>Increment</button>
+     </div>
+   );
+ };`
        }
      ]
    },
    {
      id: 'msg-3',
      role: 'assistant',
      content: `### 1. React 计数器组件

我已经为你创建了 \`Counter.tsx\`。

### 2. useState 原理简述

\`useState\` 是 React 的核心 Hook 之一。它的基本原理是：
- **闭包与状态存储**：React 在内部维护了一个状态数组（或链表），每次调用 \`useState\` 都会按顺序读取或初始化对应的状态。
- **触发重新渲染**：当你调用 \`setCount\` 时，React 会将新的状态放入更新队列，并调度一次组件的重新渲染。
- **状态保持**：在下一次渲染时，\`useState\` 会返回最新的状态值，而不是初始值。

### 3. React 19 新特性

根据最新的搜索结果，React 19 带来了许多激动人心的新特性：
- **Actions**：原生支持处理异步表单提交和状态更新。
- **新 Hooks**：引入了 \`useActionState\`、\`useFormStatus\` 和 \`useOptimistic\`。
- **\`use\` API**：可以在渲染过程中读取 Promise 和 Context。
- **Server Components**：服务器组件正式进入稳定版。`,
      timestamp: now - 45000,
      mode: 'chat'
    }
  ];
};

export const generateClusterMockConversation = (type: 'architect' | 'ui' | 'security' = 'architect'): Message[] => {
  const now = Date.now();
  
  if (type === 'architect') {
    return [
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
        content: '我已经为你规划了个人博客的整体架构。我们将采用 React + Vite + Tailwind CSS 的技术栈。\n\n目前进度：\n1. [已完成] 架构规划与目录结构设计\n2. [执行中] 前端 UI 组件开发 (@ui-weaver)\n3. [待开始] 安全合规性审查 (@sec-guard)',
        timestamp: now - 110000,
        mode: 'chat',
        thinking: `1. 需求分析：个人博客前端页面，深色模式。
2. 架构规划：React + Vite + Tailwind CSS。
3. 任务分配：
- 我负责基础架构和配置。
- @ui-weaver 负责 UI 开发。
- @sec-guard 负责安全审查。`,
        fileEdits: [
          {
            file: 'tailwind.config.js',
            status: 'success',
            diff: `  module.exports = {
+   darkMode: 'class',
    content: [
      "./index.html",
      "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
      extend: {},
    },
    plugins: [],
  }`
          }
        ]
      }
    ];
  }

  if (type === 'ui') {
    return [
      {
        id: 'ui-msg-1',
        role: 'assistant',
        agentId: 'ui-weaver',
        content: '架构规划已收到。我已经完成了前端页面的开发，包含深色模式切换功能和响应式布局。',
        timestamp: now - 80000,
        mode: 'chat',
        thinking: `1. 接收任务：实现博客页面和深色模式。
2. 开发步骤：
- 实现深色模式 Context。
- 编写 Header 和文章列表。
3. 执行代码修改...`,
        fileEdits: [
          {
            file: 'src/App.tsx',
            status: 'success',
            diff: `+ import React, { useState, useEffect } from 'react';
+ 
+ export default function App() {
+   const [isDark, setIsDark] = useState(false);
+   
+   useEffect(() => {
+     if (isDark) document.documentElement.classList.add('dark');
+     else document.documentElement.classList.remove('dark');
+   }, [isDark]);
+ 
+   return (
+     <div className="min-h-screen bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 transition-colors">
+       <header className="p-4 border-b dark:border-zinc-700 flex justify-between items-center">
+         <h1 className="text-xl font-bold">My Blog</h1>
+         <button onClick={() => setIsDark(!isDark)} className="p-2 rounded bg-zinc-100 dark:bg-zinc-700">
+           {isDark ? '☀️' : '🌙'}
+         </button>
+       </header>
+       <main className="p-8 max-w-3xl mx-auto">
+         <article className="prose dark:prose-invert">
+           <h2>Hello World</h2>
+           <p>This is my first blog post.</p>
+         </article>
+       </main>
+     </div>
+   );
+ }`
          }
        ]
      }
    ];
  }

  return [
    {
      id: 'sec-msg-1',
      role: 'assistant',
      agentId: 'sec-guard',
      content: '我检查了代码，发现没有明显的安全漏洞。但建议在处理用户输入（如博客评论）时，务必增加 XSS 防护。',
      timestamp: now - 30000,
      mode: 'chat',
      thinking: `1. 审查目标：App.tsx 和 tailwind.config.js
2. 安全检查项：XSS 漏洞、依赖安全。
3. 结论：代码安全，可合并。`
    }
  ];
};
