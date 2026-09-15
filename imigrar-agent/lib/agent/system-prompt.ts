import { getRepository } from "@/lib/data";
import {
  DEFAULT_KNOWLEDGE,
  buildSystemPrompt,
  type KnowledgeBase,
  type PromptOverrides,
} from "@/lib/agent/knowledge";
import { blocoMaterialOficial } from "@/lib/agent/material-oficial";
import { acervoDoPrompt } from "@/lib/agent/acervo";
import {
  DEFAULT_TRAINING,
  buildBehaviorRulesBlock,
  buildIdentityBlock,
  buildTechnicalBlock,
  normalizeGuardrails,
  normalizeIdentity,
  normalizeObjections,
  normalizeReasoning,
  normalizeTechnical,
  normalizeTransferRules,
  serializeReasoning,
  type TrainingConfig,
} from "@/lib/agent/training";

// Prompt montado a partir da Base de Conhecimento padrão (fallback / exibição).
export const DEFAULT_SYSTEM_PROMPT = buildSystemPrompt(DEFAULT_KNOWLEDGE);

// Base de Conhecimento efetiva: a versão editada no dashboard (config "knowledge_base")
// ou a padrão do código.
export async function getKnowledgeBase(): Promise<KnowledgeBase> {
  const cfg = await getRepository().getConfig<KnowledgeBase>("knowledge_base");
  if (cfg && Array.isArray(cfg.sections) && typeof cfg.persona === "string") {
    return cfg;
  }
  return DEFAULT_KNOWLEDGE;
}

/**
 * Treinamento efetivo: o que a equipe editou em /dashboard/treinar, com o padrão do
 * código onde ainda não houve edição. Cada bloco tem a sua chave em agent_config, então
 * mexer nas objeções não derruba as regras de encaminhamento e vice-versa.
 */
export async function getTrainingConfig(): Promise<TrainingConfig> {
  const repo = getRepository();
  const [kb, objections, transferRules, guardrails, technical, reasoning] = await Promise.all([
    repo.getConfig<KnowledgeBase & { identity?: unknown }>("knowledge_base"),
    repo.getConfig<unknown>("objections"),
    repo.getConfig<unknown>("transfer_rules"),
    repo.getConfig<unknown>("guardrails"),
    repo.getConfig<unknown>("technical_knowledge"),
    repo.getConfig<unknown>("reasoning"),
  ]);
  return {
    reasoning: reasoning ? normalizeReasoning(reasoning) : DEFAULT_TRAINING.reasoning,
    identity: kb?.identity ? normalizeIdentity(kb.identity) : DEFAULT_TRAINING.identity,
    objections: objections ? normalizeObjections(objections) : DEFAULT_TRAINING.objections,
    transferRules: transferRules
      ? normalizeTransferRules(transferRules)
      : DEFAULT_TRAINING.transferRules,
    guardrails: guardrails ? normalizeGuardrails(guardrails) : DEFAULT_TRAINING.guardrails,
    technical: technical ? normalizeTechnical(technical) : DEFAULT_TRAINING.technical,
  };
}

/** Converte o treinamento nos blocos que o buildSystemPrompt sabe consumir. */
export function trainingToOverrides(t: TrainingConfig): PromptOverrides {
  const objections = t.objections.filter((o) => o.ativo);
  const transferRules = t.transferRules.filter((r) => r.ativo);
  return {
    reasoningBlock: serializeReasoning(t.reasoning),
    identityBlock: buildIdentityBlock(t.identity),
    behaviorBlock: buildBehaviorRulesBlock(t.guardrails.regras),
    technicalBlock: buildTechnicalBlock(t.technical),
    objections,
    transferRules: transferRules.map((r) => ({ categoria: r.categoria, resposta: r.resposta })),
    confidential: t.guardrails.termos,
  };
}

// Perguntas do briefing e seus rótulos legíveis no prompt do agente.
const BRIEFING_LABELS: Record<string, string> = {
  resumo: "O que a empresa faz",
  servicos: "Serviços",
  diferenciais: "Diferenciais",
  regioes: "Regiões atendidas",
  horario: "Horário de atendimento",
  cases: "Cases / clientes de destaque",
  cliente_ideal: "Perfil do cliente ideal",
  condicoes: "Condições comerciais",
  objecoes: "Objeções comuns e como responder",
  transferencia: "Quando transferir para humano",
};

