// O MAPA DO ATENDIMENTO — o caminho de uma mensagem, escrito uma vez.
//
// A pergunta que este arquivo responde é a que todo mundo faz na terceira semana usando o
// painel: "se a pessoa disser X, o que a Ana faz?". Hoje a resposta existe, mas espalhada
// por doze arquivos e uns três mil comentários — quem precisa dela (o sócio decidindo se
// confia no agente, o atendente entendendo por que um caso não foi encaminhado) não vai
// ler `lib/agent/index.ts`.
//
// ─────────────────────────────────────────────────────────────────────────────
// POR QUE O MAPA É DADO, E NÃO UM DESENHO.
//
// A tentação é fazer um fluxograma bonito no Figma e colar como imagem. Isso dura uma
// sprint: o código muda, o desenho não, e a partir daí o mapa MENTE — que é pior do que
// não ter mapa, porque agora existe uma fonte errada com aparência de oficial.
//
// Então o mapa é uma estrutura, cada etapa aponta o ARQUIVO onde ela mora, e as listas
// que dependem de configuração (objeções, regras de encaminhamento, classificações,
// acervo) são lidas do que está gravado, não redigitadas aqui. O desenho é montado a
// partir disso na tela.
// ─────────────────────────────────────────────────────────────────────────────

import { CLASSIFICACOES } from "@/lib/domain/types";
import { CLASSIFICACAO_AJUDA, CLASSIFICACAO_LABEL } from "@/lib/domain/rotulos";
import { MATERIAIS } from "@/lib/agent/material-oficial";

/** O que a etapa é — muda a cor e a forma no mapa. */
export type TipoDeEtapa =
  | "entrada" // a mensagem chegando
  | "leitura" // o sistema lendo o que já se sabe, sem decidir nada
  | "portao" // uma decisão determinística, em código, que LIMITA o que o modelo pode fazer
  | "modelo" // o LLM escrevendo
  | "rede" // uma proteção que age depois do modelo
  | "saida"; // o que sai, e o que fica gravado

export interface EtapaDoMapa {
  id: string;
  titulo: string;
  tipo: TipoDeEtapa;
  /** Uma frase: o que acontece aqui. */
  oQue: string;
  /** Por que existe. É o que impede alguém de "simplificar" a etapa fora sem saber o custo. */
  porQue: string;
  /** As saídas possíveis desta etapa — é isto que faz o mapa ser um mapa. */
  caminhos?: { se: string; entao: string }[];
  /** Onde isso mora. Quem for conferir abre o arquivo. */
  arquivo: string;
}

