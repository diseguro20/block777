import crypto from 'crypto';

const baseUrl = String(process.env.AMPLOPAY_API_URL || 'https://app.amplopay.com/api/v1').replace(/\/+$/, '');
const publicKey = String(process.env.AMPLOPAY_API_KEY || 'diseguro20_mus5al766zug2sva').trim();
const secretKey = String(process.env.AMPLOPAY_API_SECRET || 'hbmzkatcs1yomotlvr658eqlmw2d8fyzm87ldk730qldgbacukce1vww61be70nc').trim();
const callbackBaseUrl = String(process.env.AMPLOPAY_CALLBACK_BASE_URL || 'https://block777-omega.vercel.app').replace(/\/+$/, '');
let producerCache = null;
let producerCacheUntil = 0;

export const amploPayStatus = {
  provider: 'AmploPay',
  configured: Boolean(publicKey && secretKey),
  webhookConfigured: Boolean(publicKey && secretKey),
  webhookVerification: 'per_transaction_token_with_strict_transaction_binding',
  baseUrl,
  authMode: 'keys'
};

export function amploWebhookUrl(path) {
  const normalizedPath = String(path || '').startsWith('/') ? String(path) : `/${String(path || '')}`;
  return `${callbackBaseUrl}${normalizedPath}`;
}

function authHeaders() {
  return {
    'x-public-key': publicKey,
    'x-secret-key': secretKey,
    'Authorization': `Bearer ${secretKey}`
  };
}

async function amploRequest(path, options = {}) {
  if (!amploPayStatus.configured) {
    const error = new Error('Gateway AmploPay aguardando as chaves de integração.');
    error.statusCode = 503;
    throw error;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    signal: options.signal || AbortSignal.timeout(12000),
    headers: {
      Accept: 'application/json',
      ...authHeaders(),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });

  const raw = await response.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch (_) {
    data = { message: raw };
  }

  if (!response.ok) {
    const message = data.errorDescription || data.message || data.error || data.details ||
      `AmploPay respondeu com status ${response.status}.`;
    const error = new Error(typeof message === 'string' ? message : JSON.stringify(message));
    error.statusCode = response.status >= 400 && response.status < 500 ? 400 : 502;
    error.gatewayStatus = response.status;
    throw error;
  }

  return data;
}

export async function testAmploCredentials() {
  return amploRequest('/gateway/producer/credentials');
}

export async function getAmploProducer() {
  if (producerCache && Date.now() < producerCacheUntil) return producerCache;
  producerCache = await amploRequest('/gateway/producer');
  producerCacheUntil = Date.now() + (10 * 60 * 1000);
  return producerCache;
}

export async function createAmploPix({ amountCents, customer, referenceId, webhookUrl }) {
  let customerPhone = customer?.phone;
  let customerDocument = customer?.document;
  if (!customerPhone || !customerDocument) {
    try {
      const producer = await getAmploProducer();
      customerPhone ||= producer.phone;
      customerDocument ||= producer.document;
    } catch (_) {
      customerPhone ||= '11989891853';
      customerDocument ||= '52968522817';
    }
  }

  const rawPhone = String(customerPhone || '').replace(/\D/g, '');
  const cleanPhone = rawPhone.length >= 10 ? rawPhone : '11989891853';
  const rawDoc = String(customerDocument || '').replace(/\D/g, '');
  const cleanDoc = rawDoc.length === 11 || rawDoc.length === 14 ? rawDoc : '52968522817';

  const data = await amploRequest('/gateway/pix/receive', {
    method: 'POST',
    body: JSON.stringify({
      identifier: referenceId,
      amount: Number((amountCents / 100).toFixed(2)),
      client: {
        name: customer?.name || 'Jogador Block777',
        email: customer?.email || 'contato@block777.com',
        phone: cleanPhone,
        document: cleanDoc
      },
      metadata: {
        product: 'block777',
        referenceId
      },
      ...(webhookUrl ? { callbackUrl: webhookUrl } : {})
    })
  });

  const gatewayId = data.transactionId;
  const pixCode = data.pix?.code;
  const qrCodeUrl = data.pix?.image ||
    (data.pix?.base64 ? `data:image/png;base64,${String(data.pix.base64).replace(/^data:image\/\w+;base64,/, '')}` : null) ||
    `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(pixCode || '')}`;

  if (!gatewayId || !pixCode) {
    const error = new Error('A AmploPay não retornou os dados PIX esperados.');
    error.statusCode = 502;
    throw error;
  }

  return {
    gatewayId: String(gatewayId),
    pixCode: String(pixCode),
    qrCodeUrl,
    status: String(data.transactionStatus || (String(data.status || '').toUpperCase() === 'OK' ? 'PENDING' : data.status) || 'PENDING'),
    fee: Number(data.fee || 0),
    orderId: data.order?.id || null,
    webhookTokenHash: data.webhookToken ? hashAmploWebhookToken(data.webhookToken) : null,
    raw: data
  };
}

