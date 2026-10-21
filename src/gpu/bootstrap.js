// Runs before the official page. Preserve its OAuth, URL, FlashVars and loading
// flow. Only this game's Ruffle player gets a transparent world compositor.
(() => {
  if (window.top !== window) return;
  const append = Node.prototype.appendChild,
    loaders = new WeakSet();
  Node.prototype.appendChild = function (child) {
    if (
      this.id === 'game-container' &&
      child?.localName === 'ruffle-player' &&
      !loaders.has(child)
    ) {
      // ruffle() creates a new facade on every call in the reviewed engine.
      // Wrap the element's factory, rather than a discarded temporary facade.
      const factory = child.ruffle.bind(child);
      child.ruffle = (...args) => {
        const api = factory(...args),
          load = api.load.bind(api);
        api.load = (options) =>
          load({ ...options, wmode: 'transparent', backgroundExecutionMode: 'mainThread' });
        return api;
      };
      loaders.add(child);
    }
    return append.call(this, child);
  };
  addEventListener(
    'DOMContentLoaded',
    () => {
      const script = document.createElement('script');
      script.type = 'module';
      script.src = '/__launcher_gpu/entry.mjs';
      document.head.appendChild(script);
    },
    { once: true }
  );
})();
