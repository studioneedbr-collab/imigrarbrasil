// TREINAMENTO DA ANA — tudo que a equipe edita em /dashboard/treinar.
//
// Até aqui, objeções, regras de encaminhamento e guardrails só existiam como constantes
// em lib/agent/knowledge.ts: mudar uma palavra exigia programador e deploy. Este módulo
// dá a cada um desses blocos uma forma SERIALIZÁVEL (nada de RegExp, que não sobrevive a
// JSON) com um padrão vindo do código, para que a versão editada no painel possa viver em
// agent_config e entrar no system prompt no lugar do padrão.
//
// Chaves em agent_config: "agent_identity" (dentro de knowledge_base), "objections",
// "transfer_rules", "guardrails", "technical_knowledge".

import {
  AGENT_REASONING,
  OBJECTIONS,
  TRANSFER_RULES,
  CONFIDENTIAL,
  type Objection,
} from "@/lib/agent/knowledge";

/* ------------------------------------------------------------------ */
/* Raciocínio — como ela pensa antes de responder                      */
/* ------------------------------------------------------------------ */

export interface ReasoningBlock {
  id: string;
  /** Cabeçalho do bloco, sem as barras ════. É o que a aba mostra como título. */
  title: string;
  body: string;
}

/** Cabeçalho de bloco no formato `════════ TÍTULO ════════`. */
const REASONING_HEADING = /^═+\s*(.+?)\s*═+$/;

/**
 * Quebra o texto do raciocínio nos blocos separados por `════════ TÍTULO ════════`.
 *
 * Um textarea com as 300 linhas do bloco inteiro seria intocável na prática — ninguém
 * edita "como a Ana pensa" rolando um campo desses. Em blocos, dá para mexer só em
 * "QUANDO ENCAMINHAR PARA O TIME JURÍDICO" sem esbarrar no resto.
 */
export function parseReasoning(texto: string): ReasoningBlock[] {
  const blocos: ReasoningBlock[] = [];
  let atual: ReasoningBlock | null = null;
  let n = 0;
  for (const linha of texto.split("\n")) {
    const m = linha.match(REASONING_HEADING);
    if (m) {
      if (atual) blocos.push({ ...atual, body: atual.body.trim() });
      atual = { id: `rac_${++n}`, title: m[1], body: "" };
    } else if (atual) {
      atual.body += `${linha}\n`;
    }
    // Linha antes do primeiro cabeçalho é descartada: o AGENT_REASONING começa com um,
    // e texto órfão ali não teria onde ser editado.
  }
  if (atual) blocos.push({ ...atual, body: atual.body.trim() });
  return blocos;
}

/** Remonta o texto do raciocínio a partir dos blocos, no formato que o prompt espera. */
export function serializeReasoning(blocos: ReasoningBlock[]): string {
  return blocos
    .filter((b) => b.title.trim())
    .map((b) => `════════ ${b.title.trim()} ════════\n\n${b.body.trim()}`)
    .join("\n\n");
}

export const DEFAULT_REASONING: ReasoningBlock[] = parseReasoning(AGENT_REASONING);

export function normalizeReasoning(v: unknown): ReasoningBlock[] {
  if (!Array.isArray(v)) return DEFAULT_REASONING;
  return v
    .map((raw, i) => {
      const b = (raw ?? {}) as Partial<ReasoningBlock>;
      return {
        id: typeof b.id === "string" && b.id ? b.id : `rac_${i + 1}`,
        title: typeof b.title === "string" ? b.title : "",
        body: typeof b.body === "string" ? b.body : "",
      };
    })
    .filter((b) => b.title.trim());
}

/* ------------------------------------------------------------------ */
/* Identidade                                                          */
/* ------------------------------------------------------------------ */

export type Tone = "profissional_calorosa" | "formal" | "direta";
export type MessageLength = "curtas" | "medias" | "detalhadas";

export interface Identity {
  agentName: string;
  companyName: string;
  tone: Tone;
  messageLength: MessageLength;
}