export async function getAmploTransaction({ gatewayId, referenceId }) {
  if (!gatewayId && !referenceId) throw new Error('Informe a transação que será consultada.');

  const queries = [];
  if (gatewayId) queries.push(new URLSearchParams({ id: String(gatewayId) }));
  if (referenceId) queries.push(new URLSearchParams({ clientIdentifier: String(referenceId) }));
  let lastResponse = null;
  let lastError = null;
  for (const query of queries) {
    try {
      const response = await amploRequest(`/gateway/transactions?${query.toString()}`);
      lastResponse = response;
      if (extractAmploTransaction(response, { gatewayId, referenceId })) return response;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastResponse) return lastResponse;
  throw lastError || new Error('Transação não encontrada na AmploPay.');
}

export function extractAmploTransaction(lookup, { gatewayId, referenceId } = {}) {
  const candidates = [];
  const visited = new Set();
  const collect = (value, depth = 0) => {
    if (!value || depth > 5 || visited.has(value)) return;
    if (typeof value === 'object') visited.add(value);
    if (Array.isArray(value)) {
      value.forEach(item => collect(item, depth + 1));
      return;
    }
    if (typeof value !== 'object') return;
    const looksLikeTransaction = value.id || value.transactionId || value.identifier ||
      value.clientIdentifier || value.status || value.paymentStatus || value.transactionStatus;
    if (looksLikeTransaction) candidates.push(value);
    ['data', 'transactions', 'transaction', 'results', 'items', 'docs', 'content', 'records'].forEach(key => {
      if (value[key] && value[key] !== value) collect(value[key], depth + 1);
    });
  };
  collect(lookup);
  return candidates.find(item => {
    if (!item) return false;
    const id = String(item.id || item.transactionId || item.uuid || '');
    const reference = String(item.identifier || item.clientIdentifier || item.externalId || item.metadata?.referenceId || '');
    return (gatewayId && id === String(gatewayId)) || (referenceId && reference === String(referenceId));
  }) || (!gatewayId && !referenceId && candidates.length === 1 ? candidates[0] : null);
}

export function amploTransactionStatus(transaction) {
  return String(transaction?.status || transaction?.paymentStatus || transaction?.transactionStatus || '').trim().toUpperCase();
}

export function isAmploPaid(transaction) {
  return ['COMPLETED', 'PAID', 'APPROVED', 'SETTLED', 'SUCCESS', 'SUCCEEDED', 'CONFIRMED', 'TRANSACTION_PAID']
    .includes(amploTransactionStatus(transaction));
}

export function amploAmountMatches(transaction, expectedCents) {
  const amount = Number(transaction?.amount ?? transaction?.value ?? transaction?.paidAmount ?? transaction?.total);
  if (!Number.isFinite(amount)) return false;
  const expected = Math.round(Number(expectedCents) || 0);
  return Math.round(amount * 100) === expected || Math.round(amount) === expected;
}

export async function verifyAmploTransactionWithRetry({ gatewayId, referenceId, retryDelaysMs = [0, 700, 1600, 3000] }) {
  let lastError = null;
  for (let attempt = 0; attempt < retryDelaysMs.length; attempt++) {
    const delay = Math.max(0, Number(retryDelaysMs[attempt]) || 0);
    if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
    try {
      const lookup = await getAmploTransaction({ gatewayId, referenceId });
      const transaction = extractAmploTransaction(lookup, { gatewayId, referenceId });
      if (transaction) return { transaction, attemptsCompleted: attempt + 1 };
    } catch (error) {
      lastError = error;
    }
  }
  return { transaction: null, error: lastError, attemptsCompleted: retryDelaysMs.length };
}

export function parseAmploWebhook(body) {
  const event = String(body?.event || '').toUpperCase();
  const transaction = body?.transaction && typeof body.transaction === 'object'
    ? body.transaction
    : {};
  const gatewayId = transaction.id || body?.transactionId || body?.id || null;
  const referenceId = transaction.identifier || transaction.clientIdentifier || body?.identifier || body?.metadata?.referenceId || null;
  const status = String(transaction.status || body?.status || '').toUpperCase();

  return {
    event,
    token: body?.token ? String(body.token) : null,
    gatewayId: gatewayId ? String(gatewayId) : null,
    referenceId: referenceId ? String(referenceId) : null,
    status,
    paid: event === 'TRANSACTION_PAID' || isAmploPaid(transaction) || isAmploPaid(body),
    transaction
  };
}

export function hashAmploWebhookToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

export function verifyAmploWebhookToken(receivedToken, expectedHash) {
  if (!receivedToken || !expectedHash) return false;
  const actual = Buffer.from(hashAmploWebhookToken(receivedToken), 'hex');
  const expected = Buffer.from(String(expectedHash), 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
