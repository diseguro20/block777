import React from "react";
import {
  AbsoluteFill,
  Composition,
  Easing,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import {Audio} from "@remotion/media";

const C = {
  bg: "#030705",
  panel: "#0a120e",
  panel2: "#101d15",
  lime: "#c9ff43",
  green: "#42e889",
  gold: "#ffd84a",
  white: "#f7fbf8",
  muted: "#9aa9a1",
  line: "#294033",
  danger: "#ff635d",
};

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

const ease = Easing.bezier(0.16, 1, 0.3, 1);

const sceneOpacity = (frame: number, duration: number) =>
  interpolate(frame, [0, 10, duration - 12, duration], [0, 1, 1, 0], {
    ...clamp,
    easing: ease,
  });

const Brand = ({compact = false}: {compact?: boolean}) => (
  <div style={{display: "flex", alignItems: "center", gap: compact ? 14 : 20}}>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(2, ${compact ? 16 : 22}px)`,
        gap: compact ? 4 : 5,
        rotate: "45deg",
      }}
    >
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            width: compact ? 16 : 22,
            height: compact ? 16 : 22,
            borderRadius: 4,
            background: C.lime,
            opacity: i === 1 ? 0.58 : 1,
            boxShadow: `0 0 22px ${C.lime}77`,
          }}
        />
      ))}
    </div>
    <div>
      <div
        style={{
          color: C.white,
          fontSize: compact ? 29 : 40,
          fontWeight: 1000,
          letterSpacing: -2,
        }}
      >
        BLOCKERINO
      </div>
      <div
        style={{
          color: C.muted,
          fontSize: compact ? 11 : 14,
          fontWeight: 900,
          letterSpacing: compact ? 5 : 7,
        }}
      >
        PLAY SMART
      </div>
    </div>
  </div>
);

const Background = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 18% 10%, #8bae253c, transparent 31%), radial-gradient(circle at 90% 72%, #168f5b32, transparent 37%), #030705",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.11,
          backgroundImage:
            "linear-gradient(#c9ff4314 1px, transparent 1px), linear-gradient(90deg, #c9ff4314 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          translate: `${interpolate(frame, [0, 600], [0, -64], clamp)}px ${interpolate(frame, [0, 600], [0, -96], clamp)}px`,
        }}
      />
      {Array.from({length: 20}).map((_, i) => {
        const travel = (frame * (1.8 + (i % 4) * 0.55) + i * 91) % 2200;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              width: 9 + (i % 3) * 8,
              height: 9 + (i % 3) * 8,
              borderRadius: i % 2 ? "50%" : 5,
              background: i % 4 === 0 ? C.gold : C.lime,
              opacity: 0.18 + (i % 4) * 0.08,
              left: `${5 + ((i * 23) % 91)}%`,
              top: 1950 - travel,
              rotate: `${frame * (1 + (i % 3))}deg`,
              boxShadow: `0 0 18px ${i % 4 === 0 ? C.gold : C.lime}`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

const Footer = ({label = "18+ • JOGUE COM RESPONSABILIDADE"}: {label?: string}) => (
  <div
    style={{
      position: "absolute",
      left: 70,
      right: 70,
      bottom: 45,
      display: "flex",
      justifyContent: "center",
      color: C.muted,
      fontSize: 21,
      fontWeight: 850,
      letterSpacing: 1.4,
      textAlign: "center",
    }}
  >
    {label}
  </div>
);

const HookScene = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        padding: "110px 76px 150px",
        opacity: sceneOpacity(frame, 82),
        justifyContent: "space-between",
      }}
    >
      <Brand />
      <div style={{display: "flex", flexDirection: "column", alignItems: "center"}}>
        <div
          style={{
            color: C.bg,
            background: C.lime,
            padding: "14px 24px",
            borderRadius: 999,
            fontSize: 30,
            fontWeight: 1000,
            letterSpacing: 2,
            opacity: interpolate(frame, [4, 18], [0, 1], clamp),
            scale: interpolate(frame, [4, 18], [0.7, 1], {...clamp, easing: ease}),
          }}
        >
          VOCÊ AINDA NÃO VIU ISSO?
        </div>
        <div
          style={{
            marginTop: 45,
            color: C.white,
            fontSize: 126,
            lineHeight: 0.86,
            letterSpacing: -9,
            fontWeight: 1000,
            textAlign: "center",
            opacity: interpolate(frame, [12, 30], [0, 1], clamp),
            scale: interpolate(frame, [12, 30], [1.18, 1], {...clamp, easing: ease}),
          }}
        >
          ENCAIXE.
          <br />
          <span style={{color: C.lime}}>QUEBRE.</span>
          <br />
          MULTIPLIQUE.
        </div>
        <div
          style={{
            marginTop: 54,
            color: C.white,
            fontSize: 49,
            lineHeight: 1.1,
            fontWeight: 900,
            textAlign: "center",
            opacity: interpolate(frame, [30, 48], [0, 1], clamp),
            translate: `0 ${interpolate(frame, [30, 48], [35, 0], clamp)}px`,
          }}
        >
          O jogo de blocos que coloca
          <br />
          <span style={{color: C.gold}}>sua estratégia à prova.</span>
        </div>
      </div>
      <div
        style={{
          border: `2px solid ${C.line}`,
          background: `${C.panel}e8`,
          borderRadius: 24,
          padding: "23px 28px",
          color: C.muted,
          fontSize: 27,
          textAlign: "center",
          fontWeight: 800,
        }}
      >
        GAMEPLAY DEMONSTRATIVO • RESULTADOS VARIAM
      </div>
      <Footer />
    </AbsoluteFill>
  );
};

const GameBoard = () => {
  const frame = useCurrentFrame();
  const events = [38, 84, 130];
  const cleared = events.filter((event) => frame >= event).length;
  const multiplier = ["1.00x", "1.06x", "1.13x", "1.21x"][cleared];
  const payout = ["R$ 20,00", "R$ 21,20", "R$ 22,60", "R$ 24,20"][cleared];
  const activeEvent = events.findIndex((event) => Math.abs(frame - event) <= 8);

  const rowIsVisible = (row: number, col: number) => {
    const eventIndex = row === 6 ? 0 : row === 4 ? 1 : row === 2 ? 2 : -1;
    if (eventIndex < 0) return false;
    const event = events[eventIndex];
    if (frame > event + 8) return false;
    return col < 7 || frame >= event;
  };

  const scattered = new Set(["0-1", "0-2", "1-1", "1-5", "3-0", "3-3", "5-2", "5-5", "7-0", "7-4"]);

  return (
    <div
      style={{
        width: 900,
        borderRadius: 38,
        border: `3px solid ${C.line}`,
        background: "linear-gradient(180deg, #101a15, #050907)",
        padding: 24,
        boxShadow: `0 45px 110px #000b, 0 0 70px ${C.lime}14`,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          border: `2px solid ${C.line}`,
          borderRadius: 20,
          overflow: "hidden",
          marginBottom: 18,
        }}
      >
        {[
          ["MULTIPLICADOR", multiplier],
          ["LINHAS", String(cleared)],
          ["RETORNO POTENCIAL", payout],
        ].map(([label, value], i) => (
          <div
            key={label}
            style={{
              padding: "19px 10px",
              textAlign: "center",
              borderRight: i < 2 ? `2px solid ${C.line}` : undefined,
            }}
          >
            <div style={{color: C.muted, fontSize: 18, fontWeight: 900}}>{label}</div>
            <div style={{color: C.lime, fontSize: 37, fontWeight: 1000, marginTop: 6}}>{value}</div>
          </div>
        ))}
      </div>
      <div
        style={{
          position: "relative",
          display: "grid",
          gridTemplateColumns: "repeat(8, 1fr)",
          width: 846,
          height: 846,
          border: `2px solid ${C.line}`,
          background: "#050907",
          overflow: "hidden",
        }}
      >
        {Array.from({length: 64}).map((_, index) => {
          const row = Math.floor(index / 8);
          const col = index % 8;
          const filled = scattered.has(`${row}-${col}`) || rowIsVisible(row, col);
          const isTarget = (row === 6 && frame >= 38 && frame <= 46) || (row === 4 && frame >= 84 && frame <= 92) || (row === 2 && frame >= 130 && frame <= 138);
          return (
            <div key={index} style={{position: "relative", border: `1px solid ${C.line}90`}}>
              {filled ? (
                <div
                  style={{
                    position: "absolute",
                    inset: 6,
                    borderRadius: 8,
                    background: (row + col) % 3 === 0 ? C.green : C.lime,
                    boxShadow: isTarget ? `0 0 36px ${C.lime}` : "inset 0 0 0 2px #ffffff23",
                    opacity: isTarget
                      ? interpolate(frame % 46, [0, 7, 14], [0.7, 1, 0.72], clamp)
                      : 0.86,
                  }}
                />
              ) : null}
            </div>
          );
        })}
        {events.map((event, index) => {
          const row = [6, 4, 2][index];
          const p = interpolate(frame, [event - 18, event], [0, 1], clamp);
          const hidden = frame < event - 18 || frame > event + 2;
          return (
            <div
              key={event}
              style={{
                position: "absolute",
                width: 92,
                height: 92,
                borderRadius: 10,
                background: C.gold,
                left: interpolate(p, [0, 1], [380, 744], clamp),
                top: interpolate(p, [0, 1], [870, row * 105.75 + 7], clamp),
                opacity: hidden ? 0 : 1,
                boxShadow: `0 0 36px ${C.gold}`,
                scale: interpolate(p, [0, 0.82, 1], [0.84, 1.08, 1], clamp),
              }}
            />
          );
        })}
        {activeEvent >= 0 ? (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: [6, 4, 2][activeEvent] * 105.75,
              height: 105.75,
              background: `linear-gradient(90deg, transparent, ${C.lime}, transparent)`,
              opacity: interpolate(Math.abs(frame - events[activeEvent]), [0, 8], [0.8, 0], clamp),
              boxShadow: `0 0 50px ${C.lime}`,
            }}
          />
        ) : null}
      </div>
      <div
        style={{
          marginTop: 18,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          color: C.muted,
          fontSize: 20,
          fontWeight: 850,
        }}
      >
        <span>ARRASTE • ENCAIXE • COMPLETE</span>
        <span style={{color: C.lime}}>DEMONSTRAÇÃO</span>
      </div>
      {activeEvent >= 0 ? (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "46%",
            translate: "-50% -50%",
            borderRadius: 26,
            background: `${C.panel}f2`,
            border: `3px solid ${C.lime}`,
            padding: "26px 44px",
            textAlign: "center",
            boxShadow: `0 0 90px ${C.lime}77`,
            opacity: interpolate(Math.abs(frame - events[activeEvent]), [0, 8], [1, 0], clamp),
            scale: interpolate(Math.abs(frame - events[activeEvent]), [0, 8], [1.08, 0.78], clamp),
          }}
        >
          <div style={{color: C.lime, fontSize: 27, fontWeight: 1000}}>CASH-IN!</div>
          <div style={{color: C.white, fontSize: 62, fontWeight: 1000}}>{payout}</div>
        </div>
      ) : null}
    </div>
  );
};

