// netlify/functions/charge-full-checkout.js
const { Client, Environment } = require('square');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

exports.handler = async function (event) {
  try {
    const body = JSON.parse(event.body || '{}');
    const { token, cart, customer, shipping: shippingFromClient, promoPercent, promoCode } = body;

    if (!token || !Array.isArray(cart) || !cart.length || !customer?.email || !customer?.zip || !customer?.state) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing or invalid payment or customer info.' }) };
    }

    const accessToken = process.env.SQUARE_ACCESS_TOKEN;
    const locationId  = process.env.SQUARE_LOCATION_ID;
    const senderEmail = process.env.CONTACT_EMAIL2;
    const senderPass  = process.env.CONTACT_APP_PASS2;

    // --- variation mapping (synced with calc-totals) ---
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

    const client = new Client({ accessToken, environment: Environment.Production });

    // --- shipping (server-authoritative) ---
    const quantity = cart.reduce((q, item) => q + (parseInt(item.quantity) || 0), 0);
    const shippingAmount =
      quantity <= 1 ? 5.95 :
      quantity === 2 ? 8.95 :
      quantity === 3 ? 11.95 :
      quantity === 4 ? 14.95 : 17.95;

    // --- line items from catalog variations (Square will use catalog prices) ---
    const lineItems = cart.map((item) => {
      const catalogObjectId = sizeToCatalogId[(item.size || '').toUpperCase()];
      if (!catalogObjectId) throw new Error(`Missing catalogObjectId for size: ${item.size}`);
      return {
        catalogObjectId,
        quantity: String(item.quantity || 1),
        note: `${item.product}  Size: ${item.size}, Color: ${item.color || ''}`.trim()
      };
    });

    // --- order + fulfillment metadata ---
    const referenceId = `KS-${Date.now().toString().slice(-6)}`;
    const fulfillment = {
      type: 'SHIPMENT',
      state: 'PROPOSED',
      shipmentDetails: {
        recipient: {
          displayName: `${customer.firstName || ''} ${customer.name || ''}`.trim(),
          address: {
            addressLine1: customer.address,
            addressLine2: customer.address2,
            locality: customer.city,
            administrativeDistrictLevel1: customer.state,
            postalCode: customer.zip,
            country: 'US'
          }
        }
      }
    };

    // --- lookup or create customer ---
    let customerId;
    try {
      const search = await client.customersApi.searchCustomers({
        query: { filter: { emailAddress: { exact: String(customer.email).trim() } } }
      });
      if (search.result.customers?.length) customerId = search.result.customers[0].id;
    } catch {}
    if (!customerId) {
      const created = await client.customersApi.createCustomer({
        givenName: customer.firstName || customer.name,
        emailAddress: customer.email,
        address: {
          addressLine1: customer.address,
          addressLine2: customer.address2,
          locality: customer.city,
          administrativeDistrictLevel1: customer.state,
          postalCode: customer.zip,
          country: 'US'
        },
        phoneNumber: customer.phone
      });
      customerId = created.result.customer.id;
    }

    // --- tax toggle for Option B (CA only) ---
    const shippingState = (customer?.state || '').trim().toUpperCase(); // you can prefer a separate 'shipping.state' if provided
    const isCA = shippingState === 'CA';

    // --- promo: validate and compute %
    let discountPercent = Number(promoPercent) || 0;
    if (promoCode && customer?.email) {
      // server-side validation against your check-promo function (best-effort)
      try {
        const host  = event.headers?.['x-forwarded-host'] || event.headers?.host;
        const proto = event.headers?.['x-forwarded-proto'] || 'https';
        const url = `${proto}://${host}/.netlify/functions/check-promo?code=${encodeURIComponent(promoCode)}&email=${encodeURIComponent(customer.email)}`;
        const resp = await fetch(url);
        const json = await resp.json();
        if (resp.ok && json.valid && Number(json.amount) > 0) {
          discountPercent = Number(json.amount);
        } else {
          discountPercent = 0; // invalid/expired code
        }
      } catch { /* ignore and use client-provided or 0 */ }
    }
    if (!Number.isFinite(discountPercent) || discountPercent < 0) discountPercent = 0;
    if (discountPercent > 100) discountPercent = 100;

    // --- build order (Option B: auto-apply catalog taxes only for CA; explicit ORDER discount if any) ---
    const orderPayload = {
      locationId,
      customerId,
      referenceId,
      lineItems,
      fulfillments: [fulfillment],
      pricingOptions: { autoApplyTaxes: isCA, autoApplyDiscounts: false },
      serviceCharges: [{
        name: 'Shipping',
        amountMoney: { amount: Math.round(shippingAmount * 100), currency: 'USD' },
        calculationPhase: 'TOTAL_PHASE',
        taxable: false
      }]
    };
    if (discountPercent > 0) {
      orderPayload.discounts = [{
        uid: 'promo',
        name: promoCode ? `Promo ${promoCode}` : 'Promo',
        scope: 'ORDER',
        percentage: String(discountPercent) // e.g., "10" for 10%
      }];
    }

    // --- create order ---
    const orderResult = await client.ordersApi.createOrder({
      idempotencyKey: crypto.randomUUID(),
      order: orderPayload
    });
    const order = orderResult.result.order;

    const taxCents       = Number(order.totalTaxMoney?.amount || 0);
    const discountCents  = Number(order.totalDiscountMoney?.amount || 0);
    const totalCents     = Number(order.totalMoney?.amount || 0);

    // --- pay the order ---
    const paymentResult = await client.paymentsApi.createPayment({
      sourceId: token,
      idempotencyKey: crypto.randomUUID(),
      locationId,
      customerId,
      orderId: order.id,
      amountMoney: { amount: totalCents, currency: 'USD' },
      buyerEmailAddress: customer.email,
      autocomplete: true,
      note: `KindaShirty order ${referenceId}`
    });

    // --- email confirmation ---
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: senderEmail, pass: senderPass }
    });

