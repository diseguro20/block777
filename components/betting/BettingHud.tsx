import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useBetting } from '@/hooks/useBettingState';
import { formatCurrency, BET_PRESETS, calculatePayout } from '@/constants/Betting';
import Animated, { useAnimatedStyle, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { AuthModal } from './AuthModal';

interface BettingHudProps {
  onCashout?: () => void;
  inGame?: boolean;
}

export const BettingHud: React.FC<BettingHudProps> = ({ onCashout, inGame = false }) => {
  const {
    balance,
    isDemo,
    setIsDemo,
    bet,
    setBet,
    doubleBet,
    halfBet,
    multiplier,
    status,
    setIsWalletOpen,
    setIsHistoryOpen,
    setIsAuthOpen,
    user,
    token,
  } = useBetting();

  const currentPayout = calculatePayout(bet, multiplier);

  const glowStyle = useAnimatedStyle(() => ({
    shadowOpacity: withRepeat(
      withSequence(withTiming(0.8, { duration: 600 }), withTiming(0.3, { duration: 600 })),
      -1,
      true
    ),
  }));

  const handleDecreaseBet = () => {
    if (inGame) return;
    const currentIndex = BET_PRESETS.indexOf(bet);
    if (currentIndex > 0) {
      setBet(BET_PRESETS[currentIndex - 1]);
    } else if (bet > BET_PRESETS[0]) {
      setBet(BET_PRESETS[0]);
    }
  };

  const handleIncreaseBet = () => {
    if (inGame) return;
    const currentIndex = BET_PRESETS.indexOf(bet);
    if (currentIndex !== -1 && currentIndex < BET_PRESETS.length - 1) {
      setBet(BET_PRESETS[currentIndex + 1]);
    } else {
      setBet(Math.min(bet * 2, 500));
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Header Bar */}
      <View style={styles.headerBar}>
        {/* Toggle Real vs Demo Mode */}
        <TouchableOpacity style={styles.demoBadge} onPress={() => !inGame && setIsDemo(!isDemo)}>
          <Text style={{ fontSize: 13 }}>{isDemo ? '🎪' : '🔥'}</Text>
          <Text style={[styles.demoText, { color: isDemo ? '#E87F24' : '#F7B731' }]}>
            {isDemo ? 'MODO DEMO' : 'MODO REAL'}
          </Text>
        </TouchableOpacity>

        {/* User Auth or Balance */}
        {token && user ? (
          <TouchableOpacity style={styles.balanceContainer} onPress={() => setIsWalletOpen(true)}>
            <Text style={{ fontSize: 13 }}>💰</Text>
            <Text style={styles.balanceText}>{formatCurrency(balance)}</Text>
            <View style={styles.plusBtn}>
              <Ionicons name="add" size={12} color="#1a0a2e" />
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.authTriggerBtn} onPress={() => setIsAuthOpen(true)}>
            <Text style={styles.authTriggerBtnText}>🔑 ENTRAR / CADASTRAR (BÔNUS 300%)</Text>
          </TouchableOpacity>
        )}

        {/* History Modal Trigger */}
        <TouchableOpacity style={styles.iconBtn} onPress={() => setIsHistoryOpen(true)}>
          <Text style={{ fontSize: 16 }}>📜</Text>
        </TouchableOpacity>
      </View>

      {/* Bet Controls (Presets + Double/Half Inspired by Pesca Junina) */}
      {!inGame && (
        <View style={styles.betControlsContainer}>
          <Text style={styles.controlLabel}>🌽 VALOR DA APOSTA (R$)</Text>
          <View style={styles.betSelector}>
            <TouchableOpacity style={styles.stepBtn} onPress={handleDecreaseBet}>
              <Text style={styles.stepBtnText}>-</Text>
            </TouchableOpacity>

            <View style={styles.betDisplay}>
              <Text style={styles.betValueText}>{formatCurrency(bet)}</Text>
            </View>

            <TouchableOpacity style={styles.stepBtn} onPress={handleIncreaseBet}>
              <Text style={styles.stepBtnText}>+</Text>
            </TouchableOpacity>
          </View>

          {/* Presets Row with 2X and /2 */}
          <View style={styles.presetsRow}>
            <TouchableOpacity style={styles.calcBtn} onPress={halfBet}>
              <Text style={styles.calcBtnText}>1/2</Text>
            </TouchableOpacity>

            {BET_PRESETS.slice(0, 5).map((preset) => (
              <TouchableOpacity
                key={preset}
                style={[styles.presetBtn, bet === preset && styles.presetBtnActive]}
                onPress={() => setBet(preset)}
              >
                <Text style={[styles.presetText, bet === preset && styles.presetTextActive]}>
                  R${preset}
                </Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity style={styles.calcBtn} onPress={doubleBet}>
              <Text style={styles.calcBtnText}>2X</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* In-Game Cashout Panel */}
      {inGame && (
        <View style={styles.inGamePanel}>
          <View style={styles.multiInfo}>
            <View style={styles.multiBadge}>
              <Text style={styles.multiLabel}>🎆 MULTIPLICADOR</Text>
              <Text style={styles.multiVal}>{multiplier.toFixed(2)}x</Text>
            </View>

            <View style={styles.payoutBadge}>
              <Text style={styles.payoutLabel}>💰 LUCRO ACUMULADO</Text>
              <Text style={styles.payoutVal}>{formatCurrency(currentPayout)}</Text>
            </View>
          </View>

          {status === 'IN_GAME' && (
            <Animated.View style={[styles.cashoutBtnWrapper, glowStyle]}>
              <TouchableOpacity style={styles.cashoutBtn} onPress={onCashout} activeOpacity={0.8}>
                <Text style={{ fontSize: 18 }}>🌽</Text>
                <Text style={styles.cashoutBtnText}>RESGATAR R$ {currentPayout.toFixed(2)}</Text>
              </TouchableOpacity>
            </Animated.View>
          )}
        </View>
      )}

      {/* Render AuthModal */}
      <AuthModal />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(26, 10, 46, 0.94)',
    borderBottomWidth: 2,
    borderBottomColor: '#8B5E3C',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    gap: 6,
  },
  demoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(139, 94, 60, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(247, 183, 49, 0.3)',
    gap: 4,
  },
  demoText: {
    fontFamily: 'Silkscreen',
    fontSize: 8.5,
    fontWeight: 'bold',
  },
  balanceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(247, 183, 49, 0.15)',
    borderWidth: 1.5,
    borderColor: '#F7B731',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 4,
  },
  balanceText: {
    fontFamily: 'Silkscreen',
    fontSize: 12,
    color: '#F7B731',
    fontWeight: 'bold',
  },
  plusBtn: {
    backgroundColor: '#F7B731',
    borderRadius: 8,
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authTriggerBtn: {
    backgroundColor: '#E8432F',
    borderWidth: 1.5,
    borderColor: '#F7B731',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  authTriggerBtnText: {
    fontFamily: 'Silkscreen',
    fontSize: 8.5,
    color: '#fff',
    fontWeight: 'bold',
  },
  iconBtn: {
    backgroundColor: 'rgba(139, 94, 60, 0.3)',
    padding: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(247, 183, 49, 0.2)',
  },
  betControlsContainer: {
    alignItems: 'center',
    marginTop: 2,
  },
  controlLabel: {
    fontFamily: 'Silkscreen',
    fontSize: 8.5,
    color: '#F5E6C8',
    marginBottom: 4,
    opacity: 0.75,
  },
  betSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    width: '90%',
    maxWidth: 280,
  },
  stepBtn: {
    backgroundColor: '#8B5E3C',
    width: 36,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F7B731',
  },
  stepBtnText: {
    color: '#F5E6C8',
    fontSize: 18,
    fontWeight: 'bold',
  },
  betDisplay: {
    flex: 1,
    backgroundColor: 'rgba(26, 10, 46, 0.8)',
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#8B5E3C',
    marginHorizontal: 4,
  },
  betValueText: {
    fontFamily: 'Silkscreen',
    fontSize: 13,
    color: '#F7B731',
    fontWeight: 'bold',
  },
  presetsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  calcBtn: {
    backgroundColor: '#2D8B4E',
    borderWidth: 1,
    borderColor: '#F7B731',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  calcBtnText: {
    fontFamily: 'Silkscreen',
    fontSize: 9,
    color: '#fff',
    fontWeight: 'bold',
  },
  presetBtn: {
    backgroundColor: 'rgba(139, 94, 60, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(247, 183, 49, 0.2)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  presetBtnActive: {
    backgroundColor: '#E8432F',
    borderColor: '#F7B731',
  },
  presetText: {
    fontFamily: 'Silkscreen',
    fontSize: 9,
    color: '#F5E6C8',
    opacity: 0.75,
  },
  presetTextActive: {
    color: '#F5E6C8',
    fontWeight: 'bold',
    opacity: 1,
  },
  inGamePanel: {
    gap: 6,
  },
  multiInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  multiBadge: {
    backgroundColor: 'rgba(232, 67, 47, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#E8432F',
    alignItems: 'center',
    flex: 1,
    marginRight: 4,
  },
  multiLabel: {
    fontFamily: 'Silkscreen',
    fontSize: 8,
    color: '#E8432F',
  },
  multiVal: {
    fontFamily: 'Silkscreen',
    fontSize: 14,
    color: '#F5E6C8',
    fontWeight: 'bold',
  },
  payoutBadge: {
    backgroundColor: 'rgba(45, 139, 78, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#2D8B4E',
    alignItems: 'center',
    flex: 1,
    marginLeft: 4,
  },
  payoutLabel: {
    fontFamily: 'Silkscreen',
    fontSize: 8,
    color: '#2D8B4E',
  },
  payoutVal: {
    fontFamily: 'Silkscreen',
    fontSize: 14,
    color: '#2D8B4E',
    fontWeight: 'bold',
  },
  cashoutBtnWrapper: {
    borderRadius: 12,
    shadowColor: '#F7B731',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 10,
  },
  cashoutBtn: {
    backgroundColor: '#F7B731',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 12,
    gap: 8,
    borderWidth: 2,
    borderColor: '#E8432F',
  },
  cashoutBtnText: {
    fontFamily: 'Silkscreen',
    fontSize: 13,
    color: '#1a0a2e',
    fontWeight: 'bold',
  },
});
