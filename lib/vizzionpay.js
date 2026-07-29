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
  if (!customerPhone) {
    const producer = await getVizzionProducer();
    customerPhone = producer.phone;
  }
  if (!customerPhone) {
    const error = new Error('A conta Vizzion Pay precisa ter um telefone cadastrado.');
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
        document: customer.document
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
  const query = new URLSearchParams();
  if (gatewayId) query.set('id', gatewayId);
  if (referenceId) query.set('clientIdentifier', referenceId);
  if (![...query.keys()].length) throw new Error('Informe a transação que será consultada.');
  return vizzionRequest(`/gateway/transactions?${query.toString()}`);
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
