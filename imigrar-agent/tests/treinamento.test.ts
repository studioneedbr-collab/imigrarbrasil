import { describe, it, expect } from "vitest";
import {
  AGENT_REASONING,
  DEFAULT_KNOWLEDGE,
  buildSystemPrompt,
  findObjection,
} from "@/lib/agent/knowledge";
import { detectTransfer } from "@/lib/agent/transfer";
import {
  BEHAVIOR_RULES,
  DEFAULT_TRAINING,
  buildBehaviorRulesBlock,
  buildIdentityBlock,
  buildTechnicalBlock,
  buildTransferRegex,
  normalizeGuardrails,
  normalizeIdentity,
  normalizeObjections,
  normalizeReasoning,
  normalizeTechnical,
  normalizeTransferRules,
  parseReasoning,
  serializeReasoning,
  type ObjectionConfig,
  type TransferRuleConfig,
} from "@/lib/agent/training";

// O ponto desta suíte é um só: o que a equipe edita em /dashboard/treinar tem que chegar
// ao prompt e ao motor determinístico. Enquanto isso não é verdade, a tela é decorativa.

describe("padrões vindos do código", () => {
  it("traz as 15 objeções, as regras de encaminhamento e os guardrails", () => {
    expect(DEFAULT_TRAINING.objections).toHaveLength(15);
    expect(DEFAULT_TRAINING.transferRules.length).toBeGreaterThan(5);
    expect(DEFAULT_TRAINING.guardrails.termos).toContain("margem");
    expect(DEFAULT_TRAINING.identity.agentName).toBe("Shayene");
  });

  it("toda regra de encaminhamento tem palavras legíveis que casam com o próprio regex", () => {
    for (const r of DEFAULT_TRAINING.transferRules) {
      expect(r.keywords.length, `regra ${r.categoria} sem palavras`).toBeGreaterThan(0);
      const re = buildTransferRegex(r.keywords)!;
      for (const k of r.keywords) expect(re.test(k)).toBe(true);
    }
  });

  it("as regras gerais de comportamento vêm todas ligadas", () => {
    for (const r of BEHAVIOR_RULES) expect(DEFAULT_TRAINING.guardrails.regras[r.id]).toBe(true);
  });
});

describe("o prompt reflete o que foi editado", () => {
  const identity = {
    agentName: "Marina",
    companyName: "Outra Empresa",
    tone: "formal" as const,
    messageLength: "detalhadas" as const,
  };

  it("usa o nome, a empresa e o tom escolhidos", () => {
    const prompt = buildSystemPrompt(DEFAULT_KNOWLEDGE, {
      identityBlock: buildIdentityBlock(identity),
    });
    expect(prompt).toContain("Marina");
    expect(prompt).toContain("Outra Empresa");
    expect(prompt).toContain("Tom formal");
  });

  it("leva a resposta de objeção editada, e não a original", () => {
    const editada: ObjectionConfig = {
      id: "obj_1",
      objecao: "O preço está muito alto.",
      querDizer: "Não percebeu o valor.",
      resposta: "RESPOSTA NOVA DO EDUARDO",
      keywords: ["caro"],
      ativo: true,
    };
    const prompt = buildSystemPrompt(DEFAULT_KNOWLEDGE, { objections: [editada] });
    expect(prompt).toContain("RESPOSTA NOVA DO EDUARDO");
    expect(prompt).not.toContain("Faz sentido pesar o valor");
  });

  it("omite a objeção desativada", () => {
    const ativas = DEFAULT_TRAINING.objections
      .filter((o) => o.objecao !== "Vou pensar.")
      .filter((o) => o.ativo);
    const prompt = buildSystemPrompt(DEFAULT_KNOWLEDGE, { objections: ativas });
    expect(prompt).not.toContain('"Vou pensar."');
  });

  it("lista só as categorias de encaminhamento que sobraram", () => {
    const prompt = buildSystemPrompt(DEFAULT_KNOWLEDGE, {
      transferRules: [{ categoria: "financeiro", resposta: "Vou te passar para o financeiro." }],
    });
    // Mirar na linha do mapa de setores, e não no prompt inteiro: "trabalhista" também
    // aparece na base de conhecimento ("conformidade trabalhista"), que nada tem a ver.
    const mapa = prompt
      .split("\n")
      .find((l) => l.includes("estiverem cumpridas:"))!;
    expect(mapa).toContain("financeiro");
    expect(mapa).not.toContain("trabalhista");
    expect(prompt).toContain("Vou te passar para o financeiro.");
  });

  it("usa os termos confidenciais editados", () => {
    const prompt = buildSystemPrompt(DEFAULT_KNOWLEDGE, { confidential: ["senha do wifi"] });
    expect(prompt).toContain("senha do wifi");
    expect(prompt).not.toContain("NUNCA revele: custo interno");
  });

  it("regra de comportamento desligada some do prompt", () => {
    const regras = { ...DEFAULT_TRAINING.guardrails.regras, gerar_pdf: false };
    const bloco = buildBehaviorRulesBlock(regras);
    expect(bloco).not.toContain("proposta em PDF você mesma");
    expect(bloco).toContain("Nunca ofereça falar com uma pessoa");
  });

  it("o conhecimento técnico entra com o glossário e as escalas", () => {
    const bloco = buildTechnicalBlock(DEFAULT_TRAINING.technical);
    expect(bloco).toContain("Posto 24h");
    expect(bloco).toContain("4 funcionários");
    expect(bloco).toContain("12x36");
  });

  it("sem overrides, o prompt continua idêntico ao de antes", () => {
    expect(buildSystemPrompt(DEFAULT_KNOWLEDGE, {})).toBe(buildSystemPrompt(DEFAULT_KNOWLEDGE));
  });
});

