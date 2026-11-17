export const HISTORY_LIMIT = 20;

// Normalize a sync result into a compact, bounded history record.
export function createHistoryEntry(status, trigger = "manual", at = new Date().toISOString()) {
  const counts = status?.counts;
  return {
    at,
    ok: status?.ok === true,
    trigger: trigger === "automatic" ? "automatic" : "manual",
    message: String(status?.message || (status?.ok ? "Synkronisering gennemført." : "Synkronisering fejlede.")).slice(0, 240),
    ...(status?.code ? { code: String(status.code).slice(0, 12) } : {}),
    ...(counts && typeof counts === "object" ? {
      counts: {
        ...(Number.isFinite(Number(counts.lessons)) ? { lessons: Number(counts.lessons) || 0 } : {}),
        created: Number(counts.created) || 0,
        updated: Number(counts.updated) || 0,
        deleted: Number(counts.deleted) || 0,
        ...(Number.isFinite(Number(counts.unchanged)) ? { unchanged: Number(counts.unchanged) || 0 } : {})
      }
    } : {})
  };
}

// Keep only well-formed recent entries and enforce a safe storage limit.
export function appendHistory(history, entry, limit = HISTORY_LIMIT) {
  const previous = Array.isArray(history) ? history.filter(item => item && typeof item.at === "string" && typeof item.ok === "boolean") : [];
  const safeLimit = Math.max(1, Math.min(100, Math.floor(Number(limit) || HISTORY_LIMIT)));
  return [entry, ...previous].slice(0, safeLimit);
}
