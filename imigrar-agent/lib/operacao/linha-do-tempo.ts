// A LINHA DO TEMPO DO CASO.
//
// Quando alguém pega o caso de um colega — porque ele está de férias, porque o prazo
// venceu, porque o cliente ligou cobrando —, a conversa inteira não responde à pergunta
// que importa: **o que já foi feito aqui?** Ler duzentas mensagens para descobrir que o
// prazo foi confirmado ontem e a reunião foi remarcada duas vezes é caro e falha.
//
// Isto não é uma tabela nova: os eventos já estavam gravados, espalhados entre os campos
// do lead, o log de acesso e o registro de reclassificação. O que faltava era juntá-los
// em ordem e com nome de gente ao lado.

import type {
  AccessLogEntry,
  Lead,
  Lembrete,
  Reclassificacao,
  ToqueDeFollowup,
} from "@/lib/domain/types";
import { CLASSIFICACAO_LABEL } from "@/lib/domain/rotulos";
import { MOTIVO_ESPERA_LABEL, type MotivoEspera } from "@/lib/followup/motivos";
import { nomeDoIdioma } from "@/lib/domain/idiomas";

export interface EventoDaLinha {
  em: string;
  texto: string;
  autor: string | null;
  /** `marco` recebe destaque visual: são os pontos que mudam o caso de estado. */
  peso: "marco" | "normal";
}

/** Ações do log de acesso que contam a história do caso. Ler não é história. */
const ACOES: Record<string, { texto: string; peso: "marco" | "normal" }> = {
  assumiu_atendimento: { texto: "assumiu o atendimento", peso: "marco" },
  assumiu_lead: { texto: "assumiu o atendimento", peso: "marco" },
  mudou_responsaveis: { texto: "mudou quem cuida do caso", peso: "marco" },
  enviou_proposta: { texto: "enviou proposta", peso: "marco" },
  pausou_caso: { texto: "pausou o caso", peso: "marco" },
  retomou_caso: { texto: "retomou o caso", peso: "marco" },
  confirmou_prazo: { texto: "confirmou o prazo", peso: "marco" },
  marcou_agendado: { texto: "agendou reunião", peso: "marco" },
  marcou_fechado: { texto: "fechou o atendimento", peso: "marco" },
  marcou_perdido: { texto: "marcou como perdido", peso: "marco" },
  corrigiu_ficha: { texto: "corrigiu a ficha", peso: "normal" },
  resgatou_lead: { texto: "resgatou para a fila", peso: "marco" },
  tratou_falha: { texto: "ouviu o áudio que não foi transcrito", peso: "normal" },
};

export function montarLinhaDoTempo(input: {
  lead: Lead;
  reclassificacoes: Reclassificacao[];
  acessos: AccessLogEntry[];
  lembretes: Lembrete[];
  /** Os toques de follow-up deste caso. Opcional: banco sem a migration 029 não os tem. */
  toques?: ToqueDeFollowup[];
}): EventoDaLinha[] {
  const { lead, reclassificacoes, acessos, lembretes, toques = [] } = input;
  const eventos: EventoDaLinha[] = [];

  eventos.push({ em: lead.createdAt, texto: "conversa iniciada", autor: null, peso: "marco" });

  if (lead.classificacaoIa) {
    eventos.push({
      em: lead.createdAt,
      texto: `o agente classificou como ${CLASSIFICACAO_LABEL[lead.classificacaoIa]}`,
      autor: "agente",
      peso: "normal",
    });
  }

  // O sinal de prazo não tem data própria — é do agente, e nasce com a conversa. Fica
  // ancorado na criação em vez de inventar um instante que não foi registrado.
  if (lead.temPrazoCorrendo) {
    eventos.push({
      em: lead.createdAt,
      texto: "o agente sinalizou que há prazo correndo",
      autor: "agente",
      peso: "marco",
    });
  }

  for (const r of reclassificacoes) {
    eventos.push({
      em: r.criadoEm,
      texto:
        `reclassificou de ${r.de ? CLASSIFICACAO_LABEL[r.de] : "sem classificação"} ` +
        `para ${CLASSIFICACAO_LABEL[r.para]}${r.motivo ? ` — ${r.motivo}` : ""}`,
      autor: r.autor,
      peso: "marco",
    });
  }

  // O log de acesso registra também as LEITURAS, e leitura não é história do caso: mil
  // aberturas de tela empurrariam para fora os cinco eventos que importam.
  for (const a of acessos) {
    const meta = ACOES[a.acao];
    if (!meta) continue;
    eventos.push({
      em: a.criadoEm,
      texto: a.detalhe ? `${meta.texto} — ${a.detalhe}` : meta.texto,
      autor: a.autor,
      peso: meta.peso,
    });
  }

  for (const l of lembretes) {
    eventos.push({
      em: l.criadoEm,
      texto: `agendou retorno para ${l.quando} — ${l.nota}`,
      autor: l.autor,
      peso: "normal",
    });
    if (l.feitoEm) {
      eventos.push({
        em: l.feitoEm,
        texto: "concluiu o retorno agendado",
        autor: l.feitoPor ?? null,
        peso: "normal",
      });
    }
  }

  // ─── OS TOQUES DE FOLLOW-UP ───
  //
  // Cada um entra com tudo o que a pergunta "por que ela parou de responder?" precisa:
  // data, canal, o que estávamos esperando, EM QUE LÍNGUA, quem aprovou e o texto que
  // saiu. O texto vem gravado no próprio toque, e não montado a partir do modelo — um
  // modelo editado no mês que vem reescreveria retroativamente o que a pessoa recebeu, e
  // a linha do tempo passaria a mentir exatamente onde alguém foi procurar a verdade.
  for (const t of toques) {
    const oQueEsperava = MOTIVO_ESPERA_LABEL[t.motivo as MotivoEspera] ?? t.motivo;
    const lingua = nomeDoIdioma(t.idioma) ?? "idioma não identificado";
    if (t.status === "enviado" && t.enviadoEm) {
      eventos.push({
        em: t.enviadoEm,
        texto: `follow-up ${t.toque}/3 enviado por ${t.canal} em ${lingua} — ${oQueEsperava}: “${t.texto}”`,
        autor: t.aprovadoPor ?? "automático",
        peso: "normal",
      });
      if (t.respondidoEm) {
        eventos.push({
          em: t.respondidoEm,
          texto: "a pessoa respondeu depois do follow-up",
          autor: null,
          peso: "marco",
        });
      }
      continue;
    }
    if (t.status === "pulado") {
      eventos.push({
        em: t.criadoEm,
        texto: `pulou o follow-up de ${oQueEsperava} em ${lingua}`,
        autor: t.aprovadoPor ?? null,
        peso: "normal",
      });
      continue;
    }
    if (t.status === "tarefa" || t.status === "feito") {
      eventos.push({
        em: t.criadoEm,
        texto: `${t.status === "feito" ? "tarefa cumprida" : "virou tarefa manual"} — ${t.texto}`,
        autor: t.aprovadoPor ?? null,
        peso: "normal",
      });
    }
  }

  // Mais recente primeiro: quem abre quer saber o que aconteceu por último.
  return eventos.sort((a, b) => Date.parse(b.em) - Date.parse(a.em));
}
