// AS DATAS DE PRAZO NÃO ENTRAM POR AÍ.
//
// A IA sinaliza que existe prazo; a data quem preenche é uma pessoa, na tela de detalhe,
// depois de confirmar com quem está do outro lado. A pessoa frequentemente não sabe a
// data da notificação, confunde com o dia em que recebeu o papel, ou manda uma foto
// ilegível — e um contador regressivo em cima de uma data inferida pelo modelo é
// exatamente o erro que faz alguém perder prazo.
//
// Por isso a proteção não é uma convenção: os dois caminhos de escrita genérica
// (`upsertLead`, do agente, e `updateLead`, da ficha) passam o patch por aqui e as datas
// caem fora, venham de onde vierem. Só `confirmarPrazo` grava — e ele exige o autor.

import type { Lead } from "@/lib/domain/types";

export const CAMPOS_DE_PRAZO = [
  "prazoDataNotificacao",
  "prazoDataLimite",
  "prazoConfirmadoPor",
  "prazoConfirmadoEm",
] as const;

export function semCamposDePrazo<T extends Partial<Lead>>(patch: T): T {
  const limpo = { ...patch };
  for (const campo of CAMPOS_DE_PRAZO) delete limpo[campo];
  return limpo;
}

// ─── O QUE SÓ HUMANO PREENCHE ───
//
// `relogioData` não é prazo processual (não entra em `CAMPOS_DE_PRAZO`, não vai para o
// bloco de prazos), mas nasce do mesmo problema: é uma DATA, e data que o modelo deduz
// da frase de alguém — "acho que as aulas começam em março" — vira posição na fila e
// marcador na tela. Por isso o caminho do agente (`upsertLead`) a descarta, enquanto a
// ficha (`updateLead`) grava normalmente: lá quem digita é gente.

//
// `funilId` e `etapaId` entram pelo mesmo motivo, de outro ângulo: onde o caso está no
// quadro é uma decisão de quem atende. O agente escreve na ficha a cada mensagem que
// chega — se ele pudesse mexer nisso, um card arrastado à mão para "aguardando certidão"
// voltaria sozinho para a coluna anterior no próximo "oi" da pessoa.

//
// A ETAPA COMERCIAL entra na mesma lista, e é o caso mais caro de todos: valor proposto,
// valor contratado, validade da proposta e categoria da perda são números que viram
// relatório de faturamento. Um modelo inferindo "acho que ficou uns três mil" a partir de
// uma frase do cliente escreveria receita no painel do escritório.

export const CAMPOS_SO_DE_HUMANO = [
  "relogioData",
  "funilId",
  "apoioIds",
  // A espera também: o motivo é escolhido por quem pausa o caso, e o agente reescrevendo
  // "proximoToqueEm" a cada mensagem que chega apagaria a régua que alguém montou à mão.
  "esperaMotivo",
  "esperaDesde",
  "proximoToqueEm",
  "toquesNoMotivo",
  "etapaId",
  "propostaEnviadaEm",
  "propostaValor",
  "propostaServico",
  "propostaValidade",
  "valorContratado",
  "motivoPerdaCategoria",
] as const;

export function semCamposSoDeHumano<T extends Partial<Lead>>(patch: T): T {
  const limpo = { ...patch };
  for (const campo of CAMPOS_SO_DE_HUMANO) delete limpo[campo];
  return limpo;
}
