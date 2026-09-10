import { describe, it, expect, beforeEach } from "vitest";
import { getRepository } from "@/lib/data";
import { executeTool } from "@/lib/agent/tools";
import { getPromptCru, getSystemPrompt } from "@/lib/agent/system-prompt";

// O QUE A EQUIPE EDITA EM /dashboard/treinar PRECISA CHEGAR AO AGENTE.
//
// Os dois furos que este arquivo tranca eram do mesmo tipo: a tela gravava, dizia "Salvo",
// e o agente continuava com outra coisa. Nenhum dos dois aparecia como erro em lugar
// nenhum — o sintoma era só "mexi e não mudou nada".

/** Assunto que NÃO casa com nenhum gatilho embutido (transfer-gate, TRANSFER_RULES). */
const ASSUNTO_NOVO = "curso de portugues";

const regraDoPainel = (ativo: boolean) => [
  {
    id: "curso_de_portugues",
    categoria: "curso_de_portugues",
    keywords: [ASSUNTO_NOVO],
    resposta: "Quem trata disso é o time jurídico. Posso passar o seu contato?",
    ativo,
  },
];

describe("regras de encaminhamento editadas no painel valem no caminho do DeepSeek", () => {
  // O freio da tool (lib/agent/tools.ts) chamava detectTransfer SEM as regras do painel e
  // caía na lista fixa do código. Resultado: uma categoria nova cadastrada pela equipe não
  // contava, e uma regra desligada continuava contando. O motor determinístico já passava
  // as regras — o caminho do DeepSeek, que é o que roda em produção, não.
  beforeEach(async () => {
    await getRepository().setConfig("transfer_rules", null);
  });

  it("categoria nova cadastrada libera o encaminhamento com a ficha pela metade", async () => {
    const repo = getRepository();
    await repo.setConfig("transfer_rules", regraDoPainel(true));

    const c = await repo.getOrCreateConversation("sim:regra-nova", "Iara");
    await repo.addMessage(c.id, "user", `Queria informação sobre ${ASSUNTO_NOVO}`);

    const r = (await executeTool("transferir_para_humano", {
      conversation_id: c.id,
      reason: `Pergunta sobre ${ASSUNTO_NOVO}`,
      summary: "Perguntou sobre o assunto que a equipe cadastrou como transbordo.",
      setor: "comercial",
    })) as { ok: boolean };

    expect(r.ok).toBe(true);
  });

  it("a mesma regra DESLIGADA no painel para de liberar", async () => {
    const repo = getRepository();
    await repo.setConfig("transfer_rules", regraDoPainel(false));

    const c = await repo.getOrCreateConversation("sim:regra-desligada", "Jonas");
    await repo.addMessage(c.id, "user", `Queria informação sobre ${ASSUNTO_NOVO}`);

    const r = (await executeTool("transferir_para_humano", {
      conversation_id: c.id,
      reason: `Pergunta sobre ${ASSUNTO_NOVO}`,
      summary: "Mesmo assunto, com a regra desativada na tela.",
      setor: "comercial",
    })) as { ok: boolean; error?: string };

    expect(r.ok).toBe(false);
    expect(r.error).toBe("atenda_antes_de_encaminhar");
  });
});

describe("o prompt cru legado é visível em vez de silencioso", () => {
  // agent_config.system_prompt é herança da tela de configuração antiga (hoje um redirect).
  // Enquanto existir, vence a tela de treinar inteira — e a prévia da aba Testar, montada a
  // partir de knowledge_base + treinamento, mostrava um prompt que o agente não usava.
  beforeEach(async () => {
    await getRepository().setConfig("system_prompt", "");
  });

  it("sem override, quem manda é a tela de treinar", async () => {
    expect(await getPromptCru()).toBeNull();
    expect(await getSystemPrompt()).toContain("Imigrar Brasil");
  });

  it("um resto curto de teste não conta como override", async () => {
    await getRepository().setConfig("system_prompt", "teste");
    expect(await getPromptCru()).toBeNull();
  });

  it("com override, getPromptCru devolve o texto que está realmente valendo", async () => {
    const cru = `Você é outra coisa completamente diferente. ${"x".repeat(60)}`;
    await getRepository().setConfig("system_prompt", cru);

    expect(await getPromptCru()).toBe(cru);
    // E é ele que o agente lê — com o material oficial ainda grudado no fim, que é a única
    // coisa que nem o prompt cru derruba.
    expect(await getSystemPrompt()).toContain(cru);
  });
});
