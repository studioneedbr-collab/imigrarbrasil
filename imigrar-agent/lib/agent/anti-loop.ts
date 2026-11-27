import { mensagemSemConteudo } from "@/lib/agent/triagem";
import type { LeadSetor } from "@/lib/domain/types";
import { mensagemDeDestravar, mensagemDeEncaminhamento } from "@/lib/agent/mensagens-fixas";

// Rede de segurança contra REPETIÇÃO. Quando a agente esbarra em algo que ela não consegue
// resolver — uma pergunta que o material oficial não cobre, um caso que ela não deveria
// estar conduzindo —, ela tende a reformular a MESMA pergunta indefinidamente: a pessoa
// responde, ela repergunta, e a conversa nunca sai do lugar.
//
// Aqui isso custa mais caro do que num atendimento comercial. Quem está com um prazo
// correndo, ou com medo, lê a terceira mensagem repetida como não estar sendo ouvido — e
// some. Por isso a repetição é detectada de forma determinística, sem depender do modelo
// perceber que travou.

/**
 * Palavras de ligação — não dizem nada sobre o ASSUNTO da frase, nos três idiomas em que
 * este atendimento acontece.
 *
 * Sem tirá-las, duas mensagens em inglês sobre assuntos diferentes ficavam "parecidas"
 * porque as duas tinham "you", "are", "the" e "with": foi assim que a rede acusou loop
 * entre a explicação do que a assessoria faz e a pergunta sobre onde a pessoa está, e
 * despejou um pedido de desculpas em português no meio de uma conversa em inglês.
 */
const PALAVRAS_VAZIAS = new Set([
  // pt
  "que", "com", "para", "por", "uma", "uns", "umas", "dos", "das", "nao", "sim", "mais",
  "seu", "sua", "meu", "minha", "voce", "vou", "the", "aqui", "isso", "esse", "essa",
  "pode", "posso", "ser", "esta", "estou", "tem", "sobre", "como", "mas", "aos",
  // es
  "que", "con", "para", "por", "una", "unos", "unas", "los", "las", "tu", "tus", "mi",
  "mis", "usted", "puedo", "puede", "esta", "estoy", "sobre", "como", "pero", "eso",
  // en
  "the", "and", "you", "your", "are", "was", "for", "with", "that", "this", "have", "has",
  "can", "will", "would", "what", "here", "there", "our", "from", "about", "they", "them",
  "just", "any", "not", "but", "its",
]);

// Tira emoji, acento, pontuação, caixa e as palavras de ligação — o que sobra é o ASSUNTO
// da frase. Assim "Me confirma a região? 😊" e "Me confirma a regiao, por favor." viram
// quase a mesma coisa, e duas frases diferentes que só compartilham glue, não.
function normalizar(texto: string): string[] {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !PALAVRAS_VAZIAS.has(w));
}

/**
 * Abaixo disto não dá para afirmar que duas frases dizem a mesma coisa: com quatro ou
 * cinco palavras de conteúdo, duas perguntas legítimas e diferentes já batem o limiar por
 * acidente. Acusar loop onde não há é pior do que deixar um passar — o preço do falso
 * positivo é interromper um atendimento que estava indo bem.
 */
const PALAVRAS_MINIMAS = 8;

// Os NÚMEROS de uma resposta (um prazo, uma data, um artigo de lei) são o que diferencia
// duas respostas parecidíssimas no texto e completamente diferentes no conteúdo. Se os
// números mudaram, houve avanço.
function numeros(texto: string): Set<string> {
  return new Set((texto.match(/\d[\d.,]*/g) ?? []).map((n) => n.replace(/[.,]/g, "")));
}

function mesmosNumeros(a: string, b: string): boolean {
  const A = numeros(a);
  const B = numeros(b);
  if (A.size !== B.size) return false;
  return Array.from(A).every((n) => B.has(n));
}

// Coeficiente de sobreposição: quanto da mensagem MENOR está contida na maior.
// Melhor que Jaccard aqui porque o modelo costuma repetir a mesma ideia esticando o
// texto ("...e o time te retorna em breve"); Jaccard puniria isso pelo tamanho e deixaria
// o loop passar.
export function similaridade(a: string, b: string): number {
  const A = new Set(normalizar(a));
  const B = new Set(normalizar(b));
  if (A.size === 0 || B.size === 0) return 0;
  // Frase curta demais para julgar — ver PALAVRAS_MINIMAS.
  if (Math.min(A.size, B.size) < PALAVRAS_MINIMAS) return 0;
  const comuns = Array.from(A).filter((w) => B.has(w)).length;
  return comuns / Math.min(A.size, B.size);
}

