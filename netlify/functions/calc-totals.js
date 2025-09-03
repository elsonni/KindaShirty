// netlify/functions/calc-totals.js
'use strict';

const { Client, Environment } = require('square');

// Keep this in sync with charge-full-checkout.js
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

    if (!Array.isArray(cart) || !cart.length || !state) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing cart or state.' }) };
    }

    // --- Determine discount percent ---
    let discountPercent = Number(promoPercent) || 0;

    // (Best-effort) validate promo server-side if code+email provided but no percent yet
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
      } catch {
        // ignore; keep discountPercent as-is
      }
    }

    // Clamp to 0–100 for safety
    if (!Number.isFinite(discountPercent) || discountPercent < 0) discountPercent = 0;
    if (discountPercent > 100) discountPercent = 100;

    // --- Square client ---
    const accessToken = process.env.SQUARE_ACCESS_TOKEN;
    const locationId  = process.env.SQUARE_LOCATION_ID;
    const client = new Client({ accessToken, environment: Environment.Production });

    // --- Auto-apply taxes only for CA (Option B) ---
    const isCA = String(state).trim().toUpperCase() === 'CA';

    // --- Build line items against your catalog variations ---
    const lineItems = cart.map((item) => {
      const id = sizeToCatalogId[(item.size || '').toUpperCase()];
      if (!id) throw new Error(`Missing catalogObjectId for size: ${item.size}`);
      return { catalogObjectId: id, quantity: String(item.quantity || 1) };
    });

    // --- Shipping (in cents), mirrored from your checkout logic ---
    const qty = cart.reduce((q, it) => q + (parseInt(it.quantity) || 0), 0);
    const shippingCents =
      qty <= 1 ?  595 :
      qty === 2 ?  895 :
      qty === 3 ? 1195 :
      qty === 4 ? 1495 : 1795;

    // --- Build order preview ---
    const order = {
      locationId,
      lineItems,
      pricingOptions: {
        autoApplyTaxes: isCA,        // CA only
        autoApplyDiscounts: false    // prevent catalog auto-discounts from stacking
      },
      serviceCharges: [{
        name: 'Shipping',
        amountMoney: { amount: shippingCents, currency: 'USD' },
        calculationPhase: 'TOTAL_PHASE',
        taxable: false               // no applied_taxes => shipping not taxed
      }]
    };

    if (discountPercent > 0) {
      // ORDER-scoped percentage discount so tax is calculated on the discounted base
      order.discounts = [{
        uid: 'promo',
        name: promoCode ? `Promo ${promoCode}` : 'Promo',
        scope: 'ORDER',
        percentage: String(discountPercent)   // e.g., "10" => 10% off
      }];
    }

    // --- Ask Square to calculate totals (no order is created) ---
    const calcRes = await client.ordersApi.calculateOrder({ order });
    const o = calcRes.result.order || calcRes.result.calculatedOrder || {};

    const taxCents      = Number(o.totalTaxMoney?.amount || 0);
    const discountCents = Number(o.totalDiscountMoney?.amount || 0);
    const totalCents    = Number(o.totalMoney?.amount || 0);

    // Subtotal BEFORE discount, reconstructed from Square totals:
    // total = itemsGross - discount + tax + shipping  =>  itemsGross = total + discount - tax - shipping
    const itemsGrossCents = Math.max(0, totalCents + discountCents - taxCents - shippingCents);

    return {
      statusCode: 200,
      body: JSON.stringify({
        isCA,
        itemsGross: itemsGrossCents / 100,
        discount:   discountCents   / 100,
        shipping:   shippingCents   / 100,
        tax:        taxCents        / 100,
        total:      totalCents      / 100
      })
    };

  } catch (e) {
    console.error('calc-totals error', e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
