// netlify/functions/new-arrivals.js
// Server-driven "New Arrivals" aggregator.
// Usage:
//   /.netlify/functions/new-arrivals?sources=arcade,4th_of_july,pop_culture&count=9&seed=2025-09-04
// If 'seed' is omitted, it uses today's YYYY-MM-DD (UTC) so the selection is stable per day.

// --- tiny PRNG for seeded shuffle ---
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seededShuffle(array, seedStr) {
  const seed = xmur3(seedStr)();
  const rand = mulberry32(seed);
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// --- normalize to your card/modal schema ---
function normalizeProduct(product) {
  const sizes = Array.isArray(product.sizes)
    ? product.sizes
    : Object.entries(product.sizes || {}).map(([size, price]) => ({
        size: String(size).toUpperCase(),
        price: String(price).startsWith('$') ? String(price) : `$${price}`
      }));
  const colors = Array.isArray(product.colors)
    ? product.colors
        .map(c => (typeof c === 'string' ? c : c?.color || ''))
        .map(s => String(s).trim())
        .filter(Boolean)
    : ['Black'];
  return {
    name:  product.name,
    image: product.image,
    alt:   product.alt,
    sizes,
    colors
  };
}

exports.handler = async (event) => {
  try {
    const qs      = event.queryStringParameters || {};
    const count   = Math.max(1, Math.min(50, parseInt(qs.count || '9', 10)));
    const sources = String(qs.sources || 'arcade,4th_of_july,pop_culture')
                      .split(',').map(s => s.trim()).filter(Boolean);
    const seed    = String(qs.seed || new Date().toISOString().slice(0, 10)); // YYYY-MM-DD

    const host  = event.headers['x-forwarded-host'] || event.headers.host;
    const proto = event.headers['x-forwarded-proto'] || 'https';
    const base  = `${proto}://${host}`;

    const all = [];
    for (const key of sources) {
      try {
        const url = `${base}/data/${encodeURIComponent(key)}.json`;
        const res = await fetch(url, { headers: { 'accept': 'application/json' } });
        if (!res.ok) continue;
        const json = await res.json();
        (json.products || []).forEach(p => all.push(normalizeProduct(p)));
      } catch (e) {
        console.warn('new-arrivals source failed:', key, e.message);
      }
    }

    // De-dupe by name+image
    const seen = new Set();
    const unique = [];
    for (const p of all) {
      const id = `${p.name}::${p.image}`;
      if (!seen.has(id)) { seen.add(id); unique.push(p); }
    }

    // Daily-seeded shuffle → take first N
    const sample = seededShuffle(unique, seed).slice(0, Math.min(count, unique.length));

    return {
      statusCode: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=300, s-maxage=900, stale-while-revalidate=600'
      },
      body: JSON.stringify({ products: sample })
    };
  } catch (err) {
    console.error('new-arrivals error', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Server error' }) };
  }
};
