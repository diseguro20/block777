import React, {useCallback, useEffect, useMemo, useState} from "react";
import type {Caption} from "@remotion/captions";
import {Audio} from "@remotion/media";
import {
  AbsoluteFill,
  Composition,
  Easing,
  Sequence,
  cancelRender,
  continueRender,
  delayRender,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const C = {
  bg: "#030705",
  panel: "#0a120e",
  panel2: "#101d15",
  lime: "#c9ff43",
  green: "#60e49c",
  gold: "#f7b731",
  white: "#f5f8f6",
  muted: "#9aaba2",
  line: "#294033",
};

const clamp = {extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const};
const ease = Easing.bezier(0.16, 1, 0.3, 1);

const sceneOpacity = (frame: number, duration: number) =>
  interpolate(frame, [0, 16, duration - 18, duration], [0, 1, 1, 0], {...clamp, easing: ease});

const Brand = ({small = false}: {small?: boolean}) => (
  <div style={{display: "flex", alignItems: "center", gap: small ? 14 : 20}}>
    <div style={{display: "grid", gridTemplateColumns: `repeat(2, ${small ? 16 : 22}px)`, gap: 5, rotate: "45deg"}}>
      {[0, 1, 2, 3].map((item) => (
        <div
          key={item}
          style={{
            width: small ? 16 : 22,
            height: small ? 16 : 22,
            borderRadius: 4,
            background: C.lime,
            opacity: item === 1 ? 0.55 : 1,
            boxShadow: `0 0 24px ${C.lime}66`,
          }}
        />
      ))}
    </div>
    <div>
      <div style={{color: C.white, fontSize: small ? 26 : 38, fontWeight: 950, letterSpacing: -2}}>BLOCKERINO</div>
      <div style={{color: C.muted, fontSize: small ? 10 : 14, fontWeight: 850, letterSpacing: small ? 5 : 7}}>PLAY SMART</div>
    </div>
  </div>
);

const Background = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{background: "radial-gradient(circle at 16% 10%, #72962040, transparent 31%), radial-gradient(circle at 88% 74%, #1b8b5b35, transparent 36%), #030705", overflow: "hidden"}}>
      <div
        style={{
          position: "absolute",
          inset: -80,
          opacity: 0.12,
          backgroundImage: "linear-gradient(#c9ff4320 1px, transparent 1px), linear-gradient(90deg, #c9ff4320 1px, transparent 1px)",
          backgroundSize: "58px 58px",
          translate: `${interpolate(frame, [0, 2250], [0, -116], clamp)}px ${interpolate(frame, [0, 2250], [0, -58], clamp)}px`,
          rotate: "-2deg",
        }}
      />
      {Array.from({length: 18}).map((_, index) => (
        <div
          key={index}
          style={{
            position: "absolute",
            width: 10 + (index % 4) * 7,
            height: 10 + (index % 4) * 7,
            borderRadius: index % 2 ? "50%" : 5,
            background: index % 5 === 0 ? C.gold : C.lime,
            left: `${4 + ((index * 29) % 92)}%`,
            top: `${8 + ((index * 37) % 84)}%`,
            opacity: 0.12 + (index % 3) * 0.08,
            translate: `0 ${interpolate((frame + index * 21) % 180, [0, 180], [35, -45], clamp)}px`,
            rotate: `${frame * (0.6 + (index % 3) * 0.25)}deg`,
            boxShadow: `0 0 20px ${index % 5 === 0 ? C.gold : C.lime}`,
          }}
        />
      ))}
    </AbsoluteFill>
  );
};

const Header = ({tag}: {tag: string}) => (
  <div style={{position: "absolute", top: 52, left: 72, right: 72, display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 20}}>
    <Brand small />
    <div style={{border: `1px solid ${C.line}`, borderRadius: 999, background: `${C.panel}dd`, padding: "11px 18px", color: C.lime, fontSize: 18, fontWeight: 900, letterSpacing: 2}}>{tag}</div>
  </div>
);

