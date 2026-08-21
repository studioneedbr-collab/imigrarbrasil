/**
 * Mensagem de cliente exposta ao painel só para notificar. NÃO carrega o conteúdo:
 * mensagens podem conter CPF e a notificação aparece em tela bloqueada.
 */
export interface ActivityMessage {
  id: string;
  conversationId: string;
  contactName: string | null;
  createdAt: string;
}

/** Instante em ms; datas inválidas viram NaN e são descartadas pelos filtros. */
const ms = (iso: string): number => Date.parse(iso);

/**
 * Decide o que merece notificação.
 *
 * `lastSeenAt` nulo significa "primeira carga": não notifica nada, só estabelece a
 * linha de base — senão abrir o painel dispararia uma notificação por mensagem do histórico.
 *
 * A comparação é por instante (Date.parse), nunca por texto: o Supabase devolve
 * "+00:00" e o repositório em memória devolve "Z" para o mesmo instante.
 */
export function selectNewMessages(
  messages: ActivityMessage[],
  lastSeenAt: string | null,
  alreadyNotified: ReadonlySet<string>,
): ActivityMessage[] {
  if (!lastSeenAt) return [];
  const baseline = ms(lastSeenAt);
  if (Number.isNaN(baseline)) return [];
  return messages
    .filter((m) => {
      const t = ms(m.createdAt);
      return !Number.isNaN(t) && t > baseline && !alreadyNotified.has(m.id);
    })
    .sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
}

/**
 * Nova linha de base. Nunca retrocede: se a lista vier vazia ou mais antiga que o
 * que já vimos, mantém o valor anterior — senão uma resposta fora de ordem faria
 * as mesmas mensagens notificarem de novo.
 */
export function newestTimestamp(messages: ActivityMessage[], previous: string | null): string | null {
  let best = previous;
  let bestMs = previous ? ms(previous) : Number.NEGATIVE_INFINITY;
  if (Number.isNaN(bestMs)) bestMs = Number.NEGATIVE_INFINITY;
  for (const m of messages) {
    const t = ms(m.createdAt);
    if (!Number.isNaN(t) && t > bestMs) {
      bestMs = t;
      best = m.createdAt;
    }
  }
  return best;
}
