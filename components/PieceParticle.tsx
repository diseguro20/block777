import { getRandomPiece } from "@/constants/Piece";
import React from "react";
import { useEffect, useState } from "react";
import { Dimensions, Text } from "react-native";
import Animated, { useSharedValue, withRepeat, withSequence, withDelay, withTiming, useAnimatedStyle } from "react-native-reanimated";

function PieceParticleComponent() {
    const [{width, height}, setWindowDimensions] = useState(Dimensions.get('window'));
    useEffect(() => {
        const handleResize = () => {
            setWindowDimensions(Dimensions.get('window'));
        };

        const listener = Dimensions.addEventListener('change', handleResize);

        return () => {
            listener.remove();
        };
    }, []);
    
    const randomX = Math.random() * width;
    const randomY = Math.random() * height;
    const randomDelay = Math.random() * 8000;
    const randomSize = 8 + Math.random() * 16;

    const randomTargetY = Math.random() * 50 - 120;

    const opacity = useSharedValue(0);
    const translateYOffset = useSharedValue(0);
    const scale = useSharedValue(1);

    // Emojis temáticos de festa junina
    const juninaEmojis = ['⭐', '🌽', '🔥', '🎆', '✨', '🌙', '🎵', '💫', '🪗'];
    const emoji = juninaEmojis[Math.floor(Math.random() * juninaEmojis.length)];

    useEffect(() => {
        opacity.value = withRepeat(
            withSequence(
                withDelay(randomDelay, withTiming(0.7 + Math.random() * 0.3, { duration: 1500 })),
                withTiming(0, { duration: 2000 }),
            ),
            -1,
        );

        translateYOffset.value = withRepeat(
            withSequence(
                withDelay(randomDelay, withTiming(randomTargetY, { duration: 3500 })),
                withTiming(0, { duration: 0 }),
            ),
            -1,
        );

        scale.value = withRepeat(
            withSequence(
                withDelay(randomDelay, withTiming(1.3, { duration: 1500 })),
                withTiming(0.6, { duration: 2000 }),
            ),
            -1,
        );
    }, [opacity, translateYOffset, randomDelay]);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [
            { translateY: translateYOffset.value },
            { scale: scale.value },
        ],
    }));


    return (
        <Animated.View
            pointerEvents="none"
            style={[
                {
                    position: "absolute",
                    left: randomX,
                    top: randomY,
                },
                animatedStyle,
            ]}
        >
            <Text style={{ fontSize: randomSize }}>{emoji}</Text>
        </Animated.View>
    );
}

export const PieceParticle = React.memo(PieceParticleComponent);