describe("o motor determinístico honra as edições", () => {
  it("encaminha pela palavra que a equipe cadastrou", () => {
    const rules: TransferRuleConfig[] = [
      { id: "r1", categoria: "suprimentos", keywords: ["cotação de insumo"], resposta: "Ok", ativo: true },
    ];
    expect(detectTransfer("quero fazer uma cotação de insumo", rules)?.categoria).toBe("suprimentos");
    // O que não está na lista editada não encaminha mais, mesmo estando no código.
    expect(detectTransfer("dúvida sobre férias", rules)).toBeUndefined();
  });

  it("regra desativada não encaminha", () => {
    const rules: TransferRuleConfig[] = [
      { id: "r1", categoria: "financeiro", keywords: ["reembolso"], resposta: "Ok", ativo: false },
    ];
    expect(detectTransfer("quero um reembolso", rules)).toBeUndefined();
  });

  it("sem lista editada, continua valendo o regex do código", () => {
    expect(detectTransfer("tenho dúvida sobre férias")?.categoria).toBe("trabalhista");
  });

  it("findObjection usa a lista editada quando ela é passada", () => {
    const pool = [
      { objecao: "X", querDizer: "Y", resposta: "resposta nova", keywords: ["orçamento gordo"] },
    ];
    expect(findObjection("esse orçamento gordo demais", pool)?.resposta).toBe("resposta nova");
    expect(findObjection("achei caro", pool)).toBeUndefined();
  });
});

describe("normalização do que vem do banco", () => {
  it("lixo cai no padrão do código", () => {
    expect(normalizeObjections(null)).toEqual(DEFAULT_TRAINING.objections);
    expect(normalizeTransferRules("nada")).toEqual(DEFAULT_TRAINING.transferRules);
    expect(normalizeTechnical(undefined)).toEqual(DEFAULT_TRAINING.technical);
    expect(normalizeIdentity({ tone: "inexistente" }).tone).toBe("profissional_calorosa");
  });

  it("lista vazia é respeitada como vazia — apagar tudo é uma escolha", () => {
    expect(normalizeObjections([])).toEqual([]);
    expect(normalizeTransferRules([])).toEqual([]);
    expect(normalizeGuardrails({ termos: [], regras: {} }).termos).toEqual([]);
  });

  it("descarta itens sem o mínimo para funcionar", () => {
    const objs = normalizeObjections([
      { id: "a", objecao: "", resposta: "algo", keywords: [] },
      { id: "b", objecao: "Tá caro", resposta: "", keywords: [] },
      { id: "c", objecao: "Tá caro", querDizer: "", resposta: "vale a pena", keywords: ["caro"] },
    ]);
    expect(objs).toHaveLength(1);
    expect(objs[0].id).toBe("c");

    // Regra sem nenhuma palavra-gatilho nunca dispararia: não faz sentido guardá-la.
    expect(normalizeTransferRules([{ id: "x", categoria: "abc", keywords: [], resposta: "y" }])).toEqual([]);
  });

  it("item sem 'ativo' explícito é tratado como ativo", () => {
    expect(normalizeObjections([{ id: "a", objecao: "X", resposta: "Y", keywords: [] }])[0].ativo).toBe(true);
    expect(normalizeGuardrails({ regras: {} }).regras.gerar_pdf).toBe(true);
    expect(normalizeGuardrails({ regras: { gerar_pdf: false } }).regras.gerar_pdf).toBe(false);
  });
});

