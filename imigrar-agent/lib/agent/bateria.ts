// A BATERIA DE TESTES DA AGENTE.
//
// Conversas-modelo que rodam contra o MODELO DE VERDADE (o escolhido em Integrações, com
// o treino que está salvo), turno a turno, e apontam o que deu errado em cada resposta.
//
// Existe porque o defeito da agente não aparece em teste de código: "pergunta de novo a
// nacionalidade", "responde em português a quem escreveu em espanhol", "manda um
// parágrafo de 900 caracteres" são falhas do modelo lendo o treino, e só aparecem com o
// modelo respondendo. Antes, o único jeito de achar isso era um cliente reclamar. Agora,
// depois de mexer no treino ou trocar o modelo, roda-se a bateria e se vê na hora.
//
// As conversas são ENSAIO: nascem marcadas como teste (não entram na fila nem no quadro)
// e as tools rodam em sombra — encaminhar não avisa ninguém do time.
//
// As verificações são deliberadamente objetivas. Cada uma aponta um defeito que alguém já
// viu numa conversa real; nenhuma tenta julgar "se a resposta foi boa", que é trabalho de
// quem lê o relatório.

import { randomUUID } from "crypto";
import { getRepository } from "@/lib/data";
import { respondToConversation } from "@/lib/agent";
import { detectarIdioma } from "@/lib/agent/idioma";
import { perguntasRepetidas } from "@/lib/agent/pergunta-repetida";
import { dizONome, perguntasEmSequencia } from "@/lib/agent/conversa";
import { getTrainingConfig } from "@/lib/agent/system-prompt";
import type { MessageLength } from "@/lib/agent/training";
import type { Lead } from "@/lib/domain/types";

/** Um turno é uma mensagem, ou várias seguidas (a pessoa quebrando a frase no WhatsApp). */
export type TurnoDoCenario = string | string[];

export interface Cenario {
  id: string;
  titulo: string;
  /** Por que este cenário existe — o defeito real que ele vigia. */
  vigia: string;
  turnos: TurnoDoCenario[];
  /**
   * O que a resposta do turno (0 = primeiro) precisa conter: é como se vê se a agente
   * respondeu à pergunta que a pessoa fez, em vez de seguir com a própria.
   */
  espera?: Record<number, { re: RegExp; oQue: string }>;
  /** O que a resposta do turno NÃO pode dizer — as proibições do treinamento. */
  proibe?: Record<number, { re: RegExp; oQue: string }>;
  /** Se o turno precisa (true) ou não pode (false) encaminhar ao time. */
  encaminha?: Record<number, boolean>;
  /** O idioma em que as respostas TÊM de vir. */
  idioma: "pt" | "es" | "en" | "fr";
  /** O que a ficha precisa ter no fim. Regex, porque a grafia do modelo varia. */
  ficha?: { nome?: RegExp; nacionalidade?: RegExp; onde?: RegExp };
}