// Bloco de briefing a ser anexado ao prompt final, ou string vazia se não há
// respostas preenchidas.
async function getBriefingBlock(): Promise<string> {
  const answers = await getRepository().getConfig<Record<string, string>>("briefing");
  if (!answers) return "";

  const lines = Object.entries(BRIEFING_LABELS)
    .map(([id, label]) => [label, answers[id]?.trim()] as const)
    .filter(([, value]) => !!value)
    .map(([label, value]) => `${label}: ${value}`);

  if (lines.length === 0) return "";

  return `\n\n=== BRIEFING DA EMPRESA (fornecido pela equipe — prioridade alta, use como verdade) ===\n${lines.join("\n")}`;
}

// "Treinar o agente": perguntas/respostas livres cadastradas no painel (config "faq").
// Anexadas ao prompt como verdade — é como a equipe ensina a empresa sem programador.
async function getFaqBlock(): Promise<string> {
  const items = await getRepository().getConfig<{ pergunta: string; resposta: string }[]>("faq");
  if (!items?.length) return "";
  const lines = items
    .filter((f) => f?.pergunta?.trim() && f?.resposta?.trim())
    .map((f, i) => `${i + 1}. P: ${f.pergunta.trim()}\n   R: ${f.resposta.trim()}`)
    .join("\n");
  if (!lines) return "";
  return `\n\n════════ PERGUNTAS FREQUENTES (ensinadas pela equipe — use a IDEIA da resposta com AS SUAS PALAVRAS, tratando como verdade) ════════\n${lines}`;
}

/**
 * O PROMPT CRU, E POR QUE ELE É UMA ARMADILHA.
 *
 * `agent_config.system_prompt` é um override herdado da tela antiga de configuração (hoje
 * um redirect para /dashboard/treinar). Enquanto ele existir no banco, ele vence TUDO que
 * a tela de treinar edita — persona, seções, objeções, regras, raciocínio, técnico — e só
 * o briefing, o FAQ e o material oficial continuam entrando.
 *
 * O problema não é o override existir: é ele ser INVISÍVEL. A prévia da aba "Testar" é
 * montada a partir de knowledge_base + treinamento, então ela mostrava um prompt que o
 * agente não estava usando, e quem editasse a tela veria "Salvo" sem nada mudar na
 * conversa. Por isso ele agora tem nome e é consultável — /api/training o devolve, e a
 * tela avisa.
 *
 * O piso de 50 caracteres mora aqui, num lugar só: chave vazia ou com um resto de teste
 * não é override.
 */
const PROMPT_CRU_MINIMO = 50;

/** O override cru, se houver um valendo. `null` quando a tela de treinar é quem manda. */
export async function getPromptCru(): Promise<string | null> {
  const raw = await getRepository().getConfig<string>("system_prompt");
  return typeof raw === "string" && raw.length > PROMPT_CRU_MINIMO ? raw : null;
}

// System prompt efetivo. Precedência:
// 1) override raw "system_prompt" (legado — ver getPromptCru), se definido;
// 2) prompt montado a partir da Base de Conhecimento.
// Em ambos os casos, o briefing e o FAQ da empresa (do dashboard) são anexados ao final.
export async function getSystemPrompt(): Promise<string> {
  const raw = await getPromptCru();
  const [briefingBlock, faqBlock, acervo] = await Promise.all([
    getBriefingBlock(),
    getFaqBlock(),
    // O acervo do BANCO, não os sete do código: é o que a tela de treinar acrescenta e
    // remove. Sem isto, subir um documento o indexaria na base e a Ana continuaria dizendo
    // que o assunto não é a área dela — porque o prompt dela listaria só os sete.
    acervoDoPrompt(),
  ]);
  // ═══ O MATERIAL OFICIAL ENTRA SEMPRE, E POR ÚLTIMO ═══
  //
  // Por último porque é a última coisa que o modelo lê antes de responder. E SEMPRE —
  // inclusive por cima de um `system_prompt` cru gravado à mão, inclusive depois de a
  // equipe reescrever a persona inteira na tela de treinar. O RAG injeta trecho só quando
  // a mensagem pede pesquisa; as regras que impedem a Ana de dar parecer sobre o caso de
  // alguém não podem depender disso. Ver lib/agent/material-oficial.ts.
  const material = blocoMaterialOficial(acervo);
  if (raw) return raw + briefingBlock + faqBlock + material;
  const [kb, training] = await Promise.all([getKnowledgeBase(), getTrainingConfig()]);
  return buildSystemPrompt(kb, trainingToOverrides(training)) + briefingBlock + faqBlock + material;
}
