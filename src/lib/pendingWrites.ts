const pendingWrites = new Map<string, { originalContent: string; newContent: string }>();

export function getPendingWrite(path: string): { originalContent: string; newContent: string } | undefined {
  return pendingWrites.get(path);
}

export function setPendingWrite(path: string, originalContent: string, newContent: string): void {
  const existing = pendingWrites.get(path);
  if (existing) {
    pendingWrites.set(path, { originalContent: existing.originalContent, newContent });
  } else {
    pendingWrites.set(path, { originalContent, newContent });
  }
}

export function clearPendingWrite(path: string): void {
  pendingWrites.delete(path);
}

export function hasPendingWrite(path: string): boolean {
  return pendingWrites.has(path);
}

export function getAllPendingWrites(): Map<string, { originalContent: string; newContent: string }> {
  return new Map(pendingWrites);
}

export function clearAllPendingWrites(): void {
  pendingWrites.clear();
}