const GameplayScene = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{padding: "70px 58px 120px", opacity: sceneOpacity(frame, 178)}}>
      <div style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}>
        <Brand compact />
        <div
          style={{
            color: C.lime,
            border: `2px solid ${C.line}`,
            background: C.panel,
            borderRadius: 999,
            padding: "12px 18px",
            fontSize: 20,
            fontWeight: 950,
          }}
        >
          GAMEPLAY REAL • DEMO
        </div>
      </div>
      <div
        style={{
          marginTop: 42,
          color: C.white,
          fontSize: 78,
          lineHeight: 0.92,
          fontWeight: 1000,
          letterSpacing: -5,
          textAlign: "center",
          opacity: interpolate(frame, [0, 18], [0, 1], clamp),
          translate: `0 ${interpolate(frame, [0, 18], [35, 0], clamp)}px`,
        }}
      >
        COMPLETE LINHAS.
        <br />
        <span style={{color: C.lime}}>VEJA O MULTIPLICADOR SUBIR.</span>
      </div>
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: interpolate(frame, [10, 28], [0, 1], clamp),
          scale: interpolate(frame, [10, 28], [0.92, 1], {...clamp, easing: ease}),
        }}
      >
        <GameBoard />
      </div>
      <Footer label="SIMULAÇÃO DE PARTIDA • RETORNOS NÃO SÃO GARANTIDOS • 18+" />
    </AbsoluteFill>
  );
};