export const ETAPAS: EtapaDoMapa[] = [
  {
    id: "chegada",
    titulo: "A mensagem chega",
    tipo: "entrada",
    oQue:
      "WhatsApp entrega a mensagem no webhook. Mensagens em sequência são AGRUPADAS antes de acionar o agente, e reentrega da mesma mensagem é descartada pelo id.",
    porQue:
      "Quem escreve no WhatsApp manda três linhas seguidas em vez de um parágrafo. Responder cada uma faria a Ana falar por cima da pessoa — e a Meta reentrega tudo que não recebe 200 a tempo.",
    caminhos: [
      { se: "é reentrega da mesma mensagem", entao: "descarta em silêncio" },
      { se: "áudio", entao: "transcreve antes (falha vira alerta em Falhas de transcrição)" },
      { se: "documento ou imagem", entao: "lê o conteúdo e guarda junto da mensagem" },
    ],
    arquivo: "app/api/webhook/whatsapp/route.ts",
  },
  {
    id: "silencio",
    titulo: "O agente está calado nesta conversa?",
    tipo: "portao",
    oQue:
      "Se um atendente assumiu a conversa, ou se o contato pediu para parar de receber mensagem, a Ana não responde — nem para dizer que não vai responder.",
    porQue:
      "Humano e agente respondendo na mesma thread é o defeito mais caro que existe aqui: a pessoa liga para quem assumiu, e enquanto isso a Ana responde outra coisa.",
    caminhos: [
      { se: "alguém assumiu o atendimento", entao: "a Ana se cala nesta conversa" },
      { se: "o contato pediu opt-out", entao: "silêncio definitivo neste número" },
      { se: "modo sombra ligado", entao: "ela pensa a resposta, mas ela vira rascunho e não sai" },
    ],
    arquivo: "lib/agent/ativacao.ts · lib/agent/opt-out.ts",
  },
  {
    id: "ficha",
    titulo: "A ficha se preenche sozinha",
    tipo: "leitura",
    oQue:
      "Antes de o modelo ver qualquer coisa, o texto da pessoa é lido por regra determinística: nacionalidade, onde está, situação, caminhos migratórios, sinal de prazo e classificação. Só preenche o que está vazio.",
    porQue:
      "Enquanto isso dependia de o modelo lembrar de chamar a tool, o painel ficava em “Coletando…” com a pessoa já tendo contado tudo. Número de documento é removido antes de gravar.",
    caminhos: [
      { se: "a pessoa cita multa, indeferimento ou notificação", entao: "liga o sinal de prazo (booleano, nunca uma data)" },
      { se: "já existe valor no campo", entao: "não sobrescreve — tool e mão humana valem mais" },
    ],
    arquivo: "lib/agent/lead-capture.ts · lib/agent/triagem.ts",
  },
  {
    id: "conhecido",
    titulo: "O que já se sabe entra no prompt",
    tipo: "leitura",
    oQue:
      "Nome, nacionalidade, onde está, objetivo, intenção declarada, situação documental, vínculo familiar e o prazo — inclusive a data limite JÁ confirmada por um humano.",
    porQue:
      "Quem chega com medo e tem que repetir de onde veio pela terceira vez desiste. Este bloco é o que faz a Ana confirmar em vez de reperguntar.",
    arquivo: "lib/agent/index.ts · buildDadosConhecidosBlock",
  },
  {
    id: "idioma",
    titulo: "Em que língua se responde",
    tipo: "leitura",
    oQue:
      "O idioma é detectado sobre a CONVERSA inteira, não sobre a última mensagem, e fica gravado no contato.",
    porQue:
      "No WhatsApp quase toda mensagem é curta demais para decidir sozinha: quem escreveu quatro mensagens em espanhol e mandou “ok” continua sendo atendido em espanhol.",
    arquivo: "lib/agent/idioma.ts",
  },
  {
    id: "portao",
    titulo: "Portão do encaminhamento",
    tipo: "portao",
    oQue:
      "Decide, em código, se a tool de transferir pode sequer ser oferecida ao modelo neste turno.",
    porQue:
      "O reflexo do modelo é despachar quem mandou “oi”. Mas qualquer sinal do domínio libera na hora — quem está com medo não se apresenta antes de pedir ajuda.",
    caminhos: [
      { se: "primeira mensagem, sem caso concreto", entao: "a tool fica bloqueada: acolher e perguntar o que a pessoa precisa" },
      { se: "prazo, irregularidade, refúgio, risco ou pedido de humano", entao: "libera imediatamente, mesmo sem saber o nome" },
      { se: "a Ana pediu autorização e a pessoa não disse sim", entao: "não encaminha e NÃO escreve que encaminhou" },
    ],
    arquivo: "lib/agent/transfer-gate.ts",
  },
  {
    id: "falta",
    titulo: "O que o time jurídico ainda não sabe",
    tipo: "leitura",
    oQue:
      "A ficha mínima (seis itens) vira uma instrução: descubra isto ao longo da conversa, UMA pergunta por vez.",
    porQue:
      "A mesma lista perguntada de enfiada vira interrogatório com quem já chega achando que está sendo fiscalizado. E nada disso segura um caso urgente.",
    caminhos: [
      { se: "ficha completa", entao: "para de perguntar cadastro: informa ou encaminha" },
      { se: "caso urgente com ficha pela metade", entao: "encaminha assim mesmo" },
    ],
    arquivo: "lib/domain/ficha.ts",
  },
  {
    id: "material",
    titulo: "Material oficial (RAG)",
    tipo: "leitura",
    oQue:
      "A pergunta do turno é convertida em busca no acervo e os trechos entram no prompt, com a fonte. Saudação e “ok” não disparam busca.",
    porQue:
      "O prompt manda responder só com base no material oficial. Ruído recuperado é pior que contexto nenhum — o modelo tenta usar. Sem acervo disponível, ela diz que não sabe e encaminha.",
    caminhos: [
      { se: "a pergunta cita lei, artigo ou decreto", entao: "busca também na legislação, não só na cartilha" },
      { se: "nada relevante", entao: "nenhum trecho entra — e a resposta segura é dizer que não tem a informação" },
    ],
    arquivo: "lib/agent/rag.ts",
  },
  {
    id: "regras",
    titulo: "As regras que nunca saem",
    tipo: "portao",
    oQue:
      "Seis regras invioláveis e a lista do acervo entram em TODO prompt, por último — inclusive por cima de um prompt cru gravado à mão.",
    porQue:
      "O RAG é condicional; a proibição de dar parecer não pode ser. Numa conversa real a Ana afirmou que o carimbo de entrada de alguém “quedó registrada de forma regular” — isso é parecer, e a pessoa decide a vida em cima.",
    arquivo: "lib/agent/material-oficial.ts",
  },
  {
    id: "modelo",
    titulo: "A Ana escreve",
    tipo: "modelo",
    oQue:
      "O modelo recebe o prompt montado e o histórico, e pode acionar cinco ferramentas: registrar dados, transferir para humano, buscar material, agendar follow-up e enviar opções em botão.",
    porQue:
      "Tudo antes desta etapa existe para que a escrita aconteça com o contexto certo e com as ferramentas certas disponíveis — e só elas.",
    caminhos: [
      { se: "o portão bloqueou", entao: "a ferramenta de transferir nem é oferecida" },
      { se: "o modelo falha", entao: "cai no fallback e o erro vira alerta em Falhas de LLM" },
    ],
    arquivo: "lib/agent/runner.ts · lib/agent/tools.ts",
  },
  {
    id: "antiloop",
    titulo: "Travou repetindo?",
    tipo: "rede",
    oQue:
      "Se a resposta nova é parecida demais com as anteriores, a conversa é destravada — pedindo o que falta ou entregando a uma pessoa do setor certo.",
    porQue:
      "Insistir na mesma mensagem é o pior desfecho possível: quem está com prazo correndo lê isso como não estar sendo ouvido.",
    caminhos: [
      { se: "a mesma resposta se repete", entao: "encaminha ao humano do setor daquela conversa" },
      { se: "fora do expediente", entao: "avisa quando alguém retorna, em vez de prometer resposta agora" },
    ],
    arquivo: "lib/agent/anti-loop.ts",
  },
  {
    id: "verificador",
    titulo: "Verificador de saída",
    tipo: "rede",
    oQue:
      "A última leitura antes de a mensagem sair. Corta frase que dá parecer sobre o caso e frase que anuncia um encaminhamento que não aconteceu. O corte fica registrado.",
    porQue:
      "O modelo escreve as duas coisas por gentileza, e as duas machucam: uma afirma o que só o advogado pode afirmar; a outra deixa alguém aflito esperando um telefonema que ninguém agendou.",
    caminhos: [
      { se: "cortou alguma frase", entao: "vira evento “parecer barrado” em Saúde da operação" },
    ],
    arquivo: "lib/agent/verificador-de-saida.ts",
  },
  {
    id: "saida",
    titulo: "O que fica depois",
    tipo: "saida",
    oQue:
      "A resposta é gravada e enviada; a conversa muda de status; o lead entra na fila, no CRM e nas métricas — ou é filtrado para auditoria.",
    porQue:
      "É aqui que o atendimento vira trabalho de gente: fila por prazo, card no CRM, contador de dias e, quando houver prazo, alguém precisando ligar hoje.",
    caminhos: [
      { se: "encaminhou", entao: "conversa marcada como transferida e o caso aparece na fila do time" },
      { se: "prazo sinalizado", entao: "vai para o bloco “a confirmar”, no topo da fila, sem contador até alguém ligar" },
      { se: "classificada como filtrada", entao: "sai da fila e vive em Conversas filtradas, para auditoria por amostragem" },
      { se: "nada disso", entao: "fica aguardando resposta; o follow-up automático cuida das 24h" },
    ],
    arquivo: "lib/agent/index.ts · lib/fila/ordenacao.ts",
  },
];

