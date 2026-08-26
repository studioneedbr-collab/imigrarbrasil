// SINAL DE PRAZO E CLASSIFICAÇÃO — a leitura determinística que alimenta a fila.
//
// Duas regras organizam este arquivo, e as duas existem porque o erro oposto custa caro.
//
// REGRA 1 — A IA SINALIZA, ELA NÃO DATA.
// `detectarSinalDePrazo` devolve um booleano e, quando dá, o tipo. NUNCA uma data.
// Quem recebeu multa raramente sabe a data da notificação de cabeça: confunde com o dia
// em que pegou o papel, com o dia em que abriu a carta, ou manda uma foto ilegível.
// Uma data inferida daí vira contador regressivo na tela, e contador regressivo errado é
// como se perde um prazo. A data quem pergunta e confirma é gente.
//
// REGRA 2 — A HEURÍSTICA SÓ ESQUENTA, NUNCA ESFRIA.
// `classificarAutomatico` pode subir um lead para QUENTE_PRAZO ou QUENTE_JUDICIAL, e
// pode reconhecer EXTERIOR_VISTO e MORNO_ADMINISTRATIVO. Ela NUNCA devolve CURIOSO, DPU
// ou FORA_ESCOPO — as três classificações que tiram a conversa da frente do time.
// Filtrar por regex é como se descarta silenciosamente quem precisava de ajuda, e o
// prejuízo não aparece em métrica nenhuma até tarde demais. Descartar é decisão do
// modelo, explicitamente, pela tool — e mesmo assim revisável na aba de filtradas.

import type { Classificacao, Lead, PrazoTipo } from "@/lib/domain/types";

export interface SinalDePrazo {
  /** Há prazo processual correndo? É isto, e só isto, que a IA afirma. */
  temPrazo: boolean;
  tipo: PrazoTipo | null;
  /** A frase da pessoa que levantou o sinal — vai para a tela de confirmação. */
  trecho?: string;
}

// Os quatro tipos, em ordem de especificidade. `outro` fecha a lista porque "recebi uma
// notificação e tenho 30 dias" é prazo mesmo sem dizer de quê.
const SINAIS: Array<[PrazoTipo, RegExp]> = [
  [
    "multa",
    /\bmulta(?:d[oa]|ram|s)?\b|\bmulta migrat[óo]ria\b|\bfui multad|\bme multaron\b|\bmulta de (?:R\$|reais)|\bfine\b|\bfined\b/i,
  ],
  [
    "indeferimento",
    /\bindeferid|\bindeferimento|\bneg(?:ad[oa]|aram|ou)\b[^.]{0,30}\b(ref[úu]gio|pedido|solicita[çc][ãa]o|visto|resid[êe]ncia)\b|\bconare\b[^.]{0,25}\b(neg|indefer)|\brecusad[oa]\b|\bdenegad|\bdenied\b|\brejected\b/i,
  ],
  [
    "notificacao_saida",
    /\bnotifica[çc][ãa]o de sa[íi]da\b|\bnotificad[oa] (?:para|a) sair\b|\bprazo para (?:sair|deixar) o pa[íi]s\b|\bsair do pa[íi]s em\b|\bdeporta[çc][ãa]o\b|\bdeportad|\bexpuls[ãa]o\b|\bretirada compuls[óo]ria\b|\bnotice to leave\b|\bordered to leave\b|\bsalir del pa[íi]s\b/i,
  ],
  [
    "outro",
    /\b(?:prazo|recurso|intima[çc][ãa]o|notifica[çc][ãa]o|exig[êe]ncia|cumprimento de exig[êe]ncia)\b[^.]{0,40}\b(?:de|em|at[ée]|dentro de|vence|venceu|vencendo|correndo|acabando|termina|expira)\b|\btenho (?:at[ée] )?\d{1,3} dias\b|\bvence (?:hoje|amanh[ãa]|essa semana|em \d{1,3} dias)\b|\bprazo (?:est[áa] )?(?:correndo|vencendo|acabando)\b|\bdeadline\b/i,
  ],
];

export function detectarSinalDePrazo(texto: string): SinalDePrazo {
  const t = texto ?? "";
  for (const [tipo, re] of SINAIS) {
    const m = t.match(re);
    if (m) {
      // A frase inteira em que o sinal apareceu — é o que a pessoa vai ouvir de volta ao
      // telefone quando alguém ligar para confirmar a data.
      const frase = t
        .split(/(?<=[.!?])\s+|\n+|\s{2,}/)
        .find((f) => re.test(f))
        ?.trim();
      return {
        temPrazo: true,
        tipo,
        trecho: frase && frase.length > 200 ? `${frase.slice(0, 197)}…` : frase,
      };
    }
  }
  return { temPrazo: false, tipo: null };
}