const CreatorVisual = () => {
  const frame = useCurrentFrame();
  return (
    <div style={{position: "relative", width: 590, height: 590}}>
      <div style={{position: "absolute", inset: 50, borderRadius: "50%", border: `2px solid ${C.lime}33`, boxShadow: `0 0 100px ${C.lime}25`, scale: interpolate(frame % 70, [0, 35, 70], [0.95, 1.04, 0.95], clamp)}} />
      <div style={{position: "absolute", width: 210, height: 210, borderRadius: "50%", background: C.lime, top: 76, left: 190, boxShadow: `0 0 70px ${C.lime}55`}} />
      <div style={{position: "absolute", width: 390, height: 260, borderRadius: "195px 195px 42px 42px", background: "linear-gradient(145deg, #60e49c, #1d8b58)", bottom: 62, left: 100}} />
      <div style={{position: "absolute", right: 52, top: 40, width: 110, height: 110, borderRadius: 28, background: C.panel2, border: `2px solid ${C.line}`, display: "grid", placeItems: "center", color: C.lime, fontSize: 54, fontWeight: 950, rotate: "8deg"}}>↗</div>
      <div style={{position: "absolute", left: 15, bottom: 50, borderRadius: 24, background: C.panel2, border: `2px solid ${C.line}`, padding: "20px 28px", color: C.white, fontSize: 24, fontWeight: 850, boxShadow: "0 24px 50px #0008"}}>CRIADOR + BLOCKERINO</div>
    </div>
  );
};

const IntroScene = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{padding: "150px 92px 130px", opacity: sceneOpacity(frame, 300)}}>
      <Header tag="CONVITE DE PARCERIA" />
      <div style={{flex: 1, display: "grid", gridTemplateColumns: "1.12fr .88fr", alignItems: "center", gap: 60}}>
        <div>
          <div style={{width: "fit-content", borderRadius: 999, background: C.lime, color: C.bg, padding: "12px 20px", fontSize: 22, fontWeight: 950, letterSpacing: 2, opacity: interpolate(frame, [6, 26], [0, 1], clamp), scale: interpolate(frame, [6, 26], [0.75, 1], {...clamp, easing: ease})}}>TEMOS UMA PROPOSTA PARA VOCÊ</div>
          <div style={{marginTop: 34, color: C.white, fontSize: 94, lineHeight: 0.92, fontWeight: 1000, letterSpacing: -7, opacity: interpolate(frame, [18, 42], [0, 1], clamp), translate: `${interpolate(frame, [18, 42], [-55, 0], clamp)}px 0`}}>
            VAMOS FECHAR
            <br />UMA <span style={{color: C.lime}}>PARCERIA?</span>
          </div>
          <div style={{marginTop: 38, color: C.muted, fontSize: 34, lineHeight: 1.25, fontWeight: 700, opacity: interpolate(frame, [38, 60], [0, 1], clamp)}}>Para quem já influencia — ou está começando agora no Instagram.</div>
        </div>
        <div style={{opacity: interpolate(frame, [24, 55], [0, 1], clamp), scale: interpolate(frame, [24, 55], [0.82, 1], {...clamp, easing: ease})}}><CreatorVisual /></div>
      </div>
    </AbsoluteFill>
  );
};

