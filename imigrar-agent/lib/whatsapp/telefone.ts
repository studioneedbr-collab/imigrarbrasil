// O MESMO TELEFONE É A MESMA PESSOA — a regra, pura e testável.
//
// `conversations.whatsapp_number` sempre teve unique, então duas conversas para o mesmo
// contato nunca vieram de duas linhas com o mesmo texto. Vieram de duas GRAFIAS do mesmo
// número: "5595991234567", "+55 95 99123-4567", "559591234567" (sem o nono dígito). Cada
// grafia abre uma conversa nova, e a pessoa aparece duas vezes na fila e duas vezes no
// quadro, com metade da ficha em cada uma.
//
// Foi assim que Ana Rodríguez apareceu como "Venezuela · Modalidade a definir" em EM
// ATENDIMENTO e, ao lado, como "venezolana · Saber qué hacer con una multa migratoria"
// em NOVO — a segunda com uma multa correndo que ninguém ligou à primeira.
//
// A FORMA CANÔNICA É SÓ DÍGITO, e não uma tentativa de adivinhar o formato certo. O nono
// dígito brasileiro NÃO entra na canônica: ele é tratado como VARIANTE na hora de
// procurar. A diferença importa — se a canônica tentasse "consertar" o número, ela
// deixaria de bater com o que o backfill da migration 025 gravou, e a deduplicação
// silenciosamente pararia de encontrar o histórico.

/** Conversas do simulador (`sim:<uuid>`) não são telefone e nunca deduplicam. */
export const SIM_PREFIX = "sim:";

/**
 * A forma canônica: só dígitos, sem "+", sem o "00" de discagem internacional e sem
 * zeros à esquerda. Devolve "" para o que não é telefone (simulador, string vazia).
 */
export function normalizarTelefone(bruto: string | null | undefined): string {
  const texto = (bruto ?? "").trim();
  if (!texto || texto.startsWith(SIM_PREFIX)) return "";
  let digitos = texto.replace(/\D/g, "");
  if (digitos.startsWith("00")) digitos = digitos.slice(2);
  digitos = digitos.replace(/^0+/, "");
  return digitos;
}

/**
 * As grafias que podem ser a MESMA pessoa.
 *
 * O nono dígito é o caso real: o WhatsApp entrega o número de um celular brasileiro ora
 * com ele, ora sem — depende de quem cadastrou o contato e de por onde a mensagem passou.
 * Um número de 13 dígitos começando em 55 com "9" na quinta posição e o mesmo número com
 * 12 dígitos são o mesmo telefone, e tratá-los como pessoas diferentes é justamente o
 * defeito que esta função existe para fechar.
 *
 * Fora do Brasil não se mexe: inventar variante para DDI que não se conhece uniria
 * contatos distintos, e juntar duas pessoas numa conversa só é pior do que separar uma
 * pessoa em duas.
 */
export function variantesDoTelefone(bruto: string | null | undefined): string[] {
  const canonico = normalizarTelefone(bruto);
  if (!canonico) return [];
  const variantes = new Set<string>([canonico]);

  if (canonico.startsWith("55")) {
    const semDdi = canonico.slice(2);
    // 11 dígitos após o DDI = DD + 9 + oito dígitos (celular no formato atual).
    if (semDdi.length === 11 && semDdi[2] === "9") {
      variantes.add(`55${semDdi.slice(0, 2)}${semDdi.slice(3)}`);
    }
    // 10 dígitos após o DDI = DD + oito dígitos (formato antigo, ainda muito entregue).
    if (semDdi.length === 10) {
      variantes.add(`55${semDdi.slice(0, 2)}9${semDdi.slice(2)}`);
    }
  }

  return Array.from(variantes);
}

/**
 * A JANELA. Passado este tempo sem nenhuma atividade, a mensagem nova abre uma conversa
 * nova em vez de ressuscitar a antiga.
 *
 * Trinta dias porque é a escala deste domínio: em imigração a pessoa some três semanas
 * juntando documento no consulado e volta — juntar as duas pontas é o certo. Quem volta
 * seis meses depois volta com outro caso, e empilhar isso na conversa antiga entrega ao
 * advogado uma história que mistura dois processos.
 */
export const JANELA_DE_REAPROVEITAMENTO_DIAS = 30;

export interface ConversaCandidata {
  id: string;
  status: string;
  /** Última atividade conhecida: `lastMessageAt`, com `updatedAt` como reserva. */
  atividadeEm?: string | null;
}

/**
 * Qual conversa aberta recebe esta mensagem — ou `null` quando é para abrir uma nova.
 *
 * "Aberta" exclui `finished`: quem pediu para parar, ou teve o atendimento encerrado,
 * recomeça do zero. Entre várias candidatas vence a de atividade mais recente.
 */
export function conversaParaReaproveitar(
  candidatas: ConversaCandidata[],
  agora: Date = new Date(),
): ConversaCandidata | null {
  const limite = agora.getTime() - JANELA_DE_REAPROVEITAMENTO_DIAS * 24 * 3600 * 1000;
  const abertas = candidatas
    .filter((c) => c.status !== "finished")
    .map((c) => ({ c, em: Date.parse(c.atividadeEm ?? "") }))
    .filter(({ em }) => Number.isFinite(em) && em >= limite)
    .sort((a, b) => b.em - a.em);
  return abertas[0]?.c ?? null;
}