// Caso que exige ação judicial: já há processo, decisão a recorrer, ou a pessoa está
// detida. Não confundir com "quero falar com um advogado", que é todo mundo.
const JUDICIAL =
  /\bprocesso judicial\b|\ba[çc][ãa]o judicial\b|\bna justi[çc]a\b|\bjuiz\b|\bju[íi]za\b|\bliminar\b|\bmandado de seguran[çc]a\b|\bhabeas corpus\b|\bintimad[oa] pel[oa] (?:ju[íi]z|vara|tribunal)\b|\bvara federal\b|\bpol[íi]cia federal (?:me )?(?:intimou|notificou|autuou)\b|\bdetid[oa]\b|\bpres[oa]\b|\bcustod[ií]a\b|\brecurso (?:administrativo|judicial)\b/i;

/**
 * O que dá para afirmar sem perguntar de novo.
 *
 * Devolve `null` quando não há sinal suficiente — e null é um bom resultado: lead sem
 * classificação continua na fila, no fim do bloco 3, à vista de todo mundo. O que não
 * pode acontecer é ele sumir.
 */
export function classificarAutomatico(
  lead: Pick<Lead, "localizacao" | "objetivo" | "modalidadeProvavel" | "situacaoDocumental" | "servicesInterested" | "classificacao"> | null,
  texto: string,
): Classificacao | null {
  // Já filtrado por decisão explícita (do modelo ou de um humano)? A heurística não
  // desfaz — desfazer é resgatar, e resgatar é ato de gente, na aba de filtradas.
  if (lead?.classificacao === "DPU" || lead?.classificacao === "CURIOSO" || lead?.classificacao === "FORA_ESCOPO") {
    return null;
  }

  if (detectarSinalDePrazo(texto).temPrazo) return "QUENTE_PRAZO";
  if (JUDICIAL.test(texto)) return "QUENTE_JUDICIAL";
  if (lead?.localizacao === "exterior") return "EXTERIOR_VISTO";

  // Caso concreto: a pessoa disse o que quer OU contou a situação documental dela.
  const temCaso =
    !!lead?.objetivo || !!lead?.modalidadeProvavel || !!lead?.situacaoDocumental ||
    !!lead?.servicesInterested?.length;
  return temCaso ? "MORNO_ADMINISTRATIVO" : null;
}

/**
 * ONDE A PESSOA ESTÁ, no formato que a fila usa.
 *
 * `region` guarda a frase legível ("Brasil — Boa Vista", "Exterior — Venezuela"); a fila
 * e as métricas precisam do par estruturado. A conversão mora aqui para não haver duas
 * leituras diferentes da mesma string espalhadas pelo código.
 */
export function localizacaoDeRegion(region: string | null | undefined): {
  localizacao: Lead["localizacao"];
  paisExterior: string | null;
} {
  const r = (region ?? "").trim();
  if (!r) return { localizacao: null, paisExterior: null };
  if (/^exterior/i.test(r)) {
    const pais = r.split("—")[1]?.trim() || null;
    return { localizacao: "exterior", paisExterior: pais };
  }
  if (/^brasil/i.test(r)) return { localizacao: "brasil", paisExterior: null };
  return { localizacao: null, paisExterior: null };
}

/** Rótulo curto do tipo de prazo. Duplica o de lib/domain/rotulos.ts de propósito: aquele
 *  é da interface e este roda no servidor, dentro do atendimento. */
const TIPO_EM_TEXTO: Record<NonNullable<Lead["prazoTipo"]>, string> = {
  multa: "multa migratória",
  indeferimento: "indeferimento",
  notificacao_saida: "notificação de saída",
  outro: "prazo em curso",
};

/**
 * O RESUMO DE DUAS LINHAS que a fila mostra.
 *
 * O modelo escreve o dele pela tool; este é o que aparece enquanto ele não escreveu — e
 * é melhor que "Lead sem resumo", porque quem abre a fila às 8h precisa decidir o que
 * pegar sem abrir dez conversas.
 */
export function resumoAutomatico(lead: Partial<Lead>): string {
  const quem = [lead.contactName, lead.nacionalidade ?? lead.clientType]
    .filter(Boolean)
    .join(", ");
  const onde =
    lead.localizacao === "exterior"
      ? `no exterior${lead.paisExterior ? ` (${lead.paisExterior})` : ""}`
      : lead.localizacao === "brasil"
        ? "no Brasil"
        : lead.region ?? null;
  const quer =
    lead.objetivo ??
    lead.modalidadeProvavel ??
    (lead.servicesInterested?.length ? lead.servicesInterested.join(", ") : null);

  const linha1 = [quem || "Contato sem nome", onde].filter(Boolean).join(" · ");
  // O prazo vem antes de tudo na segunda linha. Quem abre a fila de manhã precisa ler
  // "multa migratória" antes de qualquer outra coisa sobre esta pessoa.
  const prazo = lead.temPrazoCorrendo
    ? `Prazo sinalizado${lead.prazoTipo ? `: ${TIPO_EM_TEXTO[lead.prazoTipo]}` : ""} — a confirmar.`
    : null;
  const linha2 =
    prazo ??
    lead.situacaoDocumental ??
    lead.contractDuration ??
    (quer ? `Procura: ${quer}` : "Ainda sem caso descrito.");
  return `${linha1}\n${linha2}`;
}
