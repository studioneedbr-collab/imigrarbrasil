import type { ServiceSchedule } from "@/lib/domain/types";

/**
 * DIMENSIONAMENTO DE POSTO POR COBERTURA.
 *
 * "1 posto 24h" NÃO é uma pessoa: é uma posição que precisa ficar coberta 24 horas por dia,
 * e na escala 12x36 isso exige QUATRO funcionários — dois no turno do dia e dois no da
 * noite, estes com adicional noturno. É o termo do setor, e o Eduardo ditou a regra em
 * 17/08/2026, depois de o Pedro pedir cotação de "um posto de 24h" e a Shayene entender
 * dois porteiros, sem adicional noturno nenhum:
 *
 *   "1 Posto 24h significa 4 funcionários na escala 12x36 onde dois recebem adicional
 *    noturno. 2 postos 24h significa 8 funcionários na escala 12x36 onde 4 recebem
 *    adicional noturno."
 *
 * Um posto 24h cotado como duas pessoas sai pela METADE da mão de obra necessária e ainda
 * sem o adicional da noite. Por isso a regra é código, e não instrução de prompt: a
 * Shayene informa quantos POSTOS e qual a cobertura, e quem multiplica é o motor — a mesma
 * disciplina que já vale para o preço.
 *
 * Só a 12x36 está aqui. Posto 24h em três turnos de 8h existe no mercado, mas o Eduardo
 * validou só esta regra, e dimensionamento inventado foi justamente o erro de origem.
 */

export type Cobertura = "24h" | "12h_diurno" | "12h_noturno";

/** Escala em que a tabela de dimensionamento vale. */
export const ESCALA_DIMENSIONAVEL: ServiceSchedule = "12x36";

export interface Turno {
  /** Vira nome de aba na planilha de composição e descrição na proposta. */
  rotulo: string;
  funcionariosPorPosto: number;
  /** Este turno cruza a janela legal de 22h às 5h: adicional noturno na composição. */
  noturno: boolean;
}

export interface Dimensionamento {
  cobertura: Cobertura;
  /** Como o posto é chamado na conversa e no PDF. */
  rotulo: string;
  funcionariosPorPosto: number;
  turnos: Turno[];
}

const DIURNO = { rotulo: "diurno", funcionariosPorPosto: 2, noturno: false } as const;
const NOTURNO = { rotulo: "noturno", funcionariosPorPosto: 2, noturno: true } as const;

export const COBERTURAS: Record<Cobertura, Dimensionamento> = {
  // 12h trabalhadas por 36h de folga: cada turno de 12h precisa de duas pessoas se
  // alternando para cobrir todos os dias. Dois turnos × duas pessoas = quatro.
  "24h": { cobertura: "24h", rotulo: "Posto 24h", funcionariosPorPosto: 4, turnos: [DIURNO, NOTURNO] },
  "12h_diurno": { cobertura: "12h_diurno", rotulo: "Posto 12h diurno", funcionariosPorPosto: 2, turnos: [DIURNO] },
  "12h_noturno": { cobertura: "12h_noturno", rotulo: "Posto 12h noturno", funcionariosPorPosto: 2, turnos: [NOTURNO] },
};

export function dimensionar(cobertura: Cobertura): Dimensionamento {
  return COBERTURAS[cobertura];
}

/** A cobertura só é dimensionável na 12x36 — nas outras escalas quem dimensiona é humano. */
export function coberturaDimensionavel(schedule: ServiceSchedule): boolean {
  return schedule === ESCALA_DIMENSIONAVEL;
}

/** Frase pronta para a Shayene descrever o posto sem fazer conta de cabeça. */
export function descreverPosto(d: Dimensionamento, postos = 1): string {
  const funcionarios = d.funcionariosPorPosto * postos;
  const noturnos = d.turnos
    .filter((t) => t.noturno)
    .reduce((s, t) => s + t.funcionariosPorPosto * postos, 0);
  const posto = postos === 1 ? d.rotulo : `${postos} ${d.rotulo.toLowerCase()}s`;
  const comNoturno = noturnos > 0 ? `, ${noturnos} com adicional noturno` : "";
  return `${posto}: ${funcionarios} funcionário${funcionarios > 1 ? "s" : ""} na escala 12x36${comNoturno}`;
}