// O nome do agente é editável em /dashboard/treinar → Identidade. "Ana" é o padrão do
// código: o documento do projeto não definiu um nome, e um assistente sem nome nenhum
// obriga a frases como "o assistente virtual da Imigrar Brasil" toda vez que ele se
// apresenta. Trocar é um campo, sem deploy.
export const DEFAULT_IDENTITY: Identity = {
  agentName: "Ana",
  companyName: "Imigrar Brasil",
  tone: "profissional_calorosa",
  messageLength: "curtas",
};

export const TONE_LABEL: Record<Tone, string> = {
  profissional_calorosa: "Profissional e calorosa",
  formal: "Formal",
  direta: "Direta e objetiva",
};

const TONE_PROMPT: Record<Tone, string> = {
  profissional_calorosa:
    "Tom acolhedor, respeitoso e direto: soa como uma pessoa do time, nunca julga a situação de ninguém e nunca usa tom de autoridade ou fiscalização.",
  formal:
    "Tom formal: cordial e respeitoso, sem gírias, sem emoji, tratando por você com linguagem de correspondência comercial.",
  direta:
    "Tom direto e objetivo: vai ao ponto, sem rodeio nem cortesia longa, mas nunca seco a ponto de parecer rude.",
};

export const LENGTH_LABEL: Record<MessageLength, string> = {
  curtas: "Curtas (2-3 frases)",
  medias: "Médias",
  detalhadas: "Detalhadas",
};

const LENGTH_PROMPT: Record<MessageLength, string> = {
  curtas: "Mensagens curtas: 2 a 3 frases por resposta. Uma pergunta por vez.",
  medias: "Mensagens de tamanho médio: até 5 frases, com espaço para explicar um ponto.",
  detalhadas:
    "Mensagens detalhadas: pode explicar em profundidade e listar itens, sem virar um texto que ninguém lê no WhatsApp.",
};

/* ------------------------------------------------------------------ */
/* Objeções                                                            */
/* ------------------------------------------------------------------ */

export interface ObjectionConfig extends Objection {
  id: string;
  ativo: boolean;
}

export const DEFAULT_OBJECTIONS: ObjectionConfig[] = OBJECTIONS.map((o, i) => ({
  ...o,
  id: `obj_${i + 1}`,
  ativo: true,
}));

/* ------------------------------------------------------------------ */
/* Regras de encaminhamento                                            */
/* ------------------------------------------------------------------ */

export interface TransferRuleConfig {
  id: string;
  categoria: string;
  /** Palavras que disparam a regra. Viram regex em runtime (buildTransferRegex). */
  keywords: string[];
  resposta: string;
  ativo: boolean;
}

export const DEFAULT_TRANSFER_RULES: TransferRuleConfig[] = TRANSFER_RULES.map((r) => ({
  id: r.categoria,
  categoria: r.categoria,
  keywords: [...r.keywords],
  resposta: r.resposta,
  ativo: true,
}));

/**
 * Tira o acento sem tocar no resto. Existe porque a regra de transbordo é escrita no
 * painel POR QUEM ACENTUA e testada contra o que a pessoa digita NO WHATSAPP, onde
 * ninguém acentua — e aqui boa parte de quem escreve nem tem teclado em português.
 *
 * Sem isto, "o que e refugio?" não casava com a palavra "refúgio" cadastrada, e um tema
 * que a regra manda levar ao advogado caía na resposta genérica.
 */
