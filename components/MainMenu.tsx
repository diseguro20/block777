import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import Animated, { BounceInUp, FadeIn } from 'react-native-reanimated';
import { MenuStateType, useSetAppState, GameModeType } from '@/hooks/useAppState';
import { BettingHud } from './betting/BettingHud';
import { WalletModal } from './betting/WalletModal';
import { BetHistoryModal } from './betting/BetHistoryModal';
import { useBetting } from '@/hooks/useBettingState';

export default function MainMenu() {
  const [_, appendAppState] = useSetAppState();
  const { balance, bet, setStatus, setMultiplier, isDemo, setIsWalletOpen, setIsHistoryOpen } =
    useBetting();

  const handleStartGame = (mode: GameModeType) => {
    if (!isDemo && balance < bet) {
      setIsWalletOpen(true);
      return;
    }
    setMultiplier(1.0);
    setStatus('IN_GAME');
    appendAppState(mode);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        style={{ width: '100%' }}
      >
        {/* Betting HUD Bar */}
        <BettingHud inGame={false} />

        {/* Compact Logo Header */}
        <Animated.View entering={BounceInUp.duration(600)} style={styles.logoContainer}>
          <Text style={styles.logoTitle}>BLOCKERINO</Text>
          <View style={styles.betBadge}>
            <Text style={styles.betBadgeText}>🔥 FESTA JUNINA BET 🌽</Text>
          </View>
        </Animated.View>

        {/* Action Buttons Grid */}
        <View style={styles.menuButtonsContainer}>
          {/* Modes Row */}
          <TouchableOpacity
            style={[styles.playBtn, styles.classicBtn]}
            onPress={() => handleStartGame(GameModeType.Classic)}
            activeOpacity={0.85}
          >
            <View style={styles.btnContent}>
              <Text style={{ fontSize: 24 }}>🌽</Text>
              <View style={styles.btnTextCol}>
                <Text style={styles.btnMainText}>CLÁSSICO 8x8</Text>
                <Text style={styles.btnSubText}>Aposta tradicional com quebra de linhas</Text>
              </View>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.playBtn, styles.chaosBtn]}
            onPress={() => handleStartGame(GameModeType.Chaos)}
            activeOpacity={0.85}
          >
            <View style={styles.btnContent}>
              <Text style={{ fontSize: 24 }}>🎆</Text>
              <View style={styles.btnTextCol}>
                <Text style={[styles.btnMainText, { color: '#F7B731' }]}>CHAOS 10x10</Text>
                <Text style={[styles.btnSubText, { color: '#E87F24' }]}>
                  5 peças & Super Multiplicadores 🪗
                </Text>
              </View>
            </View>
          </TouchableOpacity>

          {/* Nav Grid */}
          <View style={styles.subGrid}>
            <TouchableOpacity style={styles.subBtn} onPress={() => setIsWalletOpen(true)}>
              <Text style={{ fontSize: 16 }}>💰</Text>
              <Text style={[styles.subBtnText, { color: '#F7B731' }]}>DEPOSITAR / SAQUE</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.subBtn} onPress={() => setIsHistoryOpen(true)}>
              <Text style={{ fontSize: 16 }}>📜</Text>
              <Text style={styles.subBtnText}>HISTÓRICO</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.subGrid}>
            <TouchableOpacity style={styles.subBtn} onPress={() => appendAppState(MenuStateType.HIGH_SCORES)}>
              <Text style={{ fontSize: 16 }}>🏆</Text>
              <Text style={[styles.subBtnText, { color: '#E8432F' }]}>RANKING</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.subBtn} onPress={() => appendAppState(MenuStateType.OPTIONS)}>
              <Text style={{ fontSize: 16 }}>⚙️</Text>
              <Text style={[styles.subBtnText, { color: '#aaa' }]}>OPÇÕES</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Animated.Text entering={FadeIn} style={styles.footer}>
          🎪 ARRAIÁ DIGITAL BET — PLATAFORMA OFICIAL 🌽
        </Animated.Text>
      </ScrollView>

      {/* Modals */}
      <WalletModal />
      <BetHistoryModal />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    width: '100%',
    height: '100%',
  },
  scrollContent: {
    alignItems: 'center',
    paddingBottom: 24,
    width: '100%',
  },
  logoContainer: {
    alignItems: 'center',
    marginVertical: 12,
  },
  logoTitle: {
    fontFamily: 'Silkscreen',
    fontSize: 28,
    color: '#F7B731',
    textAlign: 'center',
    letterSpacing: 2,
    textShadowColor: '#E8432F',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 6,
  },
  betBadge: {
    backgroundColor: '#E8432F',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 4,
    borderWidth: 1.5,
    borderColor: '#F7B731',
  },
  betBadgeText: {
    fontFamily: 'Silkscreen',
    fontSize: 9,
    color: '#F5E6C8',
    fontWeight: 'bold',
  },
  menuButtonsContainer: {
    width: '92%',
    maxWidth: 400,
    gap: 8,
    alignItems: 'center',
  },
  playBtn: {
    width: '100%',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 2,
  },
  classicBtn: {
    backgroundColor: '#2D8B4E',
    borderColor: '#F7B731',
  },
  chaosBtn: {
    backgroundColor: '#1a0a2e',
    borderColor: '#E8432F',
  },
  btnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  btnTextCol: {
    flex: 1,
  },
  btnMainText: {
    fontFamily: 'Silkscreen',
    fontSize: 15,
    color: '#F5E6C8',
    fontWeight: 'bold',
  },
  btnSubText: {
    fontFamily: 'Silkscreen',
    fontSize: 8.5,
    color: '#F5E6C8',
    marginTop: 2,
    opacity: 0.85,
  },
  subGrid: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  subBtn: {
    flex: 1,
    backgroundColor: 'rgba(139, 94, 60, 0.25)',
    borderWidth: 1.5,
    borderColor: 'rgba(247, 183, 49, 0.3)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
  },
  subBtnText: {
    fontFamily: 'Silkscreen',
    fontSize: 9.5,
    color: '#F5E6C8',
  },
  footer: {
    fontFamily: 'Silkscreen',
    fontSize: 8.5,
    color: '#8B5E3C',
    marginTop: 16,
    textAlign: 'center',
  },
});
