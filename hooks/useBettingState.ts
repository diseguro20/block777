import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai';
import { INITIAL_BALANCE, BetRecord } from '@/constants/Betting';

export type BetStatusType = 'IDLE' | 'IN_GAME' | 'CASHED_OUT' | 'GAME_OVER';

export interface UserData {
  id: string;
  username: string;
  email: string;
  balance: number; // Centavos
  role: string;
  is_admin?: boolean;
  is_influencer?: number;
  ref_code?: string;
}

export const walletBalanceAtom = atom<number>(INITIAL_BALANCE);
export const isDemoModeAtom = atom<boolean>(false);
export const currentBetAtom = atom<number>(2.0);
export const currentMultiplierAtom = atom<number>(1.0);
export const betStatusAtom = atom<BetStatusType>('IDLE');
export const betHistoryAtom = atom<BetRecord[]>([]);
export const isWalletModalOpenAtom = atom<boolean>(false);
export const isHistoryModalOpenAtom = atom<boolean>(false);
export const isAuthModalOpenAtom = atom<boolean>(false);
export const lastWinRecordAtom = atom<BetRecord | null>(null);
export const userTokenAtom = atom<string | null>(
  typeof window !== 'undefined' ? localStorage.getItem('token') : null
);
export const userDataAtom = atom<UserData | null>(null);

export function formatBRL(amount: number): string {
  const value = amount >= 100 && Number.isInteger(amount) ? amount / 100 : amount;
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function useBetting() {
  const [balance, setBalance] = useAtom(walletBalanceAtom);
  const [isDemo, setIsDemo] = useAtom(isDemoModeAtom);
  const [bet, setBet] = useAtom(currentBetAtom);
  const [multiplier, setMultiplier] = useAtom(currentMultiplierAtom);
  const [status, setStatus] = useAtom(betStatusAtom);
  const [history, setHistory] = useAtom(betHistoryAtom);
  const [isWalletOpen, setIsWalletOpen] = useAtom(isWalletModalOpenAtom);
  const [isHistoryOpen, setIsHistoryOpen] = useAtom(isHistoryModalOpenAtom);
  const [isAuthOpen, setIsAuthOpen] = useAtom(isAuthModalOpenAtom);
  const [lastWin, setLastWin] = useAtom(lastWinRecordAtom);
  const [token, setToken] = useAtom(userTokenAtom);
  const [user, setUser] = useAtom(userDataAtom);

  const deposit = (amount: number) => {
    setBalance((prev) => Math.round((prev + amount) * 100) / 100);
  };

  const withdraw = (amount: number): boolean => {
    if (balance >= amount) {
      setBalance((prev) => Math.round((prev - amount) * 100) / 100);
      return true;
    }
    return false;
  };

  const doubleBet = () => {
    setBet((prev) => Math.min(100.0, Math.round(prev * 2 * 100) / 100));
  };

  const halfBet = () => {
    setBet((prev) => Math.max(1.0, Math.round((prev / 2) * 100) / 100));
  };

  const addBetHistory = (record: BetRecord) => {
    setHistory((prev) => [record, ...prev.slice(0, 49)]);
  };

  const saveToken = (newToken: string | null) => {
    setToken(newToken);
    if (typeof window !== 'undefined') {
      if (newToken) {
        localStorage.setItem('token', newToken);
      } else {
        localStorage.removeItem('token');
      }
    }
  };

  return {
    balance,
    setBalance,
    isDemo,
    setIsDemo,
    bet,
    setBet,
    doubleBet,
    halfBet,
    multiplier,
    setMultiplier,
    status,
    setStatus,
    history,
    addBetHistory,
    isWalletOpen,
    setIsWalletOpen,
    isHistoryOpen,
    setIsHistoryOpen,
    isAuthOpen,
    setIsAuthOpen,
    lastWin,
    setLastWin,
    token,
    saveToken,
    user,
    setUser,
    deposit,
    withdraw,
  };
}
