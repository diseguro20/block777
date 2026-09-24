const KRS_WEBHOOK_URL = process.env.KRS_WEBHOOK_URL || 'https://krs-creator-hub.vercel.app/api/webhooks/conversions';
const KRS_DEFAULT_SECRET = 'krs_sec_live_99f821a084c7e481b3';

/**
 * Dispara o webhook de conversão de depósito para o KRS Creator Hub.
 * Execução segura e não-bloqueante: falhas na rede ou no KRS nunca interrompem
 * a aprovação do depósito ou o crédito do jogador.
 *
 * @param {Object} params
 * @param {string} [params.gameSlug] - 'blockerino' ou 'krs-777' (default 'krs-777')
 * @param {string} params.affiliateCode - Código do afiliado (ex: 'nobru', 'teste_probe')
 * @param {number} params.amountDeposited - Valor depositado em Reais (ex: 100.00)
 * @param {number} [params.commissionAmount] - Comissão em Reais (ex: 20.00)
 * @param {string} [params.playerName] - Nome do jogador (ex: 'Lucas R.')
 * @param {string} [params.transactionId] - ID único da transação
 * @param {string} [params.secret] - Segredo da API KRS (opcional, padrão krs_sec_live_...)
 * @returns {Promise<{ success: boolean, data?: any, error?: string, reason?: string }>}
 */
export async function sendKrsConversionWebhook({
  gameSlug = process.env.KRS_GAME_SLUG || 'krs-777',
  affiliateCode,
  amountDeposited,
  commissionAmount = 0,
  playerName = 'Jogador',
  transactionId = '',
  secret
}) {
  const code = String(affiliateCode || '').trim();
  if (!code) {
    // Sem código de afiliado, não dispara webhook (evita erro 400 do KRS)
    return { success: false, reason: 'NO_AFFILIATE_CODE' };
  }

  const payload = {
    game_slug: String(gameSlug || 'krs-777').trim(),
    affiliate_code: code,
    event_type: 'deposit',
    amount_deposited: Number(Number(amountDeposited || 0).toFixed(2)),
    commission_amount: Number(Number(commissionAmount || 0).toFixed(2)),
    player_name: String(playerName || 'Jogador').trim(),
    transaction_id: String(transactionId || '').trim() || `tx_${Date.now()}`
  };

  const effectiveSecret = secret || process.env.KRS_SECRET || KRS_DEFAULT_SECRET;

  console.log(`[KRS Webhook] Disparando conversão para '${code}' no jogo '${payload.game_slug}' - Depósito: R$ ${payload.amount_deposited.toFixed(2)} - Comissão: R$ ${payload.commission_amount.toFixed(2)}`);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(KRS_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-krs-secret': effectiveSecret,
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeout);

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn(`[KRS Webhook] Falhou com HTTP ${res.status}:`, json);
      return { success: false, status: res.status, error: json.error || json.message || `HTTP_${res.status}` };
    }

    console.log(`[KRS Webhook] Conversão confirmada com sucesso:`, json.message || json);
    return { success: true, data: json };
  } catch (error) {
    console.warn(`[KRS Webhook] Erro de rede ou timeout:`, error.message);
    return { success: false, error: error.message };
  }
}
