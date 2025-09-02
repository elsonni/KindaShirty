document.addEventListener('DOMContentLoaded', () => {
  // Load reusable header/footer includes
  document.querySelectorAll('[data-include]').forEach(el => {
    fetch(el.getAttribute('data-include'))
      .then(res => res.text())
      .then(html => el.outerHTML = html);
  });

  const themeSection = document.querySelector('[data-theme]');
  if (!themeSection) return;

  const themeKey = themeSection.dataset.theme;
  const container = document.getElementById('product-list');
  const dataPath = `/data/${themeKey}.json`;

  fetch(dataPath)
    .then(response => response.json())
    .then(data => {
      data.products.forEach(product => {
        // Normalize sizes into { size, price } objects
        const sizes = Array.isArray(product.sizes)
          ? product.sizes
          : Object.entries(product.sizes || {}).map(([size, price]) => ({
              size: size.toUpperCase(),
              price: price.startsWith('$') ? price : `$${price}`
            }));

        // Ensure colors is an array of clean strings
        const colors = Array.isArray(product.colors)
          ? product.colors.map(c => String(c).trim())
          : ["Black"];

        // Create product card
        const article = document.createElement('article');
        article.className = 'product';
        article.dataset.product = JSON.stringify({
          name: product.name,
          image: product.image,
          alt: product.alt,
          sizes,
          colors
        });

        article.innerHTML = `
          <img src="${product.image}" alt="${product.alt}">
          <div class="product-details">
            <h3>${product.name}</h3>
          </div>
        `;

        container.appendChild(article);
      });

      // Initialize modals after all products are added
      setTimeout(() => {
        if (typeof initializeModals === 'function') {
          initializeModals();
        }
      }, 100);
    })
    .catch(err => console.error(`Error loading ${dataPath}`, err));
});
