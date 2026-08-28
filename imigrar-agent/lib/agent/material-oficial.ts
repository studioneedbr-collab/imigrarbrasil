// O MATERIAL OFICIAL E AS REGRAS QUE NÃO SE APAGAM.
//
// A base jurídica deste atendimento são sete documentos públicos (material-oficial/), que
// a ingestão quebra em trechos e o RAG recupera a cada turno (lib/agent/rag.ts). Isso
// resolve "de onde vem a resposta" — e NÃO resolve o que estava acontecendo:
//
//   O RAG é CONDICIONAL. Ele só injeta trecho quando a mensagem pede pesquisa: uma
//   saudação, um "e aí, dá pra fazer?", uma pergunta sobre honorário não disparam busca
//   nenhuma. E é exatamente nessas mensagens — as que não parecem técnicas — que a Ana
//   escorregava e dava parecer sobre o caso da pessoa. Numa conversa real ela escreveu,
//   em espanhol, que ter o passaporte carimbado em Pacaraima "es buena señal: significa
//   que tu entrada quedó registrada de forma regular". Isso é análise do caso concreto,
//   dita por um escritório de advocacia a alguém que vai decidir a vida em cima.
//
// Então as REGRAS do material não podem depender de recuperação. Elas ficam aqui, em
// código, e entram em TODO prompt — inclusive quando a equipe reescreve a persona inteira
// na tela de treinar, inclusive quando alguém grava um `system_prompt` cru. É a única
// parte do prompt que a tela não edita, e é de propósito: o que protege a pessoa do outro
// lado não pode ser apagado por engano numa tarde de ajuste de tom.
//
// Ver também lib/agent/verificador-de-saida.ts, que corta a frase DEPOIS de escrita. Este
// bloco é a prevenção; aquele é a rede.

export interface MaterialOficial {
  arquivo: string;
  titulo: string;
  /** O que este documento resolve — é o que a Ana precisa saber para citá-lo. */
  cobre: string;
  colecao: "cartilha" | "legislacao" | "doutrina";
}

/**
 * O acervo, do jeito que ele é. A lista existe para duas leituras diferentes:
 * a Ana saber o que ela TEM (e não inventar fonte), e o time ver na tela de treinar qual
 * documento sustenta cada resposta.
 */
export const MATERIAIS: MaterialOficial[] = [
  {
    arquivo: "regularizacao-migratoria.pdf",
    titulo: "Regularização migratória",
    cobre: "quem já está no Brasil e precisa regularizar a situação: autorização de residência, prazos, multa migratória",
    colecao: "cartilha",
  },
  {
    arquivo: "emissao-de-visto.pdf",
    titulo: "Emissão de visto",
    cobre: "quem ainda está fora: tipos de visto, onde se pede, o que o consulado exige",
    colecao: "cartilha",
  },
  {
    arquivo: "refugiados-no-brasil.pdf",
    titulo: "Refúgio no Brasil",
    cobre: "solicitação de refúgio, CONARE, direitos de quem solicitou e prazos do procedimento",
    colecao: "cartilha",
  },
  {
    arquivo: "mercosul-trabalho.pdf",
    titulo: "Residência Mercosul e trabalho",
    cobre: "acordo de residência do Mercosul e o direito ao trabalho de quem está regularizando",
    colecao: "cartilha",
  },
  {
    arquivo: "naturalizacao-dpu.pdf",
    titulo: "Naturalização (DPU)",
    cobre: "naturalização e o caminho da Defensoria Pública da União para quem não pode pagar",
    colecao: "cartilha",
  },
  {
    arquivo: "legislacao-migratoria.pdf",
    titulo: "Legislação migratória",
    cobre: "Lei 13.445/2017 e o decreto que a regulamenta — o texto legal em si",
    colecao: "legislacao",
  },
  {
    arquivo: "comentarios-lei-migracao.pdf",
    titulo: "Comentários à Lei de Migração",
    cobre: "doutrina sobre a Lei de Migração, para dúvida de interpretação",
    colecao: "doutrina",
  },
];

/**
 * O BLOCO QUE VAI EM TODO PROMPT.
 *
 * Curto de propósito. Um bloco longo compete com o resto do prompt e some no meio; estas
 * são as regras que, quebradas, causam dano real a quem está do outro lado — e cada uma
 * delas já foi quebrada pelo menos uma vez numa conversa de verdade.
 */
export const REGRAS_INVIOLAVEIS = `════════ MATERIAL OFICIAL — REGRAS QUE NÃO SE QUEBRAM ════════
A base deste atendimento são documentos públicos sobre imigração no Brasil (cartilhas do
governo, a Lei 13.445/2017 e doutrina). Trechos deles são inseridos na conversa quando a
pergunta pede. Estas regras valem SEMPRE, inclusive quando nenhum trecho foi inserido:

1. SEM PARECER SOBRE O CASO CONCRETO. Você explica como a regra funciona em geral. Você
   NÃO diz se a situação de quem está falando é regular ou irregular, se o carimbo dela
   vale, se o processo dela vai dar certo, se o prazo dela ainda está aberto, nem qual
   é a chance de deferimento. Quem afirma isso é o advogado, depois de ver o documento.
2. SEM INVENTAR FONTE. Se o material não trouxe a resposta, diga que não tem essa
   informação e encaminhe. Nunca cite artigo, prazo, valor ou exigência de memória:
   número errado de prazo aqui faz a pessoa perder o prazo.
3. PRAZO SE CONFIRMA COM DOCUMENTO. Você registra que existe prazo; a DATA quem apura é
   uma pessoa do time, olhando a notificação. Não calcule data limite a partir do que a
   pessoa lembra, e não diga "você ainda tem X dias".
4. SEM HONORÁRIO, SEM VALOR, SEM PROMESSA DE RESULTADO. Nenhum preço, nem faixa, nem
   "costuma custar". Isso é conversa com o escritório.
5. GRATUIDADE EXISTE E SE DIZ. Quem não tem condições de pagar tem a Defensoria Pública
   da União como caminho — isso não é perder um cliente, é a informação correta.
6. DOCUMENTO DA PESSOA É DADO SENSÍVEL. Não repita número de passaporte, CPF, protocolo
   ou endereço na conversa, e não peça foto de documento sem necessidade.`;

/**
 * A lista dos documentos, para o prompt. Fica junto das regras: sem ela a Ana sabe que
 * "existe material oficial" e não sabe DE QUÊ — e passa a encaminhar pergunta que o
 * acervo responde, ou a prometer resposta sobre tema que ele não cobre.
 */
export function blocoDoAcervo(): string {
  const linhas = MATERIAIS.map((m) => `· ${m.titulo}: ${m.cobre}`).join("\n");
  return `O acervo disponível cobre:\n${linhas}\nTema fora dessa lista: diga que não é a sua área e encaminhe ao time.`;
}

/** O bloco inteiro — regras + acervo. É o que `getSystemPrompt` acrescenta sempre. */
export function blocoMaterialOficial(): string {
  return `\n\n${REGRAS_INVIOLAVEIS}\n\n${blocoDoAcervo()}`;
}
