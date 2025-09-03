// netlify/functions/check-promo.js
'use strict';

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const normalizeCode  = (s) => (s || '').toString().trim().toUpperCase().replace(/\s+/g, '');
const normalizeEmail = (e) => (e || '').toString().trim().toLowerCase();

exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const rawCode  = qs.code;
    const rawEmail = qs.email;
    const debug    = qs.debug === '1' || qs.debug === 'true';

    // Look in both common folder spellings; pick the first that exists
    const dirCandidates = [
      path.join(process.cwd(), 'data', 'discount_requests'),
      path.join(process.cwd(), 'data', 'discount-requests')
    ];
    const dir = dirCandidates.find(d => fs.existsSync(d)) || dirCandidates[0];

    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.md')) : [];

    if (debug) {
      // Quick inventory w/ parsed front‑matter preview
      const peek = files.slice(0, 50).map(f => {
        try {
          const fm = matter.read(path.join(dir, f)).data || {};
          return {
            file: f,
            code: (fm.code || '').toString(),
            status: (fm.status || '').toString(),
            amount: fm.amount ?? fm.percent
          };
        } catch (e) { return { file: f, parseError: true, err: String(e) }; }
      });
      return {
        statusCode: 200,
        body: JSON.stringify({
          cwd: process.cwd(),
          dirTried: dirCandidates,
          dirUsed: dir,
          filesFound: files,
          parsed: peek
        })
      };
    }

    if (!rawCode) {
      return { statusCode: 400, body: JSON.stringify({ valid: false, error: 'Missing promo code.', usageEnforced: false }) };
    }

    const code = normalizeCode(rawCode);
    const email = normalizeEmail(rawEmail);

    // Find matching file by code
    let promo = null;
    for (const file of files) {
      const fp = path.join(dir, file);
      const parsed = matter.read(fp);
      const fm = parsed.data || {};
      const fmCode = normalizeCode(fm.code || '');
      if (fmCode && fmCode === code) { promo = fm; break; }
    }

    if (!promo) {
      return { statusCode: 404, body: JSON.stringify({ valid: false, error: 'Code not found.', usageEnforced: false }) };
    }

    // Status must be Approved (be lenient about whitespace/case)
    const status = String(promo.status || '').trim().toLowerCase();
    if (status !== 'approved') {
      return { statusCode: 200, body: JSON.stringify({ valid: false, error: 'Code not approved.', usageEnforced: false }) };
    }

    const now = new Date();

    // Optional date windows
    if (promo.starts && new Date(promo.starts) > now) {
      return { statusCode: 200, body: JSON.stringify({ valid: false, error: 'Code not active yet.', usageEnforced: false }) };
    }
    if (promo.expires && now > new Date(promo.expires)) {
      return { statusCode: 200, body: JSON.stringify({ valid: false, error: 'Code expired.', usageEnforced: false }) };
    }

    // Optional audience restrictions
    if (promo.email) {
      const allowed = normalizeEmail(promo.email);
      if (!email || email !== allowed) {
        return { statusCode: 200, body: JSON.stringify({ valid: false, error: 'Code restricted to a specific email.', usageEnforced: false }) };
      }
    }
    if (Array.isArray(promo.emails) && promo.emails.length) {
      const allowedList = promo.emails.map(normalizeEmail);
      if (!email || !allowedList.includes(email)) {
        return { statusCode: 200, body: JSON.stringify({ valid: false, error: 'Code restricted to a list of emails.', usageEnforced: false }) };
      }
    }
    if (Array.isArray(promo.allowedDomains) && promo.allowedDomains.length) {
      if (!email) {
        return { statusCode: 200, body: JSON.stringify({ valid: false, error: 'Email required for domain-restricted code.', usageEnforced: false }) };
      }
      const domain = email.split('@')[1];
      const domains = promo.allowedDomains.map(d => String(d).toLowerCase());
      if (!domains.includes(domain)) {
        return { statusCode: 200, body: JSON.stringify({ valid: false, error: 'Code restricted to a domain.', usageEnforced: false }) };
      }
    }

    // Discount percent: accept number OR string like "10%"
    let amountRaw = promo.amount ?? promo.percent ?? 0;
    let amount = Number(amountRaw);
    if (!Number.isFinite(amount) && typeof amountRaw === 'string') {
      amount = Number(amountRaw.replace('%', '').trim());
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return { statusCode: 200, body: JSON.stringify({ valid: false, error: 'Invalid discount amount.', usageEnforced: false }) };
    }

    // Optional minimum subtotal (for the caller to enforce)
    const minSubtotal = Number(promo.minSubtotal || 0);

    return {
      statusCode: 200,
      body: JSON.stringify({ valid: true, amount, minSubtotal, usageEnforced: false })
    };

  } catch (err) {
    console.error('check-promo error:', err);
    return { statusCode: 500, body: JSON.stringify({ valid: false, error: err.message || 'Internal error', usageEnforced: false }) };
  }
};
