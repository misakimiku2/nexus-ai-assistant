import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM-safe __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// memoryModelClient will be dynamically imported when not in dry run mode

async function loadMessagesFromMd(filePath: string): Promise<string[]> {
  const raw = fs.readFileSync(filePath, 'utf-8');
  // Split by markdown horizontal rule '---' which separates rounds
  const sections = raw.split(/\r?\n---\s*\r?\n/);
  const msgs: string[] = [];

  for (const sec of sections) {
    const lines = sec.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    // skip sections that are just titles or short
    if (lines.length === 0) continue;

    // find first line that looks like a user utterance (not a heading like ## or **)
    for (const line of lines) {
      if (line.startsWith('#')) continue;
      if (line.startsWith('*')) continue;
      if (line.startsWith('```')) break;
      // ignore short markers like '第一轮' or '第二轮'
      if (/^第.轮/.test(line)) continue;
      // ignore lines that are just '用户对话' or similar
      if (/用户对话|候选记忆|##/.test(line)) continue;

      // if the line contains Chinese characters or typical punctuation, accept as message
      if (/[\u4e00-\u9fa5]/.test(line) && line.length >= 6) {
        msgs.push(line);
        break;
      }
    }
  }

  return msgs;
}

async function run() {
  const sampleFile = path.join(__dirname, '..', 'log', '对话以及读取到的记忆_v6.md');
  if (!fs.existsSync(sampleFile)) {
    console.error('Sample file not found:', sampleFile);
    process.exit(1);
  }

  const msgs = await loadMessagesFromMd(sampleFile);
  console.log('Loaded', msgs.length, 'user messages (showing up to 30).');

  // dryRun: set to true to skip calling remote model
  const dryRun = process.env.DRY_RUN === '1';
  const results: any[] = [];

  for (let i = 0; i < Math.min(msgs.length, 30); i++) {
    const msg = msgs[i];
    console.log('---');
    console.log('Message', i + 1, ':', msg.substring(0, 200));
    if (dryRun) continue;

    try {
      const conv = `SOURCE: ${msg}`;
      const mod = await import('../src/agent/memory/MemoryModelClient');
      const client = (mod && mod.memoryModelClient) ? mod.memoryModelClient : null;
      if (!client) {
        console.error('memoryModelClient not available via dynamic import');
        continue;
      }

      // Use debugExtract to capture raw strict/relaxed outputs
      if (typeof client.debugExtract === 'function') {
        const debug = await client.debugExtract(conv, msg);
        results.push({ index: i + 1, message: msg, debug });
        console.log('Parsed:', JSON.stringify(debug.finalSafe || debug.safeRelaxed || debug.safeStrict || [], null, 2));
      } else {
        const parsed = await client.extractCandidates(conv, msg);
        results.push({ index: i + 1, message: msg, debug: { finalSafe: parsed } });
        console.log('Parsed:', JSON.stringify(parsed, null, 2));
      }
    } catch (e) {
      console.error('Extraction error:', e);
    }
  }

  // write raw outputs to log for inspection
  try {
    const outPath = path.join(__dirname, '..', 'log', 'memory_model_raw_outputs.json');
    fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8');
    console.log('Wrote raw outputs to', outPath);
  } catch (e) {
    console.error('Failed to write raw outputs:', e);
  }
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
