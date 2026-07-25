import { PieceData, getBlockCount } from '@/constants/Piece';
import { DndProvider, DndProviderProps, Rectangle } from '@mgcrea/react-native-dnd';
import React, { useEffect } from 'react';
import { Platform, SafeAreaView, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import { ReduceMotion, runOnJS, useSharedValue } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  BoardBlockType,
  GRID_BLOCK_SIZE,
  PossibleBoardSpots,
  XYPoint,
  breakLines,
  clearHoverBlocks,
  createPossibleBoardSpots,
  emptyPossibleBoardSpots,
  newEmptyBoard,
  placePieceOntoBoard,
  updateHoveredBreaks,
} from '@/constants/Board';
import { StatsGameHud } from '@/components/game/GameHud';
import BlockGrid from '@/components/game/BlockGrid';
import { createRandomHand, createRandomHandWorklet } from '@/constants/Hand';
import HandPieces from '@/components/game/HandPieces';
import { GameModeType, useSetAppState } from '@/hooks/useAppState';
import { createHighScore, HighScoreId, updateHighScore } from '@/constants/Storage';
import { useBetting } from '@/hooks/useBettingState';
import { BettingHud } from '@/components/betting/BettingHud';
import { WinModal } from '@/components/betting/WinModal';
import { calculatePayout, MULTIPLIER_PER_LINE, COMBO_BONUS_MULTIPLIER, BetRecord } from '@/constants/Betting';
import { SoundEffects } from '@/constants/SoundEffects';

const pieceOverlapsRectangle = (layout: Rectangle, other: Rectangle) => {
  'worklet';
  if (other.width == 0 && other.height == 0) {
    return false;
  }

  return (
    layout.x < other.x + other.width &&
    layout.x + GRID_BLOCK_SIZE > other.x &&
    layout.y < other.y + other.height &&
    layout.y + GRID_BLOCK_SIZE > other.y
  );
};

const SPRING_CONFIG_MISSED_DRAG = {
  mass: 1,
  damping: 1,
  stiffness: 500,
  overshootClamping: true,
  restDisplacementThreshold: 0.01,
  restSpeedThreshold: 0.01,
  reduceMotion: ReduceMotion.Never,
};

function decodeDndId(id: string): XYPoint {
  'worklet';
  return { x: Number(id[0]), y: Number(id[2]) };
}

function impactAsyncHelper(style: Haptics.ImpactFeedbackStyle) {
  Haptics.impactAsync(style);
}

function runPiecePlacedHaptic() {
  'worklet';
  runOnJS(impactAsyncHelper)(Haptics.ImpactFeedbackStyle.Light);
}

