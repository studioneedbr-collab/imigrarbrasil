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
