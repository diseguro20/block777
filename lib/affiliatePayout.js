const cents = value => Math.round(Number(value));

export function resolveAffiliatePayout({ amount, availableBalance } = {}) {
  const payoutAmount = cents(amount);
  const balanceBefore = Math.max(0, cents(availableBalance) || 0);
  if (!Number.isSafeInteger(payoutAmount) || payoutAmount <= 0) {
    throw new Error('Informe um valor de pagamento válido.');
  }
  if (payoutAmount > balanceBefore) {
    throw new Error('O pagamento não pode ser maior que a comissão disponível.');
  }
  return {
    amount: payoutAmount,
    balanceBefore,
    balanceAfter: balanceBefore - payoutAmount
  };
}

export function normalizePayoutDescription(value) {
  return String(value || '').trim().slice(0, 160);
}
