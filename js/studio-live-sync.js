// The hosted adapter supplies atomic reads and commits only after this guard.
(function(root) {
  function createStudioLiveSync({read, canApply, generation, apply, onError = () => {}}) {
    let running = false, stopped = false;
    return {
      async refresh() {
        if (running || stopped || !canApply()) return;
        running = true;
        const start = generation();
        try {
          const result = await read();
          if (!stopped && canApply() && generation() === start) await apply(result);
        } catch (error) { if (!stopped) onError(error); }
        finally { running = false; }
      },
      stop() { stopped = true; }
    };
  }
  if (typeof module !== 'undefined') module.exports = {createStudioLiveSync};
  root.createStudioLiveSync = createStudioLiveSync;
})(typeof window === 'undefined' ? globalThis : window);
