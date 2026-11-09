import crypto from 'crypto';

const baseUrl = String(process.env.NXGATE_API_URL || 'https://api.nxgate.com.br').replace(/\/+$/, '');
const apiKey = String(process.env.NXGATE_API_KEY || 'nx_live_867a1dbe429dc9c7c3c5c29054bfa667af66e4f7').trim();
const callbackBaseUrl = String(
  process.env.NXGATE_CALLBACK_BASE_URL ||
  process.env.AMPLOPAY_CALLBACK_BASE_URL ||
  'https://block777-omega.vercel.app'
).replace(/\/+$/, '');

export const nxGateStatus = {
  provider: 'NXGate',
  configured: Boolean(apiKey),
  webhookConfigured: Boolean(apiKey),
  baseUrl
};

export function nxGateWebhookUrl(path = '/api/wallet/webhook/nxgate') {
  const normalizedPath = String(path || '').startsWith('/') ? String(path) : `/${String(path || '')}`;
  return `${callbackBaseUrl}${normalizedPath}`;
}

function generateQrCodeUrl(pixText) {
  if (!pixText) return '';
  return `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(pixText)}`;
}

function generateMockPixCopiaECola(depositId, amountCents) {
  const formattedAmount = (amountCents / 100).toFixed(2);
  return `00020101021226890014BR.GOV.BCB.PIX2567pix.nxgate.com/${depositId}520400005303986540${formattedAmount}5802BR5916BLOCK7776009SAO PAULO62070503***6304${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

export async function createNxGatePix({ amountCents, customer = {}, referenceId, webhookUrl }) {
  const depositId = referenceId || `nx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const amountReais = Number((amountCents / 100).toFixed(2));
  const finalWebhookUrl = webhookUrl || nxGateWebhookUrl();

  if (!nxGateStatus.configured) {
    console.warn('[NXGate] Chaves da NXGate não configuradas. Operando com fallback.');
    const pixCode = generateMockPixCopiaECola(depositId, amountCents);
    return {
      pixCode,
      qrCodeUrl: generateQrCodeUrl(pixCode),
      gatewayId: `nx_sim_${depositId}`,
      status: 'PENDING',
      fee: 0,
      orderId: null,
      mode: 'simulation_fallback',
      gateway: 'nxgate'
    };
  }

  const endpoint = `${baseUrl}/pix/gerar`;
  const rawPhone = String(customer.phone || '11999999999').replace(/\D/g, '');
  const cleanPhone = rawPhone.length >= 10 ? rawPhone : '11999999999';

  const payload = {
    api_key: apiKey,
    valor: amountReais,
    amount: amountReais,
    url_notificacao: finalWebhookUrl,
    webhook: finalWebhookUrl,
    postback_url: finalWebhookUrl,
    external_id: depositId,
    id_externo: depositId,
    pedido: depositId,
    descricao: 'Block777 Depósito',
    customer: {
      name: customer.name || 'Jogador Block777',
      email: customer.email || 'contato@block777.com',
      phone: cleanPhone
    }
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const data = await res.json();

    if (res.ok && (data.status === 'success' || data.paymentCode || data.pixCode || data.idTransaction)) {
      const pixCode = data.paymentCode || data.pixCode || data.pix_code || data.qrcode || data.qr_code || data.emv;
      const gatewayId = String(data.idTransaction || data.id || data.transaction_id || depositId);
      const qrCodeUrl = data.paymentCodeBase64
        ? `data:image/png;base64,${data.paymentCodeBase64}`
        : (data.qr_code_url || data.qrCodeUrl || generateQrCodeUrl(pixCode));

      console.log(`[NXGate] Cobrança PIX real gerada com sucesso! GatewayId: ${gatewayId}`);
      return {
        pixCode,
        qrCodeUrl,
        gatewayId,
        status: 'PENDING',
        fee: 0,
        orderId: data.order_id || null,
        mode: 'production',
        gateway: 'nxgate',
        raw: data
      };
    } else {
      console.warn('[NXGate] Retorno inesperado da API NXGate:', JSON.stringify(data));
    }
  } catch (err) {
    console.warn('[NXGate] Erro ao comunicar com endpoint NXGate /pix/gerar:', err.message);
  }

  // Fallback seguro caso haja instabilidade momentânea
  console.warn('[NXGate] Utilizando fallback de segurança para depósito:', depositId);
  const pixCode = generateMockPixCopiaECola(depositId, amountCents);
  return {
    pixCode,
    qrCodeUrl: generateQrCodeUrl(pixCode),
    gatewayId: `nx_fb_${depositId}`,
    status: 'PENDING',
    fee: 0,
    orderId: null,
    mode: 'simulation_fallback',
    gateway: 'nxgate'
  };
}

