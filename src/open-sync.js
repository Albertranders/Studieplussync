// Regler for "synkronisér, når Studie+ åbnes". Ren logik uden browser-API'er (kan testes).

// Skal en åbnet Studie+-fane udløse en synkronisering?
// Nej, hvis automatisk synkronisering er slået fra, Google ikke er forbundet, eller den seneste
// vellykkede synkronisering er så ny, at en ny ikke giver noget (fx ved genindlæsning af fanen).
export function shouldSyncOnOpen({ autoSync, connected, lastSyncAt, now = Date.now(), minAgeMs }) {
  if (!autoSync || !connected) return false;
  const last = Date.parse(lastSyncAt);
  if (Number.isNaN(last)) return true; // aldrig synkroniseret
  return now - last >= minAgeMs;
}

// Fejl, der blot betyder, at siden endnu ikke er klar eller ikke er logget ind. Ved en synkronisering,
// der startede af sig selv, gemmes de hverken i historikken eller som rød markering på ikonet.
const QUIET_CODES = new Set(["E301", "E302", "E303", "E304", "E306"]);
export function isQuietFailure(code) {
  return QUIET_CODES.has(code);
}