// Duas mensagens dizendo a mesma coisa. Reformular a mesma pergunta com outras palavras
// ainda reaproveita a maior parte dos termos (as três mensagens do caso da Vivi ficam em
// ~0.62); respostas de assuntos diferentes ficam bem abaixo. O falso positivo é contido
// pela checagem de números: se o valor ou a quantidade mudou, não é repetição.
const LIMITE = 0.6;

/**
 * A resposta nova repete alguma das últimas respostas da agente?
 * @param novaResposta resposta que ela está prestes a enviar
 * @param anteriores respostas anteriores dela, da mais recente para a mais antiga
 */
/** A MESMA frase, a menos de acento, emoji e pontuação. */
function mesmaFrase(a: string, b: string): boolean {
  const A = normalizar(a);
  const B = normalizar(b);
  return A.length > 0 && A.length === B.length && A.every((w, i) => w === B[i]);
}

export function ehRepeticao(novaResposta: string, anteriores: string[]): boolean {
  const nova = novaResposta.trim();
  if (nova.length < 25) return false; // "ok", "perfeito!" — repetir isso é normal.
  return anteriores.slice(0, 3).some((ant) => {
    if (!mesmosNumeros(nova, ant)) return false;
    // Duas portas: a frase REPETIDA (mesmas palavras na mesma ordem, valha o tamanho que
    // valer) e a frase REESCRITA (parecida o bastante, e aí o tamanho mínimo da
    // similaridade vale — ver PALAVRAS_MINIMAS).
    return mesmaFrase(nova, ant) || similaridade(nova, ant) >= LIMITE;
  });
}

// FIM DE CONVERSA, NÃO IMPASSE. Quando a pessoa agradece e se despede, repetir a mesma
// tranquilização ("está tudo encaminhado, fica tranquilo") é o desfecho CERTO, não um
// atendimento travado. Sem esta distinção, um "muito obrigado, só Deus sabe o que estou
// passando" virava transferência — a repetição existia, mas não havia nada travado para
// uma pessoa destravar. E aqui essa frase é comum: é assim que muita gente se despede.
const AGRADECIMENTO =
  /(brigad[oa]|agrade[çc]|valeu|\bvlw\b|\bobg\b|gratid[ãa]o|\bgrat[oa]\b|deus\s+(te\s+)?(aben[çc]oe|pague|ilumine)|abra[çc]os?|at[ée]\s+(mais|logo)|boa\s+sorte|fico\s+no\s+aguardo)/i;

// Um pedido ainda em aberto anula o agradecimento: "obrigado, mas e o meu protocolo?"
// continua sendo uma conversa que precisa avançar.
const PEDIDO_PENDENTE =
  /\?|\b(honor[áa]rio|valor(es)?|quanto|preciso|precisava|quero|queria|gostaria|manda|envia|me\s+passa|documento|prazo|protocolo|processo|advogad[oa])\b/i;

/** O cliente está só agradecendo/se despedindo, sem nada pendente? */
export function ehFechamentoCordial(texto: string): boolean {
  const t = (texto ?? "").trim();
  if (!t) return false;
  return AGRADECIMENTO.test(t) && !PEDIDO_PENDENTE.test(t);
}

// A redação das mensagens fixas (encaminhamento e destravar), no idioma da conversa,
// mora em lib/agent/mensagens-fixas.ts.

