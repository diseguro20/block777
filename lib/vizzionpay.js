import crypto from 'crypto';

const baseUrl = String(process.env.VIZZION_PAY_API_URL || 'https://api.vizzionpay.com').replace(/\/+$/, '');
const apiKey = process.env.VIZZION_PAY_API_KEY || '';
const publicKey = process.env.VIZZION_PAY_PUBLIC_KEY || process.env.VIZZION_PAY_CLIENT_ID || '';
const privateKey = process.env.VIZZION_PAY_PRIVATE_KEY || process.env.VIZZION_PAY_CLIENT_SECRET || '';
const webhookSecret = process.env.VIZZION_PAY_WEBHOOK_SECRET || '';
const authMode = String(process.env.VIZZION_PAY_AUTH_MODE || (apiKey ? 'bearer' : 'keys')).toLowerCase();

export const vizzionPayStatus = {
  provider: 'Vizzion Pay',
  configured: Boolean(apiKey || (publicKey && privateKey)),
  webhookConfigured: Boolean(webhookSecret),
  baseUrl,
  authMode
};

function authHeaders() {
  if (authMode === 'bearer') {
    const token = apiKey || privateKey;
    return { Authorization: `Bearer ${token}` };
  }
  if (authMode === 'basic') {
    return { Authorization: `Basic ${Buffer.from(`${publicKey}:${privateKey}`).toString('base64')}` };
  }
  return {
    'x-public-key': publicKey,
    'x-private-key': privateKey
  };
}

function firstValue(source, paths) {
  for (const path of paths) {
    const value = path.split('.').reduce((current, key) => current?.[key], source);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

export async function createVizzionPix({ amount, customer, referenceId, webhookUrl }) {
  if (!vizzionPayStatus.configured) {
    const error = new Error('Gateway Vizzion Pay aguardando as chaves de integração.');
    error.statusCode = 503;
    throw error;
  }

  const response = await fetch(`${baseUrl}/v1/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...authHeaders()
    },
    body: JSON.stringify({
      amount,
      payment_method: 'pix',
      customer: {
        name: customer.name,
        email: customer.email,
        ...(customer.document ? { document: customer.document } : {})
      },
      external_id: referenceId,
      metadata: { reference_id: referenceId, product: 'blockerino' },
      ...(webhookUrl ? { webhook_url: webhookUrl, callback_url: webhookUrl } : {})
    })
  });

  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch (_) { data = { message: raw }; }
  if (!response.ok) {
    const error = new Error(data.error || data.message || `Vizzion Pay respondeu com status ${response.status}.`);
    error.statusCode = 502;
    throw error;
  }

  const gatewayId = firstValue(data, ['id', 'transaction_id', 'transaction.id', 'data.id', 'data.transaction_id']);
  const pixCode = firstValue(data, ['pix_code', 'pix.code', 'pix.copy_paste', 'qr_code_text', 'data.pix_code', 'data.pix.code', 'data.qr_code_text']);
  const qrCodeUrl = firstValue(data, ['qr_code_url', 'pix.qr_code_url', 'pix.qr_code', 'data.qr_code_url', 'data.pix.qr_code_url', 'data.pix.qr_code']);
  const expiresAt = firstValue(data, ['expires_at', 'pix.expires_at', 'data.expires_at', 'data.pix.expires_at']);

  if (!gatewayId || !pixCode) {
    const error = new Error('A Vizzion Pay não retornou os dados PIX esperados.');
    error.statusCode = 502;
    throw error;
  }

  return { gatewayId: String(gatewayId), pixCode: String(pixCode), qrCodeUrl, expiresAt, raw: data };
}

export function verifyVizzionWebhook(headers, body) {
  if (!webhookSecret) return false;
  const received = String(headers['x-vizzion-signature'] || headers['x-webhook-signature'] || headers['x-signature'] || '').replace(/^sha256=/, '');
  if (!received) return false;
  const expected = crypto.createHmac('sha256', webhookSecret).update(JSON.stringify(body)).digest('hex');
  if (received.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

export function parseVizzionWebhook(body) {
  const gatewayId = firstValue(body, ['id', 'transaction_id', 'transaction.id', 'data.id', 'data.transaction_id']);
  const status = String(firstValue(body, ['status', 'transaction.status', 'data.status', 'event']) || '').toLowerCase();
  const paid = ['paid', 'approved', 'completed', 'succeeded', 'payment.paid', 'transaction.paid'].includes(status);
  return { gatewayId: gatewayId ? String(gatewayId) : null, status, paid };
}
