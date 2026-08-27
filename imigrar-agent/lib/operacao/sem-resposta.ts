// MENSAGEM QUE ENTROU E NÃO SAIU RESPOSTA.
//
// Não existe fila de processamento neste sistema: o webhook recebe, atende e responde no
// mesmo request. O que existe — e some sem deixar rastro — é a mensagem que entrou, foi
// gravada, e nunca teve resposta: exceção no meio do webhook depois do insert, envio
// recusado pela Z-API, agente que rodou e devolveu vazio.
//
// De fora, isso é indistinguível de tudo funcionando: a conversa está no painel, a
// mensagem está lá, o gráfico de volume não muda. Só a pessoa do outro lado sabe que
// ficou falando sozinha.
//
// A regra mora aqui, pura, porque os dois repositórios precisam dela e porque uma regra
// destas escrita duas vezes diverge no primeiro ajuste.

/** O mínimo que a regra precisa saber de uma mensagem. */
export interface MensagemParaEspera {
  conversationId: string;
  role: "user" | "assistant";
  createdAt: string;
}

export interface ConversaSemResposta {
  conversationId: string;
  desde: string;
  minutos: number;
}

/**
 * Conversas cuja ÚLTIMA mensagem é do contato e já passou do limite.
 *
 * `ignorar` recebe as conversas em que o silêncio da Ana é intencional — alguém assumiu
 * o atendimento, o contato pediu para parar, a instância está em modo sombra. Sem essa
 * lista, todo atendimento humano em andamento viraria alarme, e um alarme que acusa o
 * trabalho normal é um alarme que o time desliga na primeira semana.
 */
export function conversasSemResposta(
  mensagens: MensagemParaEspera[],
  opts: { minutos: number; agora?: Date; ignorar?: ReadonlySet<string> },
): ConversaSemResposta[] {
  const agora = opts.agora ?? new Date();
  const ignorar = opts.ignorar ?? new Set<string>();

  // A última mensagem de cada conversa — e só ela decide. Uma conversa com dez idas e
  // vindas onde a última é nossa está respondida, por mais antiga que seja.
  const ultima = new Map<string, MensagemParaEspera>();
  for (const m of mensagens) {
    const t = Date.parse(m.createdAt);
    if (!Number.isFinite(t)) continue;
    const atual = ultima.get(m.conversationId);
    if (!atual || t > Date.parse(atual.createdAt)) ultima.set(m.conversationId, m);
  }

  const saida: ConversaSemResposta[] = [];
  for (const [conversationId, m] of Array.from(ultima.entries())) {
    if (m.role !== "user" || ignorar.has(conversationId)) continue;
    const minutos = Math.floor((agora.getTime() - Date.parse(m.createdAt)) / 60_000);
    if (minutos >= opts.minutos) {
      saida.push({ conversationId, desde: m.createdAt, minutos });
    }
  }
  // A que espera há mais tempo primeiro: é a que tem mais chance de já ter desistido.
  return saida.sort((a, b) => b.minutos - a.minutos);
}
