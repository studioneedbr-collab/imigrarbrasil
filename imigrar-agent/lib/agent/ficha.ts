// A FICHA DA TRIAGEM — o que o advogado lê antes de pegar o caso.
//
// O agente v1 entregava um lead com quatro campos e a conversa inteira para ler. A v2 é
// triagem: o trabalho dela é chegar ao advogado com o caso já lido — como a pessoa entrou,
// que documento ela tem, se há vínculo no Brasil, se há prazo correndo — e com uma
// CLASSIFICAÇÃO que diz quem precisa ser atendido hoje.
//
// A ficha vai para o campo `notes` do lead, que o painel já mostra como "Notas" e que um
// atendente pode editar. Por isso ela vive dentro de um bloco delimitado: o que a pessoa
// do time escreveu à mão fica fora dele e nunca é sobrescrito.

import { modalidadeProvavel, type CasoTriagem } from "@/lib/agent/triagem";

/**
 * A classificação decide a fila. É a única informação da ficha que muda o que acontece
 * com a pessoa hoje, então é a primeira linha do bloco.
 */
export type Classificacao =
  | "QUENTE_PRAZO"
  | "QUENTE_JUDICIAL"
  | "MORNO_ADMINISTRATIVO"
  | "EXTERIOR_VISTO"
  | "DPU"
  | "CURIOSO"
  | "FORA_ESCOPO";

export const CLASSIFICACAO_LABEL: Record<Classificacao, string> = {
  QUENTE_PRAZO: "Prazo correndo — atender hoje",
  QUENTE_JUDICIAL: "Caso que precisa de advogado",
  MORNO_ADMINISTRATIVO: "Via administrativa, sem urgência",
  EXTERIOR_VISTO: "No exterior — visto",
  DPU: "Encaminhado à Defensoria Pública da União",
  CURIOSO: "Só queria informação",
  FORA_ESCOPO: "Fora do escopo",
};

export interface SinaisDaConversa {
  /** A pessoa disse que está fora do escopo (outro país, outra área do direito)? */
  foraDoEscopo?: boolean;
  /** Houve risco à pessoa? */
  risco?: boolean;
  /** Quantas perguntas seguidas ficaram sem resposta útil. */
  turnosSemNovidade?: number;
}

/**
 * A ordem aqui É a regra de negócio, e ela vai do mais grave para o mais frio.
 *
 * FORA_ESCOPO vem antes de tudo porque não adianta classificar urgência de um caso que a
 * casa não atende. DPU vem logo depois: quem não tem como pagar precisa do endereço certo
 * antes de qualquer triagem, e insistir com essa pessoa é o oposto do serviço.
 */
export function classificar(caso: CasoTriagem, sinais: SinaisDaConversa = {}): Classificacao {
  if (sinais.foraDoEscopo) return "FORA_ESCOPO";
  if (caso.semCondicoes) return "DPU";

  // Prazo processual correndo. Aqui o custo do erro é a pessoa perder o prazo, então
  // qualquer sinal basta — inclusive ela apenas DIZER que tem um prazo.
  if (caso.decisaoNegativa || caso.prazo === "immediate") return "QUENTE_PRAZO";

  // Casos que não têm via administrativa simples: falta documento de origem, entrada sem
  // registro, menor sem os pais, recusa da PF, risco à pessoa.
  if (
    sinais.risco ||
    caso.entrada === "sem_controle" ||
    caso.menorEnvolvido ||
    caso.recusaPf ||
    caso.passaporte === "vencido" ||
    caso.passaporte === "nao_tem" ||
    caso.certidaoNascimento === false ||
    caso.antecedentes === false
  ) {
    return "QUENTE_JUDICIAL";
  }

  if (caso.ondeEsta?.startsWith("Exterior")) return "EXTERIOR_VISTO";

  // Não respondeu duas perguntas seguidas e não contou caso nenhum: é informação, não caso.
  const contou =
    caso.nacionalidade || caso.ondeEsta || caso.entrada || caso.vinculoFamiliar ||
    caso.documentosBrasileiros.length > 0 || caso.objetivo?.length;
  if (!contou || (sinais.turnosSemNovidade ?? 0) >= 2) return "CURIOSO";

  return "MORNO_ADMINISTRATIVO";
}

