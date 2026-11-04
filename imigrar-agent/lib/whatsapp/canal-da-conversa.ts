// POR QUAL NÚMERO RESPONDER A ESTA CONVERSA.
//
// A resposta sai pelo número em que o cliente escreveu — e não pela config única de
// sempre. Com duas instâncias ligadas, a resposta manual, o documento e o follow-up saíam
// todos pelo número padrão: o cliente recebia a resposta de um número que nunca tinha
// visto, numa conversa nova, e a do número certo ficava sem resposta.
//
// Era a mesma conta que o envio de rascunho já fazia à mão; agora mora num lugar só.

import type { Conversation } from "@/lib/domain/types";
import type { Repository } from "@/lib/data/repository";
import { resolverInstancia } from "@/lib/agent/estado";
import { configDaInstancia, type ZapiResolvedConfig } from "@/lib/whatsapp/config";

/** `undefined` cai na config única — a resposta certa para quem tem uma instância só. */
export async function canalDaConversa(
  repo: Repository,
  conv: Pick<Conversation, "instanciaId">,
): Promise<ZapiResolvedConfig | undefined> {
  const instancia =
    (conv.instanciaId ? await repo.getInstancia(conv.instanciaId).catch(() => null) : null) ??
    (await resolverInstancia(null).catch(() => null));
  return instancia ? configDaInstancia(instancia) : undefined;
}