describe("raciocínio editável", () => {
  it("quebra o AGENT_REASONING nos blocos dos cabeçalhos", () => {
    const blocos = DEFAULT_TRAINING.reasoning;
    expect(blocos.length).toBeGreaterThanOrEqual(6);
    const titulos = blocos.map((b) => b.title);
    expect(titulos[0]).toContain("COMO VOCÊ PENSA");
    expect(titulos).toContain("COMO VOCÊ VENDE");
    expect(titulos).toContain("GUARDRAILS — NUNCA FAZER");
    // Nenhum bloco pode sair vazio: seria conteúdo do prompt perdido no caminho.
    for (const b of blocos) expect(b.body.length, `bloco ${b.title} vazio`).toBeGreaterThan(0);
  });

  it("remontar o texto não perde conteúdo — o round-trip é estável", () => {
    const uma = serializeReasoning(parseReasoning(AGENT_REASONING));
    const duas = serializeReasoning(parseReasoning(uma));
    expect(duas).toBe(uma);
    // E o conteúdo real continua lá, não só a moldura.
    expect(uma).toContain("FORNECEDOR / PARCEIRO COMERCIAL");
    expect(uma).toContain("SITUAÇÃO:");
  });

  it("o bloco editado substitui o raciocínio no prompt", () => {
    const prompt = buildSystemPrompt(DEFAULT_KNOWLEDGE, {
      reasoningBlock: serializeReasoning([
        { id: "a", title: "REGRA NOVA", body: "Pense assim e mais nada." },
      ]),
    });
    expect(prompt.startsWith("════════ REGRA NOVA ════════")).toBe(true);
    expect(prompt).toContain("Pense assim e mais nada.");
    expect(prompt).not.toContain("COMO VOCÊ VENDE");
  });

  it("raciocínio vazio cai no bloco do código em vez de deixar o prompt sem cabeça", () => {
    const prompt = buildSystemPrompt(DEFAULT_KNOWLEDGE, { reasoningBlock: "   " });
    expect(prompt).toContain("COMO VOCÊ PENSA");
  });

  it("normalizeReasoning descarta bloco sem título e cai no padrão se vier lixo", () => {
    expect(normalizeReasoning(null)).toEqual(DEFAULT_TRAINING.reasoning);
    expect(normalizeReasoning([{ id: "a", title: "  ", body: "x" }])).toEqual([]);
  });
});

describe("buildTransferRegex", () => {
  it("casa palavra com acento e com espaço", () => {
    const re = buildTransferRegex(["insatisfação severa", "nota fiscal"])!;
    expect(re.test("houve uma insatisfação severa aqui")).toBe(true);
    expect(re.test("preciso da NOTA FISCAL")).toBe(true);
    expect(re.test("quero um orçamento")).toBe(false);
  });

  it("escapa caracteres de regex em vez de explodir", () => {
    const re = buildTransferRegex(["r$ 1.000 (extra)"])!;
    expect(re.test("cobrou R$ 1.000 (extra) a mais")).toBe(true);
    expect(re.test("cobrou r 1x000 extra")).toBe(false);
  });

  it("lista vazia não vira regex que casa com tudo", () => {
    expect(buildTransferRegex([])).toBeNull();
    expect(buildTransferRegex(["  "])).toBeNull();
  });
});
