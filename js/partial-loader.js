// /js/partial-loader.js
(function () {
  const cache = new Map();
  async function inject(el) {
    const src = el.getAttribute('data-include');
    if (!src) return;
    try {
      let html;
      if (cache.has(src)) {
        html = cache.get(src);
      } else {
        const res = await fetch(src, { credentials: 'same-origin' });
        if (!res.ok) throw new Error(`${src} -> ${res.status}`);
        html = await res.text();
        cache.set(src, html);
      }
      el.outerHTML = html; // replace the placeholder completely
    } catch (e) {
      el.outerHTML = `<!-- include failed: ${src} (${e.message}) -->`;
      console.error('Include failed', src, e);
    }
  }
  document.querySelectorAll('[data-include]').forEach(inject);
})();
