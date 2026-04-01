import fs from 'fs';
import path from 'path';
import { SafeExtractor } from '../src/agent/memory/MemoryModelClient';

type ParsedMemory = {
  type: string;
  span: string;
  resolvedText?: string;
  sourceText?: string;
  importance?: number;
  confidence?: number;
};

async function run() {
  const inputPath = path.join(process.cwd(), 'log', 'memory_model_raw_outputs.json');
  const outPath = path.join(process.cwd(), 'log', 'memory_ab_experiment_results.json');

  if (!fs.existsSync(inputPath)) {
    console.error('Input file not found:', inputPath);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(inputPath, 'utf-8')) as any[];
  const thresholds = [0.6, 0.65, 0.7, 0.75];
  const results: Record<string, any> = {};

  for (const t of thresholds) {
    const summary: any = { threshold: t, totalMessages: raw.length, totalParsedRelaxed: 0, totalAcceptedRelaxed: 0, totalParsedMerged: 0, totalAcceptedMerged: 0, perMessage: [] };

    for (const rec of raw) {
      const parsedRelaxed = Array.isArray(rec.debug?.parsedRelaxed) ? rec.debug.parsedRelaxed : [];
      const mergedUnique = Array.isArray(rec.debug?.mergedUnique) ? rec.debug.mergedUnique : [];

      const normalize = (arr: ParsedMemory[]) => arr.map(p => ({ ...p, importance: typeof p.importance === 'number' ? p.importance : (typeof (p as any).confidence === 'number' ? (p as any).confidence : 0.75) }));
      const pr = normalize(parsedRelaxed as ParsedMemory[]);
      const mu = normalize(mergedUnique as ParsedMemory[]);

      const preview = new (SafeExtractor as any)();
      const prResults = pr.map(p => {
        const v = typeof (preview as any).validate === 'function' ? (preview as any).validate(p, { minImportance: t, rejectInterrogative: true }) : { valid: true };
        return { candidate: p, valid: v.valid, reason: v.reason || null };
      });
      const acceptedPr = prResults.filter(r => r.valid).map(r => r.candidate);

      const preview2 = new (SafeExtractor as any)();
      const muResults = mu.map(p => {
        const v = typeof (preview2 as any).validate === 'function' ? (preview2 as any).validate(p, { minImportance: t, rejectInterrogative: true }) : { valid: true };
        return { candidate: p, valid: v.valid, reason: v.reason || null };
      });
      const acceptedMu = muResults.filter(r => r.valid).map(r => r.candidate);

      summary.totalParsedRelaxed += pr.length;
      summary.totalAcceptedRelaxed += acceptedPr.length;
      summary.totalParsedMerged += mu.length;
      summary.totalAcceptedMerged += acceptedMu.length;

      summary.perMessage.push({
        index: rec.index,
        parsedRelaxedCount: pr.length,
        acceptedRelaxedCount: acceptedPr.length,
        acceptedRelaxed: acceptedPr,
        rejectedRelaxed: prResults.filter(r => !r.valid).map(r => ({ candidate: r.candidate, reason: r.reason })),
        parsedMergedCount: mu.length,
        acceptedMergedCount: acceptedMu.length,
        acceptedMerged: acceptedMu,
        rejectedMerged: muResults.filter(r => !r.valid).map(r => ({ candidate: r.candidate, reason: r.reason })),
      });
    }

    results[t] = summary;
  }

  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log('Wrote A/B results to', outPath);
  for (const t of Object.keys(results)) {
    const s = results[Number(t)];
    console.log(`Threshold ${t}: parsedRelaxed=${s.totalParsedRelaxed}, acceptedRelaxed=${s.totalAcceptedRelaxed}, parsedMerged=${s.totalParsedMerged}, acceptedMerged=${s.totalAcceptedMerged}`);
  }
}

run().catch(e => { console.error(e); process.exit(1); });
