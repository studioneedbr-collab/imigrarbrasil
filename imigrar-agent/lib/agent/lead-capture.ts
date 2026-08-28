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

import { extractSlots, semNumeroDeDocumento } from "@/lib/agent/triagem";
import {
  classificarAutomatico,
  detectarSinalDePrazo,
  localizacaoDeRegion,
  resumoAutomatico,
} from "@/lib/agent/classificacao";
import type { Classificacao, Lead } from "@/lib/domain/types";
// A ficha mínima mudou de casa (lib/domain/ficha.ts) para o painel poder lê-la sem
// arrastar as tabelas de triagem para dentro do bundle do cliente. Reexportada para que
// quem já a importava daqui continue funcionando — a regra é a mesma, e é uma só.
export { qualificacaoFaltando, type DossieFaltando } from "@/lib/domain/ficha";



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
  //
  // SEM NÚMERO DE DOCUMENTO. Estes campos guardam a FRASE da pessoa, e a frase às vezes
  // traz o CPF que ela mandou por conta própria. A regra de não transcrever esse número
  // não pode valer só na conversa: daqui ele iria para a ficha, para o resumo da fila e
  // para a exportação. Ver `semNumeroDeDocumento`.
  if (slots.situacao && !lead?.contractDuration) {
    patch.contractDuration = semNumeroDeDocumento(slots.situacao);
  }

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
  if (slots.situacao && !lead?.situacaoDocumental) {
    patch.situacaoDocumental = semNumeroDeDocumento(slots.situacao);
  }
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
      patch.situacaoDocumental = semNumeroDeDocumento(sinal.trecho);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // O QUE ELA QUER CONSEGUIR — o campo que a ficha mostrava vazio com a resposta na tela.
  //
  // A ficha da Ana Rodríguez tinha "Situação documental: hola, soy venezolana y recibí una
  // multa migratoria, no sé qué hacer" e "O que a pessoa quer conseguir:" em branco. A
  // informação estava ali, na mesma frase: quem recebeu multa quer resolver a multa. Só
  // que `objetivo` só era preenchido quando o modelo lembrava de chamar a tool, e o campo
  // vazio segura o encaminhamento (é um dos seis da ficha mínima) — ou seja, a ficha
  // ficava incompleta por falta de uma dedução que a própria frase já tinha entregue.
  //
  // Derivado, nunca inventado: sai do sinal de prazo (que já foi detectado no texto) ou
  // do caminho migratório reconhecido. Sem nenhum dos dois, continua vazio — melhor um
  // buraco honesto do que um objetivo chutado, que ninguém depois vai desconfiar.
  if (!lead?.objetivo && !patch.objetivo) {
    const tipo = patch.prazoTipo ?? lead?.prazoTipo;
    const temPrazoAgora = patch.temPrazoCorrendo ?? lead?.temPrazoCorrendo;
    const caminho =
      patch.modalidadeProvavel ??
      lead?.modalidadeProvavel ??
      (patch.servicesInterested ?? lead?.servicesInterested)?.[0];
    if (temPrazoAgora && tipo && OBJETIVO_DE_PRAZO[tipo]) patch.objetivo = OBJETIVO_DE_PRAZO[tipo];
    else if (caminho) patch.objetivo = `Conseguir ${caminho}`;
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
 * O objetivo que se deduz de um prazo. "Recebi uma multa" não é o objetivo — o objetivo é
 * resolver a multa, e é isso que o advogado precisa ler na ficha.
 */
const OBJETIVO_DE_PRAZO: Record<string, string> = {
  multa: "Resolver uma multa migratória",
  indeferimento: "Reverter um indeferimento",
  notificacao_saida: "Responder a uma notificação de saída",
};

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
