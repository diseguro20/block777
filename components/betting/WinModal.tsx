import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useBetting } from '@/hooks/useBettingState';
import { formatCurrency } from '@/constants/Betting';
import Animated, { ZoomIn } from 'react-native-reanimated';

interface WinModalProps {
  onRestart: () => void;
  onGoMenu: () => void;
}

export const WinModal: React.FC<WinModalProps> = ({ onRestart, onGoMenu }) => {
  const { status, lastWin } = useBetting();

  if (status !== 'CASHED_OUT' && status !== 'GAME_OVER') {
    return null;
  }

  const isWin = status === 'CASHED_OUT';

  return (
    <Modal visible={true} transparent animationType="fade">
      <View style={styles.overlay}>
        <Animated.View entering={ZoomIn.duration(400)} style={styles.modalCard}>
          {/* Bandeirinhas no topo do modal */}
          <View style={styles.bandeirinhasRow}>
            {[...Array(10)].map((_, i) => {
              const colors = ['#E8432F', '#F7B731', '#2D8B4E', '#E87F24', '#E84393'];
              return (
                <View key={i} style={[styles.miniFlag, { backgroundColor: colors[i % colors.length] }]} />
              );
            })}
          </View>

          <Text style={{ fontSize: 56, textAlign: 'center', marginVertical: 8 }}>
            {isWin ? '🎉' : '💥'}
          </Text>

          <Text style={[styles.title, isWin ? styles.winText : styles.lossText]}>
            {isWin ? 'ARRAIÁ DO PRÊMIO!' : 'FOGOS APAGARAM!'}
          </Text>

          <Text style={styles.subtitle}>
            {isWin
              ? 'Você resgatou os lucros no arraial! 🌽🎪'
              : 'Os blocos travaram antes do resgate... 💨'}
          </Text>

          {lastWin && (
            <View style={styles.detailsCard}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>APOSTA:</Text>
                <Text style={styles.detailVal}>{formatCurrency(lastWin.betAmount)}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>MULTIPLICADOR:</Text>
                <Text style={[styles.detailVal, { color: '#E8432F' }]}>
                  {lastWin.multiplier.toFixed(2)}x
                </Text>
              </View>

              <View style={[styles.detailRow, styles.divider]}>
                <Text style={styles.detailLabel}>{isWin ? 'RECEBIDO:' : 'PERDA:'}</Text>
                <Text style={[styles.winVal, { color: isWin ? '#2D8B4E' : '#E8432F' }]}>
                  {isWin ? formatCurrency(lastWin.winAmount) : formatCurrency(lastWin.betAmount)}
                </Text>
              </View>
            </View>
          )}

          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.restartBtn} onPress={onRestart}>
              <Text style={{ fontSize: 16 }}>🔥</Text>
              <Text style={styles.restartBtnText}>JOGAR DE NOVO</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuBtn} onPress={onGoMenu}>
              <Text style={styles.menuBtnText}>🏠 MENU</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(26, 10, 46, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#1a0a2e',
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#8B5E3C',
    padding: 20,
    alignItems: 'center',
  },
  bandeirinhasRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 6,
    gap: 4,
  },
  miniFlag: {
    width: 14,
    height: 18,
    clipPath: 'polygon(0 0, 100% 0, 50% 100%)',
    borderRadius: 1,
  },
  title: {
    fontFamily: 'Silkscreen',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 4,
  },
  winText: {
    color: '#F7B731',
  },
  lossText: {
    color: '#E8432F',
  },
  subtitle: {
    fontFamily: 'Silkscreen',
    fontSize: 10,
    color: '#F5E6C8',
    textAlign: 'center',
    marginBottom: 16,
    opacity: 0.7,
  },
  detailsCard: {
    width: '100%',
    backgroundColor: 'rgba(139, 94, 60, 0.15)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#8B5E3C',
    marginBottom: 16,
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontFamily: 'Silkscreen',
    fontSize: 9,
    color: '#F5E6C8',
    opacity: 0.7,
  },
  detailVal: {
    fontFamily: 'Silkscreen',
    fontSize: 12,
    color: '#F5E6C8',
    fontWeight: 'bold',
  },
  divider: {
    borderTopWidth: 1,
    borderColor: 'rgba(139, 94, 60, 0.4)',
    paddingTop: 8,
    marginTop: 4,
  },
  winVal: {
    fontFamily: 'Silkscreen',
    fontSize: 16,
    fontWeight: 'bold',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  restartBtn: {
    flex: 2,
    backgroundColor: '#F7B731',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
    borderWidth: 2,
    borderColor: '#E8432F',
  },
  restartBtnText: {
    fontFamily: 'Silkscreen',
    fontSize: 11,
    color: '#1a0a2e',
    fontWeight: 'bold',
  },
  menuBtn: {
    flex: 1,
    backgroundColor: 'rgba(139, 94, 60, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#8B5E3C',
  },
  menuBtnText: {
    fontFamily: 'Silkscreen',
    fontSize: 11,
    color: '#F5E6C8',
  },
});