const OfferScene = () => {
  const frame = useCurrentFrame();
  const pulse = interpolate(frame % 30, [0, 15, 30], [1, 1.045, 1], clamp);
  return (
    <AbsoluteFill
      style={{
        padding: "95px 72px 140px",
        opacity: sceneOpacity(frame, 115),
        alignItems: "center",
      }}
    >
      <Brand compact />
      <div
        style={{
          marginTop: 82,
          color: C.gold,
          fontSize: 34,
          fontWeight: 1000,
          letterSpacing: 3,
          opacity: interpolate(frame, [4, 18], [0, 1], clamp),
        }}
      >
        OFERTA DE BOAS-VINDAS
      </div>
      <div
        style={{
          marginTop: 18,
          color: C.white,
          fontSize: 116,
          lineHeight: 0.88,
          letterSpacing: -8,
          fontWeight: 1000,
          textAlign: "center",
          opacity: interpolate(frame, [10, 27], [0, 1], clamp),
          scale: interpolate(frame, [10, 27], [1.16, 1], {...clamp, easing: ease}),
        }}
      >
        DOBRE SEU
        <br />
        <span style={{color: C.lime}}>DEPÓSITO</span>
      </div>
      <div
        style={{
          marginTop: 72,
          width: "100%",
          display: "grid",
          gridTemplateColumns: "1fr 110px 1fr",
          alignItems: "center",
          gap: 16,
        }}
      >
        {[
          ["VOCÊ DEPOSITA", "R$ 20"],
          ["TOTAL PARA JOGAR", "R$ 40"],
        ].map(([label, value], i) => (
          <React.Fragment key={label}>
            {i === 1 ? (
              <div style={{color: C.lime, fontSize: 66, fontWeight: 1000, textAlign: "center"}}>→</div>
            ) : null}
            <div
              style={{
                borderRadius: 30,
                border: `3px solid ${i === 1 ? C.lime : C.line}`,
                background: i === 1 ? "linear-gradient(145deg, #1d3215, #0a120e)" : C.panel,
                padding: "40px 20px",
                textAlign: "center",
                boxShadow: i === 1 ? `0 0 70px ${C.lime}35` : "0 30px 70px #0008",
                opacity: interpolate(frame, [22 + i * 10, 40 + i * 10], [0, 1], clamp),
                translate: `${interpolate(frame, [22 + i * 10, 40 + i * 10], [i ? 50 : -50, 0], clamp)}px 0`,
              }}
            >
              <div style={{color: C.muted, fontSize: 22, fontWeight: 950}}>{label}</div>
              <div style={{color: i === 1 ? C.lime : C.white, fontSize: 88, fontWeight: 1000, marginTop: 12}}>
                {value}
              </div>
            </div>
          </React.Fragment>
        ))}
      </div>
      <div
        style={{
          marginTop: 54,
          borderRadius: 999,
          background: C.lime,
          color: C.bg,
          padding: "22px 42px",
          fontSize: 38,
          fontWeight: 1000,
          scale: pulse,
          boxShadow: `0 0 60px ${C.lime}66`,
        }}
      >
        +100% A PARTIR DE R$ 20
      </div>
      <Footer label="BÔNUS SUJEITO A ROLLOVER DE 10X SOBRE O BÔNUS • 18+" />
    </AbsoluteFill>
  );
};

