import type { Repository } from "@/lib/data/repository";
import type { Conversation, TransferTicket } from "@/lib/domain/types";

/**
 * AO DAR A CONVERSA A ALGUÉM, A AGENTE PARA OU CONTINUA?
 *
 * Até aqui sempre parava. O escritório pediu a escolha: às vezes o responsável só
 * acompanha, e a agente segue colhendo a informação até ele entrar. Os três lugares que
 * dão dono a um caso (transferir, enviar ao CRM, card do quadro) passam por aqui — três
 * cópias desta regra divergiriam na primeira mudança.
 */
export const MODOS_DA_AGENTE = ["para", "continua"] as const;
export type ModoDaAgente = (typeof MODOS_DA_AGENTE)[number];

/** A agente está calada nesta conversa? Assumida por alguém ou já encaminhada. */
export function agenteCalada(conv: Pick<Conversation, "assumedBy" | "status"> | null): boolean {
  return Boolean(conv?.assumedBy) || conv?.status === "transferred";
}

const MARCA_CONTINUA = "A agente continua respondendo.";

/** A conversa tem dono, e quem transferiu escolheu que a agente siga atendendo. */
export function agenteContinuaComResponsavel(
  conv: Pick<Conversation, "assumedBy" | "status" | "handoffReason"> | null,
): boolean {
  return !agenteCalada(conv) && Boolean(conv?.handoffReason?.endsWith(MARCA_CONTINUA));
}

export async function aplicarAgente(
  repo: Repository,
  conversationId: string,
  destino: { email: string; nome: string },
  modo: ModoDaAgente,
  motivo: string,
): Promise<void> {
  if (modo === "para") {
    await repo.assumeConversation(conversationId, destino.email);
  } else if (agenteCalada(await repo.getConversation(conversationId))) {
    // "Continua" numa conversa em que ela já estava calada quer dizer que ela VOLTA. Sem
    // isto a tela diria que a agente segue respondendo e o cliente ficaria sem ninguém.
    await repo.releaseConversation(conversationId);
  }
  await repo.updateConversation(conversationId, {
    handedOffTo: destino.nome,
    handoffReason: modo === "continua" ? `${motivo} ${MARCA_CONTINUA}` : motivo,
  });
}

/** O que a pessoa lê depois de confirmar. */
export const fraseDaAgente = (modo: ModoDaAgente) =>
  modo === "para" ? "A agente parou de responder nesta conversa." : "A agente continua respondendo até alguém assumir.";

/**
 * COM QUEM ESTÁ A CONVERSA. O responsável do caso, que muda também pela ficha e pelo
 * quadro; sem ele, para onde foi encaminhada (um setor, quando foi a agente que encaminhou).
 */
export function comQuemEsta(
  conv: Pick<Conversation, "status" | "handedOffTo">,
  responsavelId: string | null | undefined,
  nomePorId: Map<string, string>,
): { responsavelNome: string | null; comQuem: string | null } {
  const responsavelNome = (responsavelId ? nomePorId.get(responsavelId) : null) ?? null;
  return {
    responsavelNome,
    comQuem: responsavelNome ?? (conv.status === "transferred" ? conv.handedOffTo?.trim() || null : null),
  };
}

/** O texto do sino. "manual:Jurídico" não dizia nada a quem lê. */
export function rotuloDoTicket(t: Pick<TransferTicket, "reason" | "dossie">, responsavelNome: string | null): string {
  const m = t.reason.match(/^manual:(.*)$/);
  if (m) {
    const antigo = t.dossie?.necessidade?.match(/^Transferência manual para (.+) \([^)]*\)\.$/)?.[1];
    return `Transferida para ${t.dossie?.para ?? antigo ?? responsavelNome ?? m[1].trim()}`;
  }
  return responsavelNome ? `Com ${responsavelNome}` : "Aguardando alguém assumir";
}
