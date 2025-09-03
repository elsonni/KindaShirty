// netlify/functions/check-promo.js
'use strict';

const VERSION = 'promo-v4'; // <- change this string on each deploy to confirm you're on the newest build

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const normCode  = (s) => (s || '').toString().trim().toUpperCase().replace(/\s+/g, '');
const normEmail = (e) => (e || '').toString().trim().toLowerCase();

// Read front-matter; strip any JS-style // comments defensively
function readFM(fp) {
  const raw = fs.readFileSync(fp, 'utf8');
  const sanitized = raw.replace(/^\s*\/\/.*$/gm, '');
  return matter(sanitized).data || {};
}

// TEMP inline fallback allowlist to unblock you if bundling is missing
const INLINE = {
  SUMMER10: { amount: 10, status: 'Approved', email: 'pke853@gmail.com' }
};

exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const debug = qs.debug === '1' || qs.debug === 'true';

    // Candidate directories where promo files might be bundled
    const candidates = [
      path.join(process.cwd(), 'data', 'discount_requests'),
      path.join(process.cwd(), 'data', 'discount-requests'),
      path.join(__dirname, '..', '..', 'data', 'discount_requests'),
      path.join(__dirname, '..', '..', 'data', 'discount-requests')
    ];
    const dirUsed = candidates.find((d) => fs.existsSync(d)) || candidates[0];
    const files = fs.existsSync(dirUsed)
      ? fs.readdirSync(dirUsed).filter((f) => f.toLowerCase().endsWith('.md'))
      : [];

    // ---- DEBUG INVENTORY (no code/email required) ----
    if (debug) {
      const peek = files.slice(0, 50).map((f) => {
        try {
          const fm = readFM(path.join(dirUsed, f));
          return {
            file: f,
            code: (fm.code || '') + '',
            status: (fm.status || '') + '',
            amount: fm.amount ?? fm.percent
          };
        } catch (e) {
          return { file: f, parseError: true, err: String(e) };
        }
      });
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'X-Function-Version': VERSION },
        body: JSON.stringify({
          version: VERSION,
          cwd: process.cwd(),
          dirTried: candidates,
          dirUsed,
          filesFound: files,
          parsed: peek
        })
      };
    }
    // ---- /DEBUG ----

    const rawCode  = qs.code;
    const rawEmail = qs.email;
    if (!rawCode) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', 'X-Function-Version': VERSION },
        body: JSON.stringify({ valid: false, error: 'Missing promo code.', usageEnforced: false })
      };
    }
    const code  = normCode(rawCode);
    const email = normEmail(rawEmail);

    // 1) Try bundled files
    let promo = null;
    for (const f of files) {
      const fm = readFM(path.join(dirUsed, f));
      const fmCode = normCode(fm.code || '');
      if (fmCode && fmCode === code) { promo = fm; break; }
    }

    // 2) TEMP fallback (uncomment/remove when bundling confirmed)
    if (!promo && INLINE[code]) {
      promo = INLINE[code];
    }

    if (!promo) {
      const hint = files.length ? '' : ' (no promo files bundled?)';
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json', 'X-Function-Version': VERSION },
        body: JSON.stringify({ valid: false, error: 'Code not found' + hint, usageEnforced: false })
      };
    }

    // Must be Approved
    const status = String(promo.status || '').trim().toLowerCase();
    if (status !== 'approved') {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'X-Function-Version': VERSION },
        body: JSON.stringify({ valid: false, error: 'Code not approved.', usageEnforced: false })
      };
    }

    // Date windows
    const now = new Date();
    if (promo.starts && new Date(promo.starts) > now) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'X-Function-Version': VERSION },
        body: JSON.stringify({ valid: false, error: 'Code not active yet.', usageEnforced: false })
      };
    }
    if (promo.expires && now > new Date(promo.expires)) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'X-Function-Version': VERSION },
        body: JSON.stringify({ valid: false, error: 'Code expired.', usageEnforced: false })
      };
    }

    // Email restrictions
    if (promo.email) {
      const allowed = normEmail(promo.email);
      if (!email || email !== allowed) {
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json', 'X-Function-Version': VERSION },
          body: JSON.stringify({ valid: false, error: 'Code restricted to a specific email.', usageEnforced: false })
        };
      }
    }
    if (Array.isArray(promo.emails) && promo.emails.length) {
      const allowList = promo.emails.map(normEmail);
      if (!email || !allowList.includes(email)) {
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json', 'X-Function-Version': VERSION },
          body: JSON.stringify({ valid: false, error: 'Code restricted to a list of emails.', usageEnforced: false })
        };
      }
    }
    if (Array.isArray(promo.allowedDomains) && promo.allowedDomains.length) {
      if (!email) {
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json', 'X-Function-Version': VERSION },
          body: JSON.stringify({ valid: false, error: 'Email required for domain-restricted code.', usageEnforced: false })
        };
      }
      const domain = email.split('@')[1];
      const domains = promo.allowedDomains.map((d) => String(d).toLowerCase());
      if (!domains.includes(domain)) {
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json', 'X-Function-Version': VERSION },
          body: JSON.stringify({ valid: false, error: 'Code restricted to a domain.', usageEnforced: false })
        };
      }
    }

    // Discount percent
    let amountRaw = promo.amount ?? promo.percent ?? 0;
    let amount = Number(amountRaw);
    if (!Number.isFinite(amount) && typeof amountRaw === 'string') {
      amount = Number(amountRaw.replace('%', '').trim());
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'X-Function-Version': VERSION },
        body: JSON.stringify({ valid: false, error: 'Invalid discount amount.', usageEnforced: false })
      };
    }

    const minSubtotal = Number(promo.minSubtotal || 0);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'X-Function-Version': VERSION },
      body: JSON.stringify({ valid: true, amount, minSubtotal, usageEnforced: false })
    };

  } catch (err) {
    console.error('check-promo error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'X-Function-Version': VERSION },
      body: JSON.stringify({ valid: false, error: err.message || 'Internal error', usageEnforced: false })
    };
  }
};