// Build item list for email
const itemHtml = cart.map(item => `
  <li style="margin:0 0 10px;">
    <strong>${(item.product || 'Item')}</strong><br>
    ${item.size ? `Size: ${item.size}` : ''}${item.color ? ` | Color: ${item.color}` : ''}<br>
    Qty: ${item.quantity} @ ${parseFloat(String(item.price || '0').replace('$','')).toFixed(2)}
  </li>
`).join('');

// Compute pieces so email equals Square totals
const shippingCents      = Math.round(shippingAmount * 100);
const discountCents      = Number(order.totalDiscountMoney?.amount || 0);
const taxCents           = Number(order.totalTaxMoney?.amount || 0);
const totalCents         = Number(order.totalMoney?.amount || 0);
const itemsGrossCents    = Math.max(0, totalCents + discountCents - taxCents - shippingCents);

// OPTIONAL: if you still have `discountPercent` from earlier in this file,
// use it for the label; otherwise omit the "(10%)".
const discountLabel = discountCents > 0
  ? `<tr><td style="padding:6px 0;">Promo Discount</td><td style="padding:6px 0; text-align:right;">- $${(discountCents/100).toFixed(2)}</td></tr>`
  : '';

const receiptUrl = paymentResult.result.payment?.receiptUrl || null;

// Email body (simple, robust HTML)
const htmlBody = `
  <div style="font-family:Inter,Segoe UI,Arial,sans-serif; color:#111; line-height:1.4;">
    <h2 style="margin:0 0 12px;">Thank you for your order!</h2>
    <p style="margin:0 0 8px;"><strong>Order ID:</strong> ${referenceId}</p>
    <p style="margin:0 0 16px;"><strong>Email:</strong> ${customer.email}</p>

    <h3 style="margin:16px 0 8px;">Items</h3>
    <ul style="padding-left:18px; margin:8px 0 16px;">
      ${itemHtml}
    </ul>

    <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%; max-width:520px;">
      <tr>
        <td style="padding:6px 0;">Subtotal</td>
        <td style="padding:6px 0; text-align:right;">$${(itemsGrossCents/100).toFixed(2)}</td>
      </tr>
      ${discountLabel}
      <tr>
        <td style="padding:6px 0;">Shipping</td>
        <td style="padding:6px 0; text-align:right;">$${shippingAmount.toFixed(2)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;">Tax</td>
        <td style="padding:6px 0; text-align:right;">$${(taxCents/100).toFixed(2)}</td>
      </tr>
      <tr>
        <td style="border-top:1px solid #eee; padding:8px 0;"><strong>Total Charged</strong></td>
        <td style="border-top:1px solid #eee; padding:8px 0; text-align:right;"><strong>$${(totalCents/100).toFixed(2)}</strong></td>
      </tr>
    </table>

    ${receiptUrl ? `<p style="margin:16px 0;">
      <a href="${receiptUrl}" target="_blank" rel="noopener" style="color:#006aff; text-decoration:underline;">View Square Receipt</a>
    </p>` : ''}

    <p style="margin-top:24px;">If you have any questions, reply to this email or contact us at support@thekinda.co.</p>
  </div>
`;

    await transporter.sendMail({
      from: `"KindaShirty Orders" <${senderEmail}>`,
      to: customer.email,
      cc: 'Orders@thekinda.co',
      subject: "Your KindaShirty Order Confirmation",
      html: htmlBody,
      encoding: 'utf-8'
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        paymentId: paymentResult.result.payment.id,
        customerId,
        orderId: order.id,
        referenceId,
        taxAmount: taxCents,
        discount: discountCents / 100,
        shipping: shippingAmount,
        total: totalCents / 100,
        status: paymentResult.result.payment.status,
        receiptUrl: paymentResult.result.payment?.receiptUrl || null
      })
    };

  } catch (err) {
    console.error('❌ Checkout Error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message, details: err.body || err.errors || 'Unknown error' })
    };
  }
};
