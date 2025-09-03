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
    const rawCode = qs.code;
    const rawEmail = qs.email;

    const dirCandidates = [
      path.join(process.cwd(), 'data', 'discount_requests'),
      path.join(__dirname, '..', '..', 'data', 'discount_requests') // in case cwd differs in some envs
    ];
    let dir = dirCandidates.find(d => fs.existsSync(d)) || dirCandidates[0];

    // DEBUG: quick inventory
    const debug = qs.debug === '1' || qs.debug === 'true';
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.md')) : [];

    if (debug) {
      const peek = files.slice(0, 25).map(f => {
        try {
          const fm = matter.read(path.join(dir, f)).data || {};
          return { file: f, code: (fm.code || '').toString(), status: fm.status || '', amount: fm.amount ?? fm.percent };
        } catch {
          return { file: f, parseError: true };
        }
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

    if (String(promo.status || '').toLowerCase() !== 'approved') {
      return { statusCode: 200, body: JSON.stringify({ valid: false, error: 'Code not approved.', usageEnforced: false }) };
    }

    const now = new Date();
    if (promo.starts && new Date(promo.starts) > now) {
      return { statusCode: 200, body: JSON.stringify({ valid: false, error: 'Code not active yet.', usageEnforced: false }) };
    }
    if (promo.expires && now > new Date(promo.expires)) {
      return { statusCode: 200, body: JSON.stringify({ valid: false, error: 'Code expired.', usageEnforced: false }) };
    }

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

    const amount = Number(promo.amount ?? promo.percent ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      return { statusCode: 200, body: JSON.stringify({ valid: false, error: 'Invalid discount amount.', usageEnforced: false }) };
    }

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
