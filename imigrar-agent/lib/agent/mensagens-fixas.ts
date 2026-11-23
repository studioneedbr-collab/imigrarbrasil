// AS MENSAGENS FIXAS, NO IDIOMA DA CONVERSA.
//
// Algumas mensagens não passam pelo modelo: a do impasse (a agente repetiu a si mesma) e
// a que avisa um encaminhamento quando o modelo caiu no meio do turno. Eram só em
// português — e numa conversa em espanhol a pessoa recebia, do nada, um parágrafo em
// outra língua, justamente no momento em que o atendimento já estava com problema.
//
// O tom é o que o escritório pediu: formal, sem gíria e sem pedido de desculpas.

import type { LeadSetor } from "@/lib/domain/types";

type Idioma = "pt" | "es" | "en" | "fr";

const QUEM: Record<Idioma, Partial<Record<LeadSetor, string>> & { padrao: string }> = {
  pt: {
    padrao: "um advogado do nosso time jurídico",
    rh: "quem cuida das vagas aqui",
    operacional: "uma pessoa do nosso time",
    departamento_pessoal: "o nosso administrativo",
    suprimentos: "uma pessoa do nosso time",
    diretoria: "uma pessoa da nossa diretoria",
  },
  es: { padrao: "un abogado de nuestro equipo jurídico", rh: "quien se encarga de las vacantes" },
  en: { padrao: "a lawyer from our legal team", rh: "the person in charge of job openings" },
  fr: { padrao: "un avocat de notre équipe juridique", rh: "la personne chargée des recrutements" },
};

function idiomaSuportado(idioma?: string | null): Idioma {
  return idioma === "es" || idioma === "en" || idioma === "fr" ? idioma : "pt";
}

/**
 * O aviso de que o caso foi passado a uma pessoa. `proximoRetorno` é a frase em português
 * do expediente ("na segunda-feira a partir das 8h"); fora do português vai o horário
 * fixo, que não depende de tradução.
 */
export function mensagemDeEncaminhamento(p: {
  setor: LeadSetor;
  idioma?: string | null;
  proximoRetorno?: string;
  /** Frase de abertura, quando há uma razão a dizer (ex.: o impasse). */
  motivo?: "impasse";
}): string {
  const i = idiomaSuportado(p.idioma);
  // Fora do português, os setores que não são o jurídico nem as vagas viram "uma pessoa
  // do nosso time" — "um advogado" para quem procurou o administrativo seria falso.
  const generico = { es: "una persona de nuestro equipo", en: "someone from our team", fr: "une personne de notre équipe" };
  const quem =
    QUEM[i][p.setor] ?? (i !== "pt" && p.setor !== "comercial" ? generico[i] : QUEM[i].padrao);
  if (i === "pt") {
    const abertura = p.motivo === "impasse" ? "Para não repetir a mesma informação, vou encaminhar o seu atendimento. " : "";
    const fecho = " Pode continuar escrevendo por aqui: eles leem tudo o que você mandar.";
    return p.proximoRetorno
      ? `${abertura}Já deixei o seu caso com ${quem}. O atendimento é de segunda a sexta, das 8h às 18h, então eles te retornam ${p.proximoRetorno}.${fecho}`
      : `${abertura}Já pedi para ${quem} falar com você sobre isso.${fecho}`;
  }
  const fora = Boolean(p.proximoRetorno);
  if (i === "es") {
    const abertura = p.motivo === "impasse" ? "Para no repetir la misma información, voy a derivar su atención. " : "";
    return `${abertura}Ya dejé su caso con ${quem}.${fora ? " Atendemos de lunes a viernes, de 8 a 18 h (hora de Brasilia), y le responderán en el próximo horario de atención." : ""} Puede seguir escribiendo por aquí: leen todo lo que usted envíe.`;
  }
  if (i === "en") {
    const abertura = p.motivo === "impasse" ? "So as not to repeat the same information, I am passing your case on. " : "";
    return `${abertura}I have passed your case to ${quem}.${fora ? " Our hours are Monday to Friday, 8 am to 6 pm (Brasília time), and they will get back to you during the next business hours." : ""} You can keep writing here: they read everything you send.`;
  }
  const abertura = p.motivo === "impasse" ? "Pour ne pas répéter la même information, je transmets votre dossier. " : "";
  return `${abertura}J'ai transmis votre dossier à ${quem}.${fora ? " Nous sommes ouverts du lundi au vendredi, de 8 h à 18 h (heure de Brasília), et ils vous répondront dès le prochain horaire d'ouverture." : ""} Vous pouvez continuer à écrire ici : ils lisent tout ce que vous envoyez.`;
}

/**
 * O pedido da informação que falta, quando a agente travou. Em português vai a pergunta
 * exata da ficha; nas outras línguas, a forma geral — a pergunta da ficha é escrita em
 * português, e mandá-la traduzida pela metade seria pior.
 */
export function mensagemDeDestravar(p: { idioma?: string | null; perguntaEmPortugues?: string }): string {
  const i = idiomaSuportado(p.idioma);
  if (i === "pt") {
    return `Para seguirmos com o seu atendimento, preciso de uma informação: ${p.perguntaEmPortugues ?? "pode me contar um pouco mais sobre o seu caso"}?`;
  }
  if (i === "es") return "Para continuar con su atención, ¿podría contarme un poco más sobre su situación y qué necesita resolver en Brasil?";
  if (i === "en") return "To move forward with your case, could you tell me a little more about your situation and what you need to resolve in Brazil?";
  return "Pour avancer dans votre dossier, pourriez-vous m'en dire un peu plus sur votre situation et sur ce que vous devez régler au Brésil ?";
}
