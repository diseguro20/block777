import asyncio
import json
import re
from pathlib import Path

import edge_tts


TEXT = (
    "Oi! A gente quer fechar uma parceria com você. "
    "Se você é influenciador, ou está começando no Instagram, presta atenção nessa novidade. "
    "Este é o Blockerino: uma experiência de habilidade e estratégia, com uma dinâmica diferente das casas de aposta tradicionais. "
    "Funciona assim: você escolhe a entrada, recebe peças e precisa encaixar os blocos sem travar o tabuleiro. "
    "Quando completa uma fileira, ela brilha, desaparece e o multiplicador aumenta. "
    "Quanto melhor a estratégia e mais linhas você completa, maior fica o retorno potencial da partida. "
    "O jogador acompanha tudo na tela e decide a hora de resgatar o saldo disponível. "
    "Queremos criadores que mostrem a jogabilidade de verdade, expliquem o desafio com transparência e convidem a audiência a testar. "
    "Você recebe seu link de parceiro, painel para acompanhar resultados e suporte da nossa equipe. "
    "Se você topa conhecer a proposta e crescer com uma novidade feita para conteúdo, vem para o Blockerino. "
    "Fale com a nossa equipe e vamos construir essa parceria. "
    "Conteúdo para maiores de dezoito anos. Jogue com responsabilidade. Resultados variam."
)

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
MP3 = PUBLIC / "partner-pitch-voice.mp3"
SRT = PUBLIC / "partner-pitch-voice.srt"
CAPTIONS = PUBLIC / "partner-pitch-captions.json"


def ms(value: str) -> int:
    hours, minutes, seconds = value.split(":")
    return round((int(hours) * 3600 + int(minutes) * 60 + float(seconds)) * 1000)


def captions_from_vtt(vtt: str):
    pattern = re.compile(
        r"(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})\s+([^\r\n]+)"
    )
    captions = []
    for match in pattern.finditer(vtt):
        start = ms(match.group(1))
        end = ms(match.group(2))
        text = re.sub(r"<[^>]+>", "", match.group(3)).strip()
        captions.append(
            {
                "text": text,
                "startMs": start,
                "endMs": end,
                "timestampMs": start,
                "confidence": 1,
            }
        )
    return captions


async def main():
    PUBLIC.mkdir(parents=True, exist_ok=True)
    communicate = edge_tts.Communicate(
        TEXT,
        voice="pt-BR-AntonioNeural",
        rate="+2%",
        pitch="-2Hz",
        volume="+0%",
    )
    submaker = edge_tts.SubMaker()
    with MP3.open("wb") as audio:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio.write(chunk["data"])
            elif chunk["type"] in ("WordBoundary", "SentenceBoundary"):
                submaker.feed(chunk)
    SRT.write_text(submaker.get_srt(), encoding="utf-8")

    # edge-tts emits SRT here. Parse it directly into the Remotion Caption shape.
    srt = SRT.read_text(encoding="utf-8")
    srt_pattern = re.compile(
        r"\d+\s+(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})\s+(.+?)(?=\n\n|\Z)",
        re.S,
    )
    captions = []
    for match in srt_pattern.finditer(srt.replace("\r\n", "\n")):
        start = ms(match.group(1).replace(",", "."))
        end = ms(match.group(2).replace(",", "."))
        text = " ".join(match.group(3).split())
        captions.append(
            {
                "text": text,
                "startMs": start,
                "endMs": end,
                "timestampMs": start,
                "confidence": 1,
            }
        )
    CAPTIONS.write_text(json.dumps(captions, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"audio": str(MP3), "captions": len(captions), "endMs": captions[-1]["endMs"]}))


if __name__ == "__main__":
    asyncio.run(main())