const ABRE = "─── FICHA DA TRIAGEM (gerada pelo atendimento) ───";
const FECHA = "─── fim da ficha ───";

const sim = (v?: boolean) => (v === undefined ? "não perguntado" : v ? "sim" : "NÃO TEM");

/**
 * NÚMERO DE DOCUMENTO NÃO ENTRA NA FICHA.
 *
 * A ficha cita a pessoa com as palavras dela — e as palavras dela às vezes trazem o CPF
 * que ela mandou por conta própria. A regra do atendimento é não transcrever esse número,
 * e ela não pode valer só na conversa: o campo Notas é lido, exportado e fica gravado.
 */
export function semNumeroDeDocumento(texto: string): string {
  return (texto ?? "").replace(/\d[\d.\-/\s]{5,}\d/g, "[número omitido]");
}

/** O bloco que o advogado lê. Campo não descoberto aparece como tal — em triagem, a
 *  diferença entre "não tem" e "não perguntei" muda a conduta. */
export function montarFicha(
  caso: CasoTriagem,
  classificacao: Classificacao,
  extras: { idioma?: string | null; resumo?: string } = {},
): string {
  const linhas = [
    ABRE,
    `Classificação: ${classificacao} — ${CLASSIFICACAO_LABEL[classificacao]}`,
    `Idioma: ${extras.idioma ?? "não identificado"}`,
    `Nacionalidade: ${caso.nacionalidade ?? "não informada"}`,
    `Localização: ${caso.ondeEsta ?? "não informada"}`,
    `Entrada no Brasil: ${
      caso.entrada === "sem_controle"
        ? "SEM passar pelo controle migratório"
        : caso.entrada === "com_controle"
          ? "com controle migratório"
          : "não informada"
    }${caso.entradaRelato ? ` — "${semNumeroDeDocumento(caso.entradaRelato)}"` : ""}`,
    `Passaporte: ${
      caso.passaporte === "valido" ? "válido"
      : caso.passaporte === "vencido" ? "VENCIDO"
      : caso.passaporte === "nao_tem" ? "NÃO TEM"
      : "não perguntado"
    }`,
    `Certidão de nascimento: ${sim(caso.certidaoNascimento)}`,
    `Antecedentes criminais do país de origem: ${sim(caso.antecedentes)}`,
    `Vínculo familiar no Brasil: ${caso.vinculoFamiliar ?? "não informado"}`,
    `Documentos brasileiros: ${
      caso.documentosBrasileiros.length ? caso.documentosBrasileiros.join(", ") : "nenhum informado"
    }`,
    `Decisão negativa / prazo: ${caso.decisaoNegativa ?? "nenhuma informada"}`,
    `Objetivo: ${caso.objetivo?.length ? caso.objetivo.join(", ") : "não informado"}`,
    `Modalidade provável: ${modalidadeProvavel(caso.nacionalidade) ?? "a definir"}`,
  ];
  if (caso.recusaPf) linhas.push("Atenção: a Polícia Federal recusou documento ou negou isenção.");
  if (caso.menorEnvolvido) linhas.push("Atenção: há criança ou adolescente no caso.");
  if (caso.semCondicoes) linhas.push("A pessoa disse não ter condições de pagar — encaminhada à DPU.");
  if (extras.resumo) linhas.push(`Resumo: ${semNumeroDeDocumento(extras.resumo)}`);
  linhas.push(FECHA);
  return linhas.join("\n");
}

/**
 * Escreve a ficha em `notes` SEM APAGAR o que uma pessoa do time escreveu ali.
 *
 * O campo é editável no painel. Se a ficha simplesmente sobrescrevesse, a anotação que o
 * advogado deixou depois de falar com a pessoa sumiria no turno seguinte da conversa — e
 * ninguém confiaria mais no campo.
 */
export function aplicarFicha(notasAtuais: string | null | undefined, ficha: string): string {
  const atual = notasAtuais ?? "";
  const i = atual.indexOf(ABRE);
  if (i < 0) return atual.trim() ? `${atual.trim()}\n\n${ficha}` : ficha;
  const fim = atual.indexOf(FECHA, i);
  const antes = atual.slice(0, i).trimEnd();
  const depois = fim >= 0 ? atual.slice(fim + FECHA.length).trimStart() : "";
  return [antes, ficha, depois].filter(Boolean).join("\n\n");
}