export function semAcento(texto: string): string {
  return (texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Cada vogal (e o c e o n) vira uma classe com todas as suas formas. É isto que faz a
 * regra casar NOS DOIS SENTIDOS: a palavra cadastrada com acento encontra o texto sem, e
 * a cadastrada sem acento encontra o texto com.
 */
const CLASSES: Record<string, string> = {
  a: "aáàâãä", e: "eéèêë", i: "iíìîï", o: "oóòôõö", u: "uúùûü", c: "cç", n: "nñ",
};
const PARA_CLASSE = new Map<string, string>();
for (const variantes of Object.values(CLASSES)) {
  for (const ch of variantes) PARA_CLASSE.set(ch, `[${variantes}]`);
}

/**
 * Regex a partir das palavras editadas no painel. Sem \b nas bordas: as palavras vêm com
 * acento e espaço ("reunião familiar", "documento vencido"), e a borda de palavra do JS
 * não entende acento — "situação\b" nunca casaria. `includes` semântico, portanto, é o
 * certo aqui.
 *
 * INSENSÍVEL A ACENTO, e isso não é detalhe: a regra é escrita no painel POR QUEM ACENTUA
 * e testada contra o que a pessoa digita NO WHATSAPP, onde ninguém acentua — e aqui boa
 * parte de quem escreve nem tem teclado em português. Sem isto, "o que e refugio?" não
 * casava com a palavra "refúgio" cadastrada, e um tema que a regra manda levar ao
 * advogado caía na resposta genérica.
 */
export function buildTransferRegex(keywords: string[]): RegExp | null {
  const parts = keywords
    .map((k) => k.trim())
    .filter(Boolean)
    .map((k) =>
      k
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .split("")
        .map((ch) => PARA_CLASSE.get(ch.toLowerCase()) ?? ch)
        .join(""),
    );
  if (parts.length === 0) return null;
  return new RegExp(parts.join("|"), "i");
}

/* ------------------------------------------------------------------ */
/* Guardrails e regras gerais de comportamento                         */
/* ------------------------------------------------------------------ */

export type BehaviorRuleId =
  | "nao_transferir_sem_avisar"
  | "nao_repetir_pergunta"
  | "nao_falar_honorarios"
  | "nao_opinar_sobre_caso"
  | "uma_pergunta_por_vez"
  | "nao_pedir_documento";

export interface BehaviorRule {
  id: BehaviorRuleId;
  label: string;
  /** Linha que entra no prompt quando a regra está ligada. */
  prompt: string;
}

export const BEHAVIOR_RULES: BehaviorRule[] = [
  {
    id: "nao_transferir_sem_avisar",
    label: "Nunca transferir sem avisar e confirmar antes",
    prompt:
      "Nunca transfira sem avisar. Antes de chamar transferir_para_humano, diga em uma frase por que o caso precisa de um especialista e pergunte se a pessoa quer que o time entre em contato. A única exceção é risco imediato à pessoa. E só diga que encaminhou na mensagem em que realmente chamou a tool.",
  },
  {
    id: "nao_repetir_pergunta",
    label: "Nunca repetir pergunta já respondida",
    prompt:
      "Nunca pergunte de novo algo que a pessoa já respondeu nesta conversa. Releia o histórico antes de perguntar qualquer coisa — quem está aflito repetindo a própria história pela terceira vez desiste do atendimento.",
  },
  {
    id: "nao_falar_honorarios",
    label: "Nunca informar honorários ou valores",
    prompt:
      "Nunca informe, estime ou dê faixa de honorários, taxa ou forma de pagamento. Valores quem passa é o time jurídico, porque dependem do que o caso exige — diga isso com naturalidade e ofereça o encaminhamento.",
  },
  {
    id: "nao_opinar_sobre_caso",
    label: "Nunca opinar sobre o caso concreto",
    prompt:
      "Nunca diga se um pedido será aprovado ou negado, nunca estime chance de sucesso e nunca informe prazo de análise de um processo específico. Isso é análise de caso concreto e cabe ao advogado, mesmo que a pessoa insista.",
  },
  {
    id: "uma_pergunta_por_vez",
    label: "Uma pergunta por vez, nunca interrogatório",
    prompt:
      "Faça uma pergunta por vez, na ordem que a conversa pedir, aproveitando o que a pessoa já contou. Perguntas em sequência, sem nada no meio, viram formulário — e com quem está inseguro, parecem fiscalização.",
  },
  {
    id: "nao_pedir_documento",
    label: "Nunca pedir documento ou dado sensível",
    prompt:
      "Nunca peça número de documento, passaporte, CPF, senha ou dado bancário, e nunca peça foto de documento — isso é feito pelo time jurídico. Se a pessoa mandar um documento por conta própria, agradeça, não repita o número na conversa e diga que o time vai olhar.",
  },
];

export interface GuardrailsConfig {
  /** Termos que a Ana nunca revela. */
  termos: string[];
  /** Regras gerais ligadas/desligadas. */
  regras: Record<BehaviorRuleId, boolean>;
}

export const DEFAULT_GUARDRAILS: GuardrailsConfig = {
  termos: [...CONFIDENTIAL],
  regras: BEHAVIOR_RULES.reduce(
    (acc, r) => ({ ...acc, [r.id]: true }),
    {} as Record<BehaviorRuleId, boolean>,
  ),
};

/* ------------------------------------------------------------------ */
/* Conhecimento técnico                                                */
/* ------------------------------------------------------------------ */

export interface GlossaryTerm {
  id: string;
  termo: string;
  definicao: string;
}

export interface WorkSchedule {
  id: string;
  nome: string;
  descricao: string;
  quandoUsar: string;
}

export interface TechnicalKnowledge {
  termos: GlossaryTerm[];
  escalas: WorkSchedule[];
}

// GLOSSÁRIO: só o que serve para a Ana TRADUZIR um termo em uma linha na conversa.
// Nada aqui é procedimento — requisito, prazo, documento e taxa vêm do material oficial
// (RAG) ou do time jurídico, nunca de uma constante do código.
export const DEFAULT_TECHNICAL: TechnicalKnowledge = {
  termos: [
    {
      id: "crnm",
      termo: "CRNM",
      definicao:
        "Carteira de Registro Nacional Migratório: o documento de identificação de quem é migrante e tem residência no Brasil. Explique assim, sem sigla solta.",
    },
    {
      id: "autorizacao_residencia",
      termo: "Autorização de residência",
      definicao:
        "A permissão para morar no Brasil. Existe por vários motivos diferentes (trabalho, família, estudo, acordo do Mercosul) — qual cabe em cada caso é análise do time jurídico.",
    },
    {
      id: "policia_federal",
      termo: "Polícia Federal",
      definicao:
        "O órgão que registra o migrante no Brasil e emite o documento. Cite sempre em tom neutro: para muita gente que te escreve, a palavra 'polícia' assusta.",
    },
    {
      id: "conare",
      termo: "CONARE",
      definicao:
        "Comitê Nacional para os Refugiados: é quem analisa e decide os pedidos de refúgio no Brasil.",
    },
    {
      id: "refugio",
      termo: "Refúgio",
      definicao:
        "Proteção para quem deixou o próprio país por perseguição, conflito ou grave violação de direitos humanos. Assunto sensível: acolha e encaminhe, não explique procedimento.",
    },
    {
      id: "mercosul",
      termo: "Acordo de Residência do Mercosul",
      definicao:
        "Acordo entre os países do bloco que cria um caminho próprio de residência para nacionais desses países. Quais países e o que vale hoje: só do material oficial.",
    },
    {
      id: "naturalizacao",
      termo: "Naturalização",
      definicao:
        "Processo pelo qual quem é estrangeiro se torna brasileiro. Não confunda com visto nem com residência — são coisas diferentes e a pessoa costuma misturar.",
    },
    {
      id: "reuniao_familiar",
      termo: "Reunião familiar",
      definicao:
        "Caminho migratório de quem quer trazer ou manter perto cônjuge, filhos, pais e outros familiares.",
    },
  ],
  // Os "caminhos" ocupam a estrutura que na base original guardava escalas de trabalho.
  // Servem para a Ana ORIENTAR a conversa — nunca para afirmar requisito ou prazo.
  escalas: [
    {
      id: "visto_exterior",
      nome: "Visto solicitado no exterior",
      descricao:
        "Autorização pedida antes de viajar, em consulado ou embaixada do Brasil, por quem ainda está fora do país.",
      quandoUsar: "A pessoa está no exterior e quer vir para o Brasil.",
    },
    {
      id: "regularizacao",
      nome: "Regularização migratória",
      descricao:
        "Caminho de quem já está no Brasil e precisa obter ou renovar autorização de residência e documento.",
      quandoUsar: "A pessoa já está aqui. Se houver sinal de irregularidade, é caso do advogado.",
    },
    {
      id: "refugio",
      nome: "Solicitação de refúgio",
      descricao:
        "Proteção para quem saiu do próprio país por perseguição, conflito ou grave violação de direitos humanos.",
      quandoUsar: "Sempre com o time jurídico, e com prioridade.",
    },
    {
      id: "naturalizacao",
      nome: "Naturalização e nacionalidade",
      descricao: "Quando quem já vive no Brasil quer se tornar brasileiro.",
      quandoUsar: "A pessoa fala em tirar cidadania, virar brasileiro ou tirar passaporte brasileiro.",
    },
    {
      id: "mercosul",
      nome: "Residência pelo Mercosul",
      descricao: "Caminho próprio de residência e trabalho para nacionais dos países do bloco.",
      quandoUsar: "A nacionalidade da pessoa pode abrir esse caminho — confirme a nacionalidade antes.",
    },
    {
      id: "reuniao_familiar",
      nome: "Reunião familiar",
      descricao: "Caminho de quem quer trazer ou manter perto cônjuge, filhos, pais e outros familiares.",
      quandoUsar: "A conversa envolve família separada por fronteira.",
    },
  ],
};

/* ------------------------------------------------------------------ */
/* Configuração completa                                               */
/* ------------------------------------------------------------------ */

export interface TrainingConfig {
  reasoning: ReasoningBlock[];
  identity: Identity;
  objections: ObjectionConfig[];
  transferRules: TransferRuleConfig[];
  guardrails: GuardrailsConfig;
  technical: TechnicalKnowledge;
}

export const DEFAULT_TRAINING: TrainingConfig = {
  reasoning: DEFAULT_REASONING,
  identity: DEFAULT_IDENTITY,
  objections: DEFAULT_OBJECTIONS,
  transferRules: DEFAULT_TRANSFER_RULES,
  guardrails: DEFAULT_GUARDRAILS,
  technical: DEFAULT_TECHNICAL,
};

/* ------------------------------------------------------------------ */
/* Blocos de prompt                                                    */
/* ------------------------------------------------------------------ */

export function buildIdentityBlock(id: Identity): string {
  return `════════ COMO VOCÊ FALA ════════
Você se chama ${id.agentName} e atende pela ${id.companyName}. Você não é advogada e nunca se apresenta como tal.
${TONE_PROMPT[id.tone]}
${LENGTH_PROMPT[id.messageLength]}
Sempre no idioma em que a pessoa escreveu — inclusive o seu nome e o da empresa, que não se traduzem.`;
}

export function buildBehaviorRulesBlock(regras: Record<BehaviorRuleId, boolean>): string {
  const ativas = BEHAVIOR_RULES.filter((r) => regras[r.id] !== false);
  if (ativas.length === 0) return "";
  const linhas = ativas.map((r, i) => `${i + 1}. ${r.prompt}`).join("\n");
  return `════════ REGRAS QUE NÃO SE QUEBRAM ════════\n${linhas}`;
}

export function buildTechnicalBlock(t: TechnicalKnowledge): string {
  const termos = t.termos
    .filter((x) => x.termo.trim() && x.definicao.trim())
    .map((x) => `• ${x.termo.trim()}: ${x.definicao.trim()}`)
    .join("\n");
  const escalas = t.escalas
    .filter((x) => x.nome.trim())
    .map((x) => `• ${x.nome.trim()} — ${x.descricao.trim()} Quando usar: ${x.quandoUsar.trim()}`)
    .join("\n");
  const partes: string[] = [];
  if (termos)
    partes.push(
      `TERMOS QUE VOCÊ EXPLICA EM UMA LINHA (nunca jogue a sigla solta na conversa):\n${termos}`,
    );
  if (escalas) partes.push(`CAMINHOS MIGRATÓRIOS ATENDIDOS:\n${escalas}`);
  if (partes.length === 0) return "";
  return `════════ CONHECIMENTO TÉCNICO ════════\nIsto é para ORIENTAR a conversa e traduzir termo técnico. NÃO é procedimento: requisito, documento, prazo e taxa só saem do material oficial que vier com a pergunta, ou do time jurídico.\n\n${partes.join("\n\n")}`;
}

/* ------------------------------------------------------------------ */
/* Normalização do que vem do banco                                    */
/* ------------------------------------------------------------------ */

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

export function normalizeIdentity(v: unknown): Identity {
  const o = (v ?? {}) as Partial<Identity>;
  return {
    agentName: str(o.agentName, DEFAULT_IDENTITY.agentName) || DEFAULT_IDENTITY.agentName,
    companyName: str(o.companyName, DEFAULT_IDENTITY.companyName) || DEFAULT_IDENTITY.companyName,
    tone: o.tone && o.tone in TONE_LABEL ? o.tone : DEFAULT_IDENTITY.tone,
    messageLength:
      o.messageLength && o.messageLength in LENGTH_LABEL
        ? o.messageLength
        : DEFAULT_IDENTITY.messageLength,
  };
}

// Nas funções abaixo, "não é array" cai no padrão do código (config nunca gravada ou
// corrompida), mas array VAZIO é respeitado como vazio: apagar todas as objeções é uma
// escolha legítima da equipe, e ressuscitar as 15 originais em silêncio seria pior do que
// ficar sem nenhuma. Quem quiser os padrões de volta tem o botão "Restaurar padrões".
export function normalizeObjections(v: unknown): ObjectionConfig[] {
  if (!Array.isArray(v)) return DEFAULT_OBJECTIONS;
  return v
    .map((raw, i) => {
      const o = (raw ?? {}) as Partial<ObjectionConfig>;
      return {
        id: str(o.id) || `obj_${i + 1}`,
        objecao: str(o.objecao),
        querDizer: str(o.querDizer),
        resposta: str(o.resposta),
        keywords: strList(o.keywords),
        ativo: o.ativo !== false,
      };
    })
    .filter((o) => o.objecao.trim() && o.resposta.trim());
}

export function normalizeTransferRules(v: unknown): TransferRuleConfig[] {
  if (!Array.isArray(v)) return DEFAULT_TRANSFER_RULES;
  return v
    .map((raw, i) => {
      const r = (raw ?? {}) as Partial<TransferRuleConfig>;
      return {
        id: str(r.id) || `regra_${i + 1}`,
        categoria: str(r.categoria),
        keywords: strList(r.keywords),
        resposta: str(r.resposta),
        ativo: r.ativo !== false,
      };
    })
    .filter((r) => r.categoria.trim() && r.keywords.length > 0);
}

export function normalizeGuardrails(v: unknown): GuardrailsConfig {
  const g = (v ?? {}) as Partial<GuardrailsConfig>;
  const regrasRaw = (g.regras ?? {}) as Record<string, unknown>;
  const regras = BEHAVIOR_RULES.reduce(
    (acc, r) => ({ ...acc, [r.id]: regrasRaw[r.id] !== false }),
    {} as Record<BehaviorRuleId, boolean>,
  );
  const termos = Array.isArray(g.termos) ? strList(g.termos) : DEFAULT_GUARDRAILS.termos;
  return { termos, regras };
}

export function normalizeTechnical(v: unknown): TechnicalKnowledge {
  const t = (v ?? {}) as Partial<TechnicalKnowledge>;
  const termos = Array.isArray(t.termos)
    ? t.termos
        .map((raw, i) => {
          const x = (raw ?? {}) as Partial<GlossaryTerm>;
          return { id: str(x.id) || `termo_${i + 1}`, termo: str(x.termo), definicao: str(x.definicao) };
        })
        .filter((x) => x.termo.trim())
    : [];
  const escalas = Array.isArray(t.escalas)
    ? t.escalas
        .map((raw, i) => {
          const x = (raw ?? {}) as Partial<WorkSchedule>;
          return {
            id: str(x.id) || `escala_${i + 1}`,
            nome: str(x.nome),
            descricao: str(x.descricao),
            quandoUsar: str(x.quandoUsar),
          };
        })
        .filter((x) => x.nome.trim())
    : [];
  return {
    termos: Array.isArray(t.termos) ? termos : DEFAULT_TECHNICAL.termos,
    escalas: Array.isArray(t.escalas) ? escalas : DEFAULT_TECHNICAL.escalas,
  };
}