export const CENARIOS: Cenario[] = [
  {
    id: "portugues-na-suica",
    titulo: "Português na Suíça, respondendo em duas mensagens",
    vigia: "Conversa real: \"Sou português\" + \"Estou na Suíça\" respondidos com \"você está no Brasil ou em Portugal?\" e depois \"confirma que está na Suíça?\".",
    turnos: [
      "Bom dia. Meu pedido de residência no Brasil ficou com prazo excedido, mas já paguei a multa",
      ["Sou português", "Estou na Suíça"],
      "Angelo",
    ],
    idioma: "pt",
    ficha: { nacionalidade: /portugal|portugu/i, onde: /su[íi][çc]a|exterior/i },
  },
  {
    id: "brasileiro-sem-documentos",
    titulo: "Brasileiro na Europa sem documentos",
    vigia: "Conversa real: \"Brasileiro\" respondido seco e a agente perguntando \"você é brasileiro ou tem outra nacionalidade?\", com duas respostas seguidas.",
    turnos: [
      "Oi, perdi todos os meus documentos, só tenho o passaporte vencido",
      "Claudio",
      "Brasileiro",
      "Estou na Bélgica",
      "Não tenho nenhuma certidão",
    ],
    idioma: "pt",
    ficha: { nome: /claudio/i, nacionalidade: /brasil/i, onde: /b[ée]lgica|exterior/i },
  },
  {
    id: "tudo-de-uma-vez",
    titulo: "Conta tudo na primeira mensagem",
    vigia: "Quem já disse nome, nacionalidade e onde está não pode ouvir nenhuma dessas perguntas.",
    turnos: [
      "Olá, meu nome é Ahmed, sou sírio, moro em São Paulo há 3 anos e quero trazer minha esposa para o Brasil",
      "Ela está no Líbano",
    ],
    idioma: "pt",
    ficha: { nome: /ahmed/i, nacionalidade: /s[íi]ria/i, onde: /s[ãa]o paulo|brasil/i },
  },
  {
    id: "venezuelana-em-espanhol",
    titulo: "Venezuelana em Boa Vista, escrevendo em espanhol",
    vigia: "A resposta tem de vir em espanhol do começo ao fim, sem reperguntar o que já veio.",
    turnos: [
      "Hola, soy venezolana y estoy en Boa Vista, quiero regularizar mis documentos",
      "Me llamo María",
      "Entré por Pacaraima hace dos meses y no tengo ningún documento brasileño",
    ],
    idioma: "es",
    ficha: { nome: /mar[íi]a/i, nacionalidade: /venezuela/i, onde: /boa vista|brasil/i },
  },
  {
    id: "estudante-em-ingles",
    titulo: "Estudante nigeriano, em inglês",
    vigia: "Resposta em inglês, sem perguntar de onde ele é nem onde está.",
    turnos: [
      "Hi, I'm John, I'm Nigerian and I live in Lagos. I got admitted to a university in Brazil",
      "Classes start in March",
    ],
    idioma: "en",
    ficha: { nome: /john/i, nacionalidade: /nig[ée]ria/i, onde: /lagos|nig[ée]ria|exterior/i },
  },
  {
    id: "pergunta-no-meio",
    titulo: "A pessoa pergunta outra coisa no meio da triagem",
    vigia: "Reclamação do escritório: a agente ignora o que o cliente perguntou e faz a próxima pergunta da ficha, no automático.",
    turnos: [
      "Boa tarde, sou colombiano e moro em Curitiba, quero renovar minha residência",
      "Antes me diz uma coisa: você é advogada?",
      "E qual é o horário de atendimento de vocês?",
      "Estou muito preocupado, minha mãe está doente na Colômbia e não sei se posso viajar",
    ],
    espera: {
      1: { re: /n[ãa]o sou advogad|n[ãa]o,|primeiro atendimento|time jur[íi]dico|atendimento da/i, oQue: "se é advogada" },
      2: { re: /\b0?8\s*(h|:|às|as)|segunda|dias? úte/i, oQue: "o horário de atendimento" },
      3: { re: /m[ãa]e|preocupa|sinto|entendo|imagino|dif[íi]cil|viaj/i, oQue: "a preocupação com a mãe e a viagem" },
    },
    idioma: "pt",
    ficha: { nacionalidade: /col[ôo]mbi/i, onde: /curitiba|brasil/i },
  },
  {
    id: "multa-com-prazo",
    titulo: "Recebeu multa da Polícia Federal",
    vigia: "Prazo processual correndo: encaminha na hora, sem esperar o sim, e sem dizer quantos dias faltam.",
    turnos: ["Boa tarde, recebi uma notificação de multa da Polícia Federal por ter passado do prazo, quantos dias eu tenho para me defender?"],
    encaminha: { 0: true },
    proibe: { 0: { re: /\b\d+\s*dias?\b|\b(dez|quinze|trinta) dias\b|voc[êe] (confirmou|autorizou)/i, oQue: "número de dias do prazo, ou que ela confirmou" } },
    idioma: "pt",
  },
  {
    id: "parecer-e-valores",
    titulo: "Pede parecer, preço e lista de documentos",
    vigia: "As proibições mais cobradas: qualificar a situação, passar valor, despejar lista e mandar a um órgão.",
    turnos: [
      "Olá, sou Pierre, haitiano, moro em Manaus e quero trazer meu filho",
      "Quais documentos eu preciso? Me manda a lista",
      "Carimbaram meu passaporte na entrada, isso é bom para o meu caso?",
      "E quanto vocês cobram?",
    ],
    proibe: {
      1: { re: /(^|\n)\s*(\d+[.)]|[-•])\s|(?<!\p{L})v[áa] (at[ée]|[àa]) |procure (a|o) (pol[íi]cia|consulado|cart[óo]rio)/iu, oQue: "lista de documentos ou órgão" },
      // "Se isso ajuda, quem diz é o advogado" e "não posso dizer que é bom sinal" são certos.
      2: { re: /(?<!\b(?:se|n[ãa]o|nem)\b[^.!?\n]{0,50})(?:bom sinal|boa not[íi]cia|a seu favor|isso ajuda|est[áa] regular|entrada (?:foi|ficou|est[áa]) regular)/i, oQue: "parecer sobre a situação" },
      3: { re: /R\$\s*\d|\d+\s*reais|sal[áa]rios?.m[íi]nimos?/i, oQue: "valor" },
    },
    idioma: "pt",
    ficha: { nome: /pierre/i, nacionalidade: /hait/i, onde: /manaus|brasil/i },
  },
  {
    id: "sem-condicoes",
    titulo: "Não tem como pagar",
    vigia: "Defensoria, com o link, sem constrangimento e sem insistir.",
    turnos: ["Oi, sou Rosa, boliviana, moro em São Paulo e quero regularizar minha situação", "Não tenho dinheiro para pagar advogado"],
    espera: { 1: { re: /defensoria|dpu/i, oQue: "a Defensoria Pública da União" } },
    idioma: "pt",
  },
  {
    id: "so-oi",
    titulo: "Só cumprimenta",
    vigia: "Quem manda \"oi\" duas vezes recebe uma acolhida curta, não um parágrafo.",
    turnos: ["oi", "boa tarde"],
    encaminha: { 0: false, 1: false },
    idioma: "pt",
  },
];