export interface ImpasseInput {
  /** Resposta que a agente está prestes a enviar. */
  novaResposta: string;
  /** Respostas anteriores dela, da mais recente para a mais antiga. */
  respostasAnteriores: string[];
  /** Última mensagem do cliente — é ela que diz se ainda há algo pendente. */
  ultimaMensagemDoCliente: string;
  /** Setor a que esta conversa pertence (candidato = "rh"). */
  setor: LeadSetor;
  /**
   * Quem escreveu a resposta. A rede valia só para o modelo enquanto o caminho
   * determinístico era um menu, que repete a tela de propósito quando não entende a
   * opção. Sem menu, repetição ali é o mesmo defeito que no modelo — e a rede cobre os dois.
   */
  fonte?: "deepseek" | "openai" | "fallback";
  /** A conversa já foi encaminhada neste turno? */
  jaTransferiu: boolean;
  /** O que ainda falta na qualificação, em rótulos legíveis. */
  faltamNoDossie?: string[];
  /** As mesmas pendências como pergunta ao cliente — é isto que vai na mensagem fixa. */
  perguntasAoCliente?: string[];
  /**
   * Quando o time humano volta ("na segunda-feira a partir das 8h"). Vazio/ausente =
   * estamos dentro do expediente e alguém pega agora.
   */
  proximoRetorno?: string;
  /** O idioma da conversa. As mensagens fixas saem nele (lib/agent/mensagens-fixas.ts). */
  idioma?: string | null;
}

export interface ImpasseHandoff {
  /**
   * "encaminhar" abre chamado para uma pessoa. "destravar" NÃO encaminha nada: a
   * qualificação ainda está pela metade, e o caminho é perguntar o que falta.
   */
  acao: "encaminhar" | "destravar";
  setor: LeadSetor;
  motivo: string;
  msg: string;
  priority: "normal" | "urgent";
}

/**
 * O atendimento travou a ponto de precisar de uma pessoa? Devolve para quem vai e o que
 * dizer — ou null quando não há impasse.
 *
 * Quando a qualificação ainda está pela metade, travar não é motivo para chamar ninguém:
 * o mais provável é que ela tenha se enrolado numa pergunta. A saída é pedir a que falta,
 * com as palavras dela, e seguir a conversa.
 */
const DESTRAVAR_JA_ENVIADO =
  /^(Para seguirmos com o seu atendimento|Para continuar con su atención|To move forward with your case|Pour avancer dans votre dossier)/;

export function avaliarImpasse(i: ImpasseInput): ImpasseHandoff | null {
  if (i.jaTransferiu) return null;
  if (ehFechamentoCordial(i.ultimaMensagemDoCliente)) return null;
  // QUEM NÃO DISSE NADA FOI A PESSOA. Esta rede existe para detectar que o AGENTE travou.
  // Diante de "oi", "sim", "ta", repetir um convite é o comportamento certo — e acusar
  // impasse aí produzia um "acho que me embolei aqui, desculpa" que não era verdade, com
  // um pedido de desculpas por algo que a agente não fez.
  if (mensagemSemConteudo(i.ultimaMensagemDoCliente)) return null;
  if (!ehRepeticao(i.novaResposta, i.respostasAnteriores)) return null;
  const setor = i.setor;

  const faltam = i.faltamNoDossie ?? [];
  // DESTRAVAR É UMA VEZ SÓ. A pergunta fixa sai da ficha, e a ficha às vezes não registra
  // o que a pessoa respondeu ("Dominicana Haitiano" não virou nacionalidade): o mesmo
  // "Para seguirmos… qual é a sua nacionalidade?" saiu quatro vezes seguidas em 22/11 e a
  // conversa morreu ali. Se já se tentou destravar e travou de novo, é hora de uma pessoa.
  const jaDestravou = (i.respostasAnteriores ?? []).some((r) => DESTRAVAR_JA_ENVIADO.test(r ?? ""));
  if (setor === "comercial" && faltam.length > 0 && !jaDestravou) {
    return {
      acao: "destravar",
      setor,
      motivo: `Atendimento travado: ainda falta saber ${faltam.join(", ")}. Nada encaminhado — a conversa continua aqui.`,
      // Texto fixo, que não passa pela persona: o escritório pediu tom formal, sem gíria
      // e sem pedido de desculpas ("acho que me embolei aqui" foi vetado nominalmente).
      msg: mensagemDeDestravar({ idioma: i.idioma, perguntaEmPortugues: i.perguntasAoCliente?.[0] }),
      priority: "normal",
    };
  }

  return {
    acao: "encaminhar",
    setor,
    motivo: `Atendimento travado (${setor}): a agente repetiu a mesma resposta sem conseguir avançar.`,
    msg: mensagemDeEncaminhamento({ setor, idioma: i.idioma, proximoRetorno: i.proximoRetorno, motivo: "impasse" }),
    // O funil de imigração ("comercial") trata impasse como urgente: quem está travado numa
    // conversa dessas costuma estar com prazo correndo ou com medo.
    priority: setor === "comercial" ? "urgent" : "normal",
  };
}
