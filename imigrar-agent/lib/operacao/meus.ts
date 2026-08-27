// MEUS ATENDIMENTOS — quem está com a bola.
//
// A fila responde "o que chegou". Esta tela responde "o que é meu e o que está parado",
// que é outra pergunta e é a que falta quando o ciclo é longo.
//
// Em imigração a pessoa some por três semanas juntando documento no consulado e volta.
// Isso é o processo funcionando, não desinteresse. O problema é que, sem separar, o caso
// em que a pessoa está esperando UMA RESPOSTA NOSSA fica visualmente igual ao caso em que
// nós estamos legitimamente esperando ela. Um é dívida, o outro é paciência — e tratar os
// dois do mesmo jeito faz o time perder os dois.
//
// A regra de quem está com a bola é simples e não depende de ninguém marcar nada: olha
// quem falou por último na conversa.

import type { LeadDaFila } from "@/lib/fila/ordenacao";
import type { Lembrete } from "@/lib/domain/types";
import { DIAS_PARA_CONSIDERAR_PARADO } from "@/lib/operacao/limites";

export interface Balde {
  /** A bola está comigo: a pessoa falou por último e ninguém respondeu. */
  comigo: LeadDaFila[];
  /** A bola está com ela: respondemos e estamos aguardando. */
  aguardandoCliente: LeadDaFila[];
  /** Reunião marcada. */
  agendados: LeadDaFila[];
  /** Sem movimento há mais de DIAS_PARA_CONSIDERAR_PARADO — atravessa os baldes acima. */
  parados: LeadDaFila[];
  /** Lembretes cuja data chegou, com o lead correspondente. */
  paraHoje: Array<{ lembrete: Lembrete; lead: LeadDaFila | null }>;
}

export function diasParado(l: LeadDaFila, agora: Date): number {
  const base = Date.parse(l.ultimoContatoEm ?? l.updatedAt ?? l.createdAt);
  if (!Number.isFinite(base)) return 0;
  return Math.floor((agora.getTime() - base) / 86_400_000);
}

/** Encerrado sai de tudo: fechado e perdido não são trabalho pendente de ninguém. */
function aberto(l: LeadDaFila): boolean {
  return l.atendimentoStatus !== "fechado" && l.atendimentoStatus !== "perdido";
}

export function montarMeus(
  leads: LeadDaFila[],
  lembretes: Lembrete[],
  usuarioId: string | null,
  agora: Date = new Date(),
): Balde {
  const meus = leads.filter((l) => aberto(l) && !!usuarioId && l.responsavelId === usuarioId);
  const hoje = new Date(agora.getTime()).toISOString().slice(0, 10);

  const porOrdemDeEspera = (a: LeadDaFila, b: LeadDaFila) =>
    Date.parse(a.ultimoContatoEm ?? a.createdAt) - Date.parse(b.ultimoContatoEm ?? b.createdAt);

  const agendados = meus.filter((l) => l.atendimentoStatus === "agendado");
  const emAndamento = meus.filter((l) => l.atendimentoStatus !== "agendado");

  return {
    // A bola comigo vem ordenada pelo que espera há mais tempo: é dívida vencendo.
    comigo: emAndamento.filter((l) => l.ultimaMensagemDe === "user").sort(porOrdemDeEspera),
    aguardandoCliente: emAndamento
      .filter((l) => l.ultimaMensagemDe !== "user")
      .sort(porOrdemDeEspera),
    agendados: agendados.sort(porOrdemDeEspera),
    parados: meus
      .filter((l) => diasParado(l, agora) >= DIAS_PARA_CONSIDERAR_PARADO)
      .sort(porOrdemDeEspera),
    paraHoje: lembretes
      .filter((l) => !l.feitoEm && l.quando <= hoje)
      .sort((a, b) => a.quando.localeCompare(b.quando))
      .map((lembrete) => ({
        lembrete,
        lead: leads.find((l) => l.id === lembrete.leadId) ?? null,
      })),
  };
}