const SkillScene = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{padding: "150px 92px 130px", opacity: sceneOpacity(frame, 350)}}>
      <Header tag="JOGO DE HABILIDADE" />
      <div style={{flex: 1, display: "grid", gridTemplateColumns: "0.9fr 1.1fr", alignItems: "center", gap: 80}}>
        <div style={{position: "relative", height: 610, display: "grid", placeItems: "center"}}>
          <div style={{position: "absolute", width: 470, height: 470, borderRadius: 80, rotate: `${interpolate(frame, [0, 350], [-8, 5], clamp)}deg`, background: `linear-gradient(145deg, ${C.lime}, #5fa616)`, boxShadow: `0 0 100px ${C.lime}35`}} />
          <div style={{position: "relative", display: "grid", gridTemplateColumns: "repeat(3, 92px)", gap: 13}}>
            {[0, 1, 2, 3, 4, 5, 6].map((index) => <div key={index} style={{width: 92, height: 92, borderRadius: 17, background: index % 3 === 0 ? C.gold : C.bg, boxShadow: "inset 0 0 0 3px #ffffff25", opacity: interpolate(frame, [12 + index * 5, 30 + index * 5], [0, 1], clamp), scale: interpolate(frame, [12 + index * 5, 30 + index * 5], [0.55, 1], clamp)}} />)}
          </div>
        </div>
        <div>
          <div style={{color: C.lime, fontSize: 26, fontWeight: 950, letterSpacing: 3}}>CONHEÇA A NOVIDADE</div>
          <div style={{marginTop: 22, color: C.white, fontSize: 88, lineHeight: 0.92, fontWeight: 1000, letterSpacing: -7}}>ESTE É O<br /><span style={{color: C.lime}}>BLOCKERINO.</span></div>
          <div style={{marginTop: 34, color: C.muted, fontSize: 33, lineHeight: 1.28, fontWeight: 700}}>Uma experiência de habilidade e estratégia, com dinâmica diferente das casas de aposta tradicionais.</div>
          <div style={{marginTop: 35, display: "flex", gap: 15}}>{["ESTRATÉGIA", "DECISÃO", "HABILIDADE"].map((item, index) => <div key={item} style={{border: `2px solid ${index === 1 ? C.lime : C.line}`, color: index === 1 ? C.lime : C.white, borderRadius: 999, padding: "13px 18px", fontSize: 19, fontWeight: 900, opacity: interpolate(frame, [50 + index * 8, 72 + index * 8], [0, 1], clamp)}}>{item}</div>)}</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const GameBoard = () => {
  const frame = useCurrentFrame();
  const events = [115, 255, 395];
  const cleared = events.filter((event) => frame >= event).length;
  const multiplier = ["1.00x", "1.50x", "2.00x", "2.50x"][cleared];
  const active = events.findIndex((event) => Math.abs(frame - event) < 16);
  const rows = [6, 4, 2];
  return (
    <div style={{width: 825, borderRadius: 30, border: `2px solid ${C.line}`, padding: 18, background: "linear-gradient(180deg, #0d1712, #050907)", boxShadow: "0 40px 100px #000a"}}>
      <div style={{display: "grid", gridTemplateColumns: "repeat(3,1fr)", border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden", marginBottom: 15}}>
        {[["MULTIPLICADOR", multiplier], ["LINHAS", String(cleared)], ["RETORNO", `R$ ${(20 * Number(multiplier.replace("x", ""))).toFixed(2).replace(".", ",")}`]].map(([label, value], index) => <div key={label} style={{padding: "13px 10px", textAlign: "center", borderRight: index < 2 ? `1px solid ${C.line}` : undefined}}><div style={{color: C.muted, fontSize: 14, fontWeight: 850}}>{label}</div><div style={{color: C.lime, marginTop: 5, fontSize: 28, fontWeight: 950}}>{value}</div></div>)}
      </div>
      <div style={{position: "relative", width: 787, height: 610, display: "grid", gridTemplateColumns: "repeat(8,1fr)", gridTemplateRows: "repeat(7,1fr)", border: `1px solid ${C.line}`, background: C.bg, overflow: "hidden"}}>
        {Array.from({length: 56}).map((_, index) => {
          const row = Math.floor(index / 8);
          const col = index % 8;
          const rowEvent = rows.indexOf(row);
          const event = rowEvent >= 0 ? events[rowEvent] : Infinity;
          const fullRow = rowEvent >= 0 && frame <= event + 13;
          const scattered = (row * 7 + col * 5) % 13 === 0;
          const filled = scattered || (fullRow && (col < 7 || frame >= event - 10));
          return <div key={index} style={{position: "relative", borderRight: `1px solid ${C.line}b0`, borderBottom: `1px solid ${C.line}b0`}}>{filled ? <div style={{position: "absolute", inset: 5, borderRadius: 7, background: (row + col) % 3 ? C.green : C.lime, opacity: event !== Infinity && frame > event ? interpolate(frame, [event, event + 13], [1, 0], clamp) : 0.9, boxShadow: event !== Infinity && Math.abs(frame - event) < 14 ? `0 0 28px ${C.lime}` : "inset 0 0 0 2px #ffffff1f"}} /> : null}</div>;
        })}
        {events.map((event, index) => <div key={event} style={{position: "absolute", width: 82, height: 76, borderRadius: 8, background: C.gold, left: interpolate(frame, [event - 42, event - 10], [355, 692], clamp), top: interpolate(frame, [event - 42, event - 10], [650, rows[index] * 87 + 5], clamp), opacity: interpolate(frame, [event - 45, event - 40, event - 10, event - 7], [0, 1, 1, 0], clamp), boxShadow: `0 0 30px ${C.gold}`}} />)}
        {active >= 0 ? <div style={{position: "absolute", left: 0, right: 0, top: rows[active] * 87, height: 87, background: `linear-gradient(90deg, transparent, ${C.lime}, transparent)`, opacity: interpolate(Math.abs(frame - events[active]), [0, 16], [0.75, 0], clamp), boxShadow: `0 0 50px ${C.lime}`}} /> : null}
      </div>
    </div>
  );
};

const GameplayScene = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{padding: "135px 72px 125px", opacity: sceneOpacity(frame, 500)}}>
      <Header tag="GAMEPLAY DEMONSTRATIVO" />
      <div style={{flex: 1, display: "grid", gridTemplateColumns: "0.95fr 1.05fr", gap: 55, alignItems: "center"}}>
        <div>
          <div style={{color: C.white, fontSize: 78, lineHeight: 0.92, letterSpacing: -6, fontWeight: 1000}}>ENCAIXE.<br /><span style={{color: C.lime}}>FORME FILEIRAS.</span><br />MULTIPLIQUE.</div>
          <div style={{marginTop: 32, color: C.muted, fontSize: 30, lineHeight: 1.32, fontWeight: 700}}>Escolha a entrada, organize os blocos e evite travar o tabuleiro.</div>
          <div style={{marginTop: 28, display: "flex", flexDirection: "column", gap: 14}}>{["1  Arraste e encaixe as peças", "2  Complete uma fileira", "3  Veja o multiplicador subir"].map((item, index) => <div key={item} style={{borderLeft: `5px solid ${index === 2 ? C.lime : C.line}`, background: `${C.panel}de`, padding: "17px 20px", color: index === 2 ? C.lime : C.white, fontSize: 25, fontWeight: 850, opacity: interpolate(frame, [18 + index * 12, 40 + index * 12], [0, 1], clamp), translate: `${interpolate(frame, [18 + index * 12, 40 + index * 12], [-35, 0], clamp)}px 0`}}>{item}</div>)}</div>
        </div>
        <div style={{opacity: interpolate(frame, [8, 30], [0, 1], clamp), scale: interpolate(frame, [8, 30], [0.93, 1], {...clamp, easing: ease})}}><GameBoard /></div>
      </div>
      <div style={{position: "absolute", bottom: 120, right: 76, color: C.muted, fontSize: 15, fontWeight: 800}}>SIMULAÇÃO VISUAL • RESULTADOS VARIAM • 18+</div>
    </AbsoluteFill>
  );
};

