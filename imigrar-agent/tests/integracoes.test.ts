import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// A CHAVE É PLANTADA NO AMBIENTE ANTES DO MÓDULO SER CARREGADO.
//
// lib/env.ts lê process.env no topo, então definir depois não teria efeito nenhum — e o
// teste passaria por não haver chave, que é exatamente a situação em que ele não prova
// nada. O valor é reconhecível de longe: se qualquer pedaço dele aparecer numa resposta,
// o `expect` aponta o lugar.
const CHAVE_DEEPSEEK = "sk-DEEPSEEK-SEGREDO-NAO-PODE-VAZAR-1234";
const CHAVE_OPENAI = "sk-OPENAI-SEGREDO-NAO-PODE-VAZAR-5678";

describe("a tela de integrações", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.DEEPSEEK_API_KEY = CHAVE_DEEPSEEK;
    process.env.OPENAI_API_KEY = CHAVE_OPENAI;
  });

  afterEach(() => {
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.OPENAI_API_KEY;
    vi.resetModules();
  });

  it("mostra DeepSeek e OpenAI, com os dois papéis da OpenAI separados", () => {
    // A tela pedia WhatsApp e Z-API e não mostrava provedor de LLM nenhum — enquanto os
    // dois rodavam em produção. Transcrição e embedding aparecem separados porque são
    // duas perguntas diferentes de quem opera, ainda que a conta seja a mesma.
    return import("@/lib/integracoes/provedores").then(async ({ lerProvedores }) => {
      const provedores = await lerProvedores();
      expect(provedores.map((p) => p.chave)).toEqual([
        "deepseek",
        "openai-chat",
        "openai-transcricao",
        "openai-embedding",
      ]);
      expect(provedores.every((p) => p.credencial === "configurada")).toBe(true);
    });
  });

  it("NUNCA expõe a chave — nem mascarada, nem em pedaço", async () => {
    const { lerProvedores } = await import("@/lib/integracoes/provedores");
    const serializado = JSON.stringify(await lerProvedores());

    expect(serializado).not.toContain(CHAVE_DEEPSEEK);
    expect(serializado).not.toContain(CHAVE_OPENAI);
    // Mascarar é o hábito que parece cuidadoso e não é: os últimos caracteres já bastam
    // para confirmar QUAL chave está em uso, e o prefixo diz de que conta ela é.
    expect(serializado).not.toContain(CHAVE_DEEPSEEK.slice(-4));
    expect(serializado).not.toContain(CHAVE_OPENAI.slice(-4));
    expect(serializado).not.toMatch(/sk-/);
    expect(serializado).not.toMatch(/•{2,}|\*{2,}/);
    // O que fica no lugar é o suficiente para decidir.
    expect(serializado).toContain("configurada");
  });

  it("uma credencial ausente aparece como 'não configurada', e não some da tela", async () => {
    delete process.env.OPENAI_API_KEY;
    vi.resetModules();
    const { lerProvedores } = await import("@/lib/integracoes/provedores");
    const provedores = await lerProvedores();
    const transcricao = provedores.find((p) => p.chave === "openai-transcricao");
    expect(transcricao?.credencial).toBe("nao_configurada");
    // Provedor não configurado não é provedor ocioso: ocioso é o que TEM credencial e
    // não está sendo chamado. Confundir os dois faria a tela acusar o que está normal.
    expect(transcricao?.ocioso).toBe(false);
  });

  it("provedor configurado e sem chamada nenhuma em 24h aparece como ocioso", async () => {
    const { lerProvedores } = await import("@/lib/integracoes/provedores");
    const provedores = await lerProvedores();
    // Nenhuma chamada foi registrada nesta suíte: é exatamente o estado que denuncia
    // roteamento que deixou de usar o provedor.
    expect(provedores.find((p) => p.chave === "deepseek")?.ocioso).toBe(true);
  });

  it("diz para que cada provedor deveria estar sendo usado", async () => {
    const { lerProvedores } = await import("@/lib/integracoes/provedores");
    const provedores = await lerProvedores();
    expect(provedores.find((p) => p.chave === "deepseek")?.usosEsperados).toContain("redacao");
    expect(provedores.find((p) => p.chave === "openai-transcricao")?.usosEsperados).toEqual(["transcricao"]);
    expect(provedores.find((p) => p.chave === "openai-embedding")?.usosEsperados).toEqual(["embedding"]);
  });
});

