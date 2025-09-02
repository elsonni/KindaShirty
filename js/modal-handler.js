export function initializeModals() {
  const modal = document.getElementById('productModal');
  const modalImg = document.getElementById('modalImg');
  const modalTitle = document.getElementById('modalTitle');
  const modalText = document.getElementById('modalText');
  const closeBtn = document.getElementById('closeModal');

  document.querySelectorAll('.product').forEach(productEl => {
    productEl.addEventListener('click', () => {
      try {
        const productData = JSON.parse(productEl.dataset.product);

        modalImg.src = productData.image;
        modalImg.alt = productData.alt;
        modalTitle.textContent = productData.name;
        document.getElementById('modalProductName').value = productData.name;
        document.getElementById('shirtBase').src = '/img/sb/shirt-black.png';

        // Size setup
        const sizeSelect = document.getElementById('modalSize');
        sizeSelect.innerHTML = '';
        productData.sizes.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s.size;
          opt.textContent = s.size;
          opt.dataset.price = s.price;
          sizeSelect.appendChild(opt);
        });
        sizeSelect.dispatchEvent(new Event('change'));

        // Color swatch setup
        const colorSwatchContainer = document.getElementById('colorSwatches');
        colorSwatchContainer.innerHTML = '';
        productData.colors.forEach(c => {
          const colorName = c.toLowerCase().replace(/\s+/g, '-');
          const swatch = document.createElement('button');
          swatch.className = 'color-swatch';
          swatch.title = c;
          swatch.style.backgroundColor = getColorHex(c) || '#ddd';
          swatch.dataset.color = colorName;

          swatch.addEventListener('click', () => {
            document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
            swatch.classList.add('selected');
            document.getElementById('selectedColor').value = colorName;
            document.getElementById('shirtBase').src = `/img/sb/shirt-${colorName}.png`;
          });

          colorSwatchContainer.appendChild(swatch);
        });

        // Auto-select first swatch
        colorSwatchContainer.querySelector('button')?.click();

        // Reset quantity
        document.getElementById('modalQuantity').value = 1;
        document.getElementById('modalQtyDisplay').textContent = 1;
        modal.style.display = 'block';
      } catch (e) {
        console.error('Invalid product data:', e);
      }
    });
  });

  document.getElementById('modalSize').addEventListener('change', function () {
    const price = this.selectedOptions[0].dataset.price;
    const basePrice = parseFloat(price.replace('$', '')) || 24.99;
    const qty = parseInt(document.getElementById('modalQuantity').value);
    modalText.dataset.basePrice = basePrice;
    modalText.innerHTML = `<small>Each: $${basePrice.toFixed(2)}</small><br><strong>Total: $${(basePrice * qty).toFixed(2)}</strong>`;
    document.getElementById('selectedSize').value = this.value;
  });

  closeBtn.onclick = () => {
    modal.style.display = 'none';
    resetModal();
  };

  window.onkeydown = (e) => {
    if (e.key === 'Escape' && modal.style.display === 'block') {
      modal.style.display = 'none';
      resetModal();
    }
  };

  window.onclick = (e) => {
    if (e.target === modal) {
      modal.style.display = 'none';
      resetModal();
    }
  };

  function resetModal() {
    modalImg.src = "";
    modalTitle.textContent = "";
    document.getElementById('modalProductName').value = "";
  }
}

export function adjustModalQty(delta) {
  const qtyInput = document.getElementById('modalQuantity');
  const qtyDisplay = document.getElementById('modalQtyDisplay');
  let qty = Math.max(1, parseInt(qtyInput.value) + delta);
  qtyInput.value = qty;
  qtyDisplay.textContent = qty;
  const basePrice = parseFloat(document.getElementById('modalText').dataset.basePrice || '24.99');
  document.getElementById('modalText').innerHTML = `<small>Each: $${basePrice.toFixed(2)}</small><br><strong>Total: $${(basePrice * qty).toFixed(2)}</strong>`;
}

export function addToCart() {
  const product = document.getElementById('modalProductName').value;
  const size = document.getElementById('selectedSize').value;
  const color = document.getElementById('selectedColor').value;
  const quantity = document.getElementById('modalQuantity').value;
  const basePrice = parseFloat(document.getElementById('modalText').dataset.basePrice || '24.99');
  const price = `$${basePrice.toFixed(2)}`;
  const image = document.getElementById('modalImg')?.src || '';

  const item = { product, size, color, quantity, price, image };
  let cart = JSON.parse(localStorage.getItem('cart')) || [];
  cart.push(item);
  localStorage.setItem('cart', JSON.stringify(cart));

  alert('Added to cart!');
  document.getElementById('productModal').style.display = 'none';

  window.updateCartCount?.(); // shared update (global-safe)
}

