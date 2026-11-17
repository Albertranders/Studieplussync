// Holder styr på kalenderændringer, der er bekræftet af Google under en synkronisering.
export function createSyncProgress() {
  const counts = { created: 0, updated: 0, deleted: 0 };
  return {
    record(type) {
      if (Object.hasOwn(counts, type)) counts[type] += 1;
    },
    snapshot() {
      return { ...counts };
    }
  };
}

// Gør delvise ændringer tydelige, når et senere Google-kald fejler.
export function addPartialProgressToStatus(status, progress = {}) {
  const counts = {
    created: Math.max(0, Number(progress.created) || 0),
    updated: Math.max(0, Number(progress.updated) || 0),
    deleted: Math.max(0, Number(progress.deleted) || 0)
  };
  const total = counts.created + counts.updated + counts.deleted;
  if (total === 0) return status;

  const summary = `${counts.created} nye, ${counts.updated} ændrede og ${counts.deleted} slettede`;
  const previousDetail = status?.detail ? `${status.detail} ` : "";
  return {
    ...status,
    partial: true,
    message: `${status?.message || "Synkroniseringen fejlede."} ${total} ændringer blev gennemført før fejlen (${summary}).`,
    detail: `${previousDetail}Kalenderen kan derfor være delvist opdateret. Kør synkronisering igen for at afstemme kalenderen.`,
    counts: { lessons: 0, ...counts, unchanged: 0 }
  };
}