/** As classificações, com o que cada uma provoca no painel. Lidas do domínio. */
export const CLASSIFICACOES_DO_MAPA = CLASSIFICACOES.map((c) => ({
  chave: c,
  rotulo: CLASSIFICACAO_LABEL[c],
  ajuda: CLASSIFICACAO_AJUDA[c],
}));

/** O acervo que sustenta as respostas — a mesma lista que vai ao prompt. */
export const ACERVO_DO_MAPA = MATERIAIS;

/**
 * O QUE ELA FAZ QUANDO A PESSOA PERGUNTA X.
 *
 * Estes são os casos que NÃO vêm de configuração: são decisões em código, e por isso não
 * aparecem na tela de treinar. Quem lê o mapa precisa vê-las junto das configuráveis, ou
 * fica com a impressão de que tudo é editável — e tenta mudar na tela algo que só muda
 * numa versão nova.
 */
export interface CenarioFixo {
  pergunta: string;
  resposta: string;
  onde: string;
}

export const CENARIOS_FIXOS: CenarioFixo[] = [
  {
    pergunta: "“Quanto custa?” / “Qual o valor dos honorários?”",
    resposta:
      "Não diz preço, nem faixa, nem “costuma custar”. Explica que valores são conversa com o escritório e encaminha — pedido de valores libera o encaminhamento na hora.",
    onde: "material-oficial.ts (regra 4) · transfer-gate.ts",
  },
  {
    pergunta: "“Minha situação está regular?” / “Meu carimbo vale?”",
    resposta:
      "Não responde. Explica como a regra funciona em geral e diz que quem afirma sobre o caso dela é o advogado, depois de ver o documento. Se escrever assim mesmo, o verificador corta a frase antes de sair.",
    onde: "material-oficial.ts (regra 1) · verificador-de-saida.ts",
  },
  {
    pergunta: "“Recebi uma multa migratória”",
    resposta:
      "Liga o sinal de prazo e o tipo, escreve o objetivo na ficha, classifica como prazo correndo e encaminha. NÃO calcula data limite nem diz quantos dias sobram — a data quem apura é uma pessoa, olhando o documento.",
    onde: "classificacao.ts · lead-capture.ts",
  },
  {
    pergunta: "“Não tenho como pagar”",
    resposta:
      "Informa o caminho da Defensoria Pública da União. Isso não é perder um cliente: é a informação correta, e a conversa é classificada como DPU.",
    onde: "material-oficial.ts (regra 5) · classificacao.ts",
  },
  {
    pergunta: "“Quero falar com uma pessoa”",
    resposta: "Encaminha, sem discutir — pedido explícito de humano abre o portão na hora.",
    onde: "transfer-gate.ts (PEDIU_HUMANO)",
  },
  {
    pergunta: "“Oi” / “Bom dia” (primeira mensagem, sem caso)",
    resposta:
      "Acolhe, se apresenta em uma linha e pergunta o que a pessoa precisa. Não encaminha e não promete que “o time entra em contato” — ainda não há caso para encaminhar.",
    onde: "transfer-gate.ts",
  },
  {
    pergunta: "“Quero trabalhar no Brasil”",
    resposta:
      "É atendimento de imigração, não candidatura a emprego. Só “quero trabalhar NA Imigrar Brasil” vira RH — a rede de roteamento separa as duas coisas.",
    onde: "routing-net.ts",
  },
  {
    pergunta: "Manda um áudio em espanhol",
    resposta:
      "Transcreve, atende em espanhol (o idioma fica gravado no contato) e o áudio original continua guardado junto da transcrição, para quem for ligar conferir.",
    onde: "audio.ts · idioma.ts",
  },
  {
    pergunta: "Manda o CPF ou o número do passaporte",
    resposta:
      "Não repete o número na conversa nem grava na ficha: o campo guarda a frase da pessoa com o número removido.",
    onde: "material-oficial.ts (regra 6) · triagem.ts",
  },
  {
    pergunta: "Some por três semanas e volta",
    resposta:
      "Cumprimenta de novo e retoma de onde parou, confirmando o que já se sabe em vez de reperguntar. Depois de 24h em silêncio, o follow-up automático já teve a vez dele.",
    onde: "index.ts · followup.ts",
  },
];
