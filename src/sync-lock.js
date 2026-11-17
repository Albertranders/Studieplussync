// Prevent overlapping syncs in the extension service worker.
export function createSyncLock() {
  let locked = false;

  return {
    tryAcquire() {
      // Return null when another sync owns the lock; otherwise return an idempotent release function.
      if (locked) return null;
      locked = true;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        locked = false;
      };
    },
    get isLocked() {
      return locked;
    }
  };
}
