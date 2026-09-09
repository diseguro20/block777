import { calculateDepositPromotion } from './promotion.js';

export function resolveDepositCredit(deposit = {}, settings = {}) {
  const calculated = calculateDepositPromotion(deposit.amount, settings);
  const bonusAmount = deposit.bonusAmount == null
    ? calculated.bonusAmount
    : Math.max(0, Math.round(Number(deposit.bonusAmount) || 0));
  const rolloverRequired = deposit.rolloverRequired == null
    ? calculated.rolloverRequired
    : Math.max(0, Math.round(Number(deposit.rolloverRequired) || 0));
  return {
    bonusAmount,
    rolloverRequired,
    creditedAmount: Math.max(0, Math.round(Number(deposit.amount) || 0)) + bonusAmount
  };
}