// Color hex map
function getColorHex(name) {
  const map = {
    "Army": "#4B5320",
    "Asphalt": "#3E3E3C",
    "Athletic Grey": "#A9A9A9",
    "Atlantic": "#337EA9",
    "Aqua": "#5BC8D1",
    "Autumn": "#C1440E",
    "Baby Blue": "#BFE1EB",
    "Berry": "#9B2D5D",
    "Black": "#101820",
    "Blue Storm": "#748E9A",
    "Brown": "#5C4033",
    "Burnt Orange": "#CC5500",
    "Canvas Red": "#BA2C2F",
    "Cardinal": "#9B2335",
    "Carolina Blue": "#A3C1DA",
    "Charity Pink": "#ED7A9E",
    "Chestnut": "#964B00",
    "Citron": "#F6EB61",
    "Clay": "#B66E41",
    "Columbia Blue": "#C4DDEC",
    "Cool Blue": "#4C6A92",
    "Coral": "#F88379",
    "Dark Grey": "#585E6F",
    "Dark Lavender": "#A592B1",
    "Deep Teal": "#005F5F",
    "Dust": "#E5E4E2",
    "Dusty Blue": "#A2B6C0",
    "Electric Blue": "#3E8EDE",
    "Evergreen": "#115E59",
    "Forest": "#314F3A",
    "Fuchsia": "#C154C1",
    "Gold": "#FDB813",
    "Kelly": "#28A745",
    "Lavender Blue": "#C5CBE1",
    "Lavender Dust": "#C4B6C8",
    "Leaf": "#6D9F4B",
    "Light Blue": "#ADD8E6",
    "Light Violet": "#D6AEDD",
    "Lilac": "#B98EB1",
    "Maize Yellow": "#F4D35E",
    "Marine": "#2A6F9E",
    "Maroon": "#6E2E2A",
    "Mauve": "#D8A39D",
    "Military Green": "#4B5320",
    "Mint": "#AAF0D1",
    "Mustard": "#D6A52D",
    "Navy": "#1A1F71",
    "Natural": "#EDE6D6",
    "New Cocoa": "#A9746E",
    "New Hunter Green": "#355E3B",
    "New Pink Gravel": "#D1A8A4",
    "New Purple Storm": "#836EAA",
    "New Vintage Denim": "#5C6D82",
    "New Vintage Red": "#913144",
    "Ocean Blue": "#5BA8C1",
    "Olive": "#708238",
    "Orange": "#F76300",
    "Orchid": "#CBAACB",
    "Oxblood Black": "#43302E",
    "Peach": "#FFE5B4",
    "Pebble Brown": "#A9746E",
    "Pine": "#4F7160",
    "Pink": "#F4C6D7",
    "Poppy": "#EF4136",
    "Red": "#C8102E",
    "Royal Purple": "#652D90",
    "Rust": "#B7410E",
    "Sage": "#B2AC88",
    "Sand Dune": "#D6BAA3",
    "Silver": "#C0C0C0",
    "Slate": "#708090",
    "Soft Cream": "#F3E4B2",
    "Soft Pink": "#F4D8E4",
    "Spring Green": "#A8DAB5",
    "Steel Blue": "#4682B4",
    "Storm": "#A2A2A1",
    "Strobe": "#F9E79F",
    "Sunset": "#F6A58E",
    "Synthetic Green": "#009879",
    "Tan": "#D2B48C",
    "Team Navy": "#1A2D5A",
    "Team Purple": "#5C4E8A",
    "Terracotta": "#E2725B",
    "Toast": "#D1A26C",
    "True Royal": "#3F4C9A",
    "Turquoise": "#30D5C8",
    "Vintage Black": "#1C1C1C",
    "Vintage Brown": "#8B6D5C",
    "Vintage Navy": "#2C3E50",
    "Vintage White": "#F5F5F0",
    "White": "#FFFFFF",
    "Yellow": "#F6EB61"
  };
  return map[name] || null;
}


function updateCartCount() {
  const countEl = document.getElementById('cartCount');
  const cart = JSON.parse(localStorage.getItem('cart')) || [];
  if (countEl) {
    countEl.textContent = cart.length;
    countEl.style.display = cart.length > 0 ? 'inline-block' : 'none';
  }
}
