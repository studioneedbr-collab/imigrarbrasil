import { describe, it, expect } from "vitest";
import { capturarDadosDoLead, qualificacaoFaltando } from "@/lib/agent/lead-capture";
import { avaliarEncaminhamentoComercial } from "@/lib/agent/transfer-gate";
import type { Lead } from "@/lib/domain/types";

const lead = (patch: Partial<Lead> = {}): Lead =>
  ({
    id: "l1", conversationId: "c1", whatsappNumber: "5521999999999",
    status: "novo", stage: "novo", score: 0,
    createdAt: "2026-08-17T12:00:00Z", updatedAt: "2026-08-17T12:00:00Z",
    ...patch,
  }) as Lead;

// O dossiê tem que se preencher sozinho: quando o modelo não chama registrar_dados_lead
// — e ele esquece direto —, o painel ficava em "Coletando…" enquanto a pessoa já tinha
// contado tudo. Aqui isso pesa mais do que num atendimento comercial: quem está aflito e
// tem que repetir a própria história pela terceira vez desiste.
describe("dossiê que se preenche sozinho", () => {
  it("lê nacionalidade, onde a pessoa está e o que ela procura", () => {
    const p = capturarDadosDoLead(
      "Sou venezuelana, moro em Boa Vista e preciso regularizar minha residência.",
      null,
    );
    expect(p?.clientType).toBe("Venezuela");
    expect(p?.region).toBe("Brasil — Boa Vista");
    expect(p?.servicesInterested).toEqual(["Regularização migratória"]);
  });

  it("guarda como a pessoa entrou, na frase dela", () => {
    const p = capturarDadosDoLead("Entrei pela fronteira em 2024 e tenho protocolo.", null);
    expect(p?.contractDuration).toMatch(/Entrei pela fronteira/);
  });

  it("pega e-mail e prazo", () => {
    const p = capturarDadosDoLead(
      "meu e-mail é yolanda@exemplo.com, e é urgente, meu prazo está correndo",
      null,
    );
    expect(p?.email).toBe("yolanda@exemplo.com");
    expect(p?.urgency).toBe("immediate");
  });

  it("nunca sobrescreve o que já está gravado", () => {
    const p = capturarDadosDoLead(
      "sou haitiano e estou no Brasil",
      lead({ clientType: "Angola", region: "Exterior — Angola" }),
    );
    expect(p?.clientType).toBeUndefined();
    expect(p?.region).toBeUndefined();
  });

  it("acumula caminho novo em vez de trocar", () => {
    const p = capturarDadosDoLead("depois eu queria pedir naturalização também", lead({
      servicesInterested: ["Regularização migratória"],
    }));
    expect(p?.servicesInterested).toEqual(["Regularização migratória", "Naturalização"]);
  });

  it("sem novidade nenhuma, não escreve no banco", () => {
    expect(capturarDadosDoLead("boa tarde", null)).toBeNull();
    expect(capturarDadosDoLead("obrigado!", lead({ region: "Brasil" }))).toBeNull();
  });
});

