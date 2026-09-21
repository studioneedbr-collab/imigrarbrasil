import { describe, it, expect } from "vitest";
import { extractSlots, nomeDaResposta, nomePlausivel } from "@/lib/agent/triagem";
import { capturarDadosDoLead } from "@/lib/agent/lead-capture";
import { qualificacaoFaltando } from "@/lib/domain/ficha";
import { processMessage } from "@/lib/agent";
import { getRepository } from "@/lib/data";
import type { Lead } from "@/lib/domain/types";

/**
 * O NOME DA PESSOA — o primeiro dos três da abertura.
 *
 * O time relatou o defeito assim: "a IA está solicitando o nome da pessoa lá depois da
 * conversa". Eram três causas somadas, e cada bloco aqui fixa uma:
 *
 * 1. Quem respondia o nome seco ("Maria") não era lido — a ficha continuava vazia e a
 *    pergunta voltava mais adiante.
 * 2. O caminho sem LLM não tinha o nome na lista de perguntas: ele NUNCA perguntava.
 * 3. O portão de encaminhamento cobra o nome (ficha mínima), e era ali, na hora de passar
 *    o caso, que o buraco aparecia — daí a pergunta sair no fim.
 */

describe("ler o nome que a pessoa respondeu", () => {
  const PERGUNTA = "Antes de mais nada, como você se chama?";

  it("aceita a resposta seca, que é como se responde no WhatsApp", () => {
    expect(nomeDaResposta(PERGUNTA, "Maria")).toBe("Maria");
    expect(nomeDaResposta(PERGUNTA, "Maria Silva")).toBe("Maria Silva");
    expect(nomeDaResposta(PERGUNTA, "sou Maria")).toBe("Maria");
    expect(nomeDaResposta(PERGUNTA, "é Maria mesmo")).toBe("Maria Mesmo");
    expect(nomeDaResposta(PERGUNTA, "Maria 😊")).toBe("Maria");
    expect(nomeDaResposta("¿Cómo te llamas?", "Yolanda")).toBe("Yolanda");
    expect(nomeDaResposta("What's your name?", "my name is John Carter")).toBe("John Carter");
  });

  it("só lê quando a pergunta anterior foi essa — senão toda palavra solta vira nome", () => {
    expect(nomeDaResposta("Você já está no Brasil ou ainda está fora?", "Boa Vista")).toBeUndefined();
    expect(nomeDaResposta("", "Maria")).toBeUndefined();
  });

  it("recusa o que não é nome, em vez de chutar", () => {
    for (const resposta of [
      "sim",
      "ok",
      "bom dia",
      "não quero dizer",
      "sou venezuelana",
      "prefiro falar com um advogado agora por favor",
      "5511999998888",
    ]) {
      expect(nomeDaResposta(PERGUNTA, resposta), resposta).toBeUndefined();
    }
  });

  // Nome errado na ficha é pior do que nome nenhum: ninguém desconfia dele, e alguém liga
  // chamando a pessoa por um gentílico.
  it("gentílico não vira nome", () => {
    expect(nomePlausivel("venezuelana que")).toBeUndefined();
    expect(extractSlots("sou a venezuelana que entrou por Pacaraima").name).toBeUndefined();
  });

  it("a apresentação espontânea continua valendo", () => {
    expect(extractSlots("Meu nome é Yolanda, sou venezuelana").name).toBe("Yolanda");
    expect(extractSlots("me chamo Erica e queria mandar meu currículo").name).toBe("Erica");
  });
});

describe("o nome respondido chega à ficha", () => {
  it("a captura grava o nome vindo da resposta à pergunta da Ana", () => {
    const patch = capturarDadosDoLead("oi  Maria", null, {
      perguntaDoAgente: "Antes de mais nada, como você se chama?",
      mensagem: "Maria",
    });
    expect(patch?.contactName).toBe("Maria");
  });

  it("sem o contexto do turno, a palavra solta não vira nome", () => {
    expect(capturarDadosDoLead("oi  Maria", null)?.contactName).toBeUndefined();
  });

  it("o que já está gravado não é sobrescrito pela heurística", () => {
    const lead = { contactName: "Rosa" } as Lead;
    const patch = capturarDadosDoLead("Maria", lead, {
      perguntaDoAgente: "como você se chama?",
      mensagem: "Maria",
    });
    expect(patch?.contactName).toBeUndefined();
  });
});

// É este portão que fazia a pergunta aparecer no fim: sem o nome, a ficha mínima nunca
// fecha, e o modelo só descobre o buraco na hora de encaminhar.
describe("a ficha mínima continua exigindo o nome", () => {
  it("sem nome a ficha não fecha", () => {
    expect(qualificacaoFaltando(null).faltam).toContain("o nome dela");
  });
});