// A ESCOLHA DO PROVEDOR É DADO, não código: o painel grava, e quem chama pergunta.
describe("a escolha de quem responde (DeepSeek ou ChatGPT)", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.DEEPSEEK_API_KEY = CHAVE_DEEPSEEK;
    process.env.OPENAI_API_KEY = CHAVE_OPENAI;
  });

  afterEach(() => {
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.OPENAI_API_KEY;
    vi.resetModules();
  });

  it("sem nada gravado, o DeepSeek responde e o ChatGPT fica de reserva", async () => {
    const { todosOsLlms } = await import("@/lib/agent/llm");
    const { ativo, llms } = await todosOsLlms();
    expect(ativo).toBe("deepseek");
    expect(llms.map((l) => l.provedor)).toEqual(["deepseek", "openai"]);

    const { lerProvedores } = await import("@/lib/integracoes/provedores");
    const provedores = await lerProvedores();
    expect(provedores.find((p) => p.chave === "deepseek")?.papel).toBe("ativo");
    const chat = provedores.find((p) => p.chave === "openai-chat");
    expect(chat?.papel).toBe("reserva");
    // Reserva parada não é provedor ocioso: ficar parada é o trabalho dela.
    expect(chat?.ocioso).toBe(false);
  });

  it("gravar a escolha no painel inverte a ordem, e a chave do painel vence a do ambiente", async () => {
    const { gravarLlm, todosOsLlms } = await import("@/lib/agent/llm");
    await gravarLlm({ ativo: "openai", openaiApiKey: "sk-DO-PAINEL-9999", openaiModel: "gpt-4.1" });
    const { ativo, llms } = await todosOsLlms();
    expect(ativo).toBe("openai");
    expect(llms[0]).toMatchObject({ provedor: "openai", modelo: "gpt-4.1", key: "sk-DO-PAINEL-9999", origemDaChave: "painel" });
    expect(llms[1].provedor).toBe("deepseek");

    const { lerProvedores } = await import("@/lib/integracoes/provedores");
    const provedores = await lerProvedores();
    expect(provedores.find((p) => p.chave === "openai-chat")?.usosEsperados).toEqual(["redacao"]);
    expect(provedores.find((p) => p.chave === "deepseek")?.papel).toBe("reserva");
    // A chave colada no painel também não sai — nem em pedaço.
    expect(JSON.stringify(provedores)).not.toContain("9999");
  });

  it("dentro de teste nenhum provedor é chamado de verdade, com ou sem chave", async () => {
    const { llmsDisponiveis } = await import("@/lib/agent/llm");
    expect(await llmsDisponiveis()).toEqual([]);
  });

  it("monta o corpo no dialeto de cada provedor", async () => {
    const { corpoDoChat } = await import("@/lib/agent/llm");
    const p = { messages: [], maxTokens: 100, temperature: 0.4 };
    expect(corpoDoChat({ provedor: "deepseek", modelo: "deepseek-chat" }, p)).toMatchObject({ max_tokens: 100, temperature: 0.4 });
    const gpt = corpoDoChat({ provedor: "openai", modelo: "gpt-4.1-mini" }, p);
    expect(gpt).toMatchObject({ max_completion_tokens: 100, temperature: 0.4 });
    expect(gpt).not.toHaveProperty("max_tokens");
    // Modelo de raciocínio recusa temperature e precisa de folga para pensar.
    const raciocinio = corpoDoChat({ provedor: "openai", modelo: "gpt-5-mini" }, p);
    expect(raciocinio).not.toHaveProperty("temperature");
    expect(raciocinio.max_completion_tokens).toBeGreaterThan(100);
  });
});
