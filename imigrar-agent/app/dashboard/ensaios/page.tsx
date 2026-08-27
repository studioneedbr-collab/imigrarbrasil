"use client";

import { ListaDeConversas } from "@/components/conversas/lista";

/**
 * OS ENSAIOS TÊM TELA PRÓPRIA.
 *
 * Conversa de simulador e de instância de teste não aparece na fila, não aparece no
 * quadro e não entra nas métricas — essa era a regra e ela estava certa. O que faltava era
 * o outro lado dela: se o ensaio não aparece em lugar nenhum, ele fica invisível, e quem
 * acabou de testar um prompt não tem onde ler o que saiu.
 *
 * Então em vez de misturar (`sim:v2-5` e `sim:at-8-3` estavam na fila de trabalho, entre
 * casos de gente de verdade), o ensaio tem endereço. É a mesma lista de conversas, com a
 * mesma busca e a mesma paginação, apontada para o outro lado do corte.
 */
export default function EnsaiosPage() {
  return <ListaDeConversas ambiente="teste" />;
}
