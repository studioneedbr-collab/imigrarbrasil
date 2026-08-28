// O CRM — funis, etapas e a montagem do quadro.
//
// A regra que sustenta o arquivo inteiro: ETAPA É NOME, STATUS É DOMÍNIO.
//
// O escritório cria quantas etapas quiser ("aguardando certidão consular", "protocolo
// enviado", "proposta com o cliente") e cada uma aponta para um dos cinco
// `AtendimentoStatus`. É por isso que dá para redesenhar o quadro sem que a fila deixe de
// ordenar por prazo, sem que "perdido" pare de exigir motivo e sem que os relatórios
// passem a contar coisa diferente do que contavam ontem.
//
// O funil PADRÃO existe em código, não só no banco: um painel que abre vazio porque
// ninguém rodou a migration ainda é um painel quebrado, e um quadro sem colunas esconde
// todos os casos de uma vez.

import type { AtendimentoStatus, EtapaCrm, FunilCrm } from "@/lib/domain/types";
import { eFiltrada } from "@/lib/domain/types";
import { contaComoOperacaoReal } from "@/lib/domain/ambiente";
import { eConversaDeGrupo } from "@/lib/whatsapp/remetente";
import { ATENDIMENTO_LABEL } from "@/lib/domain/rotulos";
import { COLUNAS, ordenarColuna } from "@/lib/fila/kanban";
import type { LeadDaFila } from "@/lib/fila/ordenacao";

/** O funil que já existia antes de existir CRM: as cinco colunas do quadro antigo. */
export const FUNIL_PADRAO_ID = "padrao";

export const AJUDA_PADRAO: Record<AtendimentoStatus, string> = {
  novo: "Chegou e ninguém pegou.",
  em_atendimento: "Alguém do time está com a bola.",
  proposta_enviada: "O orçamento está com a pessoa, esperando resposta.",
  agendado: "Reunião marcada com a pessoa.",
  fechado: "Virou cliente ou o assunto se resolveu.",
  perdido: "Não virou atendimento — com o motivo registrado.",
};

export const FUNIL_PADRAO: FunilCrm = {
  id: FUNIL_PADRAO_ID,
  nome: "Atendimento",
  descricao: "O caminho de todo caso que chega pelo WhatsApp.",
  ordem: 0,
  padrao: true,
  arquivado: false,
  criadoEm: "1970-01-01T00:00:00.000Z",
};

/** As cinco etapas do funil padrão — uma por status, na ordem do trabalho. */
export function etapasPadrao(funilId: string = FUNIL_PADRAO_ID): EtapaCrm[] {
  return COLUNAS.map((status, i) => ({
    id: `${funilId}:${status}`,
    funilId,
    nome: ATENDIMENTO_LABEL[status],
    ajuda: AJUDA_PADRAO[status],
    status,
    ordem: i,
    arquivada: false,
  }));
}

/** O funil que a tela abre quando ninguém escolheu: o padrão, ou o primeiro que houver. */
export function funilPadrao(funis: FunilCrm[]): FunilCrm {
  const vivos = funis.filter((f) => !f.arquivado);
  return vivos.find((f) => f.padrao) ?? vivos[0] ?? FUNIL_PADRAO;
}

export interface ColunaDoQuadro {
  etapa: EtapaCrm;
  leads: LeadDaFila[];
}

/**
 * Distribui os leads nas etapas de UM funil.
 *
 * DUAS COISAS QUE PARECEM DETALHE E NÃO SÃO:
 *
 * 1. Lead sem etapa não some. Quem chegou antes do funil existir — ou nunca foi movido —
 *    não tem `etapaId`, e cai na primeira etapa cujo status bate com o dele. É o que
 *    permite criar um funil novo e ver o quadro cheio no mesmo segundo, em vez de um
 *    quadro vazio que parece perda de dados.
 *
 * 2. Etapa cujo status não existe mais, etapa arquivada, `etapaId` de outro funil: tudo
 *    volta a cair pelo status. Um caso na coluna errada é ruim; um caso invisível é pior.
 *
 * O que fica de fora é o mesmo de sempre: ensaio (ambiente que não é operação real) e
 * conversa filtrada (CURIOSO, DPU, FORA_ESCOPO), que vive na aba de auditoria.
 */
export function montarQuadro(
  leads: LeadDaFila[],
  funil: FunilCrm,
  etapas: EtapaCrm[],
  agora: Date = new Date(),
): ColunaDoQuadro[] {
  const doFunil = etapas
    .filter((e) => e.funilId === funil.id && !e.arquivada)
    .sort((a, b) => a.ordem - b.ordem);
  const colunas: ColunaDoQuadro[] = doFunil.map((etapa) => ({ etapa, leads: [] }));
  if (!colunas.length) return [];

  const porId = new Map(colunas.map((c) => [c.etapa.id, c]));
  /** A primeira etapa de cada status: o destino de quem ainda não foi movido à mão. */
  const porStatus = new Map<AtendimentoStatus, ColunaDoQuadro>();
  for (const c of colunas) if (!porStatus.has(c.etapa.status)) porStatus.set(c.etapa.status, c);

  for (const lead of leads) {
    if (!contaComoOperacaoReal(lead.ambiente)) continue;
    // GRUPO NÃO É PESSOA. O webhook parou de criar estes leads, mas os que já entraram
    // continuam no banco — e um card cujo "nome" é o JID de um grupo é trabalho alocado
    // para ninguém. Ler o próprio número conserta o passado sem UPDATE em produção.
    if (eConversaDeGrupo(lead.whatsappNumber)) continue;
    if (eFiltrada(lead.classificacao)) continue;

    // FUNIL. Quem não tem funil pertence ao padrão — não a todos: um caso aparecendo em
    // dois quadros seria trabalho alocado duas vezes.
    const funilDoLead = lead.funilId ?? (funil.padrao ? funil.id : null);
    if (funilDoLead !== funil.id) continue;

    const status = lead.atendimentoStatus ?? "novo";
    const porEtapa = lead.etapaId ? porId.get(lead.etapaId) : undefined;
    // A etapa gravada só vale se ainda descrever o status do caso. Fechar um caso pelo
    // detalhe não move o card sozinho, e a coluna precisa contar a verdade.
    const destino =
      porEtapa && porEtapa.etapa.status === status
        ? porEtapa
        : porStatus.get(status) ?? porStatus.get("novo") ?? colunas[0];
    destino.leads.push(lead);
  }

  for (const c of colunas) ordenarColuna(c.leads, c.etapa.status, agora);
  return colunas;
}

// ─── VALIDAÇÃO DO QUE VEM DA TELA ───

export const NOME_MAX = 40;
export const AJUDA_MAX = 120;

/**
 * Um funil sem nenhuma etapa que leve a "perdido" e a "fechado" é um funil de onde não se
 * sai: o caso fica para sempre em alguma coluna do meio, e a métrica de desfecho para de
 * existir. A tela avisa em vez de proibir — o funil pode estar sendo montado ainda.
 */
export function faltamDesfechos(etapas: EtapaCrm[]): AtendimentoStatus[] {
  const tem = new Set(etapas.filter((e) => !e.arquivada).map((e) => e.status));
  return (["fechado", "perdido"] as AtendimentoStatus[]).filter((s) => !tem.has(s));
}