/** Uma resposta maior do que isto já não é mensagem de WhatsApp, é e-mail. */
const RESPOSTA_LONGA: Record<MessageLength, number> = { curtas: 700, medias: 1000, detalhadas: 1800 };
/** Mais perguntas do que isto numa mensagem vira questionário. */
const PERGUNTAS_DEMAIS = 2;

const RACIOCINIO_VAZADO =
  /\b(vou verificar|seguindo o fluxo|j[áa] tenho os dados|vou registrar|registrei (os|seus) dados|como (uma )?(ia|intelig[êe]ncia artificial|modelo de linguagem)|conforme (as )?minhas instru[çc][õo]es|system prompt|nota interna|ferramenta registrar|registrar_dados_lead|transferir_para_humano)\b/i;

export interface ProblemaNoTurno {
  tipo: "pergunta_repetida" | "repetiu_a_si_mesma" | "idioma" | "longa" | "perguntas_demais" | "raciocinio_vazado" | "sem_resposta" | "nao_se_apresentou" | "ignorou" | "interrogatorio" | "nao_encaminhou" | "encaminhou_cedo" | "proibido";
  detalhe: string;
}

export interface TurnoAvaliado {
  enviado: string[];
  resposta: string;
  problemas: ProblemaNoTurno[];
}

const palavras = (t: string) =>
  new Set(
    t
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2),
  );

/** Quanto duas perguntas se parecem (0 a 1), pelas palavras em comum. */
export function semelhanca(a: string, b: string): number {
  const A = palavras(a);
  const B = palavras(b);
  if (!A.size || !B.size) return 0;
  let comum = 0;
  for (const w of A) if (B.has(w)) comum++;
  return comum / Math.min(A.size, B.size);
}

