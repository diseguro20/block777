import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai';
import { INITIAL_BALANCE, BetRecord } from '@/constants/Betting';

export type BetStatusType = 'IDLE' | 'IN_GAME' | 'CASHED_OUT' | 'GAME_OVER';

export const walletBalanceAtom = atom<number>(INITIAL_BALANCE);
export const isDemoModeAtom = atom<boolean>(false);
export const currentBetAtom = atom<number>(2.0);
export const currentMultiplierAtom = atom<number>(1.0);
export const betStatusAtom = atom<BetStatusType>('IDLE');
export const betHistoryAtom = atom<BetRecord[]>([]);
export const isWalletModalOpenAtom = atom<boolean>(false);
export const isHistoryModalOpenAtom = atom<boolean>(false);
export const lastWinRecordAtom = atom<BetRecord | null>(null);

export function useBetting() {
  const [balance, setBalance] = useAtom(walletBalanceAtom);
  const [isDemo, setIsDemo] = useAtom(isDemoModeAtom);
  const [bet, setBet] = useAtom(currentBetAtom);
  const [multiplier, setMultiplier] = useAtom(currentMultiplierAtom);
  const [status, setStatus] = useAtom(betStatusAtom);
  const [history, setHistory] = useAtom(betHistoryAtom);
  const [isWalletOpen, setIsWalletOpen] = useAtom(isWalletModalOpenAtom);
  const [isHistoryOpen, setIsHistoryOpen] = useAtom(isHistoryModalOpenAtom);
  const [lastWin, setLastWin] = useAtom(lastWinRecordAtom);

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

  const addBetHistory = (record: BetRecord) => {
    setHistory((prev) => [record, ...prev.slice(0, 49)]);
  };

  return {
    balance,
    setBalance,
    isDemo,
    setIsDemo,
    bet,
    setBet,
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
    lastWin,
    setLastWin,
    deposit,
    withdraw,
  };
}