const CashoutScene = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{padding: "145px 100px 130px", opacity: sceneOpacity(frame, 390)}}>
      <Header tag="CONTROLE NA TELA" />
      <div style={{flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", alignItems: "center", gap: 90}}>
        <div>
          <div style={{color: C.white, fontSize: 83, lineHeight: 0.92, letterSpacing: -6, fontWeight: 1000}}>ACOMPANHE.<br />DECIDA.<br /><span style={{color: C.lime}}>RESGATE.</span></div>
          <div style={{marginTop: 36, color: C.muted, fontSize: 32, lineHeight: 1.3, fontWeight: 700}}>O jogador vê o retorno potencial em tempo real e decide quando encerrar a partida.</div>
        </div>
        <div style={{borderRadius: 42, border: `2px solid ${C.line}`, background: C.panel, padding: 52, boxShadow: "0 50px 120px #000a", opacity: interpolate(frame, [12, 35], [0, 1], clamp), translate: `${interpolate(frame, [12, 35], [70, 0], clamp)}px 0`}}>
          <div style={{color: C.muted, fontSize: 22, fontWeight: 850, letterSpacing: 2}}>RETORNO POTENCIAL</div>
          <div style={{marginTop: 10, color: C.lime, fontSize: 100, fontWeight: 1000, letterSpacing: -6}}>R$ 50,00</div>
          <div style={{height: 15, marginTop: 25, borderRadius: 999, background: C.line, overflow: "hidden"}}><div style={{height: "100%", width: `${interpolate(frame, [35, 150], [8, 84], clamp)}%`, borderRadius: 999, background: C.lime, boxShadow: `0 0 24px ${C.lime}`}} /></div>
          <div style={{marginTop: 36, borderRadius: 18, background: C.green, color: C.bg, padding: "24px 28px", textAlign: "center", fontSize: 31, fontWeight: 1000, scale: interpolate(frame % 45, [0, 22, 45], [1, 1.025, 1], clamp)}}>RESGATAR AGORA →</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const PartnershipScene = () => {
  const frame = useCurrentFrame();
  const benefits = [["LINK", "Seu link individual"], ["PAINEL", "Resultados organizados"], ["SUPORTE", "Equipe ao seu lado"]];
  return (
    <AbsoluteFill style={{padding: "145px 92px 130px", opacity: sceneOpacity(frame, 420)}}>
      <Header tag="PROGRAMA DE PARCEIROS" />
      <div style={{marginTop: 80, textAlign: "center", color: C.white, fontSize: 75, lineHeight: 0.96, letterSpacing: -5, fontWeight: 1000}}>CONTEÚDO DE VERDADE.<br /><span style={{color: C.lime}}>PARCERIA COM ESTRUTURA.</span></div>
      <div style={{flex: 1, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", alignItems: "center", gap: 26}}>{benefits.map(([title, desc], index) => <div key={title} style={{height: 300, borderRadius: 30, border: `2px solid ${index === 1 ? C.lime : C.line}`, background: index === 1 ? "linear-gradient(145deg, #162713, #09100d)" : C.panel, padding: 35, display: "flex", flexDirection: "column", justifyContent: "space-between", opacity: interpolate(frame, [18 + index * 14, 45 + index * 14], [0, 1], clamp), translate: `0 ${interpolate(frame, [18 + index * 14, 45 + index * 14], [55, 0], clamp)}px`, boxShadow: index === 1 ? `0 0 65px ${C.lime}20` : "0 30px 75px #0007"}}><div style={{width: 64, height: 64, borderRadius: 18, background: C.lime, color: C.bg, display: "grid", placeItems: "center", fontSize: 30, fontWeight: 1000}}>{index + 1}</div><div><div style={{color: C.lime, fontSize: 24, fontWeight: 950, letterSpacing: 2}}>{title}</div><div style={{marginTop: 8, color: C.white, fontSize: 29, lineHeight: 1.18, fontWeight: 850}}>{desc}</div></div></div>)}</div>
      <div style={{textAlign: "center", color: C.muted, fontSize: 27, fontWeight: 700}}>Mostre a jogabilidade, explique o desafio e convide sua audiência com transparência.</div>
    </AbsoluteFill>
  );
};

const FinalScene = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{padding: "145px 110px 115px", opacity: sceneOpacity(frame, 510), alignItems: "center", textAlign: "center"}}>
      <Brand />
      <div style={{marginTop: 95, color: C.white, fontSize: 100, lineHeight: 0.9, letterSpacing: -8, fontWeight: 1000, opacity: interpolate(frame, [8, 32], [0, 1], clamp), scale: interpolate(frame, [8, 32], [1.12, 1], {...clamp, easing: ease})}}>VOCÊ TOPA<br /><span style={{color: C.lime}}>CRESCER COM A GENTE?</span></div>
      <div style={{marginTop: 42, maxWidth: 1180, color: C.muted, fontSize: 35, lineHeight: 1.25, fontWeight: 700}}>Uma novidade feita para gerar conteúdo, desafio e participação da sua audiência.</div>
      <div style={{marginTop: 55, width: 900, borderRadius: 22, background: C.lime, color: C.bg, padding: "25px 35px", fontSize: 39, fontWeight: 1000, boxShadow: `0 0 ${interpolate(frame % 42, [0, 21, 42], [35, 90, 35], clamp)}px ${C.lime}60`, scale: interpolate(frame % 42, [0, 21, 42], [1, 1.025, 1], clamp)}}>FALE COM NOSSA EQUIPE →</div>
      <div style={{marginTop: "auto", color: C.muted, fontSize: 18, lineHeight: 1.4, fontWeight: 800}}>CONTEÚDO 18+ • JOGUE COM RESPONSABILIDADE • RESULTADOS VARIAM<br />Condições comerciais apresentadas pela equipe de parcerias.</div>
    </AbsoluteFill>
  );
};

const CaptionOverlay = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const [captions, setCaptions] = useState<Caption[] | null>(null);
  const [handle] = useState(() => delayRender("Carregando legendas"));
  const load = useCallback(async () => {
    try {
      const response = await fetch(staticFile("partner-pitch-captions.json"));
      const data = (await response.json()) as Caption[];
      setCaptions(data);
      continueRender(handle);
    } catch (error) {
      cancelRender(error);
    }
  }, [handle]);
  useEffect(() => {load();}, [load]);
  const now = (frame / fps) * 1000;
  const current = useMemo(() => captions?.find((caption) => now >= caption.startMs && now <= caption.endMs), [captions, now]);
  if (!current) return null;
  return (
    <div style={{position: "absolute", left: "50%", bottom: 28, translate: "-50% 0", maxWidth: 1380, borderRadius: 14, background: "#020503e8", border: `1px solid ${C.line}`, padding: "11px 24px", color: C.white, fontSize: 27, lineHeight: 1.15, fontWeight: 850, textAlign: "center", boxShadow: "0 12px 35px #000a", zIndex: 50}}>{current.text}</div>
  );
};

export const PartnerPitchVideo: React.FC = () => (
  <AbsoluteFill style={{fontFamily: "Arial, Helvetica, sans-serif", background: C.bg}}>
    <Background />
    <Audio src={staticFile("blockerino-beat.wav")} volume={0.075} loop />
    <Audio src={staticFile("partner-pitch-voice.mp3")} volume={1} />
    <Sequence name="Convite" durationInFrames={300}><IntroScene /></Sequence>
    <Sequence name="Posicionamento" from={270} durationInFrames={350}><SkillScene /></Sequence>
    <Sequence name="Como funciona" from={590} durationInFrames={500}><GameplayScene /></Sequence>
    <Sequence name="Controle e resgate" from={1060} durationInFrames={390}><CashoutScene /></Sequence>
    <Sequence name="Estrutura da parceria" from={1420} durationInFrames={420}><PartnershipScene /></Sequence>
    <Sequence name="Chamada final" from={1810} durationInFrames={440}><FinalScene /></Sequence>
    {[270, 590, 1060, 1420, 1810].map((from) => <Sequence key={from} from={from} durationInFrames={24} layout="none"><Audio src={staticFile("whoosh.wav")} volume={0.24} /></Sequence>)}
    {[705, 845, 985].map((from) => <Sequence key={from} from={from} durationInFrames={18} layout="none"><Audio src={staticFile("ding.wav")} volume={0.34} /></Sequence>)}
    <CaptionOverlay />
  </AbsoluteFill>
);

export const PartnerPitchComposition = () => (
  <Composition
    id="BlockerinoPropostaParceiroHorizontal"
    component={PartnerPitchVideo}
    durationInFrames={2250}
    fps={30}
    width={1920}
    height={1080}
  />
);
