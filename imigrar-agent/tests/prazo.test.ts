import { describe, it, expect } from "vitest";
import { MemoryRepository } from "@/lib/data/memory-repository";
import { detectarSinalDePrazo, classificarAutomatico } from "@/lib/agent/classificacao";
import { capturarDadosDoLead } from "@/lib/agent/lead-capture";
import type { Lead } from "@/lib/domain/types";

// O ponto mais importante do painel e o mais fácil de implementar errado: a tentação é
// deixar o agente calcular a data a partir do que a pessoa disse no WhatsApp. Estes
// testes existem para que essa tentação quebre o build.

describe("a IA sinaliza, o humano confirma", () => {
  it("o resumo da fila abre com o prazo, não com 'sem caso descrito'", () => {
    const patch = capturarDadosDoLead(
      "hola, soy venezolana, vivo en Boa Vista y recibí una multa migratoria",
      null,
    );
    // A leitura de "situação" é em português e falha em espanhol; o sinal de prazo não.
    expect(patch?.resumo).toContain("Prazo sinalizado");
    expect(patch?.resumo).toContain("multa migratória");
    // A frase dela fica guardada — é o que quem for ligar lê antes de discar.
    expect(patch?.situacaoDocumental).toContain("multa migratoria");
  });

  it("a captura automática liga o sinal e NÃO grava data nenhuma", () => {
    const patch = capturarDadosDoLead(
      "recebi uma multa da polícia federal e me deram prazo de 30 dias",
      null,
    );
    expect(patch?.temPrazoCorrendo).toBe(true);
    expect(patch?.prazoTipo).toBe("multa");
    expect(patch).not.toHaveProperty("prazoDataLimite");
    expect(patch).not.toHaveProperty("prazoDataNotificacao");
  });

  it("upsertLead descarta data de prazo mesmo quando ela vem no patch", async () => {
    const repo = new MemoryRepository();
    const conv = await repo.getOrCreateConversation("5521999999999");
    const lead = await repo.upsertLead(conv.id, {
      temPrazoCorrendo: true,
      prazoDataLimite: "2026-09-01",
      prazoDataNotificacao: "2026-08-01",
      prazoConfirmadoPor: "modelo",
    } as Partial<Lead>);
    expect(lead.temPrazoCorrendo).toBe(true);
    expect(lead.prazoDataLimite).toBeUndefined();
    expect(lead.prazoConfirmadoPor).toBeUndefined();
  });

  it("updateLead (a ficha, editada à mão) também não grava data de prazo", async () => {
    const repo = new MemoryRepository();
    const conv = await repo.getOrCreateConversation("5521999999999");
    const lead = await repo.upsertLead(conv.id, { contactName: "Maria" });
    const editado = await repo.updateLead(lead.id, {
      nacionalidade: "Venezuela",
      prazoDataLimite: "2026-09-01",
    } as Partial<Lead>);
    expect(editado.nacionalidade).toBe("Venezuela");
    expect(editado.prazoDataLimite).toBeUndefined();
  });

  it("confirmarPrazo é o único caminho — e ele carrega quem confirmou", async () => {
    const repo = new MemoryRepository();
    const conv = await repo.getOrCreateConversation("5521999999999");
    const lead = await repo.upsertLead(conv.id, { temPrazoCorrendo: true });
    const confirmado = await repo.confirmarPrazo(
      lead.id,
      { tipo: "notificacao_saida", notificacao: "2026-08-20", limite: "2026-09-05" },
      "walter@imigrarbrasil.com",
    );
    expect(confirmado.prazoDataLimite).toBe("2026-09-05");
    expect(confirmado.prazoConfirmadoPor).toBe("walter@imigrarbrasil.com");
    expect(confirmado.prazoConfirmadoEm).toBeTruthy();
  });
});

describe("sinal de prazo", () => {
  it("reconhece os quatro tipos", () => {
    expect(detectarSinalDePrazo("fui multado ao sair").tipo).toBe("multa");
    expect(detectarSinalDePrazo("meu pedido de refúgio foi indeferido").tipo).toBe("indeferimento");
    expect(detectarSinalDePrazo("recebi notificação de saída do país").tipo).toBe("notificacao_saida");
    expect(detectarSinalDePrazo("tenho 15 dias para responder").tipo).toBe("outro");
  });

  it("não vê prazo onde não há", () => {
    expect(detectarSinalDePrazo("boa tarde, queria saber sobre naturalização").temPrazo).toBe(false);
  });

  it("guarda a frase da pessoa, para quem for ligar confirmar", () => {
    const sinal = detectarSinalDePrazo("oi  meu refúgio foi indeferido semana passada  o que faço");
    expect(sinal.trecho).toContain("indeferido");
  });
});

describe("a heurística só esquenta, nunca esfria", () => {
  const base = { localizacao: null, objetivo: null, modalidadeProvavel: null, situacaoDocumental: null, servicesInterested: null } as Partial<Lead>;

  it("nunca devolve CURIOSO, DPU ou FORA_ESCOPO", () => {
    // Filtrar por regex é como se descarta em silêncio quem precisava de ajuda.
    const c = classificarAutomatico({ ...base, classificacao: null } as Lead, "oi, tudo bem?");
    expect(c).toBeNull();
  });

  it("não desfaz um descarte decidido explicitamente", () => {
    const c = classificarAutomatico(
      { ...base, classificacao: "CURIOSO" } as Lead,
      "recebi uma multa",
    );
    expect(c).toBeNull();
  });

  it("sobe de morno para quente quando aparece prazo", () => {
    const lead = { id: "l", classificacao: "MORNO_ADMINISTRATIVO", situacaoDocumental: "visto vencido" } as Lead;
    const patch = capturarDadosDoLead("recebi uma notificação de saída do país", lead);
    expect(patch?.classificacao).toBe("QUENTE_PRAZO");
  });

  it("não rebaixa um quente para morno na mensagem seguinte", () => {
    const lead = { id: "l", classificacao: "QUENTE_PRAZO", objetivo: "ficar no Brasil" } as Lead;
    const patch = capturarDadosDoLead("sou venezuelana e moro em Boa Vista", lead);
    expect(patch?.classificacao).toBeUndefined();
  });
});