// ────────────────────────────── DETECÇÃO NO TEXTO ──────────────────────────────

/**
 * "24h" aparece na conversa falando de PRAZO muito mais do que de posto — a própria
 * Shayene promete reposição em 24h e proposta válida por 24 horas. Sem este filtro, quem
 * perguntasse o prazo de resposta receberia cotação de posto ininterrupto.
 */
const PRAZO_ANTES =
  /\b(?:em\s+at[ée]|at[ée]|dentro\s+de|prazo\s+de|v[áa]lid[ao]s?\s+por|validade\s+de|resposta\s+em|retorno\s+em|responder?\s+em|reposi[çc][ãa]o\s+em|substitui[çc][ãa]o\s+em|envio\s+em|entrega\s+em)\s*(?:de\s+)?$/i;

const VINTE_E_QUATRO =
  /(?:\b24\s*(?:h(?:oras|rs|s)?|hs)\b|\bvinte\s+e\s+quatro\s+horas\b|\b24\s*[x\/]\s*7\b|\b24\s+por\s+7\b|\bininterrupt\w+|\bfull\s*time\b|\bdia\s+e\s+noite\b)/gi;

const NOTURNO_EXPLICITO =
  /(?:\b(?:posto|porteiro|porteira|turno|per[íi]odo|hor[áa]rio|escala|vigia|servi[çc]o)\s+(?:da\s+)?noturn\w+|\bturno\s+da\s+noite\b|\b(?:s[óo]|apenas|somente)\s+(?:[àa]\s+)?noite\b|\bmadrugada\b)/i;

const DIURNO_EXPLICITO =
  /(?:\b(?:posto|porteiro|porteira|turno|per[íi]odo|hor[áa]rio|escala|vigia|servi[çc]o)\s+(?:do\s+)?diurn\w+|\bturno\s+do\s+dia\b|\b(?:s[óo]|apenas|somente)\s+(?:de|durante\s+o)\s+dia\b)/i;

/** "das 19h às 7h", "de 7 às 19", "19:00 as 07:00". */
const FAIXA_HORARIA =
  /\b(?:d[aeo]s?\s+)?([01]?\d|2[0-3])\s*(?:h(?:oras)?|:00|:\s*00)?\s*(?:[àa]s?|até|a|-|–|\/)\s*([01]?\d|2[0-3])\s*(?:h(?:oras)?|:00|:\s*00)?\b/i;

/**
 * Lê a cobertura que o cliente descreveu. É REDE DE SEGURANÇA e sugestão — nunca fonte
 * silenciosa de preço: quem decide cotar com cobertura é a Shayene (ou o painel), e o
 * valor sempre sai do motor com a cobertura explícita.
 */
export function detectarCobertura(texto: string): Cobertura | undefined {
  if (!texto) return undefined;
  const t = texto.toLowerCase();

  // Posto ininterrupto: procura todas as ocorrências e descarta as que falam de prazo.
  VINTE_E_QUATRO.lastIndex = 0;
  for (let m = VINTE_E_QUATRO.exec(t); m; m = VINTE_E_QUATRO.exec(t)) {
    if (!PRAZO_ANTES.test(t.slice(0, m.index))) return "24h";
  }

  const faixa = t.match(FAIXA_HORARIA);
  if (faixa) {
    const inicio = Number(faixa[1]);
    const fim = Number(faixa[2]);
    const horas = (fim - inicio + 24) % 24;
    if (horas === 0) return "24h";
    // Turno de 12h (aceita 11 e 13 porque o cliente arredonda: "das 7 às 19", "18 às 6").
    if (horas >= 11 && horas <= 13) return cruzaNoite(inicio, fim) ? "12h_noturno" : "12h_diurno";
  }

  if (NOTURNO_EXPLICITO.test(t)) return "12h_noturno";
  if (DIURNO_EXPLICITO.test(t)) return "12h_diurno";
  return undefined;
}

/** O turno pega alguma hora da janela legal de 22h às 5h? */
function cruzaNoite(inicio: number, fim: number): boolean {
  for (let i = 0; i < 24; i++) {
    const h = (inicio + i) % 24;
    if (h === fim) break;
    if (h >= 22 || h < 5) return true;
  }
  return false;
}
