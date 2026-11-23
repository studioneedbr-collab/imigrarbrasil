// A ÚLTIMA REDE CONTRA A PERGUNTA REPETIDA.
//
// O prompt, o estado do turno e a leitura da ficha dizem ao modelo o que a pessoa já
// respondeu. Mesmo assim ele às vezes pergunta de novo — e é a falha que mais denuncia um
// robô: "Sou português, estou na Suíça" respondido com "você está no Brasil ou em
// Portugal?". Aqui a resposta pronta é lida antes de sair: se uma PERGUNTA dela é sobre
// um dos três campos da abertura que a ficha já tem, o turno é corrigido.
//
// Só os três da abertura, e só perguntados À PESSOA. "Qual a nacionalidade da sua
// esposa?", "Ela está no Líbano?", "Como se chama a empresa?" são perguntas legítimas —
// numa reunião familiar, são justamente as próximas. Uma rede que dispara nelas apaga a
// pergunta certa e gasta uma chamada a mais. Por isso cada padrão exige a segunda pessoa
// ("você", "tu", "you") ou a forma fixa da pergunta sobre ela.

import type { Lead } from "@/lib/domain/types";
import { campoDaAberturaConhecido, type CampoDaAbertura } from "@/lib/domain/ficha";

// O `\b` do JavaScript só conhece letra ASCII: "está\b" e "\bé" nunca casam. As bordas
// aqui são de letra Unicode.
const I = "(?<![\\p{L}\\p{N}])";
const F = "(?![\\p{L}\\p{N}])";
const re = (corpo: string) => new RegExp(`${I}(?:${corpo})${F}`, "iu");

const VOCE = "(?:voc[eê]|vc|tu|usted)";

const SOBRE: Record<CampoDaAbertura, RegExp> = {
  nome: re(
    [
      // "Qual é o seu nome completo?" é outra pergunta: pede o que falta do nome.
      "qual (?:[ée] )?(?:o )?seu nome(?! completo)",
      `como ${VOCE} se chama`,
      "c[óo]mo te llamas",
      "cu[áa]l es tu nombre",
      "what(?:'s| is) your name",
    ].join("|"),
  ),
  nacionalidade: re(
    [
      "(?:qual|cu[áa]l) (?:[ée] |es )?(?:a )?(?:sua|tu) nacionalidad(?:e)?",
      "(?:sua|tu) nacionalidad(?:e)? (?:[ée]|es)",
      `de onde ${VOCE} [ée]`,
      "de d[óo]nde eres",
      "where are you from",
      "what is your nationality",
      `${VOCE} [ée] brasileir[oa] ou`,
      "ou (?:tem|possui) outra nacionalidade",
    ].join("|"),
  ),
  onde: re(
    [
      `onde ${VOCE} (?:est[áa]|mora|vive|se encontra|reside)`,
      `onde (?:est[áa]|mora|vive) ${VOCE}`,
      `${VOCE} (?:est[áa]|mora|vive|reside|se encontra)(?: (?:aqui|agora|hoje|atualmente|ainda))? (?:n[oa] brasil|no exterior|fora do brasil|em portugal|n[oa] \\p{Lu}\\p{L}+|em \\p{Lu}\\p{L}+|neste momento|agora)`,
      "no brasil ou (?:no exterior|fora|em \\p{Lu}|n[oa] \\p{Lu})",
      "d[óo]nde (?:est[áa]s|vives|te encuentras)",
      "(?:est[áa]s|vives) en (?:brasil|\\p{Lu})",
      "where are you (?:now|currently|located|living|based)",
      "are you (?:currently |now |still )?(?:in|living in) (?:brazil|\\p{Lu})",
    ].join("|"),
  ),
};

/** Quanto tempo, desde quando: outra pergunta, mesmo que fale de onde ela está. */
const OUTRA_PERGUNTA = re("h[áa] quanto tempo|desde quando|quanto tempo|cu[áa]nto tiempo|how long|since when");

/** As frases da resposta que são pergunta. */
function perguntas(texto: string): string[] {
  return (texto.match(/[^.!?\n]*\?/g) ?? []).map((p) => p.trim()).filter(Boolean);
}

function camposPerguntados(pergunta: string): CampoDaAbertura[] {
  if (OUTRA_PERGUNTA.test(pergunta)) return [];
  return (Object.keys(SOBRE) as CampoDaAbertura[]).filter((c) => SOBRE[c].test(pergunta));
}

/** Quais campos JÁ conhecidos a resposta pergunta de novo. Vazio = nada a corrigir. */
export function perguntasRepetidas(resposta: string, lead: Lead | null): CampoDaAbertura[] {
  if (!lead) return [];
  const achados = new Set<CampoDaAbertura>();
  for (const q of perguntas(resposta)) {
    for (const c of camposPerguntados(q)) if (campoDaAberturaConhecido(lead, c)) achados.add(c);
  }
  return (Object.keys(SOBRE) as CampoDaAbertura[]).filter((c) => achados.has(c));
}

/**
 * A resposta sem as frases que perguntam de novo. É o recurso quando não dá para
 * reescrever: uma mensagem sem a pergunta é melhor do que perguntar o que ela já disse.
 * Se não sobrar nada, devolve a original — mensagem vazia não sai.
 */
export function semAsPerguntasRepetidas(resposta: string, lead: Lead | null): string {
  if (!lead) return resposta;
  const limpa = resposta
    .replace(/[^.!?\n]*\?/g, (q) =>
      camposPerguntados(q.trim()).some((c) => campoDaAberturaConhecido(lead, c)) ? "" : q,
    )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return limpa.length >= 2 ? limpa : resposta;
}

/** A instrução que acompanha a reescrita: o que ela já disse, com as palavras da ficha. */
export function instrucaoDeReescrita(campos: CampoDaAbertura[], lead: Lead): string {
  const valor = {
    nome: lead.contactName,
    nacionalidade: lead.clientType ?? lead.nacionalidade,
    onde: lead.region ?? lead.localizacao,
  };
  const rotulo = { nome: "o nome", nacionalidade: "a nacionalidade", onde: "onde ela está agora" };
  return `CORREÇÃO OBRIGATÓRIA: a resposta que você ia mandar perguntava ${campos
    .map((c) => `${rotulo[c]} (ela já disse: ${valor[c]})`)
    .join(" e ")}. Isso já está respondido. Escreva a resposta de novo SEM essa pergunta e sem pedir confirmação dela; use o que ela disse e siga para o próximo ponto que realmente falta.`;
}
