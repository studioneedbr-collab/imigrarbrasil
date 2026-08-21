import { describe, it, expect } from "vitest";
import { capturarDadosDoLead, dossieComercialFaltando, temDocumento } from "@/lib/agent/lead-capture";
import { avaliarEncaminhamentoComercial } from "@/lib/agent/transfer-gate";
import type { Lead } from "@/lib/domain/types";

const lead = (patch: Partial<Lead> = {}): Lead =>
  ({
    id: "l1", conversationId: "c1", whatsappNumber: "5521999999999",
    status: "novo", stage: "novo", score: 0,
    createdAt: "2026-08-17T12:00:00Z", updatedAt: "2026-08-17T12:00:00Z",
    ...patch,
  }) as Lead;

// Atendimento real do "Ph" (5521993138140, 17/08): ele disse serviço e quantidade na
// terceira mensagem, e o dossiê do painel continuou em "Coletando…" porque o modelo
// nunca chamou registrar_dados_lead.
describe("dossiê que se preenche sozinho", () => {
  it("lê serviço e quantidade do pedido do cliente", () => {
    const p = capturarDadosDoLead(
      "Preciso de 4 porteiros e 5 auxiliares de limpeza sendo 1 com adicional de insalubridade.",
      null,
    );
    expect(p?.servicesInterested).toEqual(["Porteiro", "Auxiliar de Serviços Gerais"]);
    expect(p?.employeesNeeded).toBe(4);
  });

  it("pega CNPJ, e-mail e região", () => {
    const p = capturarDadosDoLead(
      "somos o Condomínio Alfa, CNPJ 18.623.185/0001-56, fica em Botafogo, manda pro contato@alfa.com.br",
      null,
    );
    expect(p?.notes).toMatch(/18\.623\.185\/0001-56/);
    expect(p?.email).toBe("contato@alfa.com.br");
    expect(p?.region).toBe("Botafogo");
  });

  it("nunca sobrescreve o que já está gravado", () => {
    const p = capturarDadosDoLead("preciso de 4 porteiros em Copacabana", lead({
      region: "Barra", employeesNeeded: 10,
    }));
    expect(p?.region).toBeUndefined();
    expect(p?.employeesNeeded).toBeUndefined();
  });

  it("acumula serviço novo em vez de trocar", () => {
    const p = capturarDadosDoLead("também vou precisar de jardineiro", lead({
      servicesInterested: ["Porteiro"],
    }));
    expect(p?.servicesInterested).toEqual(["Porteiro", "Jardineiro"]);
  });

  it("sem novidade nenhuma, não escreve no banco", () => {
    expect(capturarDadosDoLead("boa tarde", null)).toBeNull();
    expect(capturarDadosDoLead("obrigado!", lead({ region: "Barra" }))).toBeNull();
  });

  it("reconhece o documento onde o painel procura", () => {
    expect(temDocumento(lead({ notes: "CNPJ: 18.623.185/0001-56" }))).toBe(true);
    expect(temDocumento(lead())).toBe(false);
  });
});

// 17/08/2026: a triagem que segura o PDF caiu de sete campos para quatro. CNPJ e e-mail
// deixaram de travar a proposta — a Shayene ficava em loop pedindo cadastro e o cliente
// nunca via o orçamento.
describe("triagem mínima antes da proposta", () => {
  const completo = lead({
    servicesInterested: ["Porteiro"], employeesNeeded: 4, region: "Botafogo",
    companyName: "Condomínio Alfa",
  });

  it("lista o que falta, na ordem de perguntar", () => {
    const r = dossieComercialFaltando(lead({ servicesInterested: ["Porteiro"], employeesNeeded: 4 }));
    expect(r.completo).toBe(false);
    expect(r.faltam).toEqual(["a cidade/região do serviço", "o nome da empresa"]);
  });

  it("serviço, postos, região e empresa bastam — sem CNPJ e sem e-mail", () => {
    expect(dossieComercialFaltando(completo).completo).toBe(true);
  });

  it("CNPJ, e-mail e nome do contato viram complementares, para depois do PDF", () => {
    const r = dossieComercialFaltando(completo);
    expect(r.faltam).not.toContain("o CNPJ (só se ele pedir nota fiscal)");
    expect(r.complementares).toEqual([
      "o seu nome",
      "o e-mail para enviar a proposta",
      "o CNPJ (só se ele pedir nota fiscal)",
    ]);
  });

  it("com o cadastro completo, não sobra complementar nenhum", () => {
    const r = dossieComercialFaltando(lead({
      servicesInterested: ["Porteiro"], employeesNeeded: 4, region: "Botafogo",
      companyName: "Condomínio Alfa", contactName: "Pedro Henrique",
      notes: "CNPJ: 18.623.185/0001-56", email: "ph@alfa.com.br",
    }));
    expect(r.complementares).toEqual([]);
  });
});

// A regra do Eduardo (17/08/2026): o comercial humano é 1% dos atendimentos, e só
// depois do orçamento em PDF.
describe("o comercial só entra depois do PDF", () => {
  const base = {
    jaTemProposta: false,
    dossieCompleto: false,
    textoRecente: "quero uma cotação de 4 porteiros",
    assuntoExigePessoa: false,
  };

  it("segura a cotação em andamento", () => {
    expect(avaliarEncaminhamentoComercial(base).liberado).toBe(false);
  });

  it("libera depois que a proposta foi enviada", () => {
    expect(avaliarEncaminhamentoComercial({ ...base, jaTemProposta: true }).liberado).toBe(true);
  });

  it("libera quando o cliente pede uma pessoa", () => {
    expect(
      avaliarEncaminhamentoComercial({ ...base, textoRecente: "quero falar com um atendente" })
        .liberado,
    ).toBe(true);
  });

  it("libera emergência", () => {
    expect(
      avaliarEncaminhamentoComercial({ ...base, textoRecente: "teve um acidente no prédio" })
        .liberado,
    ).toBe(true);
  });

  it("libera assunto que não é cotação (contrato, jurídico, financeiro)", () => {
    expect(avaliarEncaminhamentoComercial({ ...base, assuntoExigePessoa: true }).liberado).toBe(true);
  });

  it("libera o 1%: triagem completa e ainda assim não dá para cotar", () => {
    expect(avaliarEncaminhamentoComercial({ ...base, dossieCompleto: true }).liberado).toBe(true);
  });
});
