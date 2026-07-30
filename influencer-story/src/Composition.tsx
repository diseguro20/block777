import React from "react";
import {
  AbsoluteFill,
  Composition,
  Easing,
  Sequence,
  interpolate,
  useCurrentFrame,
} from "remotion";

type GuideProps = {
  campaignLink: string;
};

const C = {
  bg: "#050907",
  panel: "#0d1512",
  panel2: "#111d18",
  lime: "#c9ff43",
  green: "#55e894",
  white: "#f4f8f5",
  muted: "#95a29d",
  line: "#26372f",
};

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

const fade = (frame: number, duration: number) =>
  interpolate(frame, [0, 12, duration - 14, duration], [0, 1, 1, 0], {
    ...clamp,
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

const Brand = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 22px)",
        gap: 5,
        rotate: "45deg",
      }}
    >
      {[0, 1, 2, 3].map((item) => (
        <div
          key={item}
          style={{
            width: 22,
            height: 22,
            borderRadius: 4,
            background: C.lime,
            opacity: item === 1 ? 0.55 : 1,
            boxShadow: `0 0 18px ${C.lime}66`,
          }}
        />
      ))}
    </div>
    <div>
      <div style={{ color: C.white, fontSize: 38, fontWeight: 900, letterSpacing: -2 }}>
        BLOCKERINO
      </div>
      <div style={{ color: C.muted, fontSize: 15, fontWeight: 800, letterSpacing: 6 }}>
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
          "radial-gradient(circle at 15% 10%, #54702066, transparent 30%), radial-gradient(circle at 92% 70%, #13513f55, transparent 35%), #050907",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.07,
          backgroundImage:
            "linear-gradient(#ffffff12 1px, transparent 1px), linear-gradient(90deg, #ffffff12 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          translate: `0 ${interpolate(frame, [0, 600], [0, -56], clamp)}px`,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 680,
          height: 680,
          borderRadius: "50%",
          border: `2px solid ${C.lime}18`,
          right: -380,
          top: 210,
          scale: interpolate(frame, [0, 600], [0.85, 1.2], clamp),
        }}
      />
    </AbsoluteFill>
  );
};

const Header = ({ step }: { step?: string }) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      width: "100%",
    }}
  >
    <Brand />
    {step ? (
      <div
        style={{
          border: `2px solid ${C.line}`,
          borderRadius: 999,
          padding: "13px 20px",
          color: C.lime,
          fontSize: 22,
          fontWeight: 900,
          letterSpacing: 2,
          background: C.panel,
        }}
      >
        {step}
      </div>
    ) : null}
  </div>
);

const Intro = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        padding: "150px 82px 190px",
        justifyContent: "space-between",
        opacity: fade(frame, 90),
      }}
    >
      <Header />
      <div>
        <div
          style={{
            width: "fit-content",
            padding: "14px 22px",
            borderRadius: 999,
            background: C.lime,
            color: C.bg,
            fontSize: 25,
            fontWeight: 950,
            letterSpacing: 2,
            opacity: interpolate(frame, [8, 24], [0, 1], clamp),
            scale: interpolate(frame, [8, 24], [0.75, 1], {
              ...clamp,
              easing: Easing.bezier(0.16, 1.2, 0.3, 1),
            }),
          }}
        >
          GUIA PARA INFLUENCER
        </div>
        <div
          style={{
            marginTop: 34,
            color: C.white,
            fontSize: 122,
            lineHeight: 0.9,
            letterSpacing: -8,
            fontWeight: 950,
            opacity: interpolate(frame, [18, 38], [0, 1], clamp),
            translate: `${interpolate(frame, [18, 38], [-45, 0], clamp)}px 0`,
          }}
        >
          COMO DIVULGAR
          <br />
          <span style={{ color: C.lime }}>NOS STORIES</span>
        </div>
      </div>
      <div
        style={{
          color: C.muted,
          fontSize: 43,
          fontWeight: 650,
          lineHeight: 1.3,
          opacity: interpolate(frame, [36, 55], [0, 1], clamp),
        }}
      >
        Grave 3 Stories seguindo
        <br />
        este passo a passo.
      </div>
    </AbsoluteFill>
  );
};

const PersonCamera = () => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: "relative",
        width: 360,
        height: 520,
        borderRadius: 42,
        border: `3px solid ${C.line}`,
        background: "linear-gradient(160deg, #1a2a22, #09100d)",
        overflow: "hidden",
        boxShadow: "0 34px 90px #0009",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 138,
          height: 138,
          borderRadius: "50%",
          background: C.lime,
          left: 111,
          top: 86,
          boxShadow: `0 0 50px ${C.lime}44`,
          scale: interpolate(frame, [10, 26], [0.7, 1], clamp),
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 270,
          height: 250,
          borderRadius: "135px 135px 30px 30px",
          background: C.green,
          left: 45,
          bottom: 0,
          translate: `0 ${interpolate(frame, [8, 30], [110, 0], clamp)}px`,
        }}
      />
      <div
        style={{
          position: "absolute",
          right: 24,
          top: 24,
          display: "flex",
          alignItems: "center",
          gap: 8,
          color: C.white,
          fontSize: 17,
          fontWeight: 900,
        }}
      >
        <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#ff4d55" }} />
        GRAVANDO
      </div>
    </div>
  );
};

