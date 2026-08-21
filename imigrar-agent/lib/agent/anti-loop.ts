import type { LeadSetor } from "@/lib/domain/types";

// Rede de segurança contra REPETIÇÃO. Quando a Shayene esbarra em algo que ela não
// consegue resolver (ex.: evento cobrado por diária, que o motor de preço mensal não
// calcula), ela tende a reformular a MESMA pergunta indefinidamente — o cliente confirma,
// ela pergunta de novo, e a conversa nunca sai do lugar. Foi o que aconteceu com a
// proposta do evento no Aterro do Flamengo: três mensagens praticamente idênticas e
// nenhuma proposta enviada.
//
// Aqui a repetição é detectada de forma determinística, sem depender do modelo perceber
// que travou.

// Tira emoji, acento, pontuação e caixa — o que sobra é a ideia da frase. Assim
// "Me confirma a região? 😊" e "Me confirma a regiao, por favor." viram quase a mesma coisa.
function normalizar(texto: string): string[] {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

// Os NÚMEROS de uma resposta (quantidade de postos, valor, prazo) são o que diferencia
// "2 postos, R$ 9.747" de "4 postos, R$ 19.494" — duas respostas parecidíssimas no texto
// e completamente diferentes no conteúdo. Se os números mudaram, houve avanço.
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
// Melhor que Jaccard aqui porque a Shayene costuma repetir a mesma ideia esticando o
// texto ("...e te retorno em instantes"); Jaccard puniria isso pelo tamanho e deixaria
// o loop passar.
export function similaridade(a: string, b: string): number {
  const A = new Set(normalizar(a));
  const B = new Set(normalizar(b));
  if (A.size === 0 || B.size === 0) return 0;
  const comuns = Array.from(A).filter((w) => B.has(w)).length;
  return comuns / Math.min(A.size, B.size);
}

// Duas mensagens dizendo a mesma coisa. Reformular a mesma pergunta com outras palavras
// ainda reaproveita a maior parte dos termos (as três mensagens do caso da Vivi ficam em
// ~0.62); respostas de assuntos diferentes ficam bem abaixo. O falso positivo é contido
// pela checagem de números: se o valor ou a quantidade mudou, não é repetição.
const LIMITE = 0.6;

/**
 * A resposta nova repete alguma das últimas respostas da Shayene?
 * @param novaResposta resposta que ela está prestes a enviar
 * @param anteriores respostas anteriores dela, da mais recente para a mais antiga
 */
export function ehRepeticao(novaResposta: string, anteriores: string[]): boolean {
  const nova = novaResposta.trim();
  if (nova.length < 25) return false; // "ok", "perfeito!" — repetir isso é normal.
  return anteriores
    .slice(0, 3)
    .some((ant) => mesmosNumeros(nova, ant) && similaridade(nova, ant) >= LIMITE);
}

// FIM DE CONVERSA, NÃO IMPASSE. Quando o cliente agradece e se despede, repetir a mesma
// tranquilização ("está tudo encaminhado, fica tranquilo") é o desfecho CERTO, não um
// atendimento travado. Sem esta distinção, o "muito obrigado, só Deus sabe o que estou
// passando" do Wanderson (candidato a ASG) virou transferência — a repetição existia,
// mas não havia nada travado para uma pessoa destravar.
const AGRADECIMENTO =
  /(brigad[oa]|agrade[çc]|valeu|\bvlw\b|\bobg\b|gratid[ãa]o|\bgrat[oa]\b|deus\s+(te\s+)?(aben[çc]oe|pague|ilumine)|abra[çc]os?|at[ée]\s+(mais|logo)|boa\s+sorte|fico\s+no\s+aguardo)/i;

// Um pedido ainda em aberto anula o agradecimento: "obrigado, mas me manda o valor"
// continua sendo uma conversa que precisa avançar.
const PEDIDO_PENDENTE =
  /\?|\b(pre[çc]o|valor(es)?|or[çc]amento|proposta|quanto|cota[çc][ãa]o|contrato|preciso|precisava|quero|queria|gostaria|manda|envia|me\s+passa)\b/i;

/** O cliente está só agradecendo/se despedindo, sem nada pendente? */
export function ehFechamentoCordial(texto: string): boolean {
  const t = (texto ?? "").trim();
  if (!t) return false;
  return AGRADECIMENTO.test(t) && !PEDIDO_PENDENTE.test(t);
}

// PARA QUEM VAI O IMPASSE. Antes era sempre o comercial, com o script de "valores
// exatos" — foi assim que um candidato a vaga caiu na fila de vendas ouvindo que
// alguém ia fechar preço com ele. Quem destrava o atendimento é o setor DAQUELA
// conversa, e a mensagem tem que combinar com ele.
const QUEM: Record<LeadSetor, string> = {
  comercial: "uma pessoa do nosso comercial",
  rh: "uma pessoa do nosso RH",
  operacional: "uma pessoa do nosso time operacional",
  departamento_pessoal: "o nosso Departamento Pessoal",
  suprimentos: "uma pessoa do nosso time de suprimentos",
  diretoria: "uma pessoa da nossa diretoria",
};

// FORA DO EXPEDIENTE NINGUÉM PEGA. Domingo não tem comercial, e dizer "já chamei uma
// pessoa aqui" às 21h de sábado é prometer um retorno que não existe. Quando estamos
// fora do horário, a mensagem diz QUANDO o time volta, em vez de sugerir que alguém
// está olhando naquele instante.
function msgImpasse(setor: LeadSetor, proximoRetorno?: string): string {
  const quem = QUEM[setor] ?? QUEM.comercial;
  const abertura = "Deixa eu te dar um retorno certinho em vez de ficar repetindo a mesma coisa 😊 ";
  const fecho = " Continuo por aqui: se quiser adiantar algum detalhe, pode me mandar.";
  if (proximoRetorno) {
    return `${abertura}Já deixei o seu caso com ${quem}. Nosso atendimento é de segunda a sexta, das 8h às 18h, então eles te retornam ${proximoRetorno}.${fecho}`;
  }
  return `${abertura}Já chamei ${quem} para cuidar disso com você.${fecho}`;
}

export interface ImpasseInput {
  /** Resposta que a Shayene está prestes a enviar. */
  novaResposta: string;
  /** Respostas anteriores dela, da mais recente para a mais antiga. */
  respostasAnteriores: string[];
  /** Última mensagem do cliente — é ela que diz se ainda há algo pendente. */
  ultimaMensagemDoCliente: string;
  /** Setor a que esta conversa pertence (candidato = "rh"). */
  setor: LeadSetor;
  /** Quem escreveu a resposta. O engine repete menus de propósito. */
  fonte?: "deepseek" | "engine";
  /** A conversa já foi encaminhada neste turno? */
  jaTransferiu: boolean;
  /** Esta conversa já recebeu proposta em PDF? (só importa no comercial) */
  jaTemProposta?: boolean;
  /** O que ainda falta na triagem comercial, em rótulos legíveis. */
  faltamNoDossie?: string[];
  /**
   * Quando o time humano volta ("na segunda-feira a partir das 8h"). Vazio/ausente =
   * estamos dentro do expediente e alguém pega agora.
   */
  proximoRetorno?: string;
}

export interface ImpasseHandoff {
  /**
   * "encaminhar" abre chamado para uma pessoa. "destravar" NÃO encaminha nada: é uma
   * cotação em andamento, e o caminho é perguntar o que falta e mandar o PDF.
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
 * No COMERCIAL, travar não é motivo para chamar ninguém: a Shayene fecha a cotação e
 * manda a proposta em PDF sozinha. Se ela repetiu a mesma pergunta, o problema é que
 * falta dado na triagem — e a saída é perguntar o que falta, não passar o lead adiante.
 */
export function avaliarImpasse(i: ImpasseInput): ImpasseHandoff | null {
  if (i.fonte === "engine" || i.jaTransferiu) return null;
  if (ehFechamentoCordial(i.ultimaMensagemDoCliente)) return null;
  if (!ehRepeticao(i.novaResposta, i.respostasAnteriores)) return null;
  const setor = i.setor;

  const faltam = i.faltamNoDossie ?? [];
  if (setor === "comercial" && !i.jaTemProposta && faltam.length > 0) {
    return {
      acao: "destravar",
      setor,
      motivo: `Cotação travada: falta ${faltam.join(", ")}. Nada encaminhado — a proposta sai daqui.`,
      msg:
        `Acho que me embolei aqui, desculpa 😊 Para eu fechar o orçamento e te mandar a proposta em PDF, ` +
        `só me falta ${faltam.slice(0, 2).join(" e ")}.`,
      priority: "normal",
    };
  }

  return {
    acao: "encaminhar",
    setor,
    motivo: `Atendimento travado (${setor}): a Shayene repetiu a mesma resposta sem conseguir avançar.`,
    msg: msgImpasse(setor, i.proximoRetorno),
    // Só a fila comercial trata impasse como urgente: ali cada minuto parado é proposta
    // que não sai. Nos outros setores urgência é decisão de quem recebe.
    priority: setor === "comercial" ? "urgent" : "normal",
  };
}
