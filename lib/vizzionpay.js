const baseUrl = String(process.env.VIZZION_PAY_API_URL || 'https://app.vizzionpay.com.br/api/v1').replace(/\/+$/, '');
const publicKey = process.env.VIZZION_PAY_PUBLIC_KEY || '';
const privateKey = process.env.VIZZION_PAY_PRIVATE_KEY || '';
let producerCache = null;
let producerCacheUntil = 0;

export const vizzionPayStatus = {
  provider: 'Vizzion Pay',
  configured: Boolean(publicKey && privateKey),
  webhookConfigured: Boolean(publicKey && privateKey),
  webhookVerification: 'authenticated_transaction_lookup',
  baseUrl,
  authMode: 'keys'
};

function authHeaders() {
  return {
    'x-public-key': publicKey,
    'x-secret-key': privateKey
  };
}

async function vizzionRequest(path, options = {}) {
  if (!vizzionPayStatus.configured) {
    const error = new Error('Gateway Vizzion Pay aguardando as chaves de integração.');
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
      `Vizzion Pay respondeu com status ${response.status}.`;
    const error = new Error(typeof message === 'string' ? message : JSON.stringify(message));
    error.statusCode = response.status >= 400 && response.status < 500 ? 400 : 502;
    error.gatewayStatus = response.status;
    throw error;
  }

  return data;
}

export async function testVizzionCredentials() {
  return vizzionRequest('/gateway/producer/credentials');
}

export async function getVizzionProducer() {
  if (producerCache && Date.now() < producerCacheUntil) return producerCache;
  producerCache = await vizzionRequest('/gateway/producer');
  producerCacheUntil = Date.now() + (10 * 60 * 1000);
  return producerCache;
}

export async function createVizzionPix({ amountCents, customer, referenceId, webhookUrl }) {
  let customerPhone = customer.phone;
  let customerDocument = customer.document;
  if (!customerPhone || !customerDocument) {
    const producer = await getVizzionProducer();
    customerPhone ||= producer.phone;
    customerDocument ||= producer.document;
  }
  if (!customerPhone) {
    const error = new Error('A conta Vizzion Pay precisa ter um telefone cadastrado.');
    error.statusCode = 503;
    throw error;
  }
  if (!customerDocument) {
    const error = new Error('A conta Vizzion Pay precisa concluir a verificação de CPF ou CNPJ.');
    error.statusCode = 503;
    throw error;
  }

  const data = await vizzionRequest('/gateway/pix/receive', {
    method: 'POST',
    body: JSON.stringify({
      identifier: referenceId,
      amount: Number((amountCents / 100).toFixed(2)),
      client: {
        name: customer.name,
        email: customer.email,
        phone: customerPhone,
        document: customerDocument
      },
      metadata: {
        product: 'blockerino',
        referenceId
      },
      ...(webhookUrl ? { callbackUrl: webhookUrl } : {})
    })
  });

  const gatewayId = data.transactionId;
  const pixCode = data.pix?.code;
  const qrCodeUrl = data.pix?.image ||
    (data.pix?.base64 ? `data:image/png;base64,${String(data.pix.base64).replace(/^data:image\/\w+;base64,/, '')}` : null);

  if (!gatewayId || !pixCode) {
    const error = new Error('A Vizzion Pay não retornou os dados PIX esperados.');
    error.statusCode = 502;
    throw error;
  }

  return {
    gatewayId: String(gatewayId),
    pixCode: String(pixCode),
    qrCodeUrl,
    status: String(data.status || 'PENDING'),
    fee: Number(data.fee || 0),
    orderId: data.order?.id || null,
    raw: data
  };
}

export async function getVizzionTransaction({ gatewayId, referenceId }) {
  if (!gatewayId && !referenceId) throw new Error('Informe a transação que será consultada.');

  // Algumas versões da API ignoram ou rejeitam filtros combinados. Consulte pelo
  // identificador do gateway e use o identificador do cliente como fallback.
  const queries = [];
  if (gatewayId) queries.push(new URLSearchParams({ id: String(gatewayId) }));
  if (referenceId) queries.push(new URLSearchParams({ clientIdentifier: String(referenceId) }));
  let lastResponse = null;
  let lastError = null;
  for (const query of queries) {
    try {
      const response = await vizzionRequest(`/gateway/transactions?${query.toString()}`);
      lastResponse = response;
      if (extractVizzionTransaction(response, { gatewayId, referenceId })) return response;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastResponse) return lastResponse;
  throw lastError || new Error('Transação não encontrada na Vizzion Pay.');
}

export function extractVizzionTransaction(lookup, { gatewayId, referenceId } = {}) {
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

export function vizzionTransactionStatus(transaction) {
  return String(transaction?.status || transaction?.paymentStatus || transaction?.transactionStatus || '').trim().toUpperCase();
}

export function isVizzionPaid(transaction) {
  return ['COMPLETED', 'PAID', 'APPROVED', 'SETTLED', 'SUCCESS', 'SUCCEEDED', 'CONFIRMED', 'TRANSACTION_PAID']
    .includes(vizzionTransactionStatus(transaction));
}

export function vizzionAmountMatches(transaction, expectedCents) {
  const amount = Number(transaction?.amount ?? transaction?.value ?? transaction?.paidAmount ?? transaction?.total);
  if (!Number.isFinite(amount)) return true;
  const expected = Math.round(Number(expectedCents) || 0);
  return Math.round(amount * 100) === expected || Math.round(amount) === expected;
}

export async function verifyVizzionTransactionWithRetry({ gatewayId, referenceId, retryDelaysMs = [0, 700, 1600, 3000] }) {
  let lastError = null;
  for (let attempt = 0; attempt < retryDelaysMs.length; attempt++) {
    const delay = Math.max(0, Number(retryDelaysMs[attempt]) || 0);
    if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
    try {
      const lookup = await getVizzionTransaction({ gatewayId, referenceId });
      const transaction = extractVizzionTransaction(lookup, { gatewayId, referenceId });
      if (transaction) return { transaction, attemptsCompleted: attempt + 1 };
    } catch (error) {
      lastError = error;
    }
  }
  return { transaction: null, error: lastError, attemptsCompleted: retryDelaysMs.length };
}

export function parseVizzionWebhook(body) {
  const event = String(body?.event || '').toUpperCase();
  const transaction = body?.transaction || {};
  const gatewayId = transaction.id || body?.transactionId || body?.id || null;
  const referenceId = transaction.identifier || transaction.clientIdentifier || body?.identifier || null;
  const status = String(transaction.status || body?.status || '').toUpperCase();

  return {
    event,
    token: body?.token ? String(body.token) : null,
    gatewayId: gatewayId ? String(gatewayId) : null,
    referenceId: referenceId ? String(referenceId) : null,
    status,
    paid: event === 'TRANSACTION_PAID' || status === 'COMPLETED'
  };
}
