// netlify/functions/calc-totals.js
const { Client, Environment } = require('square');

// Reuse your variation map (kept in sync with charge-full-checkout.js)
const sizeToCatalogId = {
  XXS: "ZUPGPO2XVL5VHZ2I37XQ5IDJ",
  XS:  "RU5HBYNBGC5YI76B6HRQFQN3",
  S:   "IXRI3WJS6XGP7IQSASXA6KCA",
  M:   "4WJEKSK7CDRSMFHV6UEZTPCT",
  L:   "IX5L6VC7ZS3NJJDNURYBVVWS",
  XL:  "ZIFH4HBYWZLWPI46NRGJAA3V",
  XXL: "2S3ZUOKTXQ62YCJNHQQK4GRM", "2XL": "2S3ZUOKTXQ62YCJNHQQK4GRM",
  XXXL:"53V5JSWYNGTTLZ7W4B6NWQUZ", "3XL": "53V5JSWYNGTTLZ7W4B6NWQUZ",
  XXXXL:"IM53XVOCJMFYENLXPHWNMLXS", "4XL": "IM53XVOCJMFYENLXPHWNMLXS"
};

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const { cart, state, promoPercent, promoCode, email } = body;

    if (!cart?.length || !state) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing cart or state.' }) };
    }

    // 1) Optional: trust a % passed from the client (already validated by /check-promo)
    let discountPercent = Number(promoPercent) || 0;

    // 2) (Optional server-side sanity) if no percent provided but code+email present,
    // try to validate via the existing check-promo function. If it fails, continue with 0.
    if (!discountPercent && promoCode && email) {
      try {
        const host  = event.headers?.['x-forwarded-host'] || event.headers?.host;
        const proto = event.headers?.['x-forwarded-proto'] || 'https';
        const url = `${proto}://${host}/.netlify/functions/check-promo?code=${encodeURIComponent(promoCode)}&email=${encodeURIComponent(email)}`;
        const resp = await fetch(url);
        const json = await resp.json();
        if (resp.ok && json.valid && Number(json.amount) > 0) {
          discountPercent = Number(json.amount);
        }
      } catch { /* ignore */ }
    }

    // Clamp to 0–100 for safety
    if (!Number.isFinite(discountPercent) || discountPercent < 0) discountPercent = 0;
    if (discountPercent > 100) discountPercent = 100;

    const accessToken = process.env.SQUARE_ACCESS_TOKEN;
    const locationId  = process.env.SQUARE_LOCATION_ID;
    const client = new Client({ accessToken, environment: Environment.Production });

    const isCA = String(state).trim().toUpperCase() === 'CA';

    // Build line items using catalog variation IDs
    const lineItems = cart.map(item => {
      const id = sizeToCatalogId[(item.size || '').toUpperCase()];
      if (!id) throw new Error(`Missing catalogObjectId for size: ${item.size}`);
      return { catalogObjectId: id, quantity: String(item.quantity || 1) };
    });

    // Shipping in cents (mirror your tier logic)
    const qty = cart.reduce((q, it) => q + (parseInt(it.quantity) || 0), 0);
    const shippingCents = qty <= 1 ? 595 : qty === 2 ? 895 : qty === 3 ? 1195 : qty === 4 ? 1495 : 1795;

    // Subtotal from cart for display (pre-discount)
    const grossItemsCents = Math.round(
      cart.reduce((s, it) => s + (parseFloat(String(it.price).replace('$','')) || 0) * (parseInt(it.quantity) || 0), 0) * 100
    );

    // Build order for preview:
    // - OPTION B: auto-apply taxes only for CA
    // - prevent any catalog auto-discounts (we supply our promo as an explicit order discount)
    const order = {
      locationId,
      lineItems,
      pricingOptions: { autoApplyTaxes: isCA, autoApplyDiscounts: false },
      serviceCharges: [{
        name: 'Shipping',
        amountMoney: { amount: shippingCents, currency: 'USD' },
        calculationPhase: 'TOTAL_PHASE',
        taxable: false
      }]
    };

    if (discountPercent > 0) {
      // ORDER-scoped percentage discount so tax calculates on the discounted base. :contentReference[oaicite:1]{index=1}
      order.discounts = [{
        uid: 'promo',
        name: promoCode ? `Promo ${promoCode}` : 'Promo',
        scope: 'ORDER',
        percentage: String(discountPercent)  // e.g., "10" means 10%
      }];
    }

    // Calculate totals (no order created here). :contentReference[oaicite:2]{index=2}
    const calcRes = await client.ordersApi.calculateOrder({ order });
    const calc = calcRes.result.order || calcRes.result.calculatedOrder || {};

    const taxCents       = Number(calc.totalTaxMoney?.amount || 0);
    const discountCents  = Number(calc.totalDiscountMoney?.amount || 0);
    const totalCents     = Number(calc.totalMoney?.amount || 0);
    const itemsNetCents  = Number(calc.totalItemizedMoney?.amount || (totalCents - taxCents - shippingCents));

    // Response for the UI
    return {
      statusCode: 200,
      body: JSON.stringify({
        isCA,
        // Show pre-discount subtotal for "Subtotal" line
        itemsGross: grossItemsCents / 100,
        // Show discount as a positive value for UI ("-$X.XX")
        discount: discountCents / 100,
        // Shipping and tax as calculated by Square
        shipping: shippingCents / 100,
        tax:      taxCents / 100,
        // Grand total after discount + tax + shipping
        total:    totalCents / 100
      })
    };
  } catch (e) {
    console.error('calc-totals error', e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