export const Game = ({ gameMode }: { gameMode: GameModeType }) => {
  const boardLength = gameMode == GameModeType.Chaos ? 10 : 8;
  const handSize = gameMode == GameModeType.Chaos ? 5 : 3;
  const board = useSharedValue(newEmptyBoard(boardLength));
  const draggingPiece = useSharedValue<number | null>(null);
  const possibleBoardDropSpots = useSharedValue<PossibleBoardSpots>(
    emptyPossibleBoardSpots(boardLength)
  );
  const hand = useSharedValue(createRandomHand(handSize));
  const score = useSharedValue(0);
  const combo = useSharedValue(0);
  const lastBrokenLine = useSharedValue(0);
  const scoreStorageId = useSharedValue<HighScoreId | undefined>(undefined);

  const [_, __, popAppState] = useSetAppState();

  const {
    bet,
    multiplier,
    setMultiplier,
    isDemo,
    withdraw,
    deposit,
    status,
    setStatus,
    addBetHistory,
    setLastWin,
  } = useBetting();

  // Deduzir aposta no início da partida se não for demo
  useEffect(() => {
    if (status === 'IN_GAME' && !isDemo) {
      withdraw(bet);
    }
  }, []);

  const handleUpdateBetMultiplier = (linesBroken: number, currentCombo: number) => {
    const inc = linesBroken * MULTIPLIER_PER_LINE + currentCombo * COMBO_BONUS_MULTIPLIER;
    const newMult = Math.round((multiplier + inc) * 100) / 100;
    setMultiplier(newMult);
    SoundEffects.playLineClear(linesBroken);
  };

  const handleGameOver = () => {
    const record: BetRecord = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      betAmount: bet,
      multiplier: multiplier,
      winAmount: 0,
      gameMode: gameMode,
      cashedOut: false,
    };
    addBetHistory(record);
    setLastWin(record);
    setStatus('GAME_OVER');
  };

  const handleCashout = () => {
    SoundEffects.playWinCashout();
    const winPayout = calculatePayout(bet, multiplier);
    if (!isDemo) {
      deposit(winPayout);
    }
    const record: BetRecord = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      betAmount: bet,
      multiplier: multiplier,
      winAmount: winPayout,
      gameMode: gameMode,
      cashedOut: true,
    };
    addBetHistory(record);
    setLastWin(record);
    setStatus('CASHED_OUT');
  };

  const handleRestart = () => {
    board.value = newEmptyBoard(boardLength);
    hand.value = createRandomHand(handSize);
    score.value = 0;
    combo.value = 0;
    lastBrokenLine.value = 0;
    setMultiplier(1.0);
    setStatus('IN_GAME');
    if (!isDemo) {
      withdraw(bet);
    }
  };

  const handleGoMenu = () => {
    popAppState();
  };

  useEffect(() => {
    if (scoreStorageId.value != undefined) return;
    createHighScore({ score: score.value, date: new Date().getTime(), type: gameMode }).then(
      (id) => {
        scoreStorageId.value = id;
      }
    );
  }, [scoreStorageId]);

  const handleDragEnd: DndProviderProps['onDragEnd'] = ({ active, over }) => {
    'worklet';
    if (over) {
      if (draggingPiece.value == null) {
        return;
      }

      const dropIdStr = over.id.toString();
      const { x: dropX, y: dropY } = decodeDndId(dropIdStr);
      const piece: PieceData = hand.value[draggingPiece.value!]!;

      if (Platform.OS != 'web') runPiecePlacedHaptic();

      const newBoard = clearHoverBlocks([...board.value]);
      placePieceOntoBoard(newBoard, piece, dropX, dropY, BoardBlockType.FILLED);
      const linesBroken = breakLines(newBoard);

      const pieceBlockCount = getBlockCount(piece);
      score.value += pieceBlockCount;

      if (linesBroken > 0) {
        lastBrokenLine.value = 0;
        combo.value += linesBroken;
        score.value += linesBroken * boardLength * (combo.value / 2) * pieceBlockCount;
        runOnJS(handleUpdateBetMultiplier)(linesBroken, combo.value);
      } else {
        lastBrokenLine.value++;
        if (lastBrokenLine.value >= handSize) {
          combo.value = 0;
        }
      }

      if (scoreStorageId)
        runOnJS(updateHighScore)(scoreStorageId.value!, {
          score: score.value,
          date: new Date().getTime(),
          type: gameMode,
        });

      const newHand = [...hand.value];
      newHand[draggingPiece.value!] = null;

      let empty = true;
      for (let i = 0; i < handSize; i++) {
        if (newHand[i] != null) {
          empty = false;
          break;
        }
      }

      if (empty) {
        hand.value = createRandomHandWorklet(handSize);
      } else {
        hand.value = newHand;
      }
      board.value = newBoard;

      // Verificar se há posições válidas para as peças restantes da mão
      let canPlaceAny = false;
      for (let i = 0; i < handSize; i++) {
        const p = hand.value[i];
        if (p != null) {
          const spots = createPossibleBoardSpots(board.value, p);
          for (let y = 0; y < spots.length; y++) {
            for (let x = 0; x < spots[y].length; x++) {
              if (spots[y][x] === 1) {
                canPlaceAny = true;
                break;
              }
            }
            if (canPlaceAny) break;
          }
        }
        if (canPlaceAny) break;
      }

      if (!canPlaceAny) {
        runOnJS(handleGameOver)();
      }
    } else {
      board.value = clearHoverBlocks([...board.value]);
    }
    draggingPiece.value = null;
    possibleBoardDropSpots.value = emptyPossibleBoardSpots(boardLength);
  };

  const handleBegin: DndProviderProps['onBegin'] = (event, meta) => {
    'worklet';
    const handIndex = Number(meta.activeId.toString());
    if (hand.value[handIndex] != null) {
      draggingPiece.value = handIndex;
      possibleBoardDropSpots.value = createPossibleBoardSpots(
        board.value,
        hand.value[handIndex]
      );
    }
  };

  const handleFinalize: DndProviderProps['onFinalize'] = ({ state }) => {
    'worklet';
    if (state !== State.END) {
      draggingPiece.value = null;
    }
  };

  const handleUpdate: DndProviderProps['onUpdate'] = (
    event,
    { activeId, activeLayout, droppableActiveId }
  ) => {
    'worklet';
    if (!droppableActiveId) {
      board.value = clearHoverBlocks([...board.value]);
      return;
    }

    if (draggingPiece.value == null) {
      return;
    }

    const dropIdStr = droppableActiveId.toString();
    const { x: dropX, y: dropY } = decodeDndId(dropIdStr);
    const piece: PieceData = hand.value[draggingPiece.value!]!;

    const newBoard = clearHoverBlocks([...board.value]);
    updateHoveredBreaks(newBoard, piece, dropX, dropY);

    board.value = newBoard;
  };

  return (
    <SafeAreaView style={styles.root}>
      <GestureHandlerRootView style={styles.root}>
        <View style={styles.root}>
          {/* Betting HUD top bar */}
          <BettingHud inGame={true} onCashout={handleCashout} />

          <DndProvider
            shouldDropWorklet={pieceOverlapsRectangle}
            springConfig={SPRING_CONFIG_MISSED_DRAG}
            onBegin={handleBegin}
            onFinalize={handleFinalize}
            onDragEnd={handleDragEnd}
            onUpdate={handleUpdate}
          >
            <StatsGameHud
              score={score}
              combo={combo}
              lastBrokenLine={lastBrokenLine}
              hand={hand}
            />
            <BlockGrid
              board={board}
              possibleBoardDropSpots={possibleBoardDropSpots}
              hand={hand}
              draggingPiece={draggingPiece}
            />
            <HandPieces hand={hand} />
          </DndProvider>

          {/* Modal de Vitória / Cashout ou Game Over */}
          <WinModal onRestart={handleRestart} onGoMenu={handleGoMenu} />
        </View>
      </GestureHandlerRootView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: {
    width: '100%',
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 0,
    overflow: 'hidden',
    backgroundColor: '#1a0a2e',
  },
});

export default Game;