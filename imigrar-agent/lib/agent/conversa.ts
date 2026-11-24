// CONVERSAR, E NÃO SÓ PERGUNTAR.
//
// O escritório viu duas coisas nas conversas reais. A agente não dizia o próprio nome: o
// prompt informa que ela se chama Cláudia, mas nenhuma regra mandava DIZER, e a ordem de
// se apresentar só existia para quem mandava uma mensagem vaga. E ela ignorava o que a
// pessoa acabara de escrever para fazer a próxima pergunta da ficha — porque tudo o que o
// modelo lia por último falava de perguntas, e nada falava de responder.
//
// O que está aqui é determinístico e vale com qualquer modelo e com qualquer treino salvo.

import { detectarIdioma } from "@/lib/agent/idioma";

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** A resposta diz o nome da agente? ("Claudia" sem acento também vale.) */
export function dizONome(resposta: string, nome: string): boolean {
  const n = semAcento(nome.trim()).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Palavra inteira: "Ana" não está em "semana".
  return !n || new RegExp(`(?<![\\p{L}])${n}(?![\\p{L}])`, "u").test(semAcento(resposta));
}

const SAUDACAO =
  /^\s*(?:(?:ol[áa]|oi|bom dia|boa tarde|boa noite|hola|buen(?:os|as)? (?:d[íi]as?|tardes|noches)|hello|hi|good (?:morning|afternoon|evening)|bonjour|bonsoir)(?![\p{L}])[\s,!.]*)+/iu;
const NOME_DEPOIS_DA_SAUDACAO = /^\p{Lu}\p{L}+(?:\s\p{Lu}\p{L}+)?[!.,]\s*/u;

