import { describe, it, expect } from "vitest";
import { detectarIdioma, idiomaDaConversa, pedidoDeIdioma } from "@/lib/agent/idioma";

// Caso real (Ricardo, 27/11/2026): a mensagem pronta do site foi lida como francês e a
// conversa seguiu em francês com ele pedindo espanhol, inglês e português.
describe("idioma — a conversa do Ricardo", () => {
  it("a mensagem pronta do botão do site é português, não francês", () => {
    expect(detectarIdioma("Olá, estive no site da Imigrar Brasil. Gostaria de mais informações.")).toBe("pt");
  });

  it("francês de verdade continua francês", () => {
    expect(detectarIdioma("bonjour, j'ai besoin de papiers pour mon séjour au Brésil")).toBe("fr");
    expect(detectarIdioma("Je voudrais plus d'informations sur le visa, mais je ne sais pas")).toBe("fr");
  });

  it("reconhece o pedido explícito de idioma, com erro de digitação", () => {
    expect(pedidoDeIdioma("Ablas  espanhol")).toBe("es");
    expect(pedidoDeIdioma("Habla español?")).toBe("es");
    expect(pedidoDeIdioma("Do you speak English?")).toBe("en");
    expect(pedidoDeIdioma("Habla inglés?")).toBe("en");
    expect(pedidoDeIdioma("Fala português?")).toBe("pt");
    expect(pedidoDeIdioma("pode ser em portugues")).toBe("pt");
    expect(pedidoDeIdioma("en français s'il vous plaît")).toBe("fr");
    expect(pedidoDeIdioma("Español?")).toBe("es");
  });

  it("nacionalidade não é pedido de idioma", () => {
    expect(pedidoDeIdioma("sou espanhol")).toBeUndefined();
    expect(pedidoDeIdioma("soy francés")).toBeUndefined();
  });

  it("a conversa troca de língua na hora em que ele pede, e não volta sozinha", () => {
    const falas: string[] = [];
    const turno = (m: string, gravado: string | null) => {
      falas.push(m);
      return idiomaDaConversa(m, falas.join("  "), gravado);
    };
    let g: string | null = null;
    g = turno("Olá, estive no site da Imigrar Brasil. Gostaria de mais informações.", g) ?? g;
    expect(g).toBe("pt");
    g = turno("Ablas  espanhol", g) ?? g;
    expect(g).toBe("es");
    g = turno("Yes", g) ?? g;
    expect(g).toBe("es");
    g = turno("Ok", g) ?? g;
    expect(g).toBe("es");
    g = turno("Do you speak English?", g) ?? g;
    expect(g).toBe("en");
    g = turno("ok", g) ?? g;
    expect(g).toBe("en");
    g = turno("Fala português?", g) ?? g;
    expect(g).toBe("pt");
  });

  it("portunhol vai para o português", () => {
    expect(detectarIdioma("quiero saber como fazer o meu documento aqui")).toBe("pt");
  });
});

import { avaliarConfirmacao, avaliarEncaminhamentoComercial, avaliarTransferencia, confirmou } from "@/lib/agent/transfer-gate";
import { avaliarImpasse } from "@/lib/agent/anti-loop";

// Casos reais de 25 a 27/11: quem estava pronto para contratar ficou preso em
// "deseja que eu encaminhe?".
describe("transbordo imediato — quem quer contratar não espera ficha completa", () => {
  const prontos = [
    "Eu quero agora. Estou pronto, tenho todos os documentos",
    "quero contratar vocês",
    "pode encaminhar",
    "como faço para contratar?",
    "resolva para mim",
    "I'm ready, I want to start",
    "quiero contratar el servicio",
  ];
  it.each(prontos)("libera a tool com a ficha pela metade: %s", (t) => {
    expect(avaliarEncaminhamentoComercial({ dossieCompleto: false, textoRecente: t, assuntoExigePessoa: false }).liberado).toBe(true);
    expect(avaliarTransferencia({ userTurns: 1, temNome: false, ultimaMensagem: t }).liberado).toBe(true);
  });

  it("quem já é cliente (boleto, parcela) vai direto", () => {
    expect(avaliarEncaminhamentoComercial({ dossieCompleto: false, textoRecente: "qual instituição enviou o boleto?", assuntoExigePessoa: false }).liberado).toBe(true);
  });

  it("'Por favor' a uma oferta de encaminhamento é sim", () => {
    expect(confirmou("Por favor")).toBe(true);
    expect(confirmou("sim, por favor")).toBe(true);
    expect(avaliarConfirmacao({
      ultimaRespostaDoAgente: "Posso encaminhar o seu caso para a equipe?",
      ultimaMensagem: "Por favor",
      textoRecente: "Por favor",
    }).liberado).toBe(true);
  });

  it("dúvida comum continua não liberando a ficha vazia", () => {
    expect(avaliarEncaminhamentoComercial({ dossieCompleto: false, textoRecente: "queria saber sobre visto de estudante", assuntoExigePessoa: false }).liberado).toBe(false);
  });
});

describe("destravar é uma vez só", () => {
  it("se a mensagem de destravar já saiu e travou de novo, encaminha", () => {
    const base = {
      jaTransferiu: false,
      ultimaMensagemDoCliente: "Dominicana Haitiano",
      novaResposta: "Para seguirmos com o seu atendimento, preciso de uma informação: qual é a sua nacionalidade?",
      setor: "comercial",
      faltamNoDossie: ["nacionalidade"],
      idioma: "pt",
    };
    const repetida = "Para seguirmos com o seu atendimento, preciso de uma informação: qual é a sua nacionalidade?";
    const r = avaliarImpasse({ ...base, respostasAnteriores: [repetida, repetida] } as never);
    expect(r?.acao).toBe("encaminhar");
  });
});
