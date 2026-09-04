import { describe, it, expect } from "vitest";
import { computeLeadScore } from "@/lib/agent/lead-score";

const t = (min: number) => new Date(2026, 0, 1, 10, min).toISOString();
type M = { role: "user" | "assistant"; content: string; createdAt: string };
const u = (content: string, min: number): M => ({ role: "user", content, createdAt: t(min) });
const a = (content: string, min: number): M => ({ role: "assistant", content, createdAt: t(min) });

const ABERTURA = a("Olá! Aqui é a Ana, da Imigrar Brasil. Como posso te ajudar?", 0);

describe("computeLeadScore — a nota", () => {
  it("caso descrito e intenção de contratar é qualificado", () => {
    const r = computeLeadScore({
      messages: [
        ABERTURA,
        u("Sou venezuelana e preciso regularizar minha residência, entrei por Pacaraima", 1),
        a("Entendi. Você tem quais documentos hoje?", 2),
        u("Tenho passaporte e o protocolo da PF. Quanto custa para vocês cuidarem?", 3),
      ],
      lead: {
        objetivo: "residência por acordo Mercosul",
        situacaoDocumental: "protocolo vencido",
        documentosPossui: "passaporte, protocolo PF",
        nacionalidade: "venezuelana",
        localizacao: "brasil",
        intencao: "contratar",
        atendimentoStatus: "em_atendimento",
      },
    });
    expect(r.verdict).toBe("qualificado");
    expect(r.score).toBeGreaterThan(60);
    expect(r.signals.some((s) => s.text.includes("escritório cuide"))).toBe(true);
  });

  it("um 'Olá' solto não vale quase nada (regressão: dava 43/100)", () => {
    const r = computeLeadScore({
      messages: [u("Olá", 0), ABERTURA],
      lead: { stage: "novo" },
    });
    expect(r.score).toBeLessThan(10);
    expect(r.verdict).toBe("frio");
    expect(r.breakdown.engajamento).toBeLessThanOrEqual(2);
    expect(r.missing).toContain("o que a pessoa quer");
    expect(r.signals.some((s) => s.text.includes("Só mandou saudação"))).toBe(true);
  });

  it("prazo correndo é prioritário mesmo com pouca conversa", () => {
    const r = computeLeadScore({
      messages: [ABERTURA, u("Recebi uma multa migratória, tenho 30 dias para responder", 1)],
      lead: { temPrazoCorrendo: true, prazoTipo: "multa", nacionalidade: "haitiana" },
    });
    expect(r.verdict).toBe("prioritario");
    expect(r.label).toContain("prazo correndo");
    expect(r.breakdown.urgencia).toBeGreaterThanOrEqual(18);
    expect(r.missing).toContain("confirmar a data do prazo");
  });

  it("prazo mencionado no texto pontua, mas pede confirmação humana", () => {
    const r = computeLeadScore({
      messages: [ABERTURA, u("Meu pedido de refúgio foi indeferido, o que eu faço?", 1)],
      lead: { nacionalidade: "cubana", localizacao: "brasil" },
    });
    expect(r.breakdown.urgencia).toBeGreaterThan(0);
    expect(r.missing).toContain("confirmar o prazo mencionado");
    // A heurística NUNCA data um prazo sozinha — ela só sinaliza.
    expect(r.signals.some((s) => s.text.includes("falta confirmar"))).toBe(true);
  });

  it("quem prefere tocar sozinho pontua menos que quem quer contratar", () => {
    const base = {
      messages: [ABERTURA, u("Preciso renovar minha CRNM, quais documentos?", 1)],
      lead: { objetivo: "renovação de CRNM", nacionalidade: "boliviana", localizacao: "brasil" as const },
    };
    const contrata = computeLeadScore({ ...base, lead: { ...base.lead, intencao: "contratar" as const } });
    const sozinho = computeLeadScore({ ...base, lead: { ...base.lead, intencao: "sozinho" as const } });
    expect(contrata.score).toBeGreaterThan(sozinho.score);
    expect(sozinho.signals.some((s) => s.kind === "negativo")).toBe(true);
  });

  it("score fica sempre entre 0 e 100", () => {
    const r = computeLeadScore({ messages: [], lead: null });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });
});

