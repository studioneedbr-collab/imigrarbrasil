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

export const CAMPOS_SO_DE_HUMANO = ["relogioData"] as const;

export function semCamposSoDeHumano<T extends Partial<Lead>>(patch: T): T {
  const limpo = { ...patch };
  for (const campo of CAMPOS_SO_DE_HUMANO) delete limpo[campo];
  return limpo;
}
