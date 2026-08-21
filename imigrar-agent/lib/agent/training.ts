// TREINAMENTO DA SHAYENE — tudo que a equipe edita em /dashboard/treinar.
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
 * edita "como a Shayene pensa" rolando um campo desses. Em blocos, dá para mexer só em
 * "COMO VOCÊ VENDE" sem esbarrar no resto.
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

export const DEFAULT_IDENTITY: Identity = {
  agentName: "Shayene",
  companyName: "Shine Rio",
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
    "Tom profissional e caloroso: acolhe, trata pelo nome, soa como uma pessoa do time — sem informalidade excessiva.",
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
 * Regex a partir das palavras editadas no painel. Sem \b nas bordas: as palavras vêm com
 * acento e espaço ("nota fiscal", "má conduta"), e a borda de palavra do JS não entende
 * acento — "insatisfação\b" nunca casaria. `includes` semântico, portanto, é o certo aqui.
 */
export function buildTransferRegex(keywords: string[]): RegExp | null {
  const parts = keywords
    .map((k) => k.trim())
    .filter(Boolean)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (parts.length === 0) return null;
  return new RegExp(parts.join("|"), "i");
}

/* ------------------------------------------------------------------ */
/* Guardrails e regras gerais de comportamento                         */
/* ------------------------------------------------------------------ */

export type BehaviorRuleId =
  | "nao_oferecer_humano"
  | "nao_repetir_pergunta"
  | "nao_inventar_preco"
  | "nao_revelar_custo"
  | "confirmar_quantidade"
  | "gerar_pdf";

export interface BehaviorRule {
  id: BehaviorRuleId;
  label: string;
  /** Linha que entra no prompt quando a regra está ligada. */
  prompt: string;
}

export const BEHAVIOR_RULES: BehaviorRule[] = [
  {
    id: "nao_oferecer_humano",
    label: "Nunca oferecer atendimento humano por iniciativa própria",
    prompt:
      "Nunca ofereça falar com uma pessoa do time por iniciativa própria. Você resolve. Só encaminhe se a pessoa pedir, se for emergência ou se houver uma providência que só um humano pode tomar.",
  },
  {
    id: "nao_repetir_pergunta",
    label: "Nunca repetir pergunta já respondida",
    prompt:
      "Nunca pergunte de novo algo que a pessoa já respondeu nesta conversa. Releia o histórico antes de perguntar qualquer coisa.",
  },
  {
    id: "nao_inventar_preco",
    label: "Nunca inventar preço sem CCT confirmada",
    prompt:
      "Nunca informe um valor sem que a convenção coletiva (CCT) da praça esteja confirmada no sistema. Sem CCT, o preço é sob consulta — diga isso com naturalidade e siga a conversa.",
  },
  {
    id: "nao_revelar_custo",
    label: "Nunca revelar custos internos ou margem",
    prompt:
      "Nunca revele custo interno, margem, taxa administrativa ou como o lucro é composto. O cliente vê preço final e o que está incluso, nunca a composição interna.",
  },
  {
    id: "confirmar_quantidade",
    label: "Sempre confirmar quantidade antes de calcular",
    prompt:
      "Sempre confirme a quantidade (quantos postos ou quantos funcionários, e qual a cobertura) antes de calcular qualquer preço. Posto 24h não é uma pessoa.",
  },
  {
    id: "gerar_pdf",
    label: "Sempre gerar PDF assim que tiver empresa + serviço + qtd",
    prompt:
      "Assim que tiver empresa, serviço e quantidade, gere e envie a proposta em PDF você mesma. Não espere o cliente pedir e não passe para o comercial antes do orçamento.",
  },
];

export interface GuardrailsConfig {
  /** Termos que a Shayene nunca revela. */
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

export const DEFAULT_TECHNICAL: TechnicalKnowledge = {
  termos: [
    {
      id: "posto_24h",
      termo: "Posto 24h",
      definicao:
        "Posição que fica coberta 24 horas por dia. Na escala 12x36 exige 4 funcionários — 2 no turno diurno e 2 no noturno, estes com adicional noturno. Não são 2 pessoas.",
    },
    {
      id: "asg",
      termo: "ASG",
      definicao: "Auxiliar de Serviços Gerais, CBO 5143-20. Limpeza e conservação predial.",
    },
    {
      id: "cct",
      termo: "CCT",
      definicao:
        "Convenção Coletiva de Trabalho. Define o piso salarial, os benefícios e os adicionais de cada praça. Sem CCT cadastrada para a região, o preço é sob consulta.",
    },
    {
      id: "in_05",
      termo: "IN 05/2017",
      definicao:
        "Instrução Normativa que define a planilha de composição de custos em 6 módulos. É o formato que a Shine Rio usa para montar o preço de cada posto.",
    },
    {
      id: "bdi",
      termo: "BDI",
      definicao:
        "Módulo 6 da planilha: custos indiretos, tributos e lucro aplicados sobre o custo do posto.",
    },
    {
      id: "adicional_noturno",
      termo: "Adicional noturno",
      definicao:
        "Acréscimo legal sobre a hora trabalhada entre 22h e 5h, com hora reduzida de 52min30s. Entra no Módulo 1 de quem cobre o turno da noite.",
    },
    {
      id: "reposicao",
      termo: "Reposição de ausências",
      definicao:
        "Módulo 4: custo de cobrir férias, faltas, licenças e afastamentos sem deixar o posto descoberto.",
    },
    {
      id: "intrajornada",
      termo: "Intrajornada",
      definicao:
        "Módulo 4.2: substituto ou indenização do intervalo de almoço quando o posto não pode ficar vazio.",
    },
  ],
  escalas: [
    {
      id: "5x2_44h",
      nome: "5x2 — 44h semanais",
      descricao:
        "Segunda a sexta, com jornada de 8h48 ou 8h de segunda a sexta e 4h no sábado. Uma pessoa por posto.",
      quandoUsar: "Limpeza, recepção, zeladoria e administrativo em horário comercial.",
    },
    {
      id: "12x36",
      nome: "12x36",
      descricao:
        "12 horas trabalhadas por 36 de folga. Cada turno de 12h exige 2 pessoas se alternando para cobrir todos os dias.",
      quandoUsar:
        "Portaria e vigilância com cobertura contínua. É a escala do posto 24h (4 funcionários).",
    },
    {
      id: "6x1_44h",
      nome: "6x1 — 44h semanais",
      descricao: "Seis dias de trabalho por um de folga, respeitando as 44h semanais.",
      quandoUsar: "Jardinagem, manutenção e operações que precisam de presença quase diária.",
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
Você se chama ${id.agentName} e atende pela ${id.companyName}.
${TONE_PROMPT[id.tone]}
${LENGTH_PROMPT[id.messageLength]}`;
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
  if (termos) partes.push(`TERMOS DO SETOR (use com precisão, é assim que o cliente fala):\n${termos}`);
  if (escalas) partes.push(`ESCALAS DE TRABALHO:\n${escalas}`);
  if (partes.length === 0) return "";
  return `════════ CONHECIMENTO TÉCNICO ════════\n${partes.join("\n\n")}`;
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