describe("o caminho sem LLM pergunta o nome primeiro", () => {
  it("a primeira pergunta da triagem é o nome, não a nacionalidade", async () => {
    const repo = getRepository();
    const conv = await repo.getOrCreateConversation("nome:abertura");
    await processMessage({ conversationId: conv.id, userText: "oi" });
    const r = await processMessage({
      conversationId: conv.id,
      userText: "quero ajuda para morar no Brasil",
    });
    expect(r.reply.toLowerCase()).toMatch(/como voc[êe] se chama/);
    expect(r.reply.toLowerCase()).not.toMatch(/de qual pa[íi]s/);
  });

  it("respondido o nome, a pergunta não volta — e a ficha fica com ele", async () => {
    const repo = getRepository();
    const conv = await repo.getOrCreateConversation("nome:respondeu");
    await processMessage({ conversationId: conv.id, userText: "oi" });
    await processMessage({
      conversationId: conv.id,
      userText: "quero ajuda para morar no Brasil",
    });
    const r = await processMessage({ conversationId: conv.id, userText: "Maria" });
    expect(r.reply.toLowerCase()).not.toMatch(/como voc[êe] se chama/);
    const lead = await repo.getLeadByConversation(conv.id);
    expect(lead?.contactName).toBe("Maria");
  });
});

/**
 * O SEGUNDO DEFEITO QUE APARECEU NA MESMA LEITURA: a Ana pedia autorização e, na mesma
 * mensagem, dizia que já tinha encaminhado.
 *
 * "Posso passar o seu contato agora?" seguido de "Já deixei o seu caso com o nosso time
 * jurídico". Quem lê entende que foi passado adiante sem ter dito sim — e é esse tipo de
 * conversa que faz alguém parar de contar o que importa.
 */
describe("não pede autorização e se responde sozinha", () => {
  it("quando o caso é encaminhado na hora, a pergunta sai e o aviso fica", async () => {
    const repo = getRepository();
    const conv = await repo.getOrCreateConversation("nome:encaminha");
    const r = await processMessage({
      conversationId: conv.id,
      userText: "oi, recebi uma multa migratória e tenho prazo",
    });
    expect(r.reply.toLowerCase()).toMatch(/j[áa] deixei o seu caso/);
    expect(r.reply.toLowerCase()).not.toMatch(/posso passar o seu contato/);
    // E a substância da resposta continua lá — cortar a pergunta não é cortar o recado.
    expect(r.reply.toLowerCase()).toMatch(/prazo/);
  });
});

/**
 * RECUSAR NÃO É SUMIR.
 *
 * A regra do atendimento diz que quem não responde duas perguntas seguidas quer
 * informação, não atendimento — e a conversa se encerra com cortesia. A regra está certa;
 * a leitura dela estava errada, porque "prefiro não dizer" É uma resposta: a pessoa leu,
 * pensou e decidiu.
 *
 * O efeito aparecia logo na abertura: perguntado o nome, quem recusava recebia a
 * despedida na mensagem seguinte. Num atendimento em que metade das pessoas está em
 * situação irregular e com medo de se identificar, despedir-se de quem não quer dar o
 * nome é dispensar exatamente quem mais precisa.
 */
describe("quem se recusa a responder continua sendo atendido", () => {
  it("recusar o nome não encerra a conversa — a próxima pergunta vem", async () => {
    const repo = getRepository();
    const conv = await repo.getOrCreateConversation("rec:uma");
    await processMessage({ conversationId: conv.id, userText: "oi" });
    await processMessage({
      conversationId: conv.id,
      userText: "quero ajuda para morar no Brasil",
    });
    const r = await processMessage({ conversationId: conv.id, userText: "prefiro não dizer" });
    expect(r.reply.toLowerCase()).not.toMatch(/obrigada pelo contato/);
    expect(r.reply.toLowerCase()).toMatch(/de qual pa[íi]s/);
  });

  it("e não insiste na pergunta recusada", async () => {
    const repo = getRepository();
    const conv = await repo.getOrCreateConversation("rec:nao-insiste");
    await processMessage({ conversationId: conv.id, userText: "oi" });
    await processMessage({ conversationId: conv.id, userText: "quero ajuda para morar no Brasil" });
    const r = await processMessage({ conversationId: conv.id, userText: "prefiro não dizer" });
    expect(r.reply.toLowerCase()).not.toMatch(/como voc[êe] se chama/);
  });

  // O outro lado: recusar tudo é dizer que não quer ser entrevistada, e insistir com essa
  // pessoa é o que faz alguém bloquear o número.
  it("duas recusas seguidas encerram com cortesia", async () => {
    const repo = getRepository();
    const conv = await repo.getOrCreateConversation("rec:duas");
    await processMessage({ conversationId: conv.id, userText: "oi" });
    await processMessage({ conversationId: conv.id, userText: "quero ajuda para morar no Brasil" });
    await processMessage({ conversationId: conv.id, userText: "prefiro não dizer" });
    const r = await processMessage({ conversationId: conv.id, userText: "não quero dizer" });
    expect(r.reply.toLowerCase()).toMatch(/obrigada pelo contato/);
  });

  it("reconhece a recusa nos três idiomas do atendimento", async () => {
    const { ehRecusa } = await import("@/lib/agent/triagem");
    for (const t of ["prefiro não dizer", "prefiero no decir", "I'd rather not say", "não quero informar"]) {
      expect(ehRecusa(t), t).toBe(true);
    }
    // E não confunde com quem está respondendo de verdade.
    for (const t of ["meu nome é Maria", "sou da Bolívia", "não tenho passaporte"]) {
      expect(ehRecusa(t), t).toBe(false);
    }
  });
});
