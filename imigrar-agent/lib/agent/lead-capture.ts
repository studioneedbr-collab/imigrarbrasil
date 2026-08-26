// O DOSSIÊ SE PREENCHE SOZINHO.
//
// Antes, o painel só mostrava dados do contato quando o modelo lembrava de chamar
// registrar_dados_lead. Quando ele não chamava — e ele esquece com frequência —, a
// conversa inteira acontecia, a pessoa dizia que é venezuelana, que está em Boa Vista e
// que o visto venceu, e o dossiê continuava em "Coletando…". Quem abria o painel não
// tinha nada na mão.
//
// Aqui a leitura é determinística e roda a TODO turno, em cima do que a pessoa escreveu.
// Nunca sobrescreve o que já está gravado (o que veio da tool ou da mão de um atendente
// vale mais que a heurística): só preenche buraco.

import { extractSlots } from "@/lib/agent/triagem";
import type { Lead } from "@/lib/domain/types";

export interface DossieFaltando {
  /** Rótulos legíveis do que ainda falta, na ordem em que vale a pena descobrir. */
  faltam: string[];
  /** Nada essencial falta — o time jurídico consegue pegar o caso. */
  completo: boolean;
  /** Dados bons de ter, que NÃO seguram nada. */
  complementares: string[];
}

/**
 * A QUALIFICAÇÃO DA IMIGRAR BRASIL — o que o advogado precisa ter na mão quando pegar
 * esta conversa: nacionalidade, onde a pessoa está, o que ela quer conseguir e se há prazo.
 *
 * Usa os campos do lead com a leitura deste domínio: `clientType` guarda a nacionalidade,
 * `region` onde a pessoa está agora e `servicesInterested` o que ela procura. Nada aqui
 * SEGURA nada: um caso concreto vai para o time jurídico mesmo com a lista pela metade.
 */
export function qualificacaoFaltando(lead: Lead | null): DossieFaltando {
  const faltam = [
    !lead?.clientType && "a nacionalidade",
    !lead?.region && "onde a pessoa está agora (no Brasil ou no exterior)",
    !lead?.servicesInterested?.length && "o que ela quer conseguir",
    !lead?.urgency && "se há prazo ou urgência",
  ].filter((x): x is string => typeof x === "string");
  const complementares = [
    !lead?.contactName && "o nome dela",
    !lead?.contractDuration && "como ela entrou e o que tem hoje",
  ].filter((x): x is string => typeof x === "string");
  return { faltam, completo: faltam.length === 0, complementares };
}

/**
 * Lê o que a pessoa escreveu e devolve o patch do que AINDA NÃO está no lead.
 * Devolve `null` quando não há novidade — assim o chamador não escreve à toa.
 */
export function capturarDadosDoLead(
  textoDoCliente: string,
  lead: Lead | null,
): Partial<Lead> | null {
  const slots = extractSlots(textoDoCliente);
  const patch: Partial<Lead> = {};

  if (slots.name && !lead?.contactName) patch.contactName = slots.name;
  if (slots.email && !lead?.email) patch.email = slots.email;
  if (slots.nacionalidade && !lead?.clientType) patch.clientType = slots.nacionalidade;
  if (slots.ondeEsta && !lead?.region) patch.region = slots.ondeEsta;
  if (slots.urgency && !lead?.urgency) patch.urgency = slots.urgency;
  // Como entrou / o que tem hoje. Ocupa `contractDuration`, que é o campo livre do lead
  // herdado da estrutura — o painel já o exibe como "Situação atual".
  if (slots.situacao && !lead?.contractDuration) patch.contractDuration = slots.situacao;

  // Caminhos migratórios: acumula em vez de trocar. Quem pergunta sobre reunião familiar
  // e depois sobre naturalização está procurando as DUAS coisas, e sobrescrever com a
  // primeira apaga metade do que o advogado precisa ler.
  if (slots.caminhos?.length) {
    const atuais = lead?.servicesInterested ?? [];
    const novos = slots.caminhos.filter((s) => !atuais.includes(s));
    if (novos.length) patch.servicesInterested = [...atuais, ...novos];
  }

  return Object.keys(patch).length ? patch : null;
}
