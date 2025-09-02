const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

exports.handler = async (event) => {
  const promoCode = (event.queryStringParameters.code || '').trim().toUpperCase();
  const emailParam = (event.queryStringParameters.email || '').trim().toLowerCase();

  const dataDir = path.join(__dirname, '../../data/discount_requests');

  console.log("?? Checking promo:", { promoCode, emailParam });

  if (!promoCode || !emailParam) {
    return {
      statusCode: 400,
      body: JSON.stringify({ valid: false, error: 'Missing promo code or email.' })
    };
  }

  try {
    if (!fs.existsSync(dataDir)) {
      return {
        statusCode: 500,
        body: JSON.stringify({ valid: false, error: 'Promo code data folder missing.' })
      };
    }

    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.md'));

    for (const file of files) {
      const content = fs.readFileSync(path.join(dataDir, file), 'utf-8');
      const { data } = matter(content);

      const storedCode = (data.requested_code || '').toUpperCase();
      const storedEmail = (data.email || '').toLowerCase();
      const status = (data.status || '').trim();
      const discount = parseFloat(data.requested_amount);

      if (
        storedCode === promoCode &&
        status === 'Approved' &&
        !isNaN(discount) &&
        (storedEmail === '' || storedEmail === emailParam)
      ) {
        console.log("? Promo valid and applied.");
        return {
          statusCode: 200,
          body: JSON.stringify({ valid: true, amount: discount })
        };
      }
    }

    return {
      statusCode: 404,
      body: JSON.stringify({ valid: false, error: 'Promo code not found or not approved.' })
    };

  } catch (err) {
    console.error("?? Promo check error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ valid: false, error: 'Internal server error.' })
    };
  }
};
