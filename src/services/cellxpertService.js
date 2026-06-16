const axios = require('axios');

/**
 * Calls the affiliate registrations endpoint described in the PDF. The bot only
 * needs a simple yes/no existence check, but raw data is preserved for future
 * reporting or richer workflows.
 */
function getProxyConfig() {
  const proxyUrl = process.env.FIXIE_URL;
  if (!proxyUrl) return undefined;

  const parsed = new URL(proxyUrl);
  const proxy = {
    protocol: parsed.protocol.replace(':', ''),
    host: parsed.hostname,
    port: Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80)),
  };

  if (parsed.username || parsed.password) {
    proxy.auth = {
      username: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
    };
  }

  return proxy;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function extractRegistrationRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.registrations)) return payload.registrations;
  if (Array.isArray(payload?.Registrations)) return payload.Registrations;
  if (Array.isArray(payload?.rows)) return payload.rows;
  return [];
}

function getMatchingRegistrationRows(rows, email) {
  const normalizedEmail = normalizeEmail(email);
  return rows.filter((row) => normalizeEmail(row?.generic1) === normalizedEmail);
}

function toYyyyMmDd(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function computeLookbackRange(days) {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - days);
  return { fromdate: toYyyyMmDd(from), todate: toYyyyMmDd(now) };
}

function normalizeBaseUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.replace(/\/+$/, '/');
}

async function findRegistrationByEmail(email) {
  const baseUrl = normalizeBaseUrl(process.env.CELLXPERT_BASE_URL || 'https://affiliate.marketsvox.com/api/');
  const affiliateId = process.env.CELLXPERT_AFFILIATE_ID || '35089';
  const apiKey = process.env.CELLXPERT_API_KEY;
  const lookbackDays = Number(process.env.CELLXPERT_LOOKBACK_DAYS || 45);

  if (!apiKey) {
    throw new Error('CELLXPERT_API_KEY is missing');
  }

  if (!baseUrl) {
    throw new Error('CELLXPERT_BASE_URL is missing');
  }

  const { fromdate, todate } = computeLookbackRange(Number.isFinite(lookbackDays) && lookbackDays > 0 ? lookbackDays : 45);

  const response = await axios.get(baseUrl, {
    validateStatus: () => true,
    params: {
      command: 'registrations',
      'Filter-Email': email,
      fromdate,
      todate,
      json: 1,
    },
    headers: {
      affiliateid: affiliateId,
      'x-api-key': apiKey,
    },
    proxy: getProxyConfig(),
    responseType: 'text',
    transformResponse: [(value) => value],
    timeout: 15000,
  });

  const raw = String(response.data || '');
  const contentType = String(response.headers['content-type'] || '').toLowerCase();
  const trimmed = raw.trim();

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Cellxpert request failed: ${response.status} ${response.statusText} (${trimmed})`);
  }

  if (trimmed === 'Bad Authentication Key' || trimmed === 'Bad Authentication' || /^ip not authenticated:/i.test(trimmed)) {
    throw new Error(`Cellxpert authentication failed: ${trimmed}`);
  }

  if (!contentType.includes('application/json')) {
    throw new Error(`Cellxpert returned non-JSON content-type "${contentType || 'unknown'}": ${trimmed}`);
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (_err) {
    throw new Error(`Cellxpert returned invalid JSON: ${trimmed}`);
  }

  const rows = extractRegistrationRows(payload);
  const matchingRows = rows.length ? getMatchingRegistrationRows(rows, email) : [];
  const found = rows.length > 0 && matchingRows.length > 0;
  return { found, rows, matchingRows };
}

module.exports = { findRegistrationByEmail, getProxyConfig, extractRegistrationRows, getMatchingRegistrationRows };
