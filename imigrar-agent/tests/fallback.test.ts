import { describe, it, expect } from "vitest";
import { processMessage } from "@/lib/agent";
import { getRepository } from "@/lib/data";

// O ATENDIMENTO SEM LLM.
//
// Substituiu a máquina de estados herdada (S0..S10), que abria um menu de terceirização
// — "1️⃣ Solicitar orçamento", "2️⃣ Conhecer nossos serviços" — para quem tinha acabado de
// perguntar sobre visto. Estes testes fixam o que o caminho determinístico faz agora:
// acolhe, NUNCA afirma nada sobre imigração, e leva ao time jurídico assim que há caso.
//
// Sem DEEPSEEK_API_KEY é este caminho que roda — inclusive na suíte.

describe("porta de entrada", () => {
  it("se apresenta em PT e ES e faz uma pergunta aberta", async () => {
    const repo = getRepository();
    const conv = await repo.getOrCreateConversation("fb:oi");
    const r = await processMessage({ conversationId: conv.id, userText: "oi" });
    expect(r.reply.toLowerCase()).toMatch(/imigrar brasil/);
    // Regra da ambiguidade: um "oi" não diz o idioma, então a porta de entrada é bilíngue.
    expect(r.reply.toLowerCase()).toMatch(/soy ana/);
    expect(r.reply.toLowerCase()).toMatch(/cuéntame qué necesitas/);
    // E o espanhol sai escrito em espanhol, com o ponto de abertura.
    expect(r.reply).toMatch(/¡Buen[oa]s/);
  });

  it("não abre menu numerado e não pede documento", async () => {
    const repo = getRepository();
    const conv = await repo.getOrCreateConversation("fb:menu");
    const r = await processMessage({ conversationId: conv.id, userText: "oi" });
    expect(r.reply).not.toMatch(/1️⃣|2️⃣|3️⃣/);
    expect(r.reply.toLowerCase()).not.toMatch(/\bcpf\b|orçamento|colaboradores/);
  });

  it("um 'oi' sozinho não vira encaminhamento", async () => {
    const repo = getRepository();
    const conv = await repo.getOrCreateConversation("fb:so-oi");
    const r = await processMessage({ conversationId: conv.id, userText: "oi" });
    expect(r.toolCalls.some((t) => t.name === "transferir_para_humano")).toBe(false);
    expect(r.status).not.toBe("transferred");
  });
});

// O PRIMEIRO TESTE REAL PEGOU ISTO: "o que vocês fazem?" caía numa resposta genérica, e
// depois de a pessoa responder "eu estou fora" a MESMA pergunta voltava, palavra por
// palavra. Quem está aflito lê a repetição como não estar sendo ouvido e some.
describe("a conversa anda", () => {
  it("responde 'o que vocês fazem?' em vez de devolver uma pergunta genérica", async () => {
    const repo = getRepository();
    const conv = await repo.getOrCreateConversation("fb:oquefazem");
    await processMessage({ conversationId: conv.id, userText: "olá, boa tarde" });
    const r = await processMessage({ conversationId: conv.id, userText: "o que vocês fazem?" });
    expect(r.reply.toLowerCase()).toMatch(/assessoria jur[íi]dica/);
    expect(r.reply.toLowerCase()).toMatch(/naturaliza[çc][ãa]o|ref[úu]gio|mercosul/);
    // E continua sendo honesto sobre quem analisa o caso.
    expect(r.reply.toLowerCase()).toMatch(/advogad|time/);
  });

  it("não repete a pergunta que a pessoa acabou de responder", async () => {
    const repo = getRepository();
    const conv = await repo.getOrCreateConversation("fb:naorepete");
    await processMessage({ conversationId: conv.id, userText: "olá, boa tarde" });
    const r1 = await processMessage({ conversationId: conv.id, userText: "o que vocês fazem?" });
    const r2 = await processMessage({ conversationId: conv.id, userText: "eu estou fora" });
    const r3 = await processMessage({ conversationId: conv.id, userText: "ainda não sei bem" });
    expect(r2.reply).not.toBe(r1.reply);
    expect(r3.reply).not.toBe(r2.reply);
    // "estou fora" respondeu ONDE ela está — a pergunta não volta.
    expect(r2.reply.toLowerCase()).not.toMatch(/j[áa] est[áa] no brasil ou ainda est[áa] fora/);
    expect(r3.reply.toLowerCase()).not.toMatch(/j[áa] est[áa] no brasil ou ainda est[áa] fora/);
  });

  it("o que a pessoa respondeu fica gravado no dossiê", async () => {
    const repo = getRepository();
    const conv = await repo.getOrCreateConversation("fb:dossie");
    await processMessage({ conversationId: conv.id, userText: "olá, boa tarde" });
    await processMessage({ conversationId: conv.id, userText: "eu estou fora, sou angolano" });
    const lead = await repo.getLeadByConversation(conv.id);
    expect(lead?.region).toMatch(/Exterior/);
    expect(lead?.clientType).toBe("Angola");
  });

  it("a saudação vem do relógio de Brasília, não da mensagem da pessoa", async () => {
    const repo = getRepository();
    const conv = await repo.getOrCreateConversation("fb:saudacao");
    // Escreve "boa noite" às 9h da manhã daqui — quem está em outro fuso faz isso o tempo todo.
    const r = await processMessage({ conversationId: conv.id, userText: "boa noite, preciso de ajuda" });
    const hora = Number(
      new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" })
        .format(new Date()),
    );
    const esperada =
      hora < 5 ? "Boa noite" : hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
    expect(r.reply.startsWith(esperada)).toBe(true);
    // Nunca "bom dia" na madrugada — é o corte ingênuo que este teste existe para travar.
    if (hora < 5) expect(r.reply).not.toMatch(/^Bom dia/);
  });
});

