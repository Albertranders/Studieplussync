// En lille lås, der beskytter mod samtidige synkroniseringer i service worker'en.
export function createSyncLock() {
  let locked = false;

  return {
    tryAcquire() {
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