// A FICHA MÍNIMA (v3). Nada aqui segura um caso URGENTE — prazo correndo, irregularidade,
// refúgio e risco vão ao advogado com a ficha pela metade, e quem garante isso é o
// transfer-gate. O que esta lista segura é a transferência de ficha vazia: a conversa que
// motivou a v3 chegou ao time sem o nome da pessoa, sem saber quando começavam as aulas e
// sem ninguém ter perguntado se ela queria contratar.
describe("o que o time jurídico ainda não sabe", () => {
  const completo = lead({
    contactName: "Rosa",
    clientType: "Venezuela",
    region: "Brasil — Boa Vista",
    servicesInterested: ["Regularização migratória"],
    urgency: "immediate",
    intencao: "contratar",
  });

  it("lista o que falta, na ordem de descobrir", () => {
    const r = qualificacaoFaltando(lead({ clientType: "Haiti" }));
    expect(r.completo).toBe(false);
    expect(r.faltam).toEqual([
      "o nome dela",
      "onde a pessoa está agora (no Brasil ou no exterior)",
      "o que ela quer conseguir",
      "o que pressiona o caso e quando (nem que seja 'sem urgência')",
      "se ela prefere tocar o processo sozinha ou que o escritório cuide (pergunte UMA vez)",
    ]);
  });

  it("nome, nacionalidade, onde está, objetivo, relógio e intenção completam a ficha", () => {
    expect(qualificacaoFaltando(completo).completo).toBe(true);
  });

  it("o nome passou a ser obrigatório — era o que faltava na conversa que motivou a v3", () => {
    const semNome = qualificacaoFaltando({ ...completo, contactName: undefined });
    expect(semNome.completo).toBe(false);
    expect(semNome.faltam).toContain("o nome dela");
  });

  it("o relógio do caso conta mesmo sem prazo processual", () => {
    const semUrgencia = { ...completo, urgency: undefined, temPrazoCorrendo: false };
    expect(qualificacaoFaltando(semUrgencia).completo).toBe(false);
    expect(
      qualificacaoFaltando({ ...semUrgencia, relogioDoCaso: "as aulas começam em março" }).completo,
    ).toBe(true);
  });

  it("sem o teste de intenção a ficha não fecha", () => {
    const r = qualificacaoFaltando({ ...completo, intencao: undefined });
    expect(r.completo).toBe(false);
    expect(r.faltam.join(" ")).toMatch(/escrit[óo]rio cuide/);
  });

  it("como ela entrou e os documentos são complementares — não seguram nada", () => {
    const r = qualificacaoFaltando(completo);
    expect(r.faltam).toEqual([]);
    expect(r.complementares).toEqual([
      "como ela entrou e o que tem hoje",
      "que documentos do país de origem ela tem em mãos",
    ]);
  });

  // A lista NUNCA pede número de documento: quem faz isso é o time jurídico, depois.
  it("não pede documento em lugar nenhum", () => {
    const r = qualificacaoFaltando(lead());
    expect([...r.faltam, ...r.complementares].join(" ")).not.toMatch(/cpf|cnpj|passaporte|n[úu]mero/i);
  });
});

// O portão da tool de encaminhamento. Na base comercial ele segurava o handoff até a
// proposta sair; aqui ele libera por padrão e segura um caso só — a conversa que ainda
// não tem nada. É o freio contra despachar quem acabou de mandar "oi".
describe("o portão só segura a conversa que ainda não tem nada", () => {
  const base = {
    dossieCompleto: false,
    textoRecente: "oi, bom dia",
    assuntoExigePessoa: false,
  };

  it("segura o 'oi' sem sinal nenhum", () => {
    expect(avaliarEncaminhamentoComercial(base).liberado).toBe(false);
  });

  it("libera na hora quando há caso concreto", () => {
    expect(
      avaliarEncaminhamentoComercial({ ...base, textoRecente: "meu visto venceu" }).liberado,
    ).toBe(true);
  });

  it("libera quando a pessoa pede um advogado", () => {
    expect(
      avaliarEncaminhamentoComercial({ ...base, textoRecente: "quero falar com um advogado" })
        .liberado,
    ).toBe(true);
  });

  it("libera risco à pessoa", () => {
    expect(
      avaliarEncaminhamentoComercial({ ...base, textoRecente: "estou correndo risco de vida" })
        .liberado,
    ).toBe(true);
  });

  it("libera assunto que a regra de transbordo reconhece", () => {
    expect(avaliarEncaminhamentoComercial({ ...base, assuntoExigePessoa: true }).liberado).toBe(true);
  });

  it("libera quando a qualificação já está completa", () => {
    expect(avaliarEncaminhamentoComercial({ ...base, dossieCompleto: true }).liberado).toBe(true);
  });
});