describe("caso concreto vai para o time jurídico", () => {
  it("situação irregular encaminha", async () => {
    const repo = getRepository();
    const conv = await repo.getOrCreateConversation("fb:irregular");
    await processMessage({ conversationId: conv.id, userText: "oi" });
    const r = await processMessage({
      conversationId: conv.id,
      userText: "meu visto venceu e recebi uma notificação da Polícia Federal",
    });
    expect(r.toolCalls.some((t) => t.name === "transferir_para_humano")).toBe(true);
    expect(r.status).toBe("transferred");
  });

  it("refúgio encaminha, e com prioridade", async () => {
    const repo = getRepository();
    const conv = await repo.getOrCreateConversation("fb:refugio");
    await processMessage({ conversationId: conv.id, userText: "oi" });
    const r = await processMessage({
      conversationId: conv.id,
      userText: "saí do meu país porque estavam me ameaçando, preciso de refúgio",
    });
    expect(r.toolCalls.some((t) => t.name === "transferir_para_humano")).toBe(true);
  });

  it("pedido explícito por um advogado encaminha", async () => {
    const repo = getRepository();
    const conv = await repo.getOrCreateConversation("fb:advogado");
    await processMessage({ conversationId: conv.id, userText: "oi" });
    const r = await processMessage({ conversationId: conv.id, userText: "quero falar com um advogado" });
    expect(r.toolCalls.some((t) => t.name === "transferir_para_humano")).toBe(true);
  });
});

describe("guardrails", () => {
  it("não informa honorários — manda para o time jurídico", async () => {
    const repo = getRepository();
    const conv = await repo.getOrCreateConversation("fb:honorarios");
    await processMessage({ conversationId: conv.id, userText: "oi" });
    const r = await processMessage({ conversationId: conv.id, userText: "quanto vocês cobram?" });
    expect(r.reply).not.toMatch(/R\$\s?\d/);
    expect(r.reply.toLowerCase()).toMatch(/time jurídico/);
  });

  // O erro grave deste domínio é inventar. Sem o modelo e sem o material oficial na mão,
  // este caminho não tem NADA para dizer sobre procedimento — e não diz.
  it("não afirma requisito, documento nem prazo", async () => {
    const repo = getRepository();
    const conv = await repo.getOrCreateConversation("fb:documentos");
    await processMessage({ conversationId: conv.id, userText: "oi" });
    const r = await processMessage({
      conversationId: conv.id,
      userText: "quais documentos preciso para reunião familiar?",
    });
    expect(r.reply.toLowerCase()).not.toMatch(/você precisa (?:de|dos|apresentar)|a lista é|leva \d+ dias|artigo \d+/);
  });

  it("não sobrou nada da porta de entrada comercial herdada", async () => {
    const repo = getRepository();
    const conv = await repo.getOrCreateConversation("fb:heranca");
    const r1 = await processMessage({ conversationId: conv.id, userText: "oi" });
    const r2 = await processMessage({ conversationId: conv.id, userText: "me conta mais" });
    const tudo = `${r1.reply} ${r2.reply}`.toLowerCase();
    for (const termo of ["shine", "terceirização", "posto", "escala", "proposta comercial", "consultor comercial"]) {
      expect(tudo, termo).not.toContain(termo);
    }
  });
});

describe("o agente não cota nem propõe nada", () => {
  it("as tools comerciais não existem mais", async () => {
    const { AGENT_TOOLS } = await import("@/lib/agent/tools");
    const nomes = AGENT_TOOLS.map((t) => t.name);
    expect(nomes).not.toContain("calcular_preco_servico");
    expect(nomes).not.toContain("gerar_proposta_pdf");
    expect(nomes).not.toContain("registrar_funcionario");
  });

  it("chamar uma tool removida é erro, não um caminho silencioso", async () => {
    const { executeTool } = await import("@/lib/agent/tools");
    await expect(executeTool("calcular_preco_servico", { service_name: "ASG", employees_count: 2 }))
      .rejects.toThrow(/desconhecida/i);
  });
});
