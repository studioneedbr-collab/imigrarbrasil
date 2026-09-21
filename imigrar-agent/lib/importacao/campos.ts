// OS CAMPOS QUE UMA PLANILHA PODE TRAZER — e como adivinhar qual coluna é qual.
//
// A carga inicial foi um script que sabia de cor os nomes das colunas do Sérgio. Serviu
// uma vez. Para servir sempre, quem tem que se adaptar é o sistema: a planilha do
// escritório vai mudar de nome de coluna, ganhar coluna nova e perder outra, e ninguém
// vai abrir um arquivo .mjs para acompanhar.
//
// A DETECÇÃO É PALPITE, E A TELA DEIXA CORRIGIR. Adivinhar bem economiza o trabalho de
// mapear vinte colunas à mão; adivinhar errado e gravar sem mostrar seria trocar o
// telefone de uma pessoa pelo número de pessoas do grupo familiar. Por isso a função
// devolve uma SUGESTÃO, e quem confirma é gente.

import type { AtendimentoStatus } from "@/lib/domain/types";

export type CampoImportavel =
  | "idExterno"
  | "nome"
  | "telefone"
  | "email"
  | "nacionalidade"
  | "regiao"
  | "fase"
  | "urgencia"
  | "servico"
  | "descricao"
  | "propostaValor"
  | "propostaEnviadaEm"
  | "primeiroContato";

export interface DefinicaoDeCampo {
  campo: CampoImportavel;
  /** Como o campo aparece na tela de mapeamento. */
  rotulo: string;
  /** O que ele vira no painel — a frase que evita mapear a coluna errada. */
  ajuda: string;
  /**
   * Pedaços de nome de coluna que sugerem este campo, sem acento e em caixa baixa.
   * Ordem importa: o primeiro que casar vence.
   */
  pistas: string[];
}

/**
 * SÓ O TELEFONE É OBRIGATÓRIO, e não o nome.
 *
 * Parece o contrário, e não é: sem telefone o caso é um card que ninguém consegue
 * retomar — não dá para ligar, não dá para escrever, e ele nunca vai casar com a conversa
 * de WhatsApp da mesma pessoa. Sem nome dá: metade dos casos que chegam pelo WhatsApp
 * começa exatamente assim, identificada pelo número, e o nome aparece na conversa.
 */
export const CAMPOS: DefinicaoDeCampo[] = [
  {
    campo: "idExterno",
    rotulo: "ID da linha",
    ajuda: "O identificador que a planilha já usa. É ele que faz reimportar atualizar em vez de duplicar.",
    pistas: ["id lead", "id do lead", "id", "codigo", "código", "ref"],
  },
  {
    campo: "nome",
    rotulo: "Nome",
    ajuda: "Como a pessoa se chama.",
    pistas: ["nome completo", "nome do lead", "nome", "cliente", "contato"],
  },
  {
    campo: "telefone",
    rotulo: "WhatsApp / telefone",
    ajuda: "Obrigatório. É a chave que junta este caso com a conversa de WhatsApp da mesma pessoa.",
    pistas: ["whatsapp", "telefone", "celular", "fone", "tel", "phone"],
  },
  {
    campo: "email",
    rotulo: "E-mail",
    ajuda: "Texto que não for e-mail de verdade é descartado.",
    pistas: ["e-mail", "email", "mail"],
  },
  {
    campo: "nacionalidade",
    rotulo: "Nacionalidade",
    ajuda: "País de origem da pessoa.",
    pistas: ["nacionalidade", "pais de origem", "país de origem", "origem"],
  },
  {
    campo: "regiao",
    rotulo: "Onde está",
    ajuda: "Cidade, estado ou país onde a pessoa está agora.",
    pistas: ["cidade", "estado", "pais de residencia", "país de residência", "onde", "regiao", "região", "localiza"],
  },
  {
    campo: "fase",
    rotulo: "Etapa do funil",
    ajuda: "Em que coluna o caso entra. Sem esta coluna, tudo entra em Novo.",
    pistas: ["fase", "etapa", "status", "situacao do atendimento", "situação do atendimento"],
  },
  {
    campo: "urgencia",
    rotulo: "Urgência",
    ajuda: "Alta, média ou baixa.",
    pistas: ["urgencia", "urgência", "prioridade"],
  },
  {
    campo: "servico",
    rotulo: "O que ela procura",
    ajuda: "Tipo de serviço, via ou objetivo.",
    pistas: ["tipo de servico", "tipo de serviço", "servico", "serviço", "objetivo", "interesse"],
  },
  {
    campo: "descricao",
    rotulo: "Descrição do caso",
    ajuda: "O texto livre sobre a situação. Vai para a ficha e passa pela triagem.",
    pistas: ["descricao", "descrição", "necessidade", "observa", "resumo", "detalhe"],
  },
  {
    campo: "propostaValor",
    rotulo: "Valor da proposta",
    ajuda: "Em reais. Vazio não vira zero — fica sem valor mesmo.",
    pistas: ["valor final", "valor proposto", "valor", "orcamento", "orçamento"],
  },
  {
    campo: "propostaEnviadaEm",
    rotulo: "Data da proposta",
    ajuda: "Quando o orçamento foi enviado.",
    pistas: ["data envio proposta", "data da proposta", "envio proposta"],
  },
  {
    campo: "primeiroContato",
    rotulo: "Data do 1º contato",
    ajuda: "Quando a pessoa chegou. Vira a data de entrada do caso.",
    pistas: ["1o contato", "1º contato", "primeiro contato", "data de entrada", "data"],
  },
];

