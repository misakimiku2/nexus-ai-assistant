import * as fs from 'fs';
import * as path from 'path';

const replacements: Record<string, string> = {
  'bg-[#0a0a0a]': 'bg-zinc-900',
  'bg-zinc-950': 'bg-zinc-900',
  'bg-zinc-900': 'bg-zinc-800',
  'bg-zinc-800': 'bg-zinc-700',
  'bg-zinc-700': 'bg-zinc-600',
  'border-zinc-800': 'border-zinc-700',
  'border-zinc-700': 'border-zinc-600'
};

function processFile(filePath: string) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // We need to replace carefully to avoid double replacement.
  // We can use a regex that matches any of the keys.
  // Escape special characters in keys for regex
  const escapedKeys = Object.keys(replacements).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(escapedKeys.join('|'), 'g');
  
  const newContent = content.replace(regex, match => replacements[match]);
  
  if (content !== newContent) {
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log(`Updated ${filePath}`);
  }
}

function walkDir(dir: string) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walkDir(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      processFile(fullPath);
    }
  }
}

walkDir('./src');
