import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import Animated, { BounceInUp, FadeIn } from 'react-native-reanimated';
import { MenuStateType, useSetAppState, GameModeType } from '@/hooks/useAppState';
import { BettingHud } from './betting/BettingHud';
import { WalletModal } from './betting/WalletModal';
import { BetHistoryModal } from './betting/BetHistoryModal';
import { useBetting, formatBRL } from '@/hooks/useBettingState';
import { Game } from './game/Game';
import { calculatePayout } from '@/constants/Betting';

export default function MainMenu() {
  const [_, appendAppState] = useSetAppState();
  const { balance, bet, setStatus, setMultiplier, multiplier, isDemo, setIsWalletOpen, setIsHistoryOpen } =
    useBetting();

  const currentPayout = calculatePayout(bet, multiplier);
  const formattedPayout = formatBRL(currentPayout);

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

        {/* Banner de Marketing Agressivo */}
        <View style={styles.promoCard}>
          <View style={styles.promoHeaderBadge}>
            <Text style={styles.promoHeaderBadgeText}>🔥 OFERTA EXCLUSIVA DE BOAS-VINDAS 🚀</Text>
          </View>
          <Text style={styles.promoTitle}>BÔNUS DE 300% NO 1º DEPÓSITO!</Text>
          <View style={styles.promoBonusBox}>
            <Text style={styles.promoBonusText}>🌽 DEPOSITOU R$ 20,00 ➔ JOGUE COM R$ 60,00! 💰</Text>
          </View>
          <Text style={styles.promoSubText}>
            Aproveite os multiplicadores de até 10X e saques PIX instantâneos no Arraiá!
          </Text>
        </View>

        {/* Jogo Real Blockerino 8x8 na Prévia Principal */}
        <View style={styles.previewGameCard}>
          <Text style={styles.previewTitle}>🎮 JOGO REAL EM PRÉVIA GRATUITA:</Text>
          <Text style={styles.previewSubTitle}>
            Arraste as peças abaixo para o grid original 8x8 e teste seus prêmios:
          </Text>

          <View style={styles.previewGameContainer}>
            <Game gameMode={GameModeType.Classic} />
          </View>

          {/* CTA Dinâmico com Lucro em Tempo Real */}
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={() => setIsWalletOpen(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaButtonText}>
              🔥 GANHAR {formattedPayout} DE VERDADE (RESGATAR 300%) 🚀
            </Text>
          </TouchableOpacity>
        </View>

        {/* Seletor de Modos de Jogo */}
        <View style={styles.menuButtonsContainer}>
          <TouchableOpacity
            style={[styles.playBtn, styles.classicBtn]}
            onPress={() => handleStartGame(GameModeType.Classic)}
            activeOpacity={0.85}
          >
            <View style={styles.btnContent}>
              <Text style={{ fontSize: 24 }}>🌽</Text>
              <View style={styles.btnTextCol}>
                <Text style={styles.btnMainText}>MODO CLÁSSICO 8x8</Text>
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
                <Text style={[styles.btnMainText, { color: '#F7B731' }]}>MODO CHAOS 10x10</Text>
                <Text style={[styles.btnSubText, { color: '#E87F24' }]}>
                  5 peças & Super Multiplicadores 🪗
                </Text>
              </View>
            </View>
          </TouchableOpacity>

          {/* Navegação Secundária */}
          <View style={styles.subGrid}>
            <TouchableOpacity style={styles.subBtn} onPress={() => setIsWalletOpen(true)}>
              <Text style={{ fontSize: 16 }}>💰</Text>
              <Text style={[styles.subBtnText, { color: '#F7B731' }]}>CAIXA PIX (300% BÔNUS)</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.subBtn} onPress={() => setIsHistoryOpen(true)}>
              <Text style={{ fontSize: 16 }}>📜</Text>
              <Text style={styles.subBtnText}>HISTÓRICO</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Animated.Text entering={FadeIn} style={styles.footer}>
          🎪 ARRAIÁ DIGITAL BET — PLATAFORMA OFICIAL 🌽
        </Animated.Text>
      </ScrollView>

      {/* Modais */}
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
    paddingBottom: 32,
    width: '100%',
  },
  logoContainer: {
    alignItems: 'center',
    marginVertical: 10,
  },
  logoTitle: {
    fontFamily: 'Silkscreen',
    fontSize: 26,
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
  promoCard: {
    width: '92%',
    maxWidth: 420,
    backgroundColor: 'rgba(232, 67, 47, 0.2)',
    borderWidth: 2,
    borderColor: '#F7B731',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    marginBottom: 14,
  },
  promoHeaderBadge: {
    backgroundColor: '#E8432F',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    marginBottom: 6,
  },
  promoHeaderBadgeText: {
    fontFamily: 'Silkscreen',
    fontSize: 9,
    color: '#fff',
    fontWeight: 'bold',
  },
  promoTitle: {
    fontFamily: 'Silkscreen',
    fontSize: 16,
    color: '#F7B731',
    textAlign: 'center',
    fontWeight: 'bold',
    marginBottom: 6,
  },
  promoBonusBox: {
    backgroundColor: 'rgba(45, 139, 78, 0.35)',
    borderWidth: 1.5,
    borderColor: '#2D8B4E',
    borderRadius: 10,
    padding: 8,
    marginVertical: 6,
    width: '100%',
  },
  promoBonusText: {
    fontFamily: 'Silkscreen',
    fontSize: 11,
    color: '#fff',
    textAlign: 'center',
    fontWeight: 'bold',
  },
  promoSubText: {
    fontFamily: 'Silkscreen',
    fontSize: 8.5,
    color: '#F5E6C8',
    opacity: 0.8,
    textAlign: 'center',
  },
  previewGameCard: {
    width: '92%',
    maxWidth: 420,
    backgroundColor: 'rgba(26, 10, 46, 0.92)',
    borderWidth: 2,
    borderColor: '#8B5E3C',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  previewTitle: {
    fontFamily: 'Silkscreen',
    fontSize: 12,
    color: '#F7B731',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  previewSubTitle: {
    fontFamily: 'Silkscreen',
    fontSize: 8.5,
    color: '#F5E6C8',
    opacity: 0.75,
    marginBottom: 10,
    textAlign: 'center',
  },
  previewGameContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaButton: {
    width: '100%',
    backgroundColor: '#F7B731',
    borderWidth: 2,
    borderColor: '#E8432F',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 10,
    marginTop: 12,
    alignItems: 'center',
  },
  ctaButtonText: {
    fontFamily: 'Silkscreen',
    fontSize: 11,
    color: '#1a0a2e',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  menuButtonsContainer: {
    width: '92%',
    maxWidth: 420,
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
    fontSize: 13,
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
    fontSize: 8.5,
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
