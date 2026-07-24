export interface BetRecord {
  id: string;
  timestamp: number;
  betAmount: number;
  multiplier: number;
  winAmount: number;
  gameMode: string;
  cashedOut: boolean;
}

export const INITIAL_BALANCE = 100.0; // R$ 100,00 inicial

export const BET_PRESETS = [0.5, 1.0, 2.0, 5.0, 10.0, 20.0, 50.0];

export const MULTIPLIER_PER_LINE = 0.5; // Cada linha limpa adiciona +0.5x de multiplicador
export const BASE_MULTIPLIER = 1.0;
export const COMBO_BONUS_MULTIPLIER = 0.8; // Bônus por combo consecutivo de destruição de linhas

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(amount);
}

export function calculatePayout(betAmount: number, multiplier: number): number {
  return Math.round(betAmount * multiplier * 100) / 100;
}