const QuoteCard = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      border: `2px solid ${C.line}`,
      borderRadius: 28,
      padding: "35px 38px",
      background: `${C.panel}ee`,
      color: C.white,
      fontSize: 39,
      fontWeight: 720,
      lineHeight: 1.3,
      boxShadow: "0 30px 80px #0008",
    }}
  >
    <span style={{ color: C.lime, fontSize: 60, lineHeight: 0 }}>&ldquo;</span>
    {children}
    <span style={{ color: C.lime, fontSize: 60, lineHeight: 0 }}>&rdquo;</span>
  </div>
);

const StepLayout = ({
  step,
  title,
  instruction,
  visual,
  children,
  duration,
}: {
  step: string;
  title: string;
  instruction: string;
  visual: React.ReactNode;
  children: React.ReactNode;
  duration: number;
}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        padding: "115px 78px 170px",
        opacity: fade(frame, duration),
      }}
    >
      <Header step={step} />
      <div
        style={{
          marginTop: 68,
          color: C.white,
          fontSize: 82,
          lineHeight: 0.95,
          letterSpacing: -5,
          fontWeight: 950,
          opacity: interpolate(frame, [4, 22], [0, 1], clamp),
          translate: `${interpolate(frame, [4, 22], [-40, 0], clamp)}px 0`,
        }}
      >
        {title}
      </div>
      <div
        style={{
          marginTop: 20,
          color: C.lime,
          fontSize: 35,
          fontWeight: 850,
          opacity: interpolate(frame, [14, 30], [0, 1], clamp),
        }}
      >
        {instruction}
      </div>
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "55px 0",
          opacity: interpolate(frame, [20, 40], [0, 1], clamp),
          scale: interpolate(frame, [20, 40], [0.92, 1], clamp),
        }}
      >
        {visual}
      </div>
      <div
        style={{
          opacity: interpolate(frame, [34, 54], [0, 1], clamp),
          translate: `0 ${interpolate(frame, [34, 54], [40, 0], clamp)}px`,
        }}
      >
        <QuoteCard>{children}</QuoteCard>
      </div>
    </AbsoluteFill>
  );
};

const StoryOne = () => (
  <StepLayout
    step="STORY 1"
    title="APRESENTE O JOGO"
    instruction="Grave seu rosto falando para a câmera."
    visual={<PersonCamera />}
    duration={150}
  >
    Conheci o Blockerino, um jogo de habilidade em que você encaixa blocos, completa
    linhas e aumenta o multiplicador.
  </StepLayout>
);

const MiniGame = () => {
  const frame = useCurrentFrame();
  const placed = frame >= 58;
  return (
    <div
      style={{
        width: 590,
        border: `3px solid ${C.line}`,
        borderRadius: 34,
        background: "#080d0b",
        padding: 25,
        boxShadow: "0 36px 90px #0009",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          color: C.muted,
          fontSize: 20,
          fontWeight: 800,
          marginBottom: 20,
        }}
      >
        <span>MULTIPLICADOR</span>
        <strong style={{ color: C.lime, fontSize: 31 }}>{placed ? "1.40x" : "1.00x"}</strong>
      </div>
      <div
        style={{
          position: "relative",
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          width: 540,
          height: 540,
          border: `2px solid ${C.line}`,
        }}
      >
        {Array.from({ length: 36 }).map((_, index) => {
          const row = Math.floor(index / 6);
          const col = index % 6;
          const filled = row === 2 && (col < 5 || placed);
          return (
            <div
              key={index}
              style={{
                position: "relative",
                borderRight: `1px solid ${C.line}`,
                borderBottom: `1px solid ${C.line}`,
              }}
            >
              {filled ? (
                <div
                  style={{
                    position: "absolute",
                    inset: 5,
                    borderRadius: 7,
                    background: col < 3 ? C.green : C.lime,
                    boxShadow: placed ? `0 0 25px ${C.lime}` : "none",
                    opacity: placed
                      ? interpolate(frame, [58, 78, 96], [1, 1, 0], clamp)
                      : 1,
                  }}
                />
              ) : null}
            </div>
          );
        })}
        <div
          style={{
            position: "absolute",
            width: 80,
            height: 80,
            borderRadius: 8,
            background: C.lime,
            left: interpolate(frame, [16, 58], [230, 455], clamp),
            top: interpolate(frame, [16, 58], [650, 190], clamp),
            opacity: interpolate(frame, [10, 18, 58, 64], [0, 1, 1, 0], clamp),
            boxShadow: `0 0 28px ${C.lime}88`,
          }}
        />
      </div>
    </div>
  );
};

