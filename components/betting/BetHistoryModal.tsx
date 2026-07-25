import React from 'react';
import { Modal, View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useBetting } from '@/hooks/useBettingState';
import { formatCurrency, BetRecord } from '@/constants/Betting';

export const BetHistoryModal: React.FC = () => {
  const { isHistoryOpen, setIsHistoryOpen, history } = useBetting();

  const renderItem = ({ item }: { item: BetRecord }) => {
    const isWin = item.cashedOut;
    const dateStr = new Date(item.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    return (
      <View style={styles.historyRow}>
        <View style={styles.rowLeft}>
          <Text style={styles.gameModeText}>
            {item.gameMode === 'classic' ? '🌽' : '🎆'} {item.gameMode.toUpperCase()}
          </Text>
          <Text style={styles.timeText}>{dateStr}</Text>
        </View>

        <View style={styles.rowCenter}>
          <Text style={styles.betLabel}>APOSTA</Text>
          <Text style={styles.betVal}>{formatCurrency(item.betAmount)}</Text>
        </View>

        <View style={styles.rowRight}>
          <Text style={[styles.multiVal, { color: isWin ? '#2D8B4E' : '#E8432F' }]}>
            {item.multiplier.toFixed(2)}x
          </Text>
          <Text style={[styles.resultVal, { color: isWin ? '#2D8B4E' : '#E8432F' }]}>
            {isWin ? `+${formatCurrency(item.winAmount)}` : `-${formatCurrency(item.betAmount)}`}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={isHistoryOpen}
      transparent
      animationType="fade"
      onRequestClose={() => setIsHistoryOpen(false)}
    >
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Text style={{ fontSize: 20 }}>📜</Text>
              <Text style={styles.titleText}>HISTÓRICO DO ARRAIAL</Text>
            </View>
            <TouchableOpacity onPress={() => setIsHistoryOpen(false)}>
              <Ionicons name="close" size={24} color="#F5E6C8" />
            </TouchableOpacity>
          </View>

          {/* List */}
          {history.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={{ fontSize: 36 }}>🎪</Text>
              <Text style={styles.emptyText}>Nenhuma aposta no arraial ainda.</Text>
            </View>
          ) : (
            <FlatList
              data={history}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              contentContainerStyle={styles.listContent}
            />
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(26, 10, 46, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
    backgroundColor: '#1a0a2e',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#8B5E3C',
    padding: 18,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  titleText: {
    fontFamily: 'Silkscreen',
    fontSize: 12,
    color: '#F7B731',
    fontWeight: 'bold',
  },
  listContent: {
    gap: 8,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(139, 94, 60, 0.15)',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(139, 94, 60, 0.3)',
  },
  rowLeft: {
    flex: 1,
  },
  gameModeText: {
    fontFamily: 'Silkscreen',
    fontSize: 10,
    color: '#F5E6C8',
  },
  timeText: {
    fontFamily: 'Silkscreen',
    fontSize: 8,
    color: '#8B5E3C',
    marginTop: 2,
  },
  rowCenter: {
    alignItems: 'center',
    marginHorizontal: 10,
  },
  betLabel: {
    fontFamily: 'Silkscreen',
    fontSize: 7,
    color: '#F5E6C8',
    opacity: 0.6,
  },
  betVal: {
    fontFamily: 'Silkscreen',
    fontSize: 10,
    color: '#F7B731',
  },
  rowRight: {
    alignItems: 'flex-end',
  },
  multiVal: {
    fontFamily: 'Silkscreen',
    fontSize: 11,
    fontWeight: 'bold',
  },
  resultVal: {
    fontFamily: 'Silkscreen',
    fontSize: 10,
    fontWeight: 'bold',
    marginTop: 2,
  },
  emptyState: {
    paddingVertical: 36,
    alignItems: 'center',
    gap: 10,
  },
  emptyText: {
    fontFamily: 'Silkscreen',
    fontSize: 11,
    color: '#8B5E3C',
  },
});