const perguntasDe = (t: string) => (t.match(/[^.!?\n]*\?/g) ?? []).map((p) => p.trim()).filter((p) => p.length > 8);

/** Avalia uma resposta. Puro: recebe tudo o que precisa, para ser testável sem modelo. */
export function avaliarResposta(p: {
  resposta: string;
  respostasAnteriores: string[];
  lead: Lead | null;
  idioma: Cenario["idioma"];
  /** O nome da agente: a primeira resposta precisa dizê-lo. */
  nomeDaAgente?: string;
  espera?: { re: RegExp; oQue: string };
  proibe?: { re: RegExp; oQue: string };
  /** Se este turno precisa ou não pode encaminhar, e se encaminhou. */
  encaminha?: boolean;
  encaminhou?: boolean;
  /** O tamanho escolhido na Identidade: "detalhadas" não é defeito. */
  tamanho?: MessageLength;
}): ProblemaNoTurno[] {
  const r = p.resposta.trim();
  if (!r) return [{ tipo: "sem_resposta", detalhe: "A agente não respondeu nada." }];
  const problemas: ProblemaNoTurno[] = [];

  if (p.nomeDaAgente && p.respostasAnteriores.length === 0 && !dizONome(r, p.nomeDaAgente)) {
    problemas.push({ tipo: "nao_se_apresentou", detalhe: `A primeira mensagem não diz o nome (${p.nomeDaAgente}).` });
  }
  if (p.espera && !p.espera.re.test(r)) {
    problemas.push({ tipo: "ignorou", detalhe: `Não respondeu ao que a pessoa trouxe: ${p.espera.oQue}.` });
  }
  const disse = p.proibe ? r.match(p.proibe.re)?.[0].trim() : undefined;
  if (p.proibe && disse !== undefined) {
    problemas.push({ tipo: "proibido", detalhe: `Disse o que não pode (${p.proibe.oQue}): "${disse}".` });
  }
  if (p.encaminha === true && !p.encaminhou) {
    problemas.push({ tipo: "nao_encaminhou", detalhe: "O caso tinha de ir para o time nesta mensagem, e não foi." });
  }
  if (p.encaminha === false && p.encaminhou) {
    problemas.push({ tipo: "encaminhou_cedo", detalhe: "Encaminhou sem a pessoa ter dito sim." });
  }
  const seguidas = perguntasEmSequencia([...p.respostasAnteriores, r]);
  if (seguidas > 3) {
    problemas.push({ tipo: "interrogatorio", detalhe: `${seguidas} mensagens seguidas terminando em pergunta.` });
  }

  const repetidas = perguntasRepetidas(r, p.lead);
  if (repetidas.length) {
    problemas.push({ tipo: "pergunta_repetida", detalhe: `Perguntou de novo: ${repetidas.join(", ")} — a ficha já tinha.` });
  }

  const anteriores = p.respostasAnteriores.flatMap(perguntasDe);
  const repetiu = perguntasDe(r).find((q) => anteriores.some((a) => semelhanca(q, a) >= 0.75));
  if (repetiu) problemas.push({ tipo: "repetiu_a_si_mesma", detalhe: `Fez de novo uma pergunta que já tinha feito: "${repetiu}"` });

  const idioma = detectarIdioma(r);
  if (idioma && idioma !== p.idioma) {
    problemas.push({ tipo: "idioma", detalhe: `Respondeu em "${idioma}", a conversa é em "${p.idioma}".` });
  }

  const teto = RESPOSTA_LONGA[p.tamanho ?? "curtas"];
  if (r.length > teto) {
    problemas.push({ tipo: "longa", detalhe: `${r.length} caracteres — acima de ${teto}, longa demais para WhatsApp.` });
  }

  const nPerguntas = (r.match(/\?/g) ?? []).length;
  if (nPerguntas > PERGUNTAS_DEMAIS) {
    problemas.push({ tipo: "perguntas_demais", detalhe: `${nPerguntas} perguntas numa mensagem só.` });
  }

  const vazou = r.match(RACIOCINIO_VAZADO)?.[0];
  if (vazou) problemas.push({ tipo: "raciocinio_vazado", detalhe: `Expôs o funcionamento interno: "${vazou}".` });

  return problemas;
}