export const CAMPO_OBRIGATORIO: CampoImportavel = "telefone";

/** Sem acento, em caixa baixa, sem pontuação — para comparar nome de coluna. */
export function chaveDeColuna(nome: string): string {
  return (nome ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * O PALPITE INICIAL DO MAPEAMENTO.
 *
 * Devolve, para cada campo, o índice da coluna que mais parece com ele — ou `null`.
 *
 * Uma coluna só serve a um campo: sem isso, "Data 1º Contato" e "Data Envio Proposta"
 * disputariam o mesmo palpite e a data errada entraria como data de entrada. Vence quem
 * casar com a pista mais específica (as pistas são testadas da mais longa para a mais
 * curta), e o campo que perder fica sem sugestão para gente resolver.
 */
/**
 * Campos que guardam número ou data. Uma coluna que é PERGUNTA não serve a nenhum deles.
 */
const CAMPOS_DE_VALOR_OU_DATA: CampoImportavel[] = [
  "propostaValor",
  "propostaEnviadaEm",
  "primeiroContato",
];

/**
 * COLUNA QUE TERMINA EM "?" GUARDA UMA RESPOSTA, NÃO UM NÚMERO.
 *
 * A planilha do comercial tem "Orçamento Enviado?", com Sim e Não dentro — e a pista
 * "orçamento" a capturava como valor da proposta. Nada de ruim seria gravado ("Sim" não
 * vira número), mas o campo ficaria mapeado, o de verdade ficaria sem sugestão, e quem
 * confere o mapeamento leria "valor da proposta: Orçamento Enviado?" e acharia que está
 * certo. Planilha de escritório é cheia de coluna-pergunta: "É Pessoa Idosa (60+)?",
 * "Contrato Fechado?", "Necessita Negociação?".
 */
function ehPergunta(nomeOriginal: string): boolean {
  return /\?\s*$/.test(nomeOriginal ?? "");
}

export function sugerirMapeamento(cabecalho: string[]): Record<CampoImportavel, number | null> {
  const chaves = cabecalho.map(chaveDeColuna);
  const perguntas = cabecalho.map(ehPergunta);
  const serve = (campo: CampoImportavel, idx: number) =>
    !(perguntas[idx] && CAMPOS_DE_VALOR_OU_DATA.includes(campo));
  const usadas = new Set<number>();
  const mapa = {} as Record<CampoImportavel, number | null>;
  for (const def of CAMPOS) mapa[def.campo] = null;

  const candidatos = CAMPOS.flatMap((def) =>
    def.pistas.map((pista) => ({ campo: def.campo, pista: chaveDeColuna(pista) })),
  );

  // PRIMEIRA PASSADA: NOME EXATO.
  //
  // Vem antes de tudo porque a coluna que se CHAMA "Nacionalidade" é a nacionalidade,
  // ponto — mesmo existindo ao lado uma "País de Origem", que também é uma pista válida e
  // por acaso é uma palavra mais longa. Sem esta passada, a planilha do comercial mapeava
  // a nacionalidade para a coluna errada: as duas dizem quase a mesma coisa, e por isso o
  // erro passaria despercebido até alguém filtrar o quadro por país.
  for (const { campo, pista } of candidatos) {
    if (mapa[campo] !== null) continue;
    const i = chaves.findIndex((c, idx) => !usadas.has(idx) && serve(campo, idx) && c === pista);
    if (i >= 0) {
      mapa[campo] = i;
      usadas.add(i);
    }
  }

  // SEGUNDA PASSADA: PEDAÇO DO NOME, da pista mais específica para a mais genérica —
  // "data envio proposta" tem que ser testada antes de "data", senão a data da proposta
  // entra como data de entrada do caso.
  for (const { campo, pista } of [...candidatos].sort((a, b) => b.pista.length - a.pista.length)) {
    if (mapa[campo] !== null) continue;
    const i = chaves.findIndex(
      (c, idx) => !usadas.has(idx) && serve(campo, idx) && c.includes(pista),
    );
    if (i >= 0) {
      mapa[campo] = i;
      usadas.add(i);
    }
  }
  return mapa;
}

/**
 * A fase da planilha vira status do quadro. As grafias são as que aparecem em planilha de
 * escritório, não as do banco — quem escreve ali escreve "Negociação", não
 * "em_atendimento".
 */
const FASES: Array<[RegExp, AtendimentoStatus]> = [
  [/proposta|or[çc]amento enviado|apresenta/i, "proposta_enviada"],
  [/fechad|ganho|contrato|cliente/i, "fechado"],
  [/perdid|desist|recus|cancel/i, "perdido"],
  [/agendad|reuni[ãa]o|call/i, "agendado"],
  [/negocia|qualifica|espera|andamento|atendimento|retorno|follow/i, "em_atendimento"],
  [/novo|primeiro contato|1o contato|lead|entrada/i, "novo"],
];

export function statusDaFase(fase: string | null | undefined): AtendimentoStatus | null {
  const t = (fase ?? "").trim();
  if (!t) return null;
  for (const [re, status] of FASES) if (re.test(t)) return status;
  return null;
}
