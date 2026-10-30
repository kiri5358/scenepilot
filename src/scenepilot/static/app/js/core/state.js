// One small piece of shared state. Screens read it and ask for changes with update(); subscribers (the renderer) are
// told once per burst of changes.

export function createState(initial) {
  let current = { ...initial };
  const listeners = new Set();
  let queued = false;

  const notify = () => {
    queued = false;
    for (const fn of listeners) fn(current);
  };

  return {
    get: () => current,
    update(patch) {
      current = { ...current, ...patch };
      if (!queued) {
        queued = true;
        queueMicrotask(notify);
      }
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