/** O que a ficha deveria ter no fim e não tem. */
export function conferirFicha(lead: Lead | null, esperado: Cenario["ficha"]): string[] {
  if (!esperado) return [];
  const faltando: string[] = [];
  if (esperado.nome && !esperado.nome.test(lead?.contactName ?? "")) faltando.push(`nome (está: ${lead?.contactName ?? "vazio"})`);
  const nac = lead?.nacionalidade ?? lead?.clientType ?? "";
  if (esperado.nacionalidade && !esperado.nacionalidade.test(nac)) faltando.push(`nacionalidade (está: ${nac || "vazio"})`);
  const onde = [lead?.region, lead?.paisExterior, lead?.localizacao].filter(Boolean).join(" ");
  if (esperado.onde && !esperado.onde.test(onde)) faltando.push(`onde está (está: ${onde || "vazio"})`);
  return faltando;
}

/** Abre a conversa de ensaio de um cenário. */
export async function abrirEnsaio(cenario: Cenario): Promise<string> {
  const repo = getRepository();
  const conv = await repo.getOrCreateConversation(`sim:bateria-${cenario.id}-${randomUUID()}`);
  await repo.updateConversation(conv.id, { ambiente: "teste" }).catch(() => {});
  return conv.id;
}

/**
 * UM TURNO POR VEZ. A bateria inteira — e até um cenário de cinco turnos — passa do tempo
 * máximo de uma função na Vercel; a tela chama turno a turno e vai mostrando.
 *
 * As respostas anteriores vêm do próprio histórico da conversa de ensaio, não do cliente:
 * o que se compara é o que a agente de fato disse.
 */
export async function rodarTurno(
  cenario: Cenario,
  indice: number,
  conversationId: string,
): Promise<{ turno: TurnoAvaliado; ultimo: boolean; fichaFaltando: string[] }> {
  const repo = getRepository();
  const turno = cenario.turnos[indice];
  if (turno === undefined) throw new Error("Turno inexistente.");
  const enviado = Array.isArray(turno) ? turno : [turno];

  const antes = (await repo.listMessages(conversationId)).filter((m) => m.role === "assistant").map((m) => m.content);
  for (const m of enviado) await repo.addMessage(conversationId, "user", m);
  const { reply, toolCalls } = await respondToConversation(conversationId, { ferramentasEmSombra: true });
  const lead = await repo.getLeadByConversation(conversationId).catch(() => null);
  const identidade = (await getTrainingConfig().catch(() => null))?.identity;
  const nomeDaAgente = identidade?.agentName;
  const encaminhou = toolCalls.some(
    (t) => t.name === "transferir_para_humano" && (t.result as { ok?: boolean } | undefined)?.ok === true,
  );

  const ultimo = indice === cenario.turnos.length - 1;
  const fichaFaltando = ultimo ? conferirFicha(lead, cenario.ficha) : [];
  // O ensaio não fica guardado: já virou relatório, e deixá-lo seria lixo na aba de
  // Ensaios a cada execução.
  if (ultimo) await repo.deleteConversation(conversationId).catch(() => {});
  return {
    turno: {
      enviado,
      resposta: reply,
      problemas: avaliarResposta({
        resposta: reply,
        respostasAnteriores: antes,
        lead,
        idioma: cenario.idioma,
        nomeDaAgente,
        tamanho: identidade?.messageLength,
        espera: cenario.espera?.[indice],
        proibe: cenario.proibe?.[indice],
        encaminha: cenario.encaminha?.[indice],
        encaminhou,
      }),
    },
    ultimo,
    fichaFaltando,
  }
}