const LimitedScene = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        padding: "110px 70px 150px",
        opacity: sceneOpacity(frame, 95),
        alignItems: "center",
      }}
    >
      <div
        style={{
          color: C.bg,
          background: C.gold,
          padding: "13px 23px",
          borderRadius: 999,
          fontSize: 26,
          fontWeight: 1000,
          letterSpacing: 2,
        }}
      >
        CAMPANHA LIMITADA
      </div>
      <div
        style={{
          marginTop: 80,
          color: C.white,
          fontSize: 98,
          lineHeight: 0.9,
          letterSpacing: -7,
          fontWeight: 1000,
          textAlign: "center",
          opacity: interpolate(frame, [7, 24], [0, 1], clamp),
        }}
      >
        BÔNUS PARA OS
        <br />
        <span style={{color: C.lime}}>100 PRIMEIROS</span>
        <br />
        CADASTROS
      </div>
      <div
        style={{
          marginTop: 72,
          width: 560,
          height: 560,
          borderRadius: "50%",
          border: `5px solid ${C.lime}`,
          background: `radial-gradient(circle, ${C.lime}33, ${C.panel} 66%)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          boxShadow: `0 0 ${interpolate(frame % 34, [0, 17, 34], [40, 110, 40], clamp)}px ${C.lime}55`,
          scale: interpolate(frame, [12, 34], [0.68, 1], {...clamp, easing: ease}),
        }}
      >
        <div style={{color: C.lime, fontSize: 210, lineHeight: 0.82, fontWeight: 1000}}>100</div>
        <div style={{color: C.white, fontSize: 36, fontWeight: 1000, marginTop: 22}}>VAGAS PROMOCIONAIS</div>
      </div>
      <div
        style={{
          marginTop: 70,
          color: C.white,
          fontSize: 42,
          lineHeight: 1.18,
          fontWeight: 900,
          textAlign: "center",
          opacity: interpolate(frame, [34, 52], [0, 1], clamp),
        }}
      >
        Cadastre-se e consulte
        <br />
        <span style={{color: C.gold}}>a disponibilidade da oferta.</span>
      </div>
      <Footer label="OFERTA SUJEITA À DISPONIBILIDADE E AOS TERMOS • 18+" />
    </AbsoluteFill>
  );
};

const CashoutScene = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        padding: "110px 70px 150px",
        opacity: sceneOpacity(frame, 75),
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{color: C.muted, fontSize: 28, fontWeight: 1000, letterSpacing: 3}}>EXEMPLO DE PARTIDA</div>
      <div
        style={{
          marginTop: 34,
          color: C.white,
          fontSize: 84,
          lineHeight: 0.94,
          fontWeight: 1000,
          letterSpacing: -5,
          textAlign: "center",
        }}
      >
        COMPLETE. MULTIPLIQUE.
        <br />
        <span style={{color: C.lime}}>DECIDA QUANDO RESGATAR.</span>
      </div>
      <div
        style={{
          marginTop: 90,
          width: 820,
          borderRadius: 40,
          border: `4px solid ${C.lime}`,
          background: `radial-gradient(circle at 50% 0, ${C.lime}35, transparent 56%), ${C.panel}`,
          padding: "52px 45px",
          textAlign: "center",
          boxShadow: `0 0 110px ${C.lime}55`,
          scale: interpolate(frame, [4, 24], [0.72, 1], {...clamp, easing: ease}),
        }}
      >
        <div style={{color: C.lime, fontSize: 29, fontWeight: 1000, letterSpacing: 3}}>CASH-IN DISPONÍVEL</div>
        <div
          style={{
            color: C.white,
            fontSize: 132,
            lineHeight: 0.95,
            fontWeight: 1000,
            letterSpacing: -5,
            marginTop: 25,
            whiteSpace: "nowrap",
          }}
        >
          R$ 24,20
        </div>
        <div style={{color: C.muted, fontSize: 32, fontWeight: 850, marginTop: 18}}>APOSTA DE EXEMPLO: R$ 20 • 1.21x</div>
        <div
          style={{
            marginTop: 48,
            borderRadius: 20,
            background: C.lime,
            color: C.bg,
            padding: "25px 34px",
            fontSize: 42,
            fontWeight: 1000,
            scale: interpolate(frame % 28, [0, 14, 28], [1, 1.035, 1], clamp),
          }}
        >
          RESGATAR AGORA →
        </div>
      </div>
      <Footer label="SIMULAÇÃO • RESULTADOS VARIAM • JOGUE COM RESPONSABILIDADE • 18+" />
    </AbsoluteFill>
  );
};

const FinalScene = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        padding: "105px 72px 155px",
        opacity: sceneOpacity(frame, 105),
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Brand />
      <div style={{textAlign: "center"}}>
        <div
          style={{
            color: C.white,
            fontSize: 121,
            lineHeight: 0.86,
            letterSpacing: -9,
            fontWeight: 1000,
            opacity: interpolate(frame, [0, 18], [0, 1], clamp),
            scale: interpolate(frame, [0, 18], [1.18, 1], {...clamp, easing: ease}),
          }}
        >
          ENTRE
          <br />
          <span style={{color: C.lime}}>AGORA.</span>
        </div>
        <div style={{marginTop: 44, color: C.white, fontSize: 48, fontWeight: 900, lineHeight: 1.15}}>
          Crie sua conta.
          <br />
          Ative seu bônus.
          <br />
          Mostre sua estratégia.
        </div>
      </div>
      <div
        style={{
          width: "100%",
          borderRadius: 30,
          background: C.lime,
          color: C.bg,
          padding: "31px 36px",
          fontSize: 45,
          fontWeight: 1000,
          textAlign: "center",
          boxShadow: `0 0 ${interpolate(frame % 32, [0, 16, 32], [35, 90, 35], clamp)}px ${C.lime}66`,
          scale: interpolate(frame % 32, [0, 16, 32], [1, 1.025, 1], clamp),
        }}
      >
        JOGAR NO BLOCKERINO →
      </div>
      <div style={{color: C.muted, fontSize: 25, fontWeight: 850, textAlign: "center", lineHeight: 1.35}}>
        100% de bônus a partir de R$ 20.
        <br />
        Rollover de 10x sobre o bônus. Oferta sujeita à disponibilidade.
        <br />
        18+ • Jogue com responsabilidade.
      </div>
    </AbsoluteFill>
  );
};

export const BlockerinoAggressiveCreative: React.FC = () => (
  <AbsoluteFill style={{fontFamily: "Arial Black, Arial, Helvetica, sans-serif", background: C.bg}}>
    <Background />
    <Audio src={staticFile("blockerino-beat.wav")} volume={0.22} />
    <Sequence name="Gancho" durationInFrames={82}>
      <HookScene />
    </Sequence>
    <Sequence name="Gameplay demonstrativo" from={70} durationInFrames={178}>
      <GameplayScene />
    </Sequence>
    <Sequence name="Oferta 100%" from={235} durationInFrames={115}>
      <OfferScene />
    </Sequence>
    <Sequence name="100 primeiros" from={338} durationInFrames={95}>
      <LimitedScene />
    </Sequence>
    <Sequence name="Cash-in demonstrativo" from={420} durationInFrames={75}>
      <CashoutScene />
    </Sequence>
    <Sequence name="CTA final" from={482} durationInFrames={105}>
      <FinalScene />
    </Sequence>

    {[70, 235, 338, 420, 482].map((from) => (
      <Sequence key={from} from={from} durationInFrames={24} layout="none">
        <Audio src={staticFile("whoosh.wav")} volume={0.45} />
      </Sequence>
    ))}
    {[108, 154, 200, 447].map((from) => (
      <Sequence key={from} from={from} durationInFrames={20} layout="none">
        <Audio src={staticFile("ding.wav")} volume={0.55} />
      </Sequence>
    ))}
  </AbsoluteFill>
);

export const CreativeBonusComposition = () => (
  <Composition
    id="CriativoBlockerinoBonus100"
    component={BlockerinoAggressiveCreative}
    durationInFrames={587}
    fps={30}
    width={1080}
    height={1920}
  />
);
