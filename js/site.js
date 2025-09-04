/* /js/site.js — consolidated (updated) */

/* ----------------------------- includes loader ----------------------------- */
async function loadIncludes() {
  const nodes = Array.from(document.querySelectorAll('[data-include]'));
  if (!nodes.length) return;
  const cache = new Map();
  await Promise.all(nodes.map(async (el) => {
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
      el.outerHTML = html;
    } catch (e) {
      el.outerHTML = `<!-- include failed: ${src} (${e.message}) -->`;
      console.error('Include failed', src, e);
    }
  }));
}

/* ----------------------------- colors (Decap) ------------------------------ */
let COLORS = {};
async function loadColors() {
  try {
    const res = await fetch('/data/colors.json', { credentials: 'same-origin' });
    if (!res.ok) throw new Error(String(res.status));
    const json = await res.json();

    if (Array.isArray(json.colors)) {
      COLORS = Object.fromEntries(
        json.colors
          .filter(c => c && c.name && c.hex)
          .map(c => [String(c.name), String(c.hex)])
      );
    } else if (json && typeof json === 'object') {
      COLORS = {};
      Object.entries(json).forEach(([k, v]) => {
        if (typeof v === 'string' && /^#([0-9a-f]{6})$/i.test(v)) COLORS[k] = v;
      });
    }
  } catch {
    // Fallback: keep hard-coded palette to avoid any breakage
    COLORS = {
      "Army":"#4B5320","Asphalt":"#3E3E3C","Athletic Grey":"#A9A9A9","Atlantic":"#337EA9","Aqua":"#5BC8D1","Autumn":"#C1440E",
      "Baby Blue":"#BFE1EB","Berry":"#9B2D5D","Black":"#101820","Blue Storm":"#748E9A","Brown":"#5C4033","Burnt Orange":"#CC5500",
      "Canvas Red":"#BA2C2F","Cardinal":"#9B2335","Carolina Blue":"#A3C1DA","Charity Pink":"#ED7A9E","Chestnut":"#964B00","Citron":"#F6EB61",
      "Clay":"#B66E41","Columbia Blue":"#C4DDEC","Cool Blue":"#4C6A92","Coral":"#F88379","Dark Grey":"#585E6F","Dark Lavender":"#A592B1",
      "Deep Teal":"#005F5F","Dust":"#E5E4E2","Dusty Blue":"#A2B6C0","Electric Blue":"#3E8EDE","Evergreen":"#115E59","Forest":"#314F3A",
      "Fuchsia":"#C154C1","Gold":"#FDB813","Kelly":"#28A745","Lavender Blue":"#C5CBE1","Lavender Dust":"#C4B6C8","Leaf":"#6D9F4B",
      "Light Blue":"#ADD8E6","Light Violet":"#D6AEDD","Lilac":"#B98EB1","Maize Yellow":"#F4D35E","Marine":"#2A6F9E","Maroon":"#6E2E2A",
      "Mauve":"#D8A39D","Military Green":"#4B5320","Mint":"#AAF0D1","Mustard":"#D6A52D","Navy":"#1A1F71","Natural":"#EDE6D6",
      "New Cocoa":"#A9746E","New Hunter Green":"#355E3B","New Pink Gravel":"#D1A8A4","New Purple Storm":"#836EAA","New Vintage Denim":"#5C6D82","New Vintage Red":"#913144",
      "Ocean Blue":"#5BA8C1","Olive":"#708238","Orange":"#F76300","Orchid":"#CBAACB","Oxblood Black":"#43302E","Peach":"#FFE5B4",
      "Pebble Brown":"#A9746E","Pine":"#4F7160","Pink":"#F4C6D7","Poppy":"#EF4136","Red":"#C8102E","Royal Purple":"#652D90",
      "Rust":"#B7410E","Sage":"#B2AC88","Sand Dune":"#D6BAA3","Silver":"#C0C0C0","Slate":"#708090","Soft Cream":"#F3E4B2",
      "Soft Pink":"#F4D8E4","Spring Green":"#A8DAB5","Steel Blue":"#4682B4","Storm":"#A2A2A1","Strobe":"#F9E79F","Sunset":"#F6A58E",
      "Synthetic Green":"#009879","Tan":"#D2B48C","Teal":"#008080","Team Navy":"#1A2D5A","Team Purple":"#5C4E8A","Terracotta":"#E2725B",
      "Toast":"#D1A26C","True Royal":"#3F4C9A","Turquoise":"#30D5C8","Vintage Black":"#1C1C1C","Vintage Brown":"#8B6D5C","Vintage Navy":"#2C3E50",
      "Vintage White":"#F5F5F0","White":"#FFFFFF","Yellow":"#F6EB61"
    };
  }
}
function getColorHex(name) {
  if (!name) return null;
  const direct = COLORS[name];
  if (direct) return direct;
  const key = String(name).toLowerCase();
  const match = Object.keys(COLORS).find(k => k.toLowerCase() === key);
  return match ? COLORS[match] : null;
}
function colorSlug(name) {
  return String(name).toLowerCase().replace(/\s+/g, '-');
}

/* ------------------------------- theme loader ------------------------------ */
// NEW: small helpers to avoid duplication
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
function renderProductCard(container, product) {
  const article = document.createElement('article');
  article.className = 'product';
  article.dataset.product = JSON.stringify(product);
  article.innerHTML = `
    <img src="${product.image}" alt="${product.alt || product.name || ''}">
    <div class="product-details"><h3>${product.name}</h3></div>
  `;
  container.appendChild(article);
}

async function initTheme() {
  const themeSection = document.querySelector('[data-theme]');
  if (!themeSection) return;
  const container = document.getElementById('product-list');
  if (!container) return;

  const themeKey = themeSection.dataset.theme;

  try {
    if (themeKey === 'new_arrivals') {
      // Server-driven rotation via Netlify Function
      const sources = (themeSection.dataset.sources || 'arcade,4th_of_july,pop_culture').trim();
      const count   = parseInt(themeSection.dataset.count || '8', 10);
      const seed    = new Date().toISOString().slice(0, 10); // daily-stable

      const url = `/.netlify/functions/new-arrivals?sources=${encodeURIComponent(sources)}&count=${count}&seed=${encodeURIComponent(seed)}`;
      const res = await fetch(url, { credentials: 'same-origin' });
      const data = await res.json();

      (data.products || []).forEach(p => renderProductCard(container, normalizeProduct(p)));
      initializeModals();
      return;
    }

    // Default: single-theme JSON (original behavior)
    const dataPath = `/data/${themeKey}.json`;
    const res = await fetch(dataPath, { credentials: 'same-origin' });
    const data = await res.json();

    (data.products || []).forEach(product => {
      renderProductCard(container, normalizeProduct(product));
    });

    initializeModals(); // after product cards exist
  } catch (err) {
    console.error('Theme init failed:', err);
  }
}

/* --------------------------------- modals ---------------------------------- */
function initializeModals() {
  const modal      = document.getElementById('productModal');
  const modalImg   = document.getElementById('modalImg');
  const modalTitle = document.getElementById('modalTitle');
  const modalText  = document.getElementById('modalText');
  const closeBtn   = document.getElementById('closeModal');
  if (!modal || !modalImg || !modalTitle || !modalText || !closeBtn) return;

  let lastActive = null;
  let keydownHandler = null;
  let backdropHandler = null;

  // Bind product cards once
  document.querySelectorAll('.product').forEach(productEl => {
    if (productEl.dataset.modalBound === '1') return;
    productEl.dataset.modalBound = '1';

    productEl.addEventListener('click', () => {
      try {
        const productData = JSON.parse(productEl.dataset.product);

        modalImg.src = productData.image;
        modalImg.alt = productData.alt || productData.name || '';
        modalTitle.textContent = productData.name;
        byId('modalProductName').value = productData.name;
        byId('shirtBase').src = '/img/sb/shirt-black.png';

        // Sizes
        const sizeSelect = byId('modalSize');
        sizeSelect.innerHTML = '';
        (productData.sizes || []).forEach(s => {
          const opt = document.createElement('option');
          opt.value = s.size;
          opt.textContent = s.size;
          opt.dataset.price = s.price;
          sizeSelect.appendChild(opt);
        });
        sizeSelect.dispatchEvent(new Event('change'));

        // Colors (swatches)
        const wrap = byId('colorSwatches');
        wrap.innerHTML = '';
        (productData.colors || []).forEach(c => {
          const label = String(c);
          const slug  = colorSlug(label);
          const btn   = document.createElement('button');
          btn.type = 'button';
          btn.className = 'color-swatch';
          btn.title = label;
          btn.style.backgroundColor = getColorHex(label) || '#ddd';
          btn.dataset.color = slug;

          btn.addEventListener('click', () => {
            wrap.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
            btn.classList.add('selected');
            byId('selectedColor').value = slug;
            byId('shirtBase').src = `/img/sb/shirt-${slug}.png`;
          });

          wrap.appendChild(btn);
        });

        // Auto-select first color
        wrap.querySelector('button')?.click();

        // Reset qty
        byId('modalQuantity').value = 1;
        byId('modalQtyDisplay').textContent = 1;

        openModal();
      } catch (e) {
        console.error('Invalid product data:', e);
      }
    });
  });

  // Price on size change (bind once)
  const sizeSelect = byId('modalSize');
  if (!sizeSelect.dataset.bound) {
    sizeSelect.dataset.bound = '1';
    sizeSelect.addEventListener('change', function () {
      const price = this.selectedOptions[0]?.dataset?.price || '$24.99';
      const basePrice = parseFloat(String(price).replace('$','')) || 24.99;
      const qty = parseInt(byId('modalQuantity').value) || 1;
      modalText.dataset.basePrice = basePrice;
      modalText.innerHTML = `<small>Each: $${basePrice.toFixed(2)}</small><br><strong>Total: $${(basePrice * qty).toFixed(2)}</strong>`;
      byId('selectedSize').value = this.value;
    });
  }

  // Close button – bind once
  if (!closeBtn.dataset.bound) {
    closeBtn.dataset.bound = '1';
    closeBtn.addEventListener('click', closeModal);
  }

  function openModal() {
    lastActive = document.activeElement;
    modal.classList.add('is-open');
    modal.style.display = 'block';
    modal.setAttribute('data-open','1');
    modal.setAttribute('aria-hidden','false');
    document.body.style.overflow = 'hidden';

    keydownHandler = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); return closeModal(); }
      if (e.key === 'Tab') trapFocus(e);
    };
    document.addEventListener('keydown', keydownHandler);

    backdropHandler = (e) => { if (e.target === modal) closeModal(); };
    modal.addEventListener('click', backdropHandler, { passive: true });

    closeBtn.focus();
  }

  function closeModal() {
    modal.classList.remove('is-open');
    modal.style.display = 'none';
    modal.removeAttribute('data-open');
    modal.setAttribute('aria-hidden','true');
    document.body.style.overflow = '';

    if (keydownHandler) document.removeEventListener('keydown', keydownHandler);
    if (backdropHandler) modal.removeEventListener('click', backdropHandler);

    resetModal();
    if (lastActive && typeof lastActive.focus === 'function') lastActive.focus();
  }

  function trapFocus(e) {
    const focusables = modal.querySelectorAll(
      'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusables.length) return;
    const first = focusables[0];
    const last  = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function resetModal() {
    modalImg.src = "";
    modalTitle.textContent = "";
    byId('modalProductName').value = "";
  }
}

// Expose cart helpers for inline handlers
function adjustModalQty(delta) {
  const qtyInput  = byId('modalQuantity');
  const qtyLabel  = byId('modalQtyDisplay');
  const modalText = byId('modalText');
  let qty = Math.max(1, (parseInt(qtyInput.value) || 1) + delta);
  qtyInput.value = qty;
  qtyLabel.textContent = qty;
  const base = parseFloat(modalText.dataset.basePrice || '24.99');
  modalText.innerHTML = `<small>Each: $${base.toFixed(2)}</small><br><strong>Total: $${(base * qty).toFixed(2)}</strong>`;
}
function addToCart() {
  const product   = byId('modalProductName').value;
  const size      = byId('selectedSize').value;
  const color     = byId('selectedColor').value;
  const quantity  = byId('modalQuantity').value;
  const basePrice = parseFloat(byId('modalText').dataset.basePrice || '24.99');
  const price     = `$${basePrice.toFixed(2)}`;
  const image     = byId('modalImg')?.src || '';

  const item = { product, size, color, quantity, price, image };
  const cart = JSON.parse(localStorage.getItem('cart') || '[]');
  cart.push(item);
  localStorage.setItem('cart', JSON.stringify(cart));

  alert('Added to cart!');
  const modal = byId('productModal'); 
  if (modal) {
    modal.classList.remove('is-open');
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden','true');
    modal.removeAttribute('data-open');
  }
  updateCartCount();
}
function updateCartCount() {
  const el = document.getElementById('cartCount');
  const cart = JSON.parse(localStorage.getItem('cart') || '[]');
  if (el) {
    el.textContent = cart.length;
    el.style.display = cart.length > 0 ? 'inline-block' : 'none';
  }
}
window.adjustModalQty = adjustModalQty;
window.addToCart      = addToCart;
window.updateCartCount= updateCartCount;

/* -------------------------- header/footer behaviors ------------------------ */
function setupSizingChartTooltip() {
  const trigger = document.getElementById('sizeChartHover');
  const tooltip = document.getElementById('sizeChartTooltip');
  if (!trigger || !tooltip) return;
  const show = () => tooltip.style.display = 'block';
  const hide = () => tooltip.style.display = 'none';
  trigger.addEventListener('mouseenter', show);
  trigger.addEventListener('mouseleave', hide);
  tooltip.addEventListener('mouseenter', show);
  tooltip.addEventListener('mouseleave', hide);
}
function setupMobileMenu() {
  const burger = document.getElementById('hamburger');
  const nav    = document.getElementById('mobileNav');
  if (!burger || !nav) return;
  document.addEventListener('click', (e) => {
    const isToggle = burger.contains(e.target);
    const inMenu   = nav.contains(e.target);
    if (isToggle) nav.classList.toggle('hidden');
    else if (!inMenu) nav.classList.add('hidden');
  }, { passive: true });
}
function showFloatingCart() {
  const btn = document.getElementById('mobileCartBtn');
  if (!btn) return;
  const cart = JSON.parse(localStorage.getItem('cart') || '[]');
  if (cart.length > 0) btn.classList.remove('hidden');
}

/* -------------------------------- bootstrap -------------------------------- */
function byId(id){ return document.getElementById(id); }

(async function bootstrap() {
  // Wait DOM, then includes, then colors, then init
  if (document.readyState === 'loading') {
    await new Promise(r => document.addEventListener('DOMContentLoaded', r, { once: true }));
  }
  await loadIncludes();     // header/footer injected
  await loadColors();       // colors map ready

  // site-wide init that relies on header/footer
  updateCartCount();
  setupSizingChartTooltip();
  setupMobileMenu();
  showFloatingCart();

  // theme & product cards (if present), then modal hooks
  await initTheme();
})();
