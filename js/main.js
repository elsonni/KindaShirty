// === Updated main.js ===

import { initializeModals, adjustModalQty, addToCart } from './modal-handler.js';

window.adjustModalQty = adjustModalQty;
window.addToCart = addToCart;
window.initializeModals = initializeModals;

document.addEventListener('DOMContentLoaded', () => {
  const includes = document.querySelectorAll('[data-include]');
  let includeCount = includes.length;

  if (includeCount === 0) {
    initAfterIncludes();
  }

  includes.forEach(el => {
    fetch(el.getAttribute('data-include'))
      .then(res => res.text())
      .then(html => {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        el.replaceWith(...tempDiv.childNodes);
      })
      .finally(() => {
        includeCount--;
        if (includeCount === 0) {
          initAfterIncludes();
        }
      });
  });
});

function initAfterIncludes() {
  updateCartCount();
  setupSizingChartTooltip();
  setupMobileMenu();
  showFloatingCart();
}

function updateCartCount() {
  const countEl = document.getElementById('cartCount');
  const cart = JSON.parse(localStorage.getItem('cart')) || [];
  if (countEl) {
    countEl.textContent = cart.length;
    countEl.style.display = cart.length > 0 ? 'inline-block' : 'none';
  }
}

function setupSizingChartTooltip() {
  const trigger = document.getElementById('sizeChartHover');
  const tooltip = document.getElementById('sizeChartTooltip');

  if (trigger && tooltip) {
    trigger.addEventListener('mouseenter', () => tooltip.style.display = 'block');
    trigger.addEventListener('mouseleave', () => tooltip.style.display = 'none');
    tooltip.addEventListener('mouseenter', () => tooltip.style.display = 'block');
    tooltip.addEventListener('mouseleave', () => tooltip.style.display = 'none');
  }
}

// ✅ FIXED: Hamburger mobile menu toggle and auto-close
function setupMobileMenu() {
  document.addEventListener('click', (e) => {
    const burger = document.getElementById('hamburger');
    const nav = document.getElementById('mobileNav');
    if (!burger || !nav) return;

    const isToggleClick = burger.contains(e.target);
    const isNavClick = nav.contains(e.target);

    if (isToggleClick) {
      nav.classList.toggle('hidden');
    } else if (!isNavClick) {
      nav.classList.add('hidden');
    }
  });
}

function showFloatingCart() {
  const btn = document.getElementById('mobileCartBtn');
  if (!btn) return;
  const cart = JSON.parse(localStorage.getItem('cart') || '[]');
  if (cart.length > 0) {
    btn.classList.remove('hidden');
  }
}
