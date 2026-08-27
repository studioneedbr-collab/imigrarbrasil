// OS CASOS DE RECUPERAÇÃO — o contrato entre a pergunta real e o material que a responde.
//
// Por que esta suíte existe: 500 testes cobrem o PROMPT e nenhum cobria o RAG. Só que o
// prompt manda a Ana responder exclusivamente pelo material recuperado — então uma
// regressão de recuperação não aparece como teste vermelho, aparece como a Ana dizendo
// "não tenho essa informação" para uma pergunta que a cartilha responde na íntegra. Entre
// duas mudanças de prompt, ninguém vê.
//
// COMO LER UM CASO. `esperados` são os ids dos chunks que respondem a pergunta — mais de
// um quando a resposta existe em cartilhas diferentes e qualquer uma serve. O id é
// derivado do conteúdo pelo `ingestao/chunk.py`: se alguém trocar o PDF, mexer no
// chunking ou reindexar torto, o id muda e o caso falha. É essa a regressão que a suíte
// pega. `trecho` é a âncora legível — serve para achar o chunk de novo quando o id mudar
// por um motivo legítimo, e é o que aparece na mensagem de falha.
//
// `lacuna` marca o caso em que o acervo NÃO responde direito. Não é para ser silenciado:
// o caso continua rodando contra o melhor chunk disponível hoje, e o texto da lacuna sai
// no relatório da suíte, para não virar folclore oral.

export interface CasoRecall {
  /** A pergunta, na forma em que ela chega — de gente, não de quem indexou. */
  consulta: string;
  /** Ids aceitáveis. Qualquer um no top-k faz o caso passar. */
  esperados: string[];
  /** Âncora legível do chunk esperado — aparece na mensagem de falha. */
  trecho: string;
  /** O que uma resposta correta precisa conter. Documentação, não asserção. */
  responde: string;
  /** Quando o acervo não cobre bem a pergunta. Sai no relatório. */
  lacuna?: string;
}

export const CASOS: CasoRecall[] = [
  {
    consulta: "boliviano precisa de visto para entrar no Brasil",
    esperados: ["0b8cc4f7f6920d66"],
    trecho: "há dispensa de visto para entrada no Brasil, por exemplo, para cidadãos do MERCOSUL",
    responde:
      "Argentina, Bolívia, Chile, Colômbia, Equador, Paraguai, Peru e Uruguai têm dispensa de visto de entrada pelos Acordos de Residência; basta documento de identidade do país de origem na fronteira, com 90 dias de estada.",
    lacuna:
      "É a pergunta que a Ana errou em produção. O chunk existe e é inequívoco, mas o texto não contém nenhum gentílico ('boliviano', 'peruano') — só a lista de países. A recuperação depende inteiramente do vetorial aproximar 'boliviano' de 'Bolívia'; na busca léxica esta consulta traz 'não concessão de visto' em primeiro lugar, que é o oposto da resposta.",
  },
  {
    consulta: "nacionais do Mercosul dispensa de visto",
    esperados: ["0b8cc4f7f6920d66"],
    trecho: "em razão dos Acordos de Residência",
    responde: "A mesma dispensa, perguntada com as palavras do documento.",
  },
  {
    consulta: "entrar no Brasil e pedir residência para estudo",
    esperados: ["5f53b5b0994d99ad"],
    trecho: "Quem pode solicitar a autorização de residência para fins de estudo",
    responde:
      "Quem pretende vir ao Brasil para curso regular, estágio ou intercâmbio pede autorização de residência para estudo — e a cartilha de regularização trata dela como pedido feito já em território brasileiro.",
  },
  {
    consulta: "quantos dias posso ficar no Brasil com documento de identidade",
    esperados: ["0b8cc4f7f6920d66", "8b605f730b3c0238"],
    trecho: "prazo de estada de 90 dias no Brasil",
    responde:
      "90 dias de estada para quem entra pela dispensa do Mercosul com documento de identidade do país de origem; o conceito de 'prazo de estada' está no chunk irmão.",
  },
  {
    consulta: "venezuelano autorização de residência",
    esperados: ["190bdb29a7d6fdb8"],
    trecho: "autorizações de residência por razões de política migratória, como é o caso de pessoas venezuelanas",
    responde:
      "Que existe residência por política migratória para pessoas venezuelanas, com Portaria Interministerial própria.",
    lacuna:
      "LACUNA REAL. Não há nenhum chunk dedicado à residência de pessoas venezuelanas: a única menção útil está de passagem dentro de 'O que é a prova de meios de vida?', cujo título — que é a âncora de recuperação das cartilhas em Q&A — não tem nada a ver com a pergunta. As demais 22 ocorrências de 'Venezuela' no acervo são doutrina sobre o bloco e a suspensão do país no Mercosul.",
  },
  {
    consulta: "haitiano visto acolhida humanitária",
    esperados: ["14bfeed05cc9bde3", "1124dd55895fbb26"],
    trecho: "acolhida humanitária",
    responde:
      "Existe visto temporário de acolhida humanitária para pessoas nacionais haitianas e apátridas residentes no Haiti (Portaria Interministerial 13/2020).",
  },
  {
    consulta: "prazo para se registrar na Polícia Federal depois de entrar",
    esperados: ["27b72d1519fcd8a4"],
    trecho: "registrar-se em uma das unidades da Polícia Federal em até 90 dias",
    responde: "90 dias após o ingresso, com residência temporária de 2 anos daí decorrente.",
    lacuna:
      "Três chunks diferentes se chamam 'Qual o prazo de residência?' em cartilhas diferentes, e os outros dois falam de prazo de residência, não de prazo de registro. Confundir os dois é fácil, e a diferença é a que decide se a pessoa está regular.",
  },
  {
    consulta: "multa migratória defesa",
    esperados: ["cf0e880326161aec"],
    trecho: "apresentar sua defesa à Polícia Federal no prazo de 10 dias",
    responde:
      "Cabe defesa administrativa em 10 dias da notificação, sem advogado; negada, cabe recurso ou ação judicial. E a multa não impede regularização nem pedido de refúgio.",
  },
  {
    consulta: "recurso indeferimento refúgio",
    esperados: ["6476f4cfcc13ec04"],
    trecho: "caberá recurso no prazo de 15 dias, contados da notificação",
    responde:
      "Indeferido o refúgio, cabe recurso em 15 dias da notificação, decidido pelo Ministro da Justiça.",
    lacuna:
      "A informação existe em UM item numerado no fim de um chunk longo intitulado 'Como solicitar?', que é sobre o passo a passo do SISCONARE. A cartilha de refugiados (2010) não cobre recurso, e nenhum chunk tem título sobre indeferimento. Para a pergunta mais urgente do domínio — prazo de recurso correndo — o acervo depende de o RRF alcançar o fim de um chunk de procedimento.",
  },
  {
    consulta: "quem pode ser chamante reunião familiar",
    esperados: ["3b34aecb51a8078d", "ab40489b5ea971bc"],
    trecho: "Familiar chamante é aquela pessoa a quem",
    responde:
      "Quem é o chamante e quem é o chamado, nas duas vias (visto de reunião familiar, no exterior; autorização de residência por reunião familiar, no Brasil).",
  },
];

/** Quantos chunks a busca devolve em produção — é este o top-k que a suíte cobra. */
export const TOP_K = 6;
