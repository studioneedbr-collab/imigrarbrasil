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
  it("traz as preocupações frequentes, as regras de encaminhamento e os guardrails", () => {
    expect(DEFAULT_TRAINING.objections.length).toBeGreaterThan(5);
    expect(DEFAULT_TRAINING.transferRules.length).toBeGreaterThan(5);
    expect(DEFAULT_TRAINING.guardrails.termos).toContain("honorários");
    expect(DEFAULT_TRAINING.identity.agentName).toBe("Ana");
    expect(DEFAULT_TRAINING.identity.companyName).toBe("Imigrar Brasil");
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
      objecao: "Quanto vocês cobram?",
      querDizer: "Quer saber se cabe no bolso.",
      resposta: "RESPOSTA NOVA DA EQUIPE",
      keywords: ["quanto custa"],
      ativo: true,
    };
    const prompt = buildSystemPrompt(DEFAULT_KNOWLEDGE, { objections: [editada] });
    expect(prompt).toContain("RESPOSTA NOVA DA EQUIPE");
    expect(prompt).not.toContain("Os valores quem passa é o time jurídico");
  });

  it("omite a objeção desativada", () => {
    const alvo = "Quanto tempo demora?";
    const ativas = DEFAULT_TRAINING.objections
      .filter((o) => o.objecao !== alvo)
      .filter((o) => o.ativo);
    const prompt = buildSystemPrompt(DEFAULT_KNOWLEDGE, { objections: ativas });
    expect(prompt).not.toContain(`"${alvo}"`);
  });

  it("lista só as categorias de encaminhamento que sobraram", () => {
    const prompt = buildSystemPrompt(DEFAULT_KNOWLEDGE, {
      transferRules: [{ categoria: "refugio_e_protecao", resposta: "Vou chamar o time jurídico." }],
    });
    const mapa = prompt.split("\n").find((l) => l.includes("SAEM das suas mãos"))!;
    expect(mapa).toContain("refugio_e_protecao");
    expect(mapa).not.toContain("honorarios_e_contratacao");
    expect(prompt).toContain("Vou chamar o time jurídico.");
  });

  it("usa os termos confidenciais editados", () => {
    const prompt = buildSystemPrompt(DEFAULT_KNOWLEDGE, { confidential: ["senha do wifi"] });
    expect(prompt).toContain("senha do wifi");
    expect(prompt).not.toContain("NUNCA revele nem estime: honorários");
  });

  it("regra de comportamento desligada some do prompt", () => {
    const regras = { ...DEFAULT_TRAINING.guardrails.regras, nao_falar_honorarios: false };
    const bloco = buildBehaviorRulesBlock(regras);
    expect(bloco).not.toContain("Nunca informe, estime ou dê faixa de honorários");
    expect(bloco).toContain("Nunca transfira sem avisar");
  });

  it("o conhecimento técnico entra com o glossário e os caminhos migratórios", () => {
    const bloco = buildTechnicalBlock(DEFAULT_TRAINING.technical);
    expect(bloco).toContain("CRNM");
    expect(bloco).toContain("CONARE");
    expect(bloco).toContain("Reunião familiar");
    // O glossário orienta a conversa; ele NÃO é fonte de procedimento.
    expect(bloco).toMatch(/NÃO é procedimento/i);
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
    expect(detectTransfer("meu visto venceu, estou irregular")?.categoria).toBe("situacao_irregular");
  });

  it("findObjection usa a lista editada quando ela é passada", () => {
    const pool = [
      { objecao: "X", querDizer: "Y", resposta: "resposta nova", keywords: ["carta convite"] },
    ];
    expect(findObjection("preciso de carta convite?", pool)?.resposta).toBe("resposta nova");
    expect(findObjection("quanto custa", pool)).toBeUndefined();
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
    expect(normalizeGuardrails({ regras: {} }).regras.nao_falar_honorarios).toBe(true);
    expect(normalizeGuardrails({ regras: { nao_falar_honorarios: false } }).regras.nao_falar_honorarios).toBe(false);
  });
});

describe("raciocínio editável", () => {
  it("quebra o AGENT_REASONING nos blocos dos cabeçalhos", () => {
    const blocos = DEFAULT_TRAINING.reasoning;
    expect(blocos.length).toBeGreaterThanOrEqual(6);
    const titulos = blocos.map((b) => b.title);
    expect(titulos[0]).toContain("COMO VOCÊ PENSA");
    expect(titulos).toContain("REGRA DE IDIOMA — PRIORIDADE MÁXIMA");
    expect(titulos).toContain("QUANDO ENCAMINHAR PARA O TIME JURÍDICO");
    expect(titulos).toContain("GUARDRAILS — NUNCA FAZER");
    // Nenhum bloco pode sair vazio: seria conteúdo do prompt perdido no caminho.
    for (const b of blocos) expect(b.body.length, `bloco ${b.title} vazio`).toBeGreaterThan(0);
  });

  it("remontar o texto não perde conteúdo — o round-trip é estável", () => {
    const uma = serializeReasoning(parseReasoning(AGENT_REASONING));
    const duas = serializeReasoning(parseReasoning(uma));
    expect(duas).toBe(uma);
    // E o conteúdo real continua lá, não só a moldura.
    expect(uma).toContain("REGRA DE IDIOMA");
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
    expect(prompt).not.toContain("EXEMPLOS DE RACIOCÍNIO");
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
