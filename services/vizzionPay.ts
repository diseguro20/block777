export interface PixCashInRequest {
  amount: number;
  userId?: string;
  payerName?: string;
  payerCpf?: string;
}

export interface PixCashInResponse {
  success: boolean;
  txId: string;
  pixCode: string;
  pixQrCodeUrl?: string;
  message?: string;
}

export interface PixCashOutRequest {
  amount: number;
  pixKey: string;
  pixKeyType?: 'cpf' | 'phone' | 'email' | 'random';
  userId?: string;
}

export interface PixCashOutResponse {
  success: boolean;
  txId: string;
  status: 'pending' | 'completed' | 'failed';
  message?: string;
}

const VIZZION_API_URL = process.env.VIZZION_PAY_API_URL || 'https://api.vizzionpay.com.br';
const CLIENT_ID = process.env.VIZZION_PAY_CLIENT_ID || '';
const CLIENT_SECRET = process.env.VIZZION_PAY_CLIENT_SECRET || '';

export function isVizzionPayConfigured(): boolean {
  return !!CLIENT_ID && CLIENT_ID !== 'seu-client-id-vizzion' && !!CLIENT_SECRET;
}

export async function createPixCashIn(params: PixCashInRequest): Promise<PixCashInResponse> {
  const txId = `PIX_IN_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  if (!isVizzionPayConfigured()) {
    // Retorno simulação rápida quando as credenciais ainda não foram preenchidas no .env
    const fakePixCode = `00020126580014BR.GOV.BCB.PIX0136${txId}520400005303986540${params.amount.toFixed(
      2
    )}5802BR5920BLOCKERINO BET GAMING6009SAO PAULO62070503***6304`;
    return {
      success: true,
      txId,
      pixCode: fakePixCode,
      pixQrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(
        fakePixCode
      )}`,
      message: 'PIX simulação (Configure VIZZION_PAY_CLIENT_ID para ambiente de produção)',
    };
  }

  try {
    const response = await fetch(`${VIZZION_API_URL}/v1/pix/qrcode`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-ID': CLIENT_ID,
        'X-Client-Secret': CLIENT_SECRET,
      },
      body: JSON.stringify({
        amount: params.amount,
        external_id: txId,
        payer: {
          name: params.payerName || 'Jogador Blockerino',
          cpf: params.payerCpf || '00000000000',
        },
      }),
    });

    const data = await response.json();

    if (response.ok && data.qrcode) {
      return {
        success: true,
        txId: data.txid || txId,
        pixCode: data.qrcode,
        pixQrCodeUrl: data.qrcode_url || data.imagen_url,
      };
    } else {
      throw new Error(data.message || 'Falha ao solicitar PIX na Vizzion Pay');
    }
  } catch (error: any) {
    console.error('Vizzion Pay CashIn Error:', error);
    return {
      success: false,
      txId,
      pixCode: '',
      message: error.message || 'Erro ao conectar com Vizzion Pay',
    };
  }
}

export async function requestPixCashOut(params: PixCashOutRequest): Promise<PixCashOutResponse> {
  const txId = `PIX_OUT_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  if (!isVizzionPayConfigured()) {
    return {
      success: true,
      txId,
      status: 'completed',
      message: 'Saque PIX simulação efetuado!',
    };
  }

  try {
    const response = await fetch(`${VIZZION_API_URL}/v1/pix/payout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-ID': CLIENT_ID,
        'X-Client-Secret': CLIENT_SECRET,
      },
      body: JSON.stringify({
        amount: params.amount,
        pix_key: params.pixKey,
        pix_key_type: params.pixKeyType || 'cpf',
        external_id: txId,
      }),
    });

    const data = await response.json();

    if (response.ok) {
      return {
        success: true,
        txId: data.txid || txId,
        status: data.status || 'completed',
      };
    } else {
      throw new Error(data.message || 'Falha ao realizar saque via Vizzion Pay');
    }
  } catch (error: any) {
    console.error('Vizzion Pay CashOut Error:', error);
    return {
      success: false,
      txId,
      status: 'failed',
      message: error.message || 'Erro na transferência PIX',
    };
  }
}