/** "Sou assistente de atendimento da…" — apresentou-se pelo cargo, sem o nome. */
const PELO_CARGO: [RegExp, (nome: string) => string][] = [
  // Não em "não sou assistente social": ali ela está dizendo o que NÃO é.
  [/(?<![Nn]ão )\b([Ss]ou) (?:a |o |uma |um )?(assistente)(?![\p{L}])/u, (n) => `$1 ${n}, $2`],
  [/([Aa]qui (?:é|fala)) (?:a |o )?(assistente)(?![\p{L}])/u, (n) => `$1 ${n}, $2`],
  [/(falando com) (?:a |o )?(assistente)(?![\p{L}])/u, (n) => `$1 ${n}, $2`],
  [/(?<![Nn]o )\b([Ss]oy) (?:la |el |una |un )?(asistente)(?![\p{L}])/u, (n) => `$1 ${n}, $2`],
  [/\b(I am|I'm|I’m) (?:the |an |a |your )?((?:virtual )?assistant)(?![\p{L}])/u, (n) => `$1 ${n}, $2`],
  [/([Jj]e suis) (?:l['’]|une |un )?(assistante?)(?![\p{L}])/u, (n) => `$1 ${n}, $2`],
];

const APRESENTACAO: Record<string, (nome: string, empresa: string) => string> = {
  pt: (n, e) => `Aqui é ${n}, do atendimento da ${e}.`,
  es: (n, e) => `Soy ${n}, del equipo de atención de ${e}.`,
  en: (n, e) => `This is ${n}, from the ${e} client service team.`,
  fr: (n, e) => `Ici ${n}, de l'accueil de ${e}.`,
};

/**
 * A PRIMEIRA MENSAGEM SEMPRE DIZ QUEM ESTÁ FALANDO. O modelo é instruído a se apresentar;
 * quando esquece, o nome entra aqui — na frase em que ele se apresentou pelo cargo, ou
 * logo depois da saudação. Em idioma sem frase pronta, fica o que o modelo escreveu: uma
 * linha em português no meio de uma resposta em árabe seria pior.
 */
export function garantirApresentacao(
  resposta: string,
  p: { nome: string; empresa: string; idioma?: string | null },
): string {
  const texto = resposta.trim();
  if (!texto || !p.nome.trim() || dizONome(texto, p.nome)) return resposta;
  for (const [re, troca] of PELO_CARGO) {
    if (re.test(texto)) return texto.replace(re, troca(p.nome.trim()));
  }
  const frase = APRESENTACAO[detectarIdioma(texto) ?? p.idioma ?? "pt"];
  if (!frase) return resposta;
  const apresentacao = frase(p.nome.trim(), p.empresa.trim() || "Imigrar Brasil");

  let saudacao = texto.match(SAUDACAO)?.[0] ?? "";
  let resto = texto.slice(saudacao.length);
  if (saudacao) {
    const nomeDela = resto.match(NOME_DEPOIS_DA_SAUDACAO)?.[0] ?? "";
    saudacao += nomeDela;
    resto = resto.slice(nomeDela.length);
  }
  const abre = saudacao.trim().replace(/[\s,.!]+$/, "");
  const corpo = resto.charAt(0).toUpperCase() + resto.slice(1);
  return [abre ? `${abre}! ${apresentacao}` : apresentacao, corpo].filter(Boolean).join(" ").trim();
}

/** A pessoa perguntou alguma coisa? Com "?" ou com a forma de pergunta sem o sinal. */
export function fezPergunta(fala: string): boolean {
  const t = (fala ?? "").trim();
  if (t.includes("?")) return true;
  // Sem o sinal, só frase curta e corrida: "quando cheguei no Brasil, fiquei na casa da
  // minha irmã" começa como pergunta e é relato.
  if (t.length > 80 || t.includes(",")) return false;
  return (
    /(?<![\p{L}])(?:queria|gostaria de|quero|preciso) saber(?![\p{L}])|(?<![\p{L}])(?:quisiera|quiero) saber|want to know/iu.test(t) ||
    /^(?:mas |e |então |pero |y |but |and )?(?:como|quanto|quando|quais|qual|onde|por ?que|será que|posso|pode|voc[eê]s|tem como|c[óo]mo|cu[áa]nto|cu[áa]ndo|cu[áa]l|d[óo]nde|puedo|ustedes|how|what|when|where|why|can|could|do you|is it|comment|combien|quand|est-ce)(?![\p{L}])/iu.test(t)
  );
}

/** Quantas mensagens seguidas da agente, até a mais recente, terminaram em pergunta. */
export function perguntasEmSequencia(respostas: string[]): number {
  let n = 0;
  for (let i = respostas.length - 1; i >= 0 && /\?[^\p{L}\p{N}]*$/u.test(respostas[i]); i--) n++;
  return n;
}

/**
 * COMO RESPONDER A ESTE TURNO — vem antes de qualquer coisa sobre perguntas, porque é a
 * ordem em que uma pessoa do time faria: ler, responder, e só então perguntar.
 */
export function comoResponder(p: {
  primeira: boolean;
  nome: string;
  empresa: string;
  perguntou: boolean;
  emSequencia: number;
}): string[] {
  return [
    p.primeira
      ? `Esta é a sua PRIMEIRA mensagem para ela: cumprimente e diga o seu nome — você é ${p.nome}, do atendimento da ${p.empresa}. Não se apresente só como "assistente". Depois responda ao que ela escreveu.`
      : "",
    "PRIMEIRO, RESPONDA AO QUE ELA ACABOU DE DIZER, com conteúdo: comente o ponto específico que ela trouxe. Se ela mudou de assunto, acompanhe o assunto dela. Se contou algo difícil, acolha em uma frase. Uma palavra solta (\"Entendi.\", \"Certo.\") seguida de pergunta NÃO é responder.",
    p.perguntou
      ? "HÁ UMA PERGUNTA na mensagem dela: responda antes de perguntar qualquer coisa. O que for informação geral, diga. O que depender da análise do caso ou de valores, diga em uma frase que quem responde isso é o time jurídico e por quê. Nunca troque a resposta por outra pergunta."
      : "",
    p.emSequencia >= 2
      ? `As suas últimas ${p.emSequencia} mensagens terminaram em pergunta, e a conversa está virando interrogatório. Nesta, NÃO termine com pergunta de ficha: comente algo útil sobre o que ela contou e deixe espaço para ela falar. Exceções: confirmar o encaminhamento ao time, ou descobrir se há prazo correndo ou risco.`
      : "",
    "A ordem da entrevista e a lista do que falta saber são pano de fundo, não roteiro: a pergunta, quando houver, nasce do que ela acabou de dizer.",
  ].filter(Boolean);
}
