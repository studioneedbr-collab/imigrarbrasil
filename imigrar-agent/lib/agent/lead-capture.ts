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
import {
  classificarAutomatico,
  detectarSinalDePrazo,
  localizacaoDeRegion,
  resumoAutomatico,
} from "@/lib/agent/classificacao";
import type { Classificacao, Lead } from "@/lib/domain/types";

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

  // ── Os campos que a FILA lê ────────────────────────────────────────────────
  // Os quatro acima são os campos herdados da estrutura antiga, com a leitura deste
  // domínio. Daqui para baixo é o modelo próprio: nacionalidade, onde a pessoa está,
  // sinal de prazo e classificação — o que decide em que bloco da fila ela aparece.

  if (slots.nacionalidade && !lead?.nacionalidade) patch.nacionalidade = slots.nacionalidade;
  if (slots.situacao && !lead?.situacaoDocumental) patch.situacaoDocumental = slots.situacao;
  if (slots.caminhos?.length && !lead?.modalidadeProvavel) {
    patch.modalidadeProvavel = slots.caminhos[0];
  }

  // Só a partir do que a pessoa ACABOU de dizer. Derivar de `lead.region` aqui faria
  // toda mensagem sem conteúdo ("obrigado!") devolver um patch e escrever no banco à
  // toa; o caminho da tool converte a região que o modelo grava, e as linhas antigas
  // vieram convertidas na migration 019.
  if (slots.ondeEsta && !lead?.localizacao) {
    const { localizacao, paisExterior } = localizacaoDeRegion(slots.ondeEsta);
    if (localizacao) {
      patch.localizacao = localizacao;
      if (paisExterior) patch.paisExterior = paisExterior;
    }
  }

  // SINAL DE PRAZO — um booleano e um tipo, nunca uma data. Ver lib/agent/classificacao.ts.
  // Uma vez ligado não se desliga sozinho: se a pessoa mencionou multa na terceira
  // mensagem e falou de outra coisa na décima, o prazo continua correndo.
  const sinal = detectarSinalDePrazo(textoDoCliente);
  if (sinal.temPrazo && !lead?.temPrazoCorrendo) {
    patch.temPrazoCorrendo = true;
    if (sinal.tipo && !lead?.prazoTipo) patch.prazoTipo = sinal.tipo;
    // A FRASE DELA, guardada como situação. É o que quem for ligar vai ler antes de
    // discar — e é justamente o caso em que a leitura por regex de situação costuma
    // falhar, porque metade dessas mensagens não chega em português.
    if (sinal.trecho && !lead?.situacaoDocumental && !patch.situacaoDocumental) {
      patch.situacaoDocumental = sinal.trecho;
    }
  }

  const classificacao = classificarAutomatico({ ...lead, ...patch } as Lead, textoDoCliente);
  if (classificacao && maisQuenteQue(classificacao, lead?.classificacao)) {
    patch.classificacao = classificacao;
  }

  // O resumo automático é reescrito enquanto for automático — a cada coisa nova que a
  // pessoa conta, ele melhora. Assim que o modelo escrever o dele pela tool, ou um
  // humano corrigir na ficha, este para de mexer.
  //
  // Só quando já há novidade: sem esta condição, uma mensagem sem conteúdo ("boa tarde")
  // devolveria um patch só com o resumo e mandaria uma escrita ao banco a cada "oi".
  if (Object.keys(patch).length && (!lead?.resumo || lead.resumo === resumoAutomatico(lead))) {
    patch.resumo = resumoAutomatico({ ...lead, ...patch } as Partial<Lead>);
  }

  return Object.keys(patch).length ? patch : null;
}

/**
 * A HEURÍSTICA SÓ ESQUENTA.
 *
 * Uma regex que esfria um lead o tira da frente do time sem que ninguém decida isso — e
 * o prejuízo de descartar quem precisava de ajuda não aparece em métrica nenhuma até
 * tarde demais. Subir de MORNO para QUENTE_PRAZO é seguro; o caminho de volta passa por
 * uma pessoa, na tela de detalhe, e fica registrado como reclassificação.
 */
const TEMPERATURA: Record<Classificacao, number> = {
  CURIOSO: 0,
  FORA_ESCOPO: 0,
  DPU: 0,
  EXTERIOR_VISTO: 1,
  MORNO_ADMINISTRATIVO: 2,
  QUENTE_JUDICIAL: 3,
  QUENTE_PRAZO: 4,
};

function maisQuenteQue(nova: Classificacao, atual: Classificacao | null | undefined): boolean {
  if (!atual) return true;
  // As filtradas são decisão explícita (do modelo ou de gente): a heurística não desfaz.
  if (TEMPERATURA[atual] === 0) return false;
  return TEMPERATURA[nova] > TEMPERATURA[atual];
}
