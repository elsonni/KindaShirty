const { Client, Environment } = require('square');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

exports.handler = async function(event) {
  try {
    const { token, cart, customer, shipping } = JSON.parse(event.body);

    if (!token || !cart?.length || !customer?.email || !customer?.zip || !customer?.state) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing or invalid payment or customer info.' }),
      };
    }

    const accessToken = process.env.SQUARE_ACCESS_TOKEN;
    const locationId = process.env.SQUARE_LOCATION_ID;
    const senderEmail = process.env.CONTACT_EMAIL2;
    const senderPass = process.env.CONTACT_APP_PASS2;

    const sizeToCatalogId = {
      "XS": "RU5HBYNBGC5YI76B6HRQFQN3",
      "S":  "IXRI3WJS6XGP7IQSASXA6KCA",
      "M":  "4WJEKSK7CDRSMFHV6UEZTPCT",
      "L":  "IX5L6VC7ZS3NJJDNURYBVVWS",
      "XL": "ZIFH4HBYWZLWPI46NRGJAA3V",
      "XXL": "2S3ZUOKTXQ62YCJNHQQK4GRM",
      "XXXL": "53V5JSWYNGTTLZ7W4B6NWQUZ",
      "XXXXL": "IM53XVOCJMFYENLXPHWNMLXS"
    };

    const client = new Client({ accessToken, environment: Environment.Production });

    const subtotal = cart.reduce((sum, item) => sum + parseFloat(item.price.replace('$', '')) * parseInt(item.quantity), 0);
    const TAX_RATE_CA = 0.0825;
    const estimatedTax = customer.state.toUpperCase() === 'CA' ? subtotal * TAX_RATE_CA : 0;
    const quantity = cart.reduce((q, item) => q + parseInt(item.quantity), 0);
    const shippingAmount = quantity <= 1 ? 5.95 : quantity === 2 ? 8.95 : quantity === 3 ? 11.95 : quantity === 4 ? 14.95 : 17.95;

    const lineItems = cart.map(item => {
      const catalogObjectId = sizeToCatalogId[item.size?.toUpperCase()];
      if (!catalogObjectId) throw new Error(`Missing catalogObjectId for size: ${item.size}`);
      return {
        catalogObjectId,
        quantity: String(item.quantity),
        note: `${item.product}  Size: ${item.size}, Color: ${item.color}`
      };
    });

    const referenceId = `KS-${Date.now().toString().slice(-6)}`;

    const fulfillment = {
      type: 'SHIPMENT',
      state: 'PROPOSED',
      shipmentDetails: {
        recipient: {
          displayName: `${customer.firstName || ''} ${customer.name}`.trim(),
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

    // Lookup or create customer
    let customerId;
    try {
      const search = await client.customersApi.searchCustomers({
        query: { filter: { emailAddress: { exact: customer.email } } }
      });
      if (search.result.customers?.length) {
        customerId = search.result.customers[0].id;
      }
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

    // Create order
    const orderResult = await client.ordersApi.createOrder({
      idempotencyKey: crypto.randomUUID(),
      order: {
        locationId,
        customerId,
        referenceId,
        lineItems,
        fulfillments: [fulfillment],
        taxes: [
          {
            uid: 'california-tax',
            name: 'CA Sales Tax',
            scope: 'ORDER',
            catalogObjectId: '54WR3GPFARRMBNAXDOCG4QQZ'
          }
        ],
        serviceCharges: [
          {
            name: 'Shipping',
            amountMoney: { amount: Math.round(shippingAmount * 100), currency: 'USD' },
            calculationPhase: 'TOTAL_PHASE',
            taxable: false
          }
        ]
      }
    });

    const order = orderResult.result.order;
    const taxCents = Number(order.totalTaxMoney?.amount || 0);
    const totalCents = Number(order.totalMoney?.amount || 0);

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

    // Email
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: senderEmail, pass: senderPass }
    });

    const itemHtml = cart.map(item => `
      <li>
        <strong>${item.product}</strong><br>
        Size: ${item.size} | Color: ${item.color}<br>
        Qty: ${item.quantity} @ ${parseFloat(item.price?.replace?.('$', '') || '0').toFixed(2)}
      </li>
    `).join('');

    const htmlBody = `
      <h2>Thank you for your order!</h2>
      <p><strong>Order ID:</strong> ${referenceId}</p>
      <p><strong>Name:</strong> ${customer.firstName || ''} ${customer.name}</p>
      <p><strong>Email:</strong> ${customer.email}</p>
      <ul>${itemHtml}</ul>
      <p><strong>Shipping:</strong> $${shippingAmount.toFixed(2)}</p>
      <p><strong>Tax:</strong> $${(taxCents / 100).toFixed(2)}</p>
      <p><strong>Total Charged:</strong> $${(totalCents / 100).toFixed(2)}</p>
      <p>If you have any questions, reply to this email or contact us at support@thekinda.co.</p>
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
        total: totalCents / 100,
        status: paymentResult.result.payment.status
      })
    };

  } catch (err) {
    console.error('❌ Checkout Error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message, details: err.body || err.errors || 'Unknown error' }),
    };
  }
};