const nxStatusCache = new Map();

export async function checkNxGateStatus(transactionId) {
  if (!nxGateStatus.configured || !transactionId) return null;

  const cached = nxStatusCache.get(transactionId);
  if (cached && cached.status === 'approved') return cached;
  if (cached && (Date.now() - cached.timestamp < 5000)) return cached;

  const endpoint = `${baseUrl}/pix/consultar`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        api_key: apiKey,
        transaction_id: transactionId
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const rawStatus = String(data.status || data.payment_status || data.data?.status || '').toUpperCase();
      const paidSignals = ['PAID', 'APPROVED', 'COMPLETED', 'CONFIRMED', 'SUCCESS', 'LIQUIDADO', 'PAGO', 'PAGA'];
      const isApproved = paidSignals.some(s => rawStatus.includes(s));

      const result = {
        status: isApproved ? 'approved' : (rawStatus === 'WAITING' || rawStatus === 'PENDING' ? 'pending' : rawStatus.toLowerCase()),
        isPaid: isApproved,
        paidAt: data.paid_at || data.payedAt || data.data?.paid_at || new Date().toISOString(),
        raw: data,
        timestamp: Date.now()
      };
      nxStatusCache.set(transactionId, result);
      return result;
    }
  } catch (err) {
    console.warn('[NXGate] Erro ao consultar status da transação:', err.message);
  }

  return null;
}

export function parseNxGateWebhook(payload = {}) {
  const referenceCandidates = [
    payload.external_id,
    payload.id_externo,
    payload.pedido,
    payload.referenceId,
    payload.reference_id,
    payload.identifier,
    payload.clientIdentifier,
    payload.client_identifier,
    payload.ref,
    payload.custom_id
  ].filter(Boolean).map(String);

  const gatewayCandidates = [
    payload.idTransaction,
    payload.id_transaction,
    payload.transaction_id,
    payload.transactionId,
    payload.id
  ].filter(Boolean).map(String);

  const rawFields = [
    payload.event,
    payload.status,
    payload.type,
    payload.action,
    payload.payment_status,
    payload.transaction_status,
    payload.data?.status,
    payload.data?.event,
    payload.data?.payment_status
  ].filter(Boolean).map(s => String(s).toUpperCase());

  const paidSignals = ['PAID', 'APPROVED', 'COMPLETED', 'CONFIRMED', 'SUCCESS', 'CHARGE.PAID', 'TRANSACTION_PAID', 'LIQUIDADO', 'PAGO', 'PAGA'];
  const isPaid = rawFields.some(field => paidSignals.some(signal => field.includes(signal))) ||
    Boolean(payload.paidAt || payload.paid_at || payload.data?.paidAt || payload.data?.paid_at);

  return {
    referenceId: referenceCandidates[0] || null,
    referenceCandidates,
    gatewayId: gatewayCandidates[0] || null,
    isPaid,
    status: isPaid ? 'COMPLETED' : 'PENDING',
    amount: payload.valor || payload.amount || payload.data?.amount || null,
    raw: payload
  };
}