describe("computeLeadScore — o veredito vem antes da nota", () => {
  it("perfil DPU sai da fila comercial sem virar 'lead frio'", () => {
    const r = computeLeadScore({
      messages: [ABERTURA, u("Preciso de ajuda com meu refúgio", 1)],
      lead: { classificacao: "DPU", objetivo: "refúgio", nacionalidade: "congolesa" },
    });
    expect(r.verdict).toBe("dpu");
    expect(r.score).toBe(0);
    expect(r.label).toContain("Defensoria");
  });

  it("quem declarou não ter condições de pagar é Defensoria, não desqualificado", () => {
    const r = computeLeadScore({
      messages: [ABERTURA, u("Não tenho como pagar advogado", 1)],
      lead: { intencao: "sem_condicoes", objetivo: "reunião familiar" },
    });
    expect(r.verdict).toBe("dpu");
  });

  it("classificação FORA_ESCOPO e CURIOSO zeram com o motivo escrito", () => {
    const fora = computeLeadScore({
      messages: [ABERTURA, u("Quero imigrar para Portugal", 1)],
      lead: { classificacao: "FORA_ESCOPO" },
    });
    expect(fora.verdict).toBe("fora_do_escopo");
    const curioso = computeLeadScore({
      messages: [ABERTURA, u("Só queria saber como funciona", 1)],
      lead: { classificacao: "CURIOSO" },
    });
    expect(curioso.verdict).toBe("desqualificado");
    for (const r of [fora, curioso]) {
      expect(r.score).toBe(0);
      expect(r.signals[0].kind).toBe("bloqueio");
    }
  });

  it("candidato a vaga, fornecedor e imprensa saem do funil", () => {
    const casos: Array<[string, string]> = [
      ["Queria mandar meu currículo para vocês", "candidato a vaga"],
      ["Somos uma distribuidora, oferecemos para o escritório material de papelaria", "fornecedor"],
      ["Sou jornalista e queria uma entrevista para uma reportagem", "imprensa/institucional"],
    ];
    for (const [msg, rotulo] of casos) {
      const r = computeLeadScore({ messages: [ABERTURA, u(msg, 1)], lead: { stage: "novo" } });
      expect(r.verdict).toBe("fora_do_funil");
      expect(r.label).toContain(rotulo);
      expect(r.score).toBe(0);
    }
  });

  it("'quero trabalhar no Brasil' é atendimento de imigração, não candidatura", () => {
    const r = computeLeadScore({
      messages: [ABERTURA, u("Quero trabalhar no Brasil, preciso de documento para isso", 1)],
      lead: { nacionalidade: "venezuelana", localizacao: "brasil" },
    });
    expect(r.verdict).not.toBe("fora_do_funil");
  });

  it("opt-out gravado na conversa zera mesmo com caso bom", () => {
    const r = computeLeadScore({
      messages: [ABERTURA, u("Recebi uma multa migratória, quanto custa para vocês cuidarem?", 1)],
      lead: { temPrazoCorrendo: true, objetivo: "defesa de multa", intencao: "contratar" },
      conversation: { optOutAt: t(9), noFollowupAt: null },
    });
    expect(r.verdict).toBe("desqualificado");
    expect(r.score).toBe(0);
  });

  it("caso perdido no quadro não volta a pontuar sozinho", () => {
    const r = computeLeadScore({
      messages: [ABERTURA, u("Recebi uma multa migratória", 1)],
      lead: { atendimentoStatus: "perdido", temPrazoCorrendo: true },
    });
    expect(r.verdict).toBe("desqualificado");
  });
});
