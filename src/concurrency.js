// Kør en opgave pr. element med højst `limit` ad gangen. Ved den første fejl startes ingen nye
// opgaver; dem, der allerede kører, gøres færdige, og fejlen kastes bagefter.
export async function runWithLimit(items, limit, worker) {
  const queue = [...items];
  let failure = null;
  async function lane() {
    while (!failure && queue.length) {
      const item = queue.shift();
      try {
        await worker(item);
      } catch (error) {
        failure ??= { error };
      }
    }
  }
  const lanes = Math.min(Math.max(1, Math.floor(Number(limit)) || 1), queue.length);
  await Promise.all(Array.from({ length: lanes }, lane));
  if (failure) throw failure.error;
}
