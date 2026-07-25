import {
	StyleSheet,
	View,
} from "react-native";
import { useFonts } from "expo-font";
import Animated, {
	FadeIn,
	FadeOut,
	ReanimatedLogLevel,
	configureReanimatedLogger,
} from "react-native-reanimated";
import Game from "@/components/game/Game";
import { GameModeType } from '@/hooks/useAppState';
import React from "react";
import OptionsMenu from "@/components/OptionsMenu";
import { MenuStateType, useAppState } from "@/hooks/useAppState";
import MainMenu from "@/components/MainMenu";
import HighScores from "@/components/HighScoresMenu";
import { PieceParticle } from "@/components/PieceParticle";
import { LinearGradient } from 'expo-linear-gradient';

configureReanimatedLogger({
	level: ReanimatedLogLevel.warn,
	strict: false,
});

export default function App() {
	const [loaded] = useFonts({
		"Press-Start-2P": require("../assets/fonts/PressStart2P-Regular.ttf"),
		SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
		Silkscreen: require("../assets/fonts/Silkscreen-Regular.ttf"),
		SilkscreenBold: require("../assets/fonts/Silkscreen-Bold.ttf"),
	});

	const [ appState ] = useAppState();

	if (!loaded) return null;

	const gameModeSearch = appState.containsGameMode();
	const gameMode = gameModeSearch ? gameModeSearch.current as GameModeType : undefined;
	
	return (
		<Animated.View entering={FadeIn} exiting={FadeOut} style={styles.container}>
			<LinearGradient
				colors={['#1a0a2e', '#2d1854', '#1a0a2e']}
				style={styles.gradient}
				start={{ x: 0, y: 0 }}
				end={{ x: 1, y: 1 }}
			/>

			{/* Bandeirinhas decorativas discretas no topo - sem bloquear toques */}
			<View style={styles.bandeirinhasTop} pointerEvents="none">
				{[...Array(14)].map((_, i) => {
					const colors = ['#E8432F', '#F7B731', '#2D8B4E', '#E87F24', '#E84393', '#F5E6C8'];
					const color = colors[i % colors.length];
					return (
						<View
							key={`flag-top-${i}`}
							style={[
								styles.bandeirinha,
								{
									backgroundColor: color,
									transform: [{ rotate: '180deg' }],
								},
							]}
						/>
					);
				})}
			</View>

			{/* Estrelinhas/Emojis flutuantes de fundo - sem bloquear toques */}
			<View style={StyleSheet.absoluteFillObject} pointerEvents="none">
				{[...Array(8)].map((_, i) => (
					<PieceParticle key={`particle${i}`} />
				))}
			</View>

			{ (appState.containsState(MenuStateType.MENU) && !gameMode) && <MainMenu></MainMenu> }
			{ gameMode && <Game gameMode={gameMode}></Game> }
			{ appState.containsState(MenuStateType.OPTIONS) && <OptionsMenu></OptionsMenu> }
			{ appState.containsState(MenuStateType.HIGH_SCORES) && <HighScores></HighScores>}
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#1a0a2e",
		alignItems: "center",
		justifyContent: "center",
		width: '100%',
		height: '100%',
		overflow: 'hidden',
	},
	gradient: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
	},
	bandeirinhasTop: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		flexDirection: 'row',
		justifyContent: 'center',
		zIndex: 0,
		opacity: 0.85,
		overflow: 'hidden',
	},
	bandeirinha: {
		width: 16,
		height: 18,
		marginHorizontal: 2,
		borderBottomLeftRadius: 2,
		borderBottomRightRadius: 2,
		clipPath: 'polygon(0 0, 100% 0, 50% 100%)',
	},
});