const StoryTwo = () => (
  <StepLayout
    step="STORY 2"
    title="MOSTRE A PARTIDA"
    instruction="Grave a tela encaixando os blocos."
    visual={<MiniGame />}
    duration={165}
  >
    Você precisa pensar antes de cada movimento para não ficar sem espaço. Minha
    pontuação foi [PONTUAÇÃO]. Consegue superar?
  </StepLayout>
);

const LinkSticker = ({ campaignLink }: { campaignLink: string }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        width: 760,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 30,
      }}
    >
      <div
        style={{
          width: 580,
          height: 280,
          borderRadius: 36,
          border: `3px solid ${C.line}`,
          background: C.panel2,
          display: "grid",
          placeItems: "center",
          color: C.muted,
          fontSize: 34,
          fontWeight: 800,
        }}
      >
        SUA GRAVAÇÃO AQUI
      </div>
      <div
        style={{
          width: "100%",
          borderRadius: 30,
          padding: "34px 48px",
          background: C.lime,
          color: C.bg,
          textAlign: "center",
          fontSize: 48,
          fontWeight: 950,
          boxShadow: `0 0 ${interpolate(frame % 36, [0, 18, 36], [20, 65, 20], clamp)}px ${C.lime}66`,
          scale: interpolate(frame % 36, [0, 18, 36], [1, 1.035, 1], clamp),
        }}
      >
        🔗 {campaignLink}
      </div>
    </div>
  );
};

const StoryThree = ({ campaignLink }: Pick<GuideProps, "campaignLink">) => (
  <StepLayout
    step="STORY 3"
    title="CHAME PARA JOGAR"
    instruction="Adicione o adesivo com seu link."
    visual={<LinkSticker campaignLink={campaignLink} />}
    duration={150}
  >
    Clique no link para jogar e depois me envie sua pontuação.
  </StepLayout>
);

const Checklist = () => {
  const frame = useCurrentFrame();
  const items = [
    "Usar seu link individual",
    "Informar: Publicidade",
    "Informar: 18+ | Jogue com responsabilidade",
    "Não prometer ganhos ou dinheiro fácil",
  ];
  return (
    <AbsoluteFill
      style={{
        padding: "130px 78px 180px",
        opacity: fade(frame, 135),
      }}
    >
      <Header step="CHECKLIST" />
      <div
        style={{
          marginTop: 90,
          color: C.white,
          fontSize: 92,
          lineHeight: 0.95,
          fontWeight: 950,
          letterSpacing: -6,
        }}
      >
        ANTES DE
        <br />
        <span style={{ color: C.lime }}>PUBLICAR</span>
      </div>
      <div
        style={{
          marginTop: 68,
          display: "flex",
          flexDirection: "column",
          gap: 22,
        }}
      >
        {items.map((item, index) => (
          <div
            key={item}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 24,
              border: `2px solid ${C.line}`,
              borderRadius: 20,
              padding: "24px 28px",
              background: C.panel,
              color: C.white,
              fontSize: 35,
              fontWeight: 760,
              opacity: interpolate(frame, [18 + index * 9, 34 + index * 9], [0, 1], clamp),
              translate: `${interpolate(frame, [18 + index * 9, 34 + index * 9], [-35, 0], clamp)}px 0`,
            }}
          >
            <div
              style={{
                width: 46,
                height: 46,
                flex: "0 0 auto",
                borderRadius: "50%",
                background: C.lime,
                color: C.bg,
                display: "grid",
                placeItems: "center",
                fontSize: 28,
                fontWeight: 950,
              }}
            >
              ✓
            </div>
            {item}
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: "auto",
          color: C.lime,
          textAlign: "center",
          fontSize: 38,
          fontWeight: 900,
          opacity: interpolate(frame, [82, 102], [0, 1], clamp),
        }}
      >
        Pronto. Agora é só gravar.
      </div>
    </AbsoluteFill>
  );
};

export const InfluencerGuide: React.FC<GuideProps> = (props) => (
  <AbsoluteFill
    style={{
      fontFamily: "Arial, Helvetica, sans-serif",
      background: C.bg,
    }}
  >
    <Background />
    <Sequence name="Introdução" durationInFrames={90}>
      <Intro />
    </Sequence>
    <Sequence name="Story 1 — Apresentação" from={75} durationInFrames={150}>
      <StoryOne />
    </Sequence>
    <Sequence name="Story 2 — Partida" from={210} durationInFrames={165}>
      <StoryTwo />
    </Sequence>
    <Sequence name="Story 3 — Link" from={360} durationInFrames={150}>
      <StoryThree campaignLink={props.campaignLink} />
    </Sequence>
    <Sequence name="Checklist obrigatório" from={495} durationInFrames={135}>
      <Checklist />
    </Sequence>
  </AbsoluteFill>
);

export const MyComposition = () => (
  <Composition
    id="GuiaInfluencerBlockerino"
    component={InfluencerGuide}
    durationInFrames={630}
    fps={30}
    width={1080}
    height={1920}
    defaultProps={{
      campaignLink: "LINK DO INFLUENCER",
    }}
  />
);
