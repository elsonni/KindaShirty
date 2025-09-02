const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

exports.handler = async (event) => {
  const promoCode = (event.queryStringParameters.code || '').trim().toUpperCase();
  const emailParam = (event.queryStringParameters.email || '').trim().toLowerCase();
  const dataDir = path.join(__dirname, '../../data/discount_requests');
  const logPath = path.join(__dirname, '../../data/promo-usage-log.json');

  try {
    let usageLog = {};
    if (fs.existsSync(logPath)) {
      usageLog = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
    }

    const alreadyUsed = (usageLog[emailParam] || []).includes(promoCode);
    if (alreadyUsed) {
      return {
        statusCode: 403,
        body: JSON.stringify({ valid: false, error: 'This promo code has already been used by this email.' })
      };
    }

    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const { data } = matter(fs.readFileSync(path.join(dataDir, file), 'utf8'));
      const storedCode = (data.requested_code || '').toUpperCase();
      const storedEmail = (data.email || '').toLowerCase();
      const isMatch = storedCode === promoCode &&
                      data.status === 'Approved' &&
                      (storedEmail === '' || storedEmail === emailParam);

      if (isMatch) {
        // Mark usage
        usageLog[emailParam] = [...(usageLog[emailParam] || []), promoCode];
        fs.writeFileSync(logPath, JSON.stringify(usageLog, null, 2));

        return {
          statusCode: 200,
          body: JSON.stringify({ valid: true, amount: Number(data.requested_amount) || 0 })
        };
      }
    }

    return {
      statusCode: 404,
      body: JSON.stringify({ valid: false, error: 'Promo code not found or not approved.' })
    };
  } catch (err) {
    console.error('Promo check failed:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ valid: false, error: 'Internal server error' })
    };
  }
};
