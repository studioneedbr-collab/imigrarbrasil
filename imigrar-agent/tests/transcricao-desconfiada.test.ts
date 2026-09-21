import { describe, it, expect } from "vitest";
import { motivoDeDesconfianca } from "@/lib/agent/audio";
import { mediaKindFor } from "@/lib/agent/vision";

/**
 * O MODELO NÃO DIZ "NÃO ENTENDI".
 *
 * Diante de silêncio, chiado, um trecho curto ou um arquivo que não é fala, o Whisper
 * escreve com a mesma confiança de sempre — e o que sai é resíduo do material em que foi
 * treinado: legenda de vídeo, agradecimento de youtuber, frase solta em inglês.
 *
 * Isso é pior do que falhar. Falha vai para a tela de Falhas de transcrição e alguém ouve
 * o áudio. Frase inventada entra na conversa como o que a pessoa DISSE: a Ana responde a
 * ela, e o dossiê do caso passa a conter uma afirmação que ninguém fez.
 *
 * O caso que motivou o arquivo: um áudio em que a pessoa dizia "ah, desculpa, liguei
 * errado" apareceu no painel como "That's cool, but yeah".
 */
describe("a transcrição merece confiança?", () => {
  // O caso real, com os dados reais: conversa em português, áudio curto, saída em inglês.
  it("recusa o caso que aconteceu — frase curta em inglês numa conversa em português", () => {
    const motivo = motivoDeDesconfianca({
      texto: "That's cool, but yeah",
      idiomaDetectado: "en",
      idiomaDaConversa: "pt",
    });
    expect(motivo).toBeTruthy();
    expect(motivo).toMatch(/en/);
    expect(motivo).toMatch(/pt/);
  });

  it("recusa os resíduos de treino conhecidos", () => {
    for (const t of ["Thank you.", "Thanks for watching!", "Obrigado", "Tchau.", "you", "Gracias"]) {
      expect(motivoDeDesconfianca({ texto: t }), t).toBeTruthy();
    }
  });

  /**
   * O outro lado, e é o que impede o remédio de virar doença: quem manda áudio aqui é
   * justamente quem tem dificuldade de escrever. Recusar fala curta de verdade jogaria
   * fora a resposta da pessoa e pediria para ela repetir — que é o que este atendimento
   * não pode fazer.
   */
  it("aceita fala curta de verdade, no idioma da conversa", () => {
    for (const t of ["sim", "não sei", "pode ser", "ah, desculpa, liguei errado"]) {
      expect(
        motivoDeDesconfianca({ texto: t, idiomaDetectado: "pt", idiomaDaConversa: "pt" }),
        t,
      ).toBeNull();
    }
  });

  it("'obrigado' sozinho é resíduo; 'obrigado' dentro de uma frase é fala", () => {
    expect(motivoDeDesconfianca({ texto: "Obrigado." })).toBeTruthy();
    expect(
      motivoDeDesconfianca({
        texto: "obrigado, eu preciso renovar meu visto de trabalho",
        idiomaDetectado: "pt",
        idiomaDaConversa: "pt",
      }),
    ).toBeNull();
  });

  /**
   * Esta operação é multilíngue de propósito e as pessoas TROCAM de idioma no meio da
   * conversa. Quem troca de verdade costuma dizer alguma coisa; é o trecho curto numa
   * língua que a conversa nunca usou que denuncia a invenção.
   */
  it("troca de idioma com substância é aceita", () => {
    const longo =
      "hola, perdón, prefiero explicar en español: mi visa vence el mes que viene y necesito saber qué hacer";
    expect(motivoDeDesconfianca({ texto: longo, idiomaDetectado: "es", idiomaDaConversa: "pt" })).toBeNull();
  });

  it("sem idioma conhecido da conversa, não há com o que comparar", () => {
    expect(motivoDeDesconfianca({ texto: "That's cool, but yeah", idiomaDetectado: "en" })).toBeNull();
  });

  it("transcrição vazia é recusada", () => {
    expect(motivoDeDesconfianca({ texto: "   " })).toBeTruthy();
  });
});

/**
 * ÁUDIO ENCAMINHADO CHEGA COMO DOCUMENTO.
 *
 * A Z-API entrega o áudio gravado na hora pelos campos `audio`/`ptt`, com mime. O mesmo
 * arquivo ENCAMINHADO chega pelo campo `document`, e às vezes sem mime nenhum. Sem a
 * extensão mapeada, ele virava "documento": nunca passava por transcrição, e o que a
 * pessoa disse virava "arquivo recebido" que ninguém lia.
 */
describe("áudio sem mime é reconhecido pela extensão", () => {
  it("as extensões que o WhatsApp entrega viram áudio", () => {
    for (const nome of ["audio.ogg", "audio.opus", "gravacao.m4a", "nota.mp3", "voz.amr"]) {
      expect(mediaKindFor("", nome), nome).toBe("audio");
    }
  });

  it("octet-stream não atrapalha — é o mesmo que não mandar mime", () => {
    expect(mediaKindFor("application/octet-stream", "audio.ogg")).toBe("audio");
  });

  it("o mime explícito continua mandando", () => {
    expect(mediaKindFor("audio/ogg", "sem-extensao")).toBe("audio");
    expect(mediaKindFor("application/pdf", "contrato.pdf")).toBe("document");
    expect(mediaKindFor("image/jpeg", "passaporte.jpg")).toBe("image");
  });
});
