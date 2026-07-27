import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import Animated, { BounceInDown, BounceInUp, FadeIn } from 'react-native-reanimated';
import { MenuStateType, useSetAppState, GameModeType } from '@/hooks/useAppState';
import { useBetting } from '@/hooks/useBettingState';
import { WalletModal } from './betting/WalletModal';

export function LandingScreen() {
  const [_, appendAppState, __] = useSetAppState();
  const { setIsWalletOpen, setIsDemo, setStatus, setMultiplier } = useBetting();

  // Ticker de prova social (Saques ao vivo)
  const recentWins = [
    { user: 'joao_99', amount: 'R$ 340,00' },
    { user: 'mariana_caipira', amount: 'R$ 750,00' },
    { user: 'pedro_bet', amount: 'R$ 1.200,00' },
    { user: 'lucas_block', amount: 'R$ 520,00' },
  ];
  const [winIndex, setWinIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setWinIndex((prev) => (prev + 1) % recentWins.length);
    }, 3500);
    return () => clearInterval(timer);
  }, []);

  const handleOpenDeposit = () => {
    setIsWalletOpen(true);
  };

  const handleStartDemoGame = () => {
    setIsDemo(true);
    setMultiplier(1.0);
    setStatus('IN_GAME');
    appendAppState(GameModeType.Classic);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        style={{ width: '100%' }}
      >
        {/* Header Centralizado */}
        <Animated.View entering={BounceInUp.duration(600)} style={styles.logoContainer}>
          <Text style={styles.logoTitle}>BLOCKERINO</Text>
          <View style={styles.betBadge}>
            <Text style={styles.betBadgeText}>🎪 BÔNUS DE 300% ATIVO 🌽</Text>
          </View>
        </Animated.View>

        {/* Card Principal de Marketing Agressivo */}
        <Animated.View entering={BounceInDown.duration(700)} style={styles.promoCard}>
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>🔥 OFERTA EXCLUSIVA DE BOAS-VINDAS 🚀</Text>
          </View>

          <Text style={styles.promoTitle}>BÔNUS DE 300% NO 1º DEPÓSITO!</Text>

          <View style={styles.bonusBox}>
            <Text style={styles.bonusBoxText}>
              🌽 DEPOSITOU R$ 20,00 ➔ JOGUE COM R$ 60,00! 💰
            </Text>
          </View>

          <Text style={styles.promoDesc}>
            Aproveite multiplicadores de até 10X e saques PIX instantâneos no Arraiá!
          </Text>

          {/* Ticker de Prova Social */}
          <View style={styles.tickerBox}>
            <Text style={styles.tickerText}>
              🎉 <Text style={{ color: '#F7B731', fontWeight: 'bold' }}>{recentWins[winIndex].user}</Text> sacou <Text style={{ color: '#2D8B4E', fontWeight: 'bold' }}>{recentWins[winIndex].amount}</Text> via PIX!
            </Text>
          </View>

          {/* Botões de Ação Principais (CTAs Agressivos) */}
          <View style={styles.ctaContainer}>
            <TouchableOpacity
              style={styles.mainCtaBtn}
              onPress={handleOpenDeposit}
              activeOpacity={0.85}
            >
              <Text style={styles.mainCtaBtnText}>
                🔥 RESGATAR R$ 60,00 AGORA (BÔNUS 300%) 🚀
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.demoBtn}
              onPress={handleStartDemoGame}
              activeOpacity={0.85}
            >
              <Text style={styles.demoBtnText}>
                🎮 JOGAR PRÉVIA GRATUITA (MODO TREINO 8x8)
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Rodapé Decorativo */}
        <Animated.Text entering={FadeIn} style={styles.footer}>
          🎪 BLOCKERINO BET — PLATAFORMA OFICIAL DA FESTA JUNINA 🌽
        </Animated.Text>
      </ScrollView>

      {/* Modal de Carteira PIX */}
      <WalletModal />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    width: '100%',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 8,
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
  promoCard: {
    width: '94%',
    maxWidth: 440,
    backgroundColor: 'rgba(26, 10, 46, 0.94)',
    borderWidth: 2,
    borderColor: '#F7B731',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginVertical: 6,
  },
  headerBadge: {
    backgroundColor: '#E8432F',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    marginBottom: 8,
  },
  headerBadgeText: {
    fontFamily: 'Silkscreen',
    fontSize: 9,
    color: '#ffffff',
    fontWeight: 'bold',
  },
  promoTitle: {
    fontFamily: 'Silkscreen',
    fontSize: 16,
    color: '#F7B731',
    textAlign: 'center',
    fontWeight: 'bold',
    marginBottom: 6,
    textShadowColor: '#E8432F',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
  },
  bonusBox: {
    backgroundColor: 'rgba(45, 139, 78, 0.35)',
    borderWidth: 1.5,
    borderColor: '#2D8B4E',
    borderRadius: 10,
    padding: 10,
    marginVertical: 6,
    width: '100%',
  },
  bonusBoxText: {
    fontFamily: 'Silkscreen',
    fontSize: 10.5,
    color: '#ffffff',
    textAlign: 'center',
    fontWeight: 'bold',
  },
  promoDesc: {
    fontFamily: 'Silkscreen',
    fontSize: 8.5,
    color: '#F5E6C8',
    opacity: 0.85,
    textAlign: 'center',
    marginVertical: 6,
  },
  tickerBox: {
    backgroundColor: 'rgba(139, 94, 60, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(247, 183, 49, 0.4)',
    borderRadius: 8,
    padding: 8,
    marginVertical: 8,
    width: '100%',
  },
  tickerText: {
    fontFamily: 'Silkscreen',
    fontSize: 8.5,
    color: '#F5E6C8',
    textAlign: 'center',
  },
  ctaContainer: {
    width: '100%',
    gap: 10,
    marginTop: 10,
  },
  mainCtaBtn: {
    width: '100%',
    backgroundColor: '#F7B731',
    borderWidth: 2,
    borderColor: '#E8432F',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  mainCtaBtnText: {
    fontFamily: 'Silkscreen',
    fontSize: 11,
    color: '#1a0a2e',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  demoBtn: {
    width: '100%',
    backgroundColor: '#2D8B4E',
    borderWidth: 1.5,
    borderColor: '#F7B731',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  demoBtnText: {
    fontFamily: 'Silkscreen',
    fontSize: 9.5,
    color: '#ffffff',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  footer: {
    fontFamily: 'Silkscreen',
    fontSize: 8.5,
    color: '#8B5E3C',
    marginVertical: 10,
    textAlign: 'center',
  },
});
