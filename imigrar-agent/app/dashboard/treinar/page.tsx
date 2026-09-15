"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  PageHeader,
  Icon,
  btnPrimary,
  btnGhost,
  Skeleton,
  SkeletonCard,
  type IconName,
} from "@/components/dashboard/ui";
import {
  LENGTH_LABEL,
  PERSONA_MAX,
  TONE_LABEL,
  type GlossaryTerm,
  type GuardrailsConfig,
  type Identity,
  type MessageLength,
  type ObjectionConfig,
  type ReasoningBlock,
  type TechnicalKnowledge,
  type Tone,
  type TransferRuleConfig,
  type WorkSchedule,
} from "@/lib/agent/training";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";

/* ================================================================== */
/* Tipos                                                              */
/* ================================================================== */

type Section = { id: string; title: string; body: string };
type FaqItem = { pergunta: string; resposta: string };
type BehaviorRuleMeta = { id: string; label: string };

type Draft = {
  persona: string;
  identity: Identity;
  reasoning: ReasoningBlock[];
  sections: Section[];
  objections: ObjectionConfig[];
  transferRules: TransferRuleConfig[];
  guardrails: GuardrailsConfig;
  technical: TechnicalKnowledge;
  briefing: Record<string, string>;
  faq: FaqItem[];
};

type Feedback = { kind: "success" | "error"; text: string } | null;

type MaterialOficialResposta = {
  regras: string;
  /** O acervo que VALE (código menos removidos, mais acrescentados) — ver lib/agent/acervo.ts. */
  documentos: DocumentoDoAcervo[];
};

type TabId =
  | "identidade"
  | "empresa"
  | "objecoes"
  | "regras"
  | "raciocinio"
  | "tecnico"
  | "material"
  | "testar";

const TABS: { id: TabId; label: string; icon: IconName }[] = [
  { id: "identidade", label: "Identidade", icon: "agent" },
  { id: "empresa", label: "Empresa e serviços", icon: "book" },
  { id: "objecoes", label: "Objeções", icon: "chat" },
  { id: "regras", label: "Regras de atendimento", icon: "shield" },
  { id: "raciocinio", label: "Raciocínio", icon: "activity" },
  { id: "tecnico", label: "Conhecimento técnico", icon: "calc" },
  { id: "material", label: "Material oficial", icon: "book" },
  { id: "testar", label: "Testar", icon: "pulse" },
];

/* ================================================================== */
/* Estilos e utilitários compartilhados                               */
/* ================================================================== */

const inputCls =
  "w-full rounded-xl border border-ib-line bg-white px-3 py-2.5 text-sm text-ib-ink placeholder:text-ib-slate focus:border-ib-mar focus:outline-none focus:ring-2 focus:ring-ib-mar/20";
const areaCls =
  "w-full rounded-xl border border-ib-line bg-white p-3 text-sm leading-relaxed text-ib-ink placeholder:text-ib-slate focus:border-ib-mar focus:outline-none focus:ring-2 focus:ring-ib-mar/20";

// id estável para itens novos, sem depender de índice (que muda quando se remove um item
// do meio da lista e faria o React reaproveitar o textarea errado).
let seq = 0;
const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${seq++}`;

function BlockHeading({
  eyebrow,
  title,
  description,
  right,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-ib-line pb-4">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ib-selo">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-ib-ink">{title}</h2>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ib-slate">{description}</p>
        ) : null}
      </div>
      {right}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ib-mar ${
        checked ? "bg-ib-mar" : "bg-ib-line"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

/** Lista de palavras-gatilho editável. Enter ou vírgula confirma a tag. */
function TagInput({
  tags,
  onChange,
  placeholder,
  label,
}: {
  tags: string[];
  onChange: (t: string[]) => void;
  placeholder: string;
  label: string;
}) {
  const [value, setValue] = useState("");

  function commit(raw: string) {
    const parts = raw
      .split(",")
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean);
    if (parts.length === 0) return;
    const merged = [...tags];
    for (const p of parts) if (!merged.includes(p)) merged.push(p);
    onChange(merged);
    setValue("");
  }

  return (
    <div className="rounded-xl border border-ib-line bg-white p-2">
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1.5 rounded-lg bg-ib-bruma px-2 py-1 text-xs font-medium text-ib-mar"
          >
            {t}
            <button
              type="button"
              aria-label={`Remover ${t}`}
              onClick={() => onChange(tags.filter((x) => x !== t))}
              className="text-ib-mar/60 transition hover:text-ib-danger"
            >
              ×
            </button>
          </span>
        ))}
        <input
          aria-label={label}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit(value);
            } else if (e.key === "Backspace" && !value && tags.length) {
              onChange(tags.slice(0, -1));
            }
          }}
          onBlur={() => commit(value)}
          placeholder={tags.length ? "" : placeholder}
          className="min-w-[9rem] flex-1 bg-transparent px-1.5 py-1 text-sm text-ib-ink outline-none placeholder:text-ib-slate"
        />
      </div>
    </div>
  );
}

function CharCount({ value, max }: { value: string; max?: number }) {
  return (
    <p className="mt-1.5 text-right font-mono text-[11px] tabular-nums text-ib-slate">
      {value.length.toLocaleString("pt-BR")}
      {max ? ` / ${max.toLocaleString("pt-BR")}` : ""} caracteres
    </p>
  );
}

/* ================================================================== */
/* Página                                                             */
/* ================================================================== */

export default function TreinarPage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("identidade");

  const [draft, setDraft] = useState<Draft | null>(null);
  // Cópia do que está no banco. Compara com o rascunho para saber se há mudança
  // pendente — e é ela que a aba Testar exibe, porque o chat usa o que está SALVO.
  const [saved, setSaved] = useState<Draft | null>(null);
  const [behaviorRules, setBehaviorRules] = useState<BehaviorRuleMeta[]>([]);
  const [preview, setPreview] = useState("");
  // O override legado de agent_config.system_prompt, quando existe. Enquanto ele estiver
  // no banco, nada desta tela chega ao agente — ver getPromptCru() em lib/agent.
  const [promptCru, setPromptCru] = useState<string | null>(null);
  const [material, setMaterial] = useState<MaterialOficialResposta | null>(null);
  const [agentOnline, setAgentOnline] = useState<boolean | null>(null);

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [tRes, sRes] = await Promise.all([
          fetch("/api/training", { cache: "no-store" }),
          fetch("/api/agent/status", { cache: "no-store" }),
        ]);
        if (!tRes.ok) throw new Error(`HTTP ${tRes.status}`);
        const d = await tRes.json();
        if (!active) return;
        const loaded: Draft = {
          persona: d.persona ?? "",
          identity: d.identity,
          reasoning: d.reasoning ?? [],
          sections: d.sections ?? [],
          objections: d.objections ?? [],
          transferRules: d.transferRules ?? [],
          guardrails: d.guardrails,
          technical: d.technical,
          briefing: d.briefing ?? {},
          faq: d.faq ?? [],
        };
        setDraft(loaded);
        setSaved(structuredClone(loaded));
        setBehaviorRules(d.behaviorRules ?? []);
        setPreview(d.preview ?? "");
        setPromptCru(d.promptCru ?? null);
        setMaterial(d.materialOficial ?? null);
        if (sRes.ok) {
          const s = (await sRes.json()) as { mode?: string };
          setAgentOnline(s.mode === "real");
        }
      } catch (err) {
        if (active) setLoadError(err instanceof Error ? err.message : "Erro ao carregar");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const patch = useCallback((p: Partial<Draft>) => {
    setDraft((prev) => (prev ? { ...prev, ...p } : prev));
    setFeedback(null);
  }, []);

  const dirty = useMemo(
    () => !!draft && !!saved && JSON.stringify(draft) !== JSON.stringify(saved),
    [draft, saved],
  );

  // Aviso do navegador ao sair com alteração não salva. Sem isto, trocar de página
  // depois de reescrever a persona descarta tudo em silêncio.
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  async function save() {
    if (!draft) return;
    setFeedback(null);
    if (draft.persona.trim().length < 10) {
      setTab("identidade");
      setFeedback({ kind: "error", text: "A persona precisa de ao menos 10 caracteres." });
      return;
    }
    // O teto vale no servidor de qualquer jeito. Conferir aqui é para a recusa vir COM a
    // conta feita — "está com 8.412, o limite é 8.000" — em vez de um erro genérico depois
    // de a pessoa ter escrito o texto inteiro e clicado em salvar.
    if (draft.persona.trim().length > PERSONA_MAX) {
      setTab("identidade");
      setFeedback({
        kind: "error",
        text: `A persona está com ${draft.persona.trim().length.toLocaleString("pt-BR")} caracteres e o limite é ${PERSONA_MAX.toLocaleString("pt-BR")}. Corte o excedente ou peça para aumentarmos o limite.`,
      });
      return;
    }
    if (draft.sections.some((s) => !s.title.trim())) {
      setTab("empresa");
      setFeedback({ kind: "error", text: "Toda seção precisa de um título." });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/training", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          faq: draft.faq.filter((f) => f.pergunta.trim() && f.resposta.trim()),
        }),
      });
      const d = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        preview?: string;
        promptCru?: string | null;
        error?: string;
      };
      if (!res.ok || !d.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      if (d.preview) setPreview(d.preview);
      setPromptCru(d.promptCru ?? null);
      setSaved(structuredClone(draft));
      // "O agente já está usando isso" seria mentira com o override legado no banco —
      // gravou, sim, mas o agente continua lendo o prompt cru. Ver a aba Testar.
      setFeedback(
        d.promptCru
          ? {
              kind: "error",
              text: "Salvo, MAS o agente não está usando: há um prompt cru antigo no banco que vence esta tela. Veja o aviso na aba Testar.",
            }
          : { kind: "success", text: "Salvo. O agente já está usando isso." },
      );
    } catch (err) {
      setFeedback({ kind: "error", text: err instanceof Error ? err.message : "Erro ao salvar" });
    } finally {
      setSaving(false);
    }
  }

  /**
   * Joga fora o prompt cru legado e devolve o comando do agente a esta tela.
   *
   * Não é "restaurar padrões": aquilo mexe no rascunho e espera um Salvar. Aqui a escrita
   * é imediata e no banco, porque enquanto essa chave existir tudo o que se salvar nesta
   * tela é gravado e ignorado — e a confusão que isso gera é justamente o que se está
   * removendo.
   */
  async function descartarPromptCru() {
    try {
      const res = await fetch("/api/training?descartar=prompt_cru", { method: "POST" });
      const d = await res.json();
      if (!res.ok || !d.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      setPromptCru(null);
      setFeedback({
        kind: "success",
        text: "Prompt cru descartado. O agente passou a usar o que está nesta tela.",
      });
    } catch (err) {
      setFeedback({
        kind: "error",
        text: err instanceof Error ? err.message : "Erro ao descartar o prompt cru",
      });
    }
  }

  async function restore(
    bloco: "objections" | "transferRules" | "guardrails" | "technical" | "reasoning",
  ) {
    try {
      const res = await fetch(`/api/training?restore=${bloco}`, { method: "POST" });
      const d = await res.json();
      if (!res.ok || !d.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      patch({ [bloco]: d[bloco] } as Partial<Draft>);
      setFeedback({
        kind: "success",
        text: "Padrões restaurados no rascunho — clique em Salvar alterações para aplicar.",
      });
    } catch (err) {
      setFeedback({
        kind: "error",
        text: err instanceof Error ? err.message : "Erro ao restaurar padrões",
      });
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Agente"
          title="Treinar o agente"
          description="Tudo que o agente sabe e como ele se comporta."
        />
        <Skeleton className="h-11 w-full rounded-xl" />
        <SkeletonCard lines={4} />
        <SkeletonCard lines={6} />
      </div>
    );
  }

  if (loadError || !draft) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Agente"
          title="Treinar o agente"
          description="Tudo que o agente sabe e como ele se comporta."
        />
        <div className="rounded-xl border border-ib-danger/20 bg-ib-danger/5 px-4 py-3 text-sm text-ib-danger">
          Não foi possível carregar o treinamento: {loadError}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Agente"
        title="Treinar o agente"
        description="Tudo que o agente sabe e como ele se comporta."
        actions={
          <>
            <StatusBadge online={agentOnline} />
            <a href="/simulate" target="_blank" rel="noopener noreferrer" className={btnGhost}>
              <Icon name="external" className="h-4 w-4" />
              Testar agora
            </a>
            <button type="button" onClick={save} disabled={saving || !dirty} className={btnPrimary}>
              <Icon name="check" className="h-4 w-4" />
              {saving ? "Salvando…" : dirty ? "Salvar alterações" : "Tudo salvo"}
            </button>
          </>
        }
      />

      {feedback ? (
        <p
          className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium ${
            feedback.kind === "success"
              ? "border border-ib-success/25 bg-ib-success/8 text-[#15803D]"
              : "border border-ib-danger/20 bg-ib-danger/5 text-ib-danger"
          }`}
        >
          <Icon name={feedback.kind === "success" ? "check" : "bolt"} className="h-3.5 w-3.5" />
          {feedback.text}
        </p>
      ) : null}

      {/* Tabs */}
      <div className="overflow-x-auto">
        <div role="tablist" aria-label="Áreas de treinamento" className="flex min-w-max gap-1 rounded-xl border border-ib-line bg-white p-1">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-ib-mar text-white shadow-sm"
                    : "text-ib-slate hover:bg-ib-papel hover:text-ib-ink"
                }`}
              >
                <Icon name={t.icon} className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === "identidade" ? <TabIdentidade draft={draft} patch={patch} /> : null}
      {tab === "empresa" ? <TabEmpresa draft={draft} patch={patch} /> : null}
      {tab === "objecoes" ? (
        <TabObjecoes draft={draft} patch={patch} onRestore={() => restore("objections")} />
      ) : null}
      {tab === "regras" ? (
        <TabRegras
          draft={draft}
          patch={patch}
          behaviorRules={behaviorRules}
          onRestore={() => restore("transferRules")}
        />
      ) : null}
      {tab === "raciocinio" ? (
        <TabRaciocinio draft={draft} patch={patch} onRestore={() => restore("reasoning")} />
      ) : null}
      {tab === "tecnico" ? (
        <TabTecnico draft={draft} patch={patch} onRestore={() => restore("technical")} />
      ) : null}
      {tab === "material" ? <TabMaterial material={material} /> : null}
      {tab === "testar" ? (
        <TabTestar
          saved={saved}
          preview={preview}
          dirty={dirty}
          promptCru={promptCru}
          onDescartarPromptCru={descartarPromptCru}
        />
      ) : null}
    </div>
  );
}

function StatusBadge({ online }: { online: boolean | null }) {
  if (online === null) return <Skeleton className="h-7 w-20 rounded-full" />;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        online
          ? "border border-ib-success/25 bg-ib-success/8 text-[#15803D]"
          : "border border-ib-danger/20 bg-ib-danger/5 text-ib-danger"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-[#15803D]" : "bg-ib-danger"}`} />
      {online ? "Ativa" : "Offline"}
    </span>
  );
}

/* ================================================================== */
/* TAB 1 — Identidade                                                 */
/* ================================================================== */

function TabIdentidade({ draft, patch }: { draft: Draft; patch: (p: Partial<Draft>) => void }) {
  const id = draft.identity;
  const set = (p: Partial<Identity>) => patch({ identity: { ...id, ...p } });

  // Prévia da apresentação: monta a primeira mensagem a partir do nome, da empresa e do
  // tom escolhidos. Não chama o modelo — é uma amostra do formato, não a resposta real.
  const apresentacao = useMemo(() => {
    const base: Record<Tone, string> = {
      profissional_calorosa: `Oi! Aqui é a ${id.agentName}, da ${id.companyName}. Como posso te ajudar?`,
      formal: `Olá. Meu nome é ${id.agentName}, falo pela ${id.companyName}. Em que posso ajudá-lo?`,
      direta: `Oi, ${id.agentName} da ${id.companyName}. Me conta o que você precisa?`,
    };
    const extra: Record<MessageLength, string> = {
      curtas: "",
      medias: " A gente trabalha com terceirização de mão de obra — limpeza, portaria, recepção e manutenção.",
      detalhadas:
        " A gente trabalha com terceirização de mão de obra: limpeza, portaria, recepção, copa e manutenção predial. Me diz qual serviço você precisa, para quantos postos e em que região, que eu já monto uma proposta pra você.",
    };
    return base[id.tone] + extra[id.messageLength];
  }, [id]);

  return (
    <div className="space-y-6">
      <Card className="p-5 sm:p-6">
        <BlockHeading
          eyebrow="Identidade"
          title="Quem ela é e como ela fala"
          description="O nome, a empresa e o jeito de escrever. Vale para todas as conversas."
        />
        <div className="grid gap-4 pt-5 sm:grid-cols-2">
          <div>
            <label htmlFor="agent-name" className="block text-sm font-medium text-ib-ink">
              Nome do agente
            </label>
            <input
              id="agent-name"
              value={id.agentName}
              onChange={(e) => set({ agentName: e.target.value })}
              className={`${inputCls} mt-1.5`}
              placeholder="Agente"
            />
          </div>
          <div>
            <label htmlFor="company-name" className="block text-sm font-medium text-ib-ink">
              Empresa
            </label>
            <input
              id="company-name"
              value={id.companyName}
              onChange={(e) => set({ companyName: e.target.value })}
              className={`${inputCls} mt-1.5`}
              placeholder="Imigrar Brasil"
            />
          </div>
          <div>
            <label htmlFor="tone" className="block text-sm font-medium text-ib-ink">
              Tom de voz
            </label>
            <select
              id="tone"
              value={id.tone}
              onChange={(e) => set({ tone: e.target.value as Tone })}
              className={`${inputCls} mt-1.5`}
            >
              {(Object.keys(TONE_LABEL) as Tone[]).map((t) => (
                <option key={t} value={t}>
                  {TONE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="length" className="block text-sm font-medium text-ib-ink">
              Tamanho das mensagens
            </label>
            <select
              id="length"
              value={id.messageLength}
              onChange={(e) => set({ messageLength: e.target.value as MessageLength })}
              className={`${inputCls} mt-1.5`}
            >
              {(Object.keys(LENGTH_LABEL) as MessageLength[]).map((l) => (
                <option key={l} value={l}>
                  {LENGTH_LABEL[l]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <BlockHeading
          eyebrow="Persona"
          title="Persona completa"
          description="A primeira coisa que ela lê antes de qualquer conversa. Define papel, postura e limites."
        />
        <div className="pt-5">
          <label htmlFor="persona" className="sr-only">
            Texto da persona
          </label>
          <textarea
            id="persona"
            value={draft.persona}
            onChange={(e) => patch({ persona: e.target.value })}
            rows={12}
            className={areaCls}
            placeholder="Você é o assistente virtual da Imigrar Brasil…"
          />
          <CharCount value={draft.persona} max={PERSONA_MAX} />
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <BlockHeading
          eyebrow="Prévia"
          title="Como ela se apresentaria"
          description="Amostra do formato, montada a partir do nome, do tom e do tamanho escolhidos acima."
        />
        <div className="pt-5">
          <div className="max-w-md rounded-2xl rounded-tl-sm bg-ib-bruma px-4 py-3 text-sm leading-relaxed text-ib-ink">
            {apresentacao}
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ================================================================== */
/* TAB 2 — Empresa e serviços                                         */
/* ================================================================== */

const BRIEFING_LABELS: Record<string, string> = {
  resumo: "O que a empresa faz (1–2 frases)",
  servicos: "Principais serviços oferecidos",
  diferenciais: "Diferenciais em relação à concorrência",
  regioes: "Regiões atendidas",
  horario: "Horário de atendimento comercial",
  cases: "Cases / clientes de destaque",
  cliente_ideal: "Perfil do cliente ideal",
  condicoes: "Condições comerciais (contrato mínimo, ticket, prazos)",
  objecoes: "Objeções comuns e como responder",
  transferencia: "Quando transferir para um humano + contatos",
};

function TabEmpresa({ draft, patch }: { draft: Draft; patch: (p: Partial<Draft>) => void }) {
  function updateSection(id: string, body: string) {
    patch({ sections: draft.sections.map((s) => (s.id === id ? { ...s, body } : s)) });
  }
  function addSection() {
    patch({ sections: [...draft.sections, { id: newId("secao"), title: "", body: "" }] });
  }
  function removeSection(id: string) {
    patch({ sections: draft.sections.filter((s) => s.id !== id) });
  }
  function renameSection(id: string, title: string) {
    patch({ sections: draft.sections.map((s) => (s.id === id ? { ...s, title } : s)) });
  }

  return (
    <div className="space-y-6">
      <Card className="p-5 sm:p-6">
        <BlockHeading
          eyebrow="Conhecimento"
          title="O que a Imigrar Brasil faz e oferece"
          description="Cada seção vira um bloco no prompt do agente. O título é o identificador da seção; o conteúdo é o que ela sabe."
          right={
            <button type="button" onClick={addSection} className={btnGhost}>
              <Icon name="plus" className="h-4 w-4" />
              Adicionar seção
            </button>
          }
        />
        <div className="space-y-4 pt-5">
          {draft.sections.map((s, i) => (
            <div key={s.id} className="rounded-xl border border-ib-line bg-ib-papel/40 p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white font-mono text-xs font-semibold text-ib-slate ring-1 ring-inset ring-ib-line">
                  {i + 1}
                </span>
                {s.title ? (
                  <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-ib-ink">
                    {s.title}
                  </h3>
                ) : (
                  <input
                    value={s.title}
                    onChange={(e) => renameSection(s.id, e.target.value)}
                    placeholder="Título da nova seção (ex.: Política de uniformes)"
                    className={`${inputCls} font-medium`}
                  />
                )}
                <button
                  type="button"
                  onClick={() => removeSection(s.id)}
                  aria-label={`Remover seção ${s.title || i + 1}`}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ib-slate transition hover:bg-ib-danger/10 hover:text-ib-danger"
                >
                  <Icon name="trash" className="h-4 w-4" />
                </button>
              </div>
              <label htmlFor={`sec-${s.id}`} className="sr-only">
                Conteúdo da seção {s.title || i + 1}
              </label>
              <textarea
                id={`sec-${s.id}`}
                value={s.body}
                onChange={(e) => updateSection(s.id, e.target.value)}
                rows={8}
                className={`${areaCls} mt-3 font-mono text-xs`}
                placeholder="Conteúdo desta seção…"
              />
              <CharCount value={s.body} />
            </div>
          ))}
        </div>
      </Card>

      <details className="group rounded-2xl border border-ib-line bg-white shadow-[0_1px_2px_rgba(11,18,32,0.04)]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 sm:px-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ib-selo">
              Briefing
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-ib-ink">
              Briefing da empresa
            </h2>
            <p className="mt-1 text-sm text-ib-slate">
              Respostas curtas que entram no prompt como verdade, com prioridade sobre as seções.
            </p>
          </div>
          <span className="shrink-0 text-ib-slate transition group-open:rotate-90">
            <Icon name="arrow" className="h-5 w-5" />
          </span>
        </summary>
        <div className="space-y-4 border-t border-ib-line px-5 py-5 sm:px-6">
          {Object.entries(BRIEFING_LABELS).map(([id, label]) => (
            <div key={id}>
              <label htmlFor={`brief-${id}`} className="block text-sm font-medium text-ib-ink">
                {label}
              </label>
              <textarea
                id={`brief-${id}`}
                value={draft.briefing[id] ?? ""}
                onChange={(e) => patch({ briefing: { ...draft.briefing, [id]: e.target.value } })}
                rows={2}
                className={`${areaCls} mt-1.5`}
              />
            </div>
          ))}
        </div>
      </details>

      <details className="group rounded-2xl border border-ib-line bg-white shadow-[0_1px_2px_rgba(11,18,32,0.04)]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 sm:px-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ib-selo">
              Perguntas frequentes
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-ib-ink">
              Perguntas que você ensinou ({draft.faq.length})
            </h2>
            <p className="mt-1 text-sm text-ib-slate">
              Pergunta do cliente e a resposta certa. Ela usa a ideia, com as palavras dela.
            </p>
          </div>
          <span className="shrink-0 text-ib-slate transition group-open:rotate-90">
            <Icon name="arrow" className="h-5 w-5" />
          </span>
        </summary>
        <div className="space-y-3 border-t border-ib-line px-5 py-5 sm:px-6">
          {draft.faq.map((f, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ib-bruma text-xs font-semibold text-ib-mar">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-2">
                <input
                  value={f.pergunta}
                  onChange={(e) =>
                    patch({
                      faq: draft.faq.map((x, j) =>
                        j === i ? { ...x, pergunta: e.target.value } : x,
                      ),
                    })
                  }
                  placeholder="Pergunta do cliente (ex.: Vocês atendem em Niterói?)"
                  className={inputCls}
                />
                <textarea
                  value={f.resposta}
                  onChange={(e) =>
                    patch({
                      faq: draft.faq.map((x, j) =>
                        j === i ? { ...x, resposta: e.target.value } : x,
                      ),
                    })
                  }
                  placeholder="Resposta que o agente deve dar"
                  rows={2}
                  className={`${areaCls} resize-y`}
                />
              </div>
              <button
                type="button"
                onClick={() => patch({ faq: draft.faq.filter((_, j) => j !== i) })}
                aria-label={`Excluir pergunta ${i + 1}`}
                className="mt-1 inline-flex items-center rounded-lg border border-ib-line bg-white p-2 text-ib-slate transition hover:border-ib-danger/30 hover:bg-ib-danger/5 hover:text-ib-danger"
              >
                <Icon name="trash" className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => patch({ faq: [...draft.faq, { pergunta: "", resposta: "" }] })}
            className={btnGhost}
          >
            <Icon name="plus" className="h-4 w-4" />
            Adicionar pergunta
          </button>
        </div>
      </details>
    </div>
  );
}

/* ================================================================== */
/* TAB 3 — Objeções                                                   */
/* ================================================================== */

function TabObjecoes({
  draft,
  patch,
  onRestore,
}: {
  draft: Draft;
  patch: (p: Partial<Draft>) => void;
  onRestore: () => void;
}) {
  const [open, setOpen] = useState<string | null>(draft.objections[0]?.id ?? null);

  const set = (id: string, p: Partial<ObjectionConfig>) =>
    patch({ objections: draft.objections.map((o) => (o.id === id ? { ...o, ...p } : o)) });

  function add() {
    const o: ObjectionConfig = {
      id: newId("obj"),
      objecao: "",
      querDizer: "",
      resposta: "",
      keywords: [],
      ativo: true,
    };
    patch({ objections: [...draft.objections, o] });
    setOpen(o.id);
  }

  const ativas = draft.objections.filter((o) => o.ativo).length;

  return (
    <Card className="p-5 sm:p-6">
      <BlockHeading
        eyebrow="Objeções"
        title={`Como ela responde quando o cliente resiste (${ativas} ativas)`}
        description="Ela se inspira na resposta e escreve com as próprias palavras — nunca copia a frase literal."
        right={
          <button type="button" onClick={onRestore} className={btnGhost}>
            <Icon name="bolt" className="h-4 w-4" />
            Restaurar padrões
          </button>
        }
      />

      <div className="space-y-3 pt-5">
        {draft.objections.map((o) => {
          const aberto = open === o.id;
          return (
            <div
              key={o.id}
              className={`rounded-xl border bg-white transition ${
                o.ativo ? "border-ib-line" : "border-dashed border-ib-line opacity-60"
              }`}
            >
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setOpen(aberto ? null : o.id)}
                  aria-expanded={aberto}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <Icon
                    name="arrow"
                    className={`h-4 w-4 shrink-0 text-ib-slate transition ${aberto ? "rotate-90" : ""}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ib-ink">
                      {o.objecao || "Nova objeção"}
                    </span>
                    {o.querDizer ? (
                      <span className="block truncate text-xs text-ib-slate">
                        quer dizer: {o.querDizer}
                      </span>
                    ) : null}
                  </span>
                </button>
                <Toggle
                  checked={o.ativo}
                  onChange={(v) => set(o.id, { ativo: v })}
                  label={`Ativar objeção ${o.objecao || "nova"}`}
                />
                <button
                  type="button"
                  onClick={() => patch({ objections: draft.objections.filter((x) => x.id !== o.id) })}
                  aria-label={`Excluir objeção ${o.objecao || "nova"}`}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ib-slate transition hover:bg-ib-danger/10 hover:text-ib-danger"
                >
                  <Icon name="trash" className="h-3.5 w-3.5" />
                </button>
              </div>

              {aberto ? (
                <div className="space-y-3 border-t border-ib-line px-4 py-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor={`obj-t-${o.id}`}
                        className="block text-xs font-semibold uppercase tracking-wide text-ib-slate"
                      >
                        O que o cliente diz
                      </label>
                      <input
                        id={`obj-t-${o.id}`}
                        value={o.objecao}
                        onChange={(e) => set(o.id, { objecao: e.target.value })}
                        className={`${inputCls} mt-1.5`}
                        placeholder="O preço está muito alto."
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`obj-q-${o.id}`}
                        className="block text-xs font-semibold uppercase tracking-wide text-ib-slate"
                      >
                        O que realmente quer dizer
                      </label>
                      <input
                        id={`obj-q-${o.id}`}
                        value={o.querDizer}
                        onChange={(e) => set(o.id, { querDizer: e.target.value })}
                        className={`${inputCls} mt-1.5`}
                        placeholder="Não percebeu o valor."
                      />
                    </div>
                  </div>
                  <div>
                    <label
                      htmlFor={`obj-r-${o.id}`}
                      className="block text-xs font-semibold uppercase tracking-wide text-ib-slate"
                    >
                      Resposta do agente
                    </label>
                    <textarea
                      id={`obj-r-${o.id}`}
                      value={o.resposta}
                      onChange={(e) => set(o.id, { resposta: e.target.value })}
                      rows={4}
                      className={`${areaCls} mt-1.5`}
                    />
                    <CharCount value={o.resposta} />
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ib-slate">
                      Palavras que disparam esta objeção
                    </p>
                    <TagInput
                      tags={o.keywords}
                      onChange={(keywords) => set(o.id, { keywords })}
                      placeholder="digite e aperte Enter"
                      label={`Palavras da objeção ${o.objecao || "nova"}`}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}

        <button
          type="button"
          onClick={add}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-ib-line bg-white py-3 text-sm font-medium text-ib-mar transition hover:border-ib-mar/40 hover:bg-ib-bruma"
        >
          <Icon name="plus" className="h-4 w-4" />
          Adicionar objeção
        </button>
      </div>
    </Card>
  );
}

/* ================================================================== */
/* TAB 4 — Regras de atendimento                                      */
/* ================================================================== */

function TabRegras({
  draft,
  patch,
  behaviorRules,
  onRestore,
}: {
  draft: Draft;
  patch: (p: Partial<Draft>) => void;
  behaviorRules: BehaviorRuleMeta[];
  onRestore: () => void;
}) {
  const set = (id: string, p: Partial<TransferRuleConfig>) =>
    patch({ transferRules: draft.transferRules.map((r) => (r.id === id ? { ...r, ...p } : r)) });

  return (
    <div className="space-y-6">
      {/* Seção 1 — transferência */}
      <Card className="p-5 sm:p-6">
        <BlockHeading
          eyebrow="Seção 1"
          title="Transferência para humano"
          description="Quando o assunto exige uma pessoa. Encaminhar é o último recurso — ela precisa saber quem é, o que quer, e haver algo que só um humano resolve."
          right={
            <button type="button" onClick={onRestore} className={btnGhost}>
              <Icon name="bolt" className="h-4 w-4" />
              Restaurar padrões
            </button>
          }
        />
        <div className="space-y-3 pt-5">
          {draft.transferRules.map((r) => (
            <div
              key={r.id}
              className={`rounded-xl border bg-white p-4 ${
                r.ativo ? "border-ib-line" : "border-dashed border-ib-line opacity-60"
              }`}
            >
              <div className="flex items-center gap-3">
                <label htmlFor={`tr-c-${r.id}`} className="sr-only">
                  Categoria da regra
                </label>
                <input
                  id={`tr-c-${r.id}`}
                  value={r.categoria}
                  onChange={(e) => set(r.id, { categoria: e.target.value })}
                  className={`${inputCls} font-mono text-xs font-semibold`}
                  placeholder="categoria (ex.: financeiro)"
                />
                <Toggle
                  checked={r.ativo}
                  onChange={(v) => set(r.id, { ativo: v })}
                  label={`Ativar regra ${r.categoria}`}
                />
                <button
                  type="button"
                  onClick={() =>
                    patch({ transferRules: draft.transferRules.filter((x) => x.id !== r.id) })
                  }
                  aria-label={`Excluir regra ${r.categoria}`}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ib-slate transition hover:bg-ib-danger/10 hover:text-ib-danger"
                >
                  <Icon name="trash" className="h-4 w-4" />
                </button>
              </div>
              <p className="mb-1.5 mt-3 text-xs font-semibold uppercase tracking-wide text-ib-slate">
                Palavras que disparam
              </p>
              <TagInput
                tags={r.keywords}
                onChange={(keywords) => set(r.id, { keywords })}
                placeholder="digite e aperte Enter"
                label={`Palavras da regra ${r.categoria}`}
              />
              <label
                htmlFor={`tr-r-${r.id}`}
                className="mt-3 block text-xs font-semibold uppercase tracking-wide text-ib-slate"
              >
                Resposta padrão ao transferir
              </label>
              <textarea
                id={`tr-r-${r.id}`}
                value={r.resposta}
                onChange={(e) => set(r.id, { resposta: e.target.value })}
                rows={3}
                className={`${areaCls} mt-1.5`}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              patch({
                transferRules: [
                  ...draft.transferRules,
                  { id: newId("regra"), categoria: "", keywords: [], resposta: "", ativo: true },
                ],
              })
            }
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-ib-line bg-white py-3 text-sm font-medium text-ib-mar transition hover:border-ib-mar/40 hover:bg-ib-bruma"
          >
            <Icon name="plus" className="h-4 w-4" />
            Adicionar regra
          </button>
        </div>
      </Card>

      {/* Seção 2 — guardrails */}
      <Card className="p-5 sm:p-6">
        <BlockHeading
          eyebrow="Seção 2"
          title="Guardrails — o que ela nunca revela"
          description="Se a pergunta encostar em um destes termos, ela diz com naturalidade que não pode passar a informação e segue ajudando."
        />
        <div className="pt-5">
          <TagInput
            tags={draft.guardrails.termos}
            onChange={(termos) => patch({ guardrails: { ...draft.guardrails, termos } })}
            placeholder="digite um termo e aperte Enter (ex.: margem)"
            label="Termos confidenciais"
          />
        </div>
      </Card>

      {/* Seção 3 — regras gerais */}
      <Card className="p-5 sm:p-6">
        <BlockHeading
          eyebrow="Seção 3"
          title="Regras gerais de comportamento"
          description="Entram no fim do prompt, que é a última coisa que ela lê antes de responder — e por isso a que mais pesa."
        />
        <div className="space-y-1 pt-5">
          {behaviorRules.map((r) => {
            // behaviorRules vem da API como {id, label} — o id é string livre aqui, e o
            // servidor é quem valida contra a lista real de BehaviorRuleId.
            const regras = draft.guardrails.regras as Record<string, boolean>;
            const on = regras[r.id] !== false;
            return (
              <label
                key={r.id}
                className="flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 transition hover:bg-ib-papel"
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) =>
                    patch({
                      guardrails: {
                        ...draft.guardrails,
                        regras: { ...draft.guardrails.regras, [r.id]: e.target.checked },
                      },
                    })
                  }
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-ib-line text-ib-mar focus:ring-ib-mar/30"
                />
                <span className="text-sm leading-relaxed text-ib-ink">{r.label}</span>
              </label>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

/* ================================================================== */
/* TAB 5 — Raciocínio                                                 */
/* ================================================================== */

/**
 * O bloco de raciocínio é o maior pedaço do prompt e o primeiro que o modelo lê. Vem
 * quebrado nos cabeçalhos ════════ do texto original, porque um textarea único com as 300
 * linhas seria intocável na prática.
 */
function TabRaciocinio({
  draft,
  patch,
  onRestore,
}: {
  draft: Draft;
  patch: (p: Partial<Draft>) => void;
  onRestore: () => void;
}) {
  const [open, setOpen] = useState<string | null>(draft.reasoning[0]?.id ?? null);

  const set = (id: string, p: Partial<ReasoningBlock>) =>
    patch({ reasoning: draft.reasoning.map((b) => (b.id === id ? { ...b, ...p } : b)) });

  return (
    <Card className="p-5 sm:p-6">
      <BlockHeading
        eyebrow="Raciocínio"
        title="Como ela pensa antes de responder"
        description="A primeira coisa que ela lê — vem antes até da persona, e é o que mais pesa no comportamento. Mexa com cuidado: é aqui que estão as regras de não parecer robô e os exemplos de decisão."
        right={
          <button type="button" onClick={onRestore} className={btnGhost}>
            <Icon name="bolt" className="h-4 w-4" />
            Restaurar padrões
          </button>
        }
      />

      <p className="mt-4 inline-flex items-start gap-2 rounded-xl border border-ib-warn/25 bg-ib-warn/8 px-3.5 py-2.5 text-xs leading-relaxed text-[#9A6212]">
        <Icon name="bolt" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Esta é a parte mais sensível do treinamento. Uma frase removida aqui muda o
        comportamento dela em toda conversa — teste na aba Testar depois de salvar.
      </p>

      <div className="space-y-3 pt-5">
        {draft.reasoning.map((b, i) => {
          const aberto = open === b.id;
          return (
            <div key={b.id} className="rounded-xl border border-ib-line bg-white">
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setOpen(aberto ? null : b.id)}
                  aria-expanded={aberto}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <Icon
                    name="arrow"
                    className={`h-4 w-4 shrink-0 text-ib-slate transition ${aberto ? "rotate-90" : ""}`}
                  />
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-ib-papel font-mono text-xs font-semibold text-ib-slate">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ib-ink">
                      {b.title}
                    </span>
                    <span className="block font-mono text-[11px] tabular-nums text-ib-slate">
                      {b.body.split("\n").length} linhas ·{" "}
                      {b.body.length.toLocaleString("pt-BR")} caracteres
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => patch({ reasoning: draft.reasoning.filter((x) => x.id !== b.id) })}
                  aria-label={`Excluir bloco ${b.title}`}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ib-slate transition hover:bg-ib-danger/10 hover:text-ib-danger"
                >
                  <Icon name="trash" className="h-3.5 w-3.5" />
                </button>
              </div>

              {aberto ? (
                <div className="space-y-3 border-t border-ib-line px-4 py-4">
                  <div>
                    <label
                      htmlFor={`rac-t-${b.id}`}
                      className="block text-xs font-semibold uppercase tracking-wide text-ib-slate"
                    >
                      Título do bloco
                    </label>
                    <input
                      id={`rac-t-${b.id}`}
                      value={b.title}
                      onChange={(e) => set(b.id, { title: e.target.value })}
                      className={`${inputCls} mt-1.5 font-semibold`}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`rac-b-${b.id}`}
                      className="block text-xs font-semibold uppercase tracking-wide text-ib-slate"
                    >
                      Conteúdo
                    </label>
                    <textarea
                      id={`rac-b-${b.id}`}
                      value={b.body}
                      onChange={(e) => set(b.id, { body: e.target.value })}
                      rows={20}
                      className={`${areaCls} mt-1.5 font-mono text-xs`}
                    />
                    <CharCount value={b.body} />
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}

        <button
          type="button"
          onClick={() => {
            const b = { id: newId("rac"), title: "", body: "" };
            patch({ reasoning: [...draft.reasoning, b] });
            setOpen(b.id);
          }}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-ib-line bg-white py-3 text-sm font-medium text-ib-mar transition hover:border-ib-mar/40 hover:bg-ib-bruma"
        >
          <Icon name="plus" className="h-4 w-4" />
          Adicionar bloco de raciocínio
        </button>
      </div>
    </Card>
  );
}

/* ================================================================== */
/* TAB 6 — Conhecimento técnico                                       */
/* ================================================================== */

function TabTecnico({
  draft,
  patch,
  onRestore,
}: {
  draft: Draft;
  patch: (p: Partial<Draft>) => void;
  onRestore: () => void;
}) {
  const t = draft.technical;
  const setT = (p: Partial<TechnicalKnowledge>) => patch({ technical: { ...t, ...p } });

  const setTermo = (id: string, p: Partial<GlossaryTerm>) =>
    setT({ termos: t.termos.map((x) => (x.id === id ? { ...x, ...p } : x)) });
  const setEscala = (id: string, p: Partial<WorkSchedule>) =>
    setT({ escalas: t.escalas.map((x) => (x.id === id ? { ...x, ...p } : x)) });

  return (
    <div className="space-y-6">
      {/* Seção 1 — glossário */}
      <Card className="p-5 sm:p-6">
        <BlockHeading
          eyebrow="Seção 1"
          title="Termos que a Ana explica"
          description="Sigla e termo técnico que ela precisa traduzir em uma linha na conversa. Nada aqui é procedimento: requisito, prazo e documento vêm do material oficial."
          right={
            <button type="button" onClick={onRestore} className={btnGhost}>
              <Icon name="bolt" className="h-4 w-4" />
              Restaurar padrões
            </button>
          }
        />
        <div className="space-y-3 pt-5">
          {t.termos.map((x) => (
            <div key={x.id} className="rounded-xl border border-ib-line bg-white p-4">
              <div className="flex items-center gap-3">
                <label htmlFor={`tk-t-${x.id}`} className="sr-only">
                  Termo
                </label>
                <input
                  id={`tk-t-${x.id}`}
                  value={x.termo}
                  onChange={(e) => setTermo(x.id, { termo: e.target.value })}
                  className={`${inputCls} font-semibold`}
                  placeholder="CRNM"
                />
                <button
                  type="button"
                  onClick={() => setT({ termos: t.termos.filter((y) => y.id !== x.id) })}
                  aria-label={`Excluir termo ${x.termo}`}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ib-slate transition hover:bg-ib-danger/10 hover:text-ib-danger"
                >
                  <Icon name="trash" className="h-4 w-4" />
                </button>
              </div>
              <label htmlFor={`tk-d-${x.id}`} className="sr-only">
                Definição de {x.termo}
              </label>
              <textarea
                id={`tk-d-${x.id}`}
                value={x.definicao}
                onChange={(e) => setTermo(x.id, { definicao: e.target.value })}
                rows={2}
                className={`${areaCls} mt-2`}
                placeholder="Carteira de Registro Nacional Migratório: o documento de identificação de quem é migrante e tem residência no Brasil."
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setT({ termos: [...t.termos, { id: newId("termo"), termo: "", definicao: "" }] })
            }
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-ib-line bg-white py-3 text-sm font-medium text-ib-mar transition hover:border-ib-mar/40 hover:bg-ib-bruma"
          >
            <Icon name="plus" className="h-4 w-4" />
            Adicionar termo
          </button>
        </div>
      </Card>

      {/* Seção 3 — escalas */}
      <Card className="p-5 sm:p-6">
        <BlockHeading
          eyebrow="Seção 3"
          title="Caminhos migratórios"
          description="O que é cada caminho atendido e quando ele entra na conversa. Serve para a Ana orientar — não para afirmar requisito nem prazo."
        />
        <div className="grid gap-3 pt-5 md:grid-cols-3">
          {t.escalas.map((e) => (
            <div key={e.id} className="rounded-xl border border-ib-line bg-white p-4">
              <div className="flex items-start gap-2">
                <label htmlFor={`esc-n-${e.id}`} className="sr-only">
                  Nome do caminho
                </label>
                <input
                  id={`esc-n-${e.id}`}
                  value={e.nome}
                  onChange={(ev) => setEscala(e.id, { nome: ev.target.value })}
                  className={`${inputCls} font-semibold`}
                  placeholder="Regularização migratória"
                />
                <button
                  type="button"
                  onClick={() => setT({ escalas: t.escalas.filter((y) => y.id !== e.id) })}
                  aria-label={`Excluir caminho ${e.nome}`}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ib-slate transition hover:bg-ib-danger/10 hover:text-ib-danger"
                >
                  <Icon name="trash" className="h-4 w-4" />
                </button>
              </div>
              <label htmlFor={`esc-d-${e.id}`} className="mt-3 block text-xs font-semibold uppercase tracking-wide text-ib-slate">
                Descrição
              </label>
              <textarea
                id={`esc-d-${e.id}`}
                value={e.descricao}
                onChange={(ev) => setEscala(e.id, { descricao: ev.target.value })}
                rows={3}
                className={`${areaCls} mt-1.5`}
              />
              <label htmlFor={`esc-q-${e.id}`} className="mt-3 block text-xs font-semibold uppercase tracking-wide text-ib-slate">
                Quando usar
              </label>
              <textarea
                id={`esc-q-${e.id}`}
                value={e.quandoUsar}
                onChange={(ev) => setEscala(e.id, { quandoUsar: ev.target.value })}
                rows={2}
                className={`${areaCls} mt-1.5`}
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            setT({
              escalas: [
                ...t.escalas,
                { id: newId("escala"), nome: "", descricao: "", quandoUsar: "" },
              ],
            })
          }
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-ib-line bg-white py-3 text-sm font-medium text-ib-mar transition hover:border-ib-mar/40 hover:bg-ib-bruma"
        >
          <Icon name="plus" className="h-4 w-4" />
          Adicionar caminho
        </button>
      </Card>
    </div>
  );
}

/* ================================================================== */
/* TAB 7 — Material oficial                                           */
/* ================================================================== */

/**
 * O QUE A ANA NUNCA ESQUECE, E O ACERVO QUE ELA LÊ.
 *
 * A aba tem duas metades com naturezas opostas, e é por isso que elas ficam juntas.
 *
 * As REGRAS não se editam: entram em todo prompt, por último, inclusive depois de a persona
 * ser reescrita. Mudar exige subir versão, de propósito — o que protege a pessoa do outro
 * lado não pode ser apagado numa tarde de ajuste de tom.
 *
 * O ACERVO se edita, e desde agora pela tela: acrescentar um PDF o quebra em trechos e
 * vetoriza na hora (ver lib/agent/ingestao.ts), e remover apaga esses trechos da base. Só
 * administrador escreve aqui; quem atende vê a lista, porque é ela que evita prometer
 * resposta sobre tema que o acervo não cobre.
 */
const COLECAO_LABEL: Record<string, string> = {
  cartilha: "Cartilha",
  legislacao: "Legislação",
  doutrina: "Doutrina",
};

type DocumentoDoAcervo = {
  arquivo: string;
  titulo: string;
  cobre: string;
  colecao: string;
  atualizadoEm?: string;
  paginas?: number;
  trechos?: number;
};

type OrigemDoArquivo = "storage" | "repositorio" | "ausente";

type AcervoResposta = {
  documentos: DocumentoDoAcervo[];
  adicionados: DocumentoDoAcervo[];
  removidos: string[];
  doCodigo: string[];
  limiteMb: number;
  maxTrechos: number;
  indexacaoDisponivel: boolean;
  podeEditar: boolean;
  /** Onde o PDF de cada documento está hoje — ver lib/agent/acervo-arquivos.ts. */
  arquivos: Record<string, OrigemDoArquivo>;
  storageDisponivel: boolean;
  soNoRepositorio: number;
};

function TabMaterial({ material }: { material: MaterialOficialResposta | null }) {
  const [acervo, setAcervo] = useState<AcervoResposta | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [enviando, setEnviando] = useState(false);
  const [aRemover, setARemover] = useState<DocumentoDoAcervo | null>(null);
  const [removendo, setRemovendo] = useState(false);
  const [zip, setZip] = useState<{ feitos: number; total: number } | null>(null);
  const [sincronizando, setSincronizando] = useState(false);

  // Campos do formulário de inclusão.
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [titulo, setTitulo] = useState("");
  const [cobre, setCobre] = useState("");
  const [colecao, setColecao] = useState("cartilha");
  const [atualizadoEm, setAtualizadoEm] = useState("");
  const inputArquivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/material-oficial", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setAcervo(d))
      .catch(() => setAcervo(null));
  }, []);

  const limiteMb = acervo?.limiteMb ?? 4;
  const podeEditar = !!acervo?.podeEditar;
  const grandeDemais = !!arquivo && arquivo.size > limiteMb * 1024 * 1024;

  function limparFormulario() {
    setArquivo(null);
    setTitulo("");
    setCobre("");
    setColecao("cartilha");
    setAtualizadoEm("");
    if (inputArquivo.current) inputArquivo.current.value = "";
  }

  async function adicionar() {
    if (!arquivo || enviando) return;
    setFeedback(null);
    // O teto é conferido aqui também, e não só no servidor: passando do limite da
    // plataforma, a requisição é recusada ANTES de chegar ao nosso código e o erro chega
    // como falha de rede, sem uma frase que explique nada.
    if (grandeDemais) {
      setFeedback({
        kind: "error",
        text: `O arquivo tem ${(arquivo.size / 1024 / 1024).toFixed(1)} MB e o limite é ${limiteMb} MB. Comprima ou divida o PDF.`,
      });
      return;
    }
    setEnviando(true);
    try {
      const form = new FormData();
      form.append("arquivo", arquivo);
      form.append("titulo", titulo);
      form.append("cobre", cobre);
      form.append("colecao", colecao);
      form.append("atualizadoEm", atualizadoEm);
      const res = await fetch("/api/material-oficial", { method: "POST", body: form });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      setAcervo((a) => (a ? { ...a, ...d } : a));
      limparFormulario();
      setFeedback({
        kind: d.avisoArquivo ? "error" : "success",
        text: d.avisoArquivo
          ? d.avisoArquivo
          : `“${d.adicionado.titulo}” entrou no acervo: ${d.adicionado.paginas} páginas em ${d.adicionado.trechos} trechos indexados. O agente já pode usar.`,
      });
    } catch (err) {
      setFeedback({
        kind: "error",
        text: err instanceof Error ? err.message : "Falha ao adicionar o documento",
      });
    } finally {
      setEnviando(false);
    }
  }

  /**
   * Manda para o Supabase os PDFs que ainda só existem dentro do deploy.
   *
   * Roda uma vez na vida do projeto. Depois dela o acervo inteiro tem um lugar só, e o
   * repositório volta a ser o que deve ser: semente e rede de segurança.
   */
  async function sincronizar() {
    if (sincronizando) return;
    setSincronizando(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/material-oficial/sincronizar", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (d.arquivos) {
        setAcervo((a) =>
          a
            ? {
                ...a,
                arquivos: d.arquivos,
                soNoRepositorio: Object.values(
                  d.arquivos as Record<string, OrigemDoArquivo>,
                ).filter((o) => o === "repositorio").length,
              }
            : a,
        );
      }
      if (!res.ok || !d.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      const enviados = (d.enviados as string[]).length;
      setFeedback({
        kind: "success",
        text: enviados
          ? `${enviados} documento(s) enviado(s) ao Supabase. O acervo inteiro está lá agora.`
          : "Nada a enviar — todos os documentos já estavam no Supabase.",
      });
    } catch (err) {
      setFeedback({
        kind: "error",
        text: err instanceof Error ? err.message : "Falha ao sincronizar com o Supabase",
      });
    } finally {
      setSincronizando(false);
    }
  }

  /** Dispara o "Salvar como" do navegador a partir de bytes já em memória. */
  function salvarArquivo(nome: string, bytes: Uint8Array, tipo: string) {
    // O cast existe porque o Uint8Array tipado do TS admite SharedArrayBuffer, que não é
    // BlobPart. Aqui os bytes sempre vêm de um ArrayBuffer comum (fetch ou fflate).
    const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: tipo }));
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * O ZIP É MONTADO AQUI, NO NAVEGADOR — e isso é uma decisão, não uma preguiça.
   *
   * O acervo inteiro passa de 20 MB. Montar o zip no servidor significaria devolver esses
   * 20 MB num único corpo de resposta, que é exatamente o tamanho que a plataforma corta —
   * e um zip truncado é pior que download nenhum, porque parece ter dado certo. Baixando um
   * arquivo por vez, cada resposta fica pequena e o limite nunca entra em jogo.
   *
   * Sem compressão (level 0) de propósito: PDF já é comprimido por dentro, então comprimir
   * de novo gasta o processador de quem está na tela para economizar quase nada.
   */
  async function baixarTodos() {
    if (zip) return;
    setFeedback(null);
    const lista = documentos;
    setZip({ feitos: 0, total: lista.length });
    try {
      const { zipSync } = await import("fflate");
      const arquivos: Record<string, Uint8Array> = {};
      const falhas: string[] = [];
      for (const d of lista) {
        const res = await fetch(
          `/api/material-oficial/arquivo?arquivo=${encodeURIComponent(d.arquivo)}`,
          { cache: "no-store" },
        );
        if (res.ok) {
          arquivos[d.arquivo] = new Uint8Array(await res.arrayBuffer());
        } else {
          falhas.push(d.arquivo);
        }
        setZip((z) => (z ? { ...z, feitos: z.feitos + 1 } : z));
      }
      if (Object.keys(arquivos).length === 0) {
        throw new Error("Nenhum dos PDFs está disponível para download.");
      }
      const hoje = new Date().toISOString().slice(0, 10);
      salvarArquivo(`material-oficial-${hoje}.zip`, zipSync(arquivos, { level: 0 }), "application/zip");
      // Falha parcial é dita, e com o nome de cada arquivo: um zip com seis dos sete
      // documentos, baixado em silêncio, é alguém confiando num acervo incompleto.
      setFeedback(
        falhas.length
          ? {
              kind: "error",
              text: `Zip gerado sem ${falhas.length} documento(s): ${falhas.join(", ")}. Os demais estão no arquivo.`,
            }
          : { kind: "success", text: `Zip com ${lista.length} documento(s) gerado.` },
      );
    } catch (err) {
      setFeedback({
        kind: "error",
        text: err instanceof Error ? err.message : "Falha ao gerar o zip",
      });
    } finally {
      setZip(null);
    }
  }

  async function remover() {
    if (!aRemover || removendo) return;
    setRemovendo(true);
    setFeedback(null);
    try {
      const res = await fetch(
        `/api/material-oficial?arquivo=${encodeURIComponent(aRemover.arquivo)}`,
        { method: "DELETE" },
      );
      const d = await res.json().catch(() => ({}));
      if (d.documentos) setAcervo((a) => (a ? { ...a, ...d } : a));
      if (!res.ok || !d.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      setFeedback({
        kind: "success",
        text: `“${aRemover.titulo}” saiu do acervo e os trechos dele foram apagados da base.`,
      });
      setARemover(null);
    } catch (err) {
      setFeedback({
        kind: "error",
        text: err instanceof Error ? err.message : "Falha ao remover o documento",
      });
      setARemover(null);
    } finally {
      setRemovendo(false);
    }
  }

  const documentos = acervo?.documentos ?? material?.documentos ?? [];
  const doCodigo = new Set(acervo?.doCodigo ?? []);

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <BlockHeading
          eyebrow="Não editável"
          title="As regras que não se quebram"
          description="Entram em todo prompt, por último — inclusive depois de a persona ser reescrita. Cada uma delas já foi quebrada numa conversa real; é isso que elas custaram para existir."
        />
        <pre className="mt-4 whitespace-pre-wrap rounded-xl border border-ib-line bg-ib-papel/60 p-4 font-mono text-[12px] leading-relaxed text-ib-ink">
          {material?.regras ?? "—"}
        </pre>
        <p className="mt-3 text-xs leading-relaxed text-ib-slate">
          Para mudar qualquer uma delas é preciso mexer em{" "}
          <code className="rounded bg-ib-papel px-1 py-0.5 font-mono">lib/agent/material-oficial.ts</code>{" "}
          e subir uma versão. É de propósito: o que protege a pessoa do outro lado não pode
          ser apagado por engano numa tarde de ajuste de tom.
        </p>
      </Card>

      <Card className="p-5">
        <BlockHeading
          eyebrow="Acervo"
          title="Os documentos que sustentam as respostas"
          description="Cada um é quebrado em trechos e recuperado a cada mensagem que pede pesquisa. A Ana conhece esta lista: é o que a impede de prometer resposta sobre tema que o acervo não cobre — e o que faz ela usar o que foi acrescentado."
          right={
            documentos.length > 0 ? (
              <button
                type="button"
                onClick={baixarTodos}
                disabled={!!zip}
                className={btnGhost}
              >
                <Icon name="doc" className="h-4 w-4" />
                {zip ? `Baixando ${zip.feitos}/${zip.total}…` : "Baixar todos (.zip)"}
              </button>
            ) : null
          }
        />

        {feedback ? (
          <p
            className={`mt-4 rounded-xl px-3 py-2 text-xs font-medium ${
              feedback.kind === "success"
                ? "border border-ib-success/25 bg-ib-success/8 text-ib-success"
                : "border border-ib-danger/25 bg-ib-danger/8 text-ib-danger"
            }`}
          >
            {feedback.text}
          </p>
        ) : null}

        {documentos.length === 0 ? (
          <p className="mt-4 rounded-xl border border-ib-danger/30 bg-ib-danger/5 px-3 py-3 text-xs leading-relaxed text-ib-danger">
            O acervo está vazio. Sem nenhum documento, o agente não tem fonte para requisito,
            prazo ou procedimento — ele vai acolher, triar e encaminhar tudo ao time jurídico.
          </p>
        ) : null}

        {/* ── O QUE AINDA SÓ EXISTE DENTRO DO DEPLOY ──
            Enquanto houver documento só no repositório, o acervo está em dois lugares com
            naturezas diferentes: um muda quando a equipe sobe algo, o outro só muda com
            deploy. O aviso some sozinho depois da sincronização. */}
        {acervo && acervo.storageDisponivel && acervo.soNoRepositorio > 0 ? (
          <div className="mt-4 rounded-xl border border-ib-warn/25 bg-ib-warn/8 px-3 py-3">
            <p className="text-xs font-medium leading-relaxed text-[#9A6212]">
              {acervo.soNoRepositorio} documento(s) ainda existem só dentro do deploy, e não no
              Supabase. Eles funcionam, mas somem a cada mudança de infraestrutura e não
              acompanham o que a equipe sobe.
            </p>
            {podeEditar ? (
              <button
                type="button"
                onClick={sincronizar}
                disabled={sincronizando}
                className={`mt-2.5 ${btnGhost}`}
              >
                <Icon name="bolt" className="h-4 w-4" />
                {sincronizando ? "Enviando…" : "Enviar ao Supabase"}
              </button>
            ) : null}
          </div>
        ) : null}

        <ul className="mt-4 divide-y divide-ib-line">
          {documentos.map((d) => (
            <li key={d.arquivo} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
              <span className="text-sm font-semibold text-ib-ink">{d.titulo}</span>
              <span className="rounded-full bg-ib-papel px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ib-slate ring-1 ring-inset ring-ib-line">
                {COLECAO_LABEL[d.colecao] ?? d.colecao}
              </span>
              {doCodigo.has(d.arquivo) ? null : (
                <span className="rounded-full bg-ib-bruma px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ib-mar">
                  Adicionado aqui
                </span>
              )}
              <span className="w-full text-xs leading-relaxed text-ib-slate sm:w-auto sm:flex-1">
                {d.cobre}
              </span>
              <span className="font-mono text-[11px] text-ib-slate">
                {d.arquivo}
                {d.trechos ? ` · ${d.trechos} trechos` : ""}
                {/* Só o que NÃO está no Supabase é anunciado: "storage" é o estado normal e
                    marcar o normal treina o olho a ignorar a etiqueta. */}
                {acervo?.arquivos?.[d.arquivo] === "repositorio" ? " · só no deploy" : ""}
                {acervo?.arquivos?.[d.arquivo] === "ausente" ? " · sem arquivo" : ""}
              </span>
              {/* Link de verdade, e não fetch: o navegador cuida do "Salvar como", da barra
                  de progresso e do arquivo grande sem passar nada pela memória da página.
                  Some quando não há arquivo em lugar nenhum — um botão que só entrega 404 é
                  pior do que a ausência dele. */}
              {acervo?.arquivos?.[d.arquivo] === "ausente" ? null : (
                <a
                  href={`/api/material-oficial/arquivo?arquivo=${encodeURIComponent(d.arquivo)}`}
                  className="rounded-lg border border-ib-line px-2 py-1 text-[11px] font-medium text-ib-mar transition hover:border-ib-mar/40 hover:bg-ib-bruma/40"
                >
                  Baixar
                </a>
              )}
              {podeEditar ? (
                <button
                  type="button"
                  onClick={() => setARemover(d)}
                  className="rounded-lg border border-ib-line px-2 py-1 text-[11px] font-medium text-ib-danger transition hover:border-ib-danger/40 hover:bg-ib-danger/5"
                >
                  Remover
                </button>
              ) : null}
            </li>
          ))}
        </ul>

        {acervo && !podeEditar ? (
          <p className="mt-4 text-xs leading-relaxed text-ib-slate">
            Acrescentar ou remover documento é restrito a administradores — o acervo é a base
            jurídica de tudo que o agente afirma.
          </p>
        ) : null}
      </Card>

      {podeEditar ? (
        <Card className="p-5">
          <BlockHeading
            eyebrow="Acrescentar"
            title="Subir um documento novo"
            description="O PDF é lido, quebrado em trechos e vetorizado na hora. A partir do momento em que aparece na lista acima, o agente já responde com base nele."
          />

          {acervo && !acervo.indexacaoDisponivel ? (
            <p className="mt-4 rounded-xl border border-ib-warn/25 bg-ib-warn/8 px-3 py-2 text-xs font-medium text-[#9A6212]">
              A indexação está indisponível (falta o Supabase ou a chave de embeddings). Subir
              agora recusaria o arquivo — o documento entraria na lista sem o agente conseguir
              ler nada dele.
            </p>
          ) : null}

          <div className="grid gap-4 pt-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="mat-arquivo" className="text-xs font-semibold text-ib-ink">
                Arquivo PDF
              </label>
              <input
                ref={inputArquivo}
                id="mat-arquivo"
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
                className="mt-1.5 w-full rounded-xl border border-ib-line bg-white px-3 py-2 text-sm text-ib-ink file:mr-3 file:rounded-lg file:border-0 file:bg-ib-papel file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-ib-ink"
              />
              <p
                className={`mt-1.5 text-[11px] ${grandeDemais ? "font-semibold text-ib-danger" : "text-ib-slate"}`}
              >
                {arquivo
                  ? `${(arquivo.size / 1024 / 1024).toFixed(1)} MB de ${limiteMb} MB`
                  : `Até ${limiteMb} MB, com texto selecionável — PDF escaneado é recusado, porque o agente não conseguiria ler nada dele.`}
              </p>
            </div>

            <div>
              <label htmlFor="mat-titulo" className="text-xs font-semibold text-ib-ink">
                Título
              </label>
              <input
                id="mat-titulo"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Cartilha de reunião familiar"
                className={`mt-1.5 ${inputCls}`}
              />
            </div>

            <div>
              <label htmlFor="mat-colecao" className="text-xs font-semibold text-ib-ink">
                Tipo
              </label>
              <select
                id="mat-colecao"
                value={colecao}
                onChange={(e) => setColecao(e.target.value)}
                className={`mt-1.5 ${inputCls}`}
              >
                <option value="cartilha">Cartilha — linguagem acessível</option>
                <option value="legislacao">Legislação — texto da lei</option>
                <option value="doutrina">Doutrina — interpretação</option>
              </select>
              <p className="mt-1.5 text-[11px] leading-relaxed text-ib-slate">
                Cartilha é consultada primeiro; lei e doutrina só quando a pergunta pede o
                dispositivo.
              </p>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="mat-cobre" className="text-xs font-semibold text-ib-ink">
                O que este documento cobre
              </label>
              <textarea
                id="mat-cobre"
                value={cobre}
                onChange={(e) => setCobre(e.target.value)}
                rows={2}
                placeholder="quem quer trazer cônjuge, filhos ou pais: requisitos, quem pode pedir e o que o pedido exige"
                className={`mt-1.5 ${areaCls}`}
              />
              <p className="mt-1.5 text-[11px] leading-relaxed text-ib-slate">
                Esta frase vai para o prompt. É por ela que o agente decide usar o documento —
                escreva em minúsculas, continuando a frase “o acervo cobre…”.
              </p>
            </div>

            <div>
              <label htmlFor="mat-data" className="text-xs font-semibold text-ib-ink">
                Atualizado em (opcional)
              </label>
              <input
                id="mat-data"
                value={atualizadoEm}
                onChange={(e) => setAtualizadoEm(e.target.value)}
                placeholder="fevereiro/2026"
                className={`mt-1.5 ${inputCls}`}
              />
              <p className="mt-1.5 text-[11px] leading-relaxed text-ib-slate">
                Regra migratória muda por portaria. A data acompanha os trechos e ajuda a
                saber o que precisa ser reconferido.
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-ib-line pt-5">
            <button
              type="button"
              onClick={adicionar}
              disabled={enviando || !arquivo || !titulo.trim() || !cobre.trim() || grandeDemais}
              className={btnPrimary}
            >
              <Icon name="bolt" className="h-4 w-4" />
              {enviando ? "Lendo e indexando…" : "Adicionar ao acervo"}
            </button>
            {enviando ? (
              <span className="text-xs text-ib-slate">
                Pode levar um ou dois minutos num PDF grande — não feche a página.
              </span>
            ) : null}
          </div>
        </Card>
      ) : null}

      <ConfirmDialog
        open={!!aRemover}
        title="Remover do acervo?"
        message={
          <>
            <strong>{aRemover?.titulo}</strong> sai da lista que o agente conhece e todos os
            trechos dele são apagados da base de busca. O agente para de responder com base
            nesse material imediatamente.
            {aRemover && doCodigo.has(aRemover.arquivo) ? (
              <>
                {" "}
                Este é um dos documentos que vêm com o sistema: o PDF continua no repositório,
                então dá para reindexá-lo depois se for preciso.
              </>
            ) : null}
          </>
        }
        confirmLabel="Remover"
        loading={removendo}
        onConfirm={remover}
        onCancel={() => setARemover(null)}
      />
    </div>
  );
}

/* ================================================================== */
/* TAB 8 — Testar                                                     */
/* ================================================================== */

// OS ATALHOS DE TESTE.
//
// Eram cenários de portaria terceirizada, herdados da base que originou este código —
// "quero 2 porteiros na Barra" testava um agente que não existe mais. Cada um destes cobre
// um caminho DIFERENTE do atendimento de imigração, que é o que faz o teste valer:
// urgência com prazo, pessoa que ainda está fora do Brasil, pedido de orientação sem caso,
// tentativa de arrancar honorário e o pedido de falar com gente.
const CENARIOS = [
  "Recebi uma multa migratória, o que faço?",
  "Estou na Venezuela e quero ir para o Brasil trabalhar",
  "Meu CRNM vence mês que vem",
  "Quanto vocês cobram?",
  "Preciso falar com uma pessoa",
];

type ChatMsg = { role: "user" | "assistant"; content: string };

function TabTestar({
  saved,
  preview,
  dirty,
  promptCru,
  onDescartarPromptCru,
}: {
  saved: Draft | null;
  preview: string;
  dirty: boolean;
  promptCru: string | null;
  onDescartarPromptCru: () => void;
}) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const convId = useRef<string | undefined>(undefined);
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, sending]);

  const send = useCallback(
    async (texto: string) => {
      const t = texto.trim();
      if (!t || sending) return;
      setErro(null);
      setInput("");
      setMsgs((m) => [...m, { role: "user", content: t }]);
      setSending(true);
      try {
        const res = await fetch("/api/simulate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: convId.current, message: t }),
        });
        const d = await res.json().catch(() => ({}));
        if (res.status === 404 && d?.error === "conversation_not_found") {
          // Instância serverless reciclada: o contexto se perdeu. Recomeça a conversa
          // em vez de deixar o painel travado num id que não existe mais.
          convId.current = undefined;
          throw new Error("A conversa de teste expirou. Mande a mensagem de novo.");
        }
        if (!res.ok) throw new Error(d?.error ?? `HTTP ${res.status}`);
        convId.current = d.conversationId;
        setMsgs((m) => [...m, { role: "assistant", content: d.reply ?? "—" }]);
      } catch (err) {
        setErro(err instanceof Error ? err.message : "Falha ao enviar");
      } finally {
        setSending(false);
      }
    },
    [sending],
  );

  const regras = saved
    ? (saved.guardrails.regras as Record<string, boolean>)
    : ({} as Record<string, boolean>);

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
      {/* Esquerda — configurações ativas */}
      <div className="space-y-4">
        {/* ── O OVERRIDE LEGADO ──
            Fica ACIMA de tudo e em vermelho porque é a única situação em que esta tela
            inteira não vale nada: enquanto essa chave existir, o agente lê o texto abaixo
            e ignora persona, seções, objeções, regras, raciocínio e técnico. Antes disso
            aparecer aqui, o sintoma era "salvei e não mudou nada". */}
        {promptCru ? (
          <Card className="border-ib-danger/30 bg-ib-danger/5 p-5">
            <BlockHeading
              eyebrow="Atenção"
              title="O agente não está usando esta tela"
              description="Há um prompt cru gravado no banco, de uma tela de configuração antiga. Ele vence tudo o que se edita aqui — persona, seções, objeções, regras, raciocínio e conhecimento técnico. Só o briefing, as perguntas frequentes e o material oficial continuam entrando."
            />
            <div className="pt-4">
              <button type="button" onClick={onDescartarPromptCru} className={btnPrimary}>
                <Icon name="bolt" className="h-4 w-4" />
                Descartar o prompt cru e usar esta tela
              </button>
              <details className="group mt-3">
                <summary className="cursor-pointer list-none text-xs font-medium text-ib-slate underline-offset-2 hover:underline">
                  Ver o prompt cru que está valendo ({promptCru.length.toLocaleString("pt-BR")}{" "}
                  caracteres)
                </summary>
                <pre className="console-scroll mt-2 max-h-72 overflow-auto rounded-lg bg-ib-ink p-4 font-mono text-[11px] leading-relaxed text-ib-bruma">
                  {promptCru}
                </pre>
              </details>
            </div>
          </Card>
        ) : null}

        <Card className="p-5">
          <BlockHeading
            eyebrow="Em produção"
            title="Configurações ativas"
            description="O que está salvo no banco agora. É com isto que o chat ao lado responde."
          />
          {dirty ? (
            <p className="mt-4 inline-flex items-center gap-2 rounded-xl border border-ib-warn/25 bg-ib-warn/8 px-3 py-2 text-xs font-medium text-[#9A6212]">
              <Icon name="bolt" className="h-3.5 w-3.5" />
              Você tem alterações não salvas — o teste ainda usa a versão anterior.
            </p>
          ) : null}

          {saved ? (
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ib-slate">
                  Identidade
                </dt>
                <dd className="mt-0.5 text-ib-ink">
                  {saved.identity.agentName} · {saved.identity.companyName} ·{" "}
                  {TONE_LABEL[saved.identity.tone]} · {LENGTH_LABEL[saved.identity.messageLength]}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ib-slate">
                  Persona
                </dt>
                <dd className="mt-0.5 line-clamp-6 leading-relaxed text-ib-slate">
                  {saved.persona}
                </dd>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  ["Seções", saved.sections.length],
                  ["Objeções", saved.objections.filter((o) => o.ativo).length],
                  ["Raciocínio", saved.reasoning.length],
                ].map(([label, n]) => (
                  <div key={String(label)} className="rounded-xl bg-ib-papel px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-ib-slate">
                      {label}
                    </p>
                    <p className="font-mono text-lg font-semibold tabular-nums text-ib-ink">{n}</p>
                  </div>
                ))}
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ib-slate">
                  Regras que não se quebram
                </dt>
                <dd className="mt-1 flex flex-wrap gap-1.5">
                  {Object.entries(regras)
                    .filter(([, on]) => on)
                    .map(([id]) => (
                      <span
                        key={id}
                        className="rounded-lg bg-ib-bruma px-2 py-1 font-mono text-[11px] text-ib-mar"
                      >
                        {id}
                      </span>
                    ))}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ib-slate">
                  Nunca revela
                </dt>
                <dd className="mt-0.5 text-ib-slate">{saved.guardrails.termos.join(", ")}</dd>
              </div>
            </dl>
          ) : null}
        </Card>

        <details className="group rounded-2xl border border-ib-line bg-white shadow-[0_1px_2px_rgba(11,18,32,0.04)]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-5 py-4 text-sm font-medium text-ib-ink">
            <span className="inline-flex items-center gap-2">
              <Icon name="doc" className="h-4 w-4 text-ib-slate" />
              Prompt gerado
            </span>
            <span className="text-ib-slate transition group-open:rotate-90">
              <Icon name="arrow" className="h-4 w-4" />
            </span>
          </summary>
          <div className="border-t border-ib-line px-5 py-4">
            <pre className="console-scroll max-h-96 overflow-auto rounded-lg bg-ib-ink p-4 font-mono text-[11px] leading-relaxed text-ib-bruma">
              {preview || "—"}
            </pre>
          </div>
        </details>
      </div>

      {/* Direita — chat */}
      <Card className="flex min-h-[32rem] flex-col p-5">
        <BlockHeading
          eyebrow="Simulador"
          title="Converse com o agente"
          description="Mesma engine do WhatsApp, em uma conversa de teste isolada."
        />

        <div className="flex flex-wrap gap-1.5 pt-4">
          {CENARIOS.map((c) => (
            <button
              key={c}
              type="button"
              disabled={sending}
              onClick={() => send(c)}
              className="rounded-lg border border-ib-line bg-white px-2.5 py-1.5 text-xs font-medium text-ib-slate transition hover:border-ib-mar/40 hover:bg-ib-bruma hover:text-ib-mar disabled:opacity-50"
            >
              {c}
            </button>
          ))}
        </div>

        <div className="console-scroll mt-4 flex-1 space-y-3 overflow-y-auto rounded-xl bg-ib-papel/50 p-4">
          {msgs.length === 0 ? (
            <p className="py-8 text-center text-sm text-ib-slate">
              Mande uma mensagem ou clique num cenário acima.
            </p>
          ) : null}
          {msgs.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "rounded-br-sm bg-ib-mar text-white"
                    : "rounded-bl-sm bg-white text-ib-ink ring-1 ring-inset ring-ib-line"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {sending ? (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm bg-white px-3.5 py-2.5 text-sm text-ib-slate ring-1 ring-inset ring-ib-line">
                digitando…
              </div>
            </div>
          ) : null}
          <div ref={fim} />
        </div>

        {erro ? <p className="mt-2 text-xs font-medium text-ib-danger">{erro}</p> : null}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="mt-3 flex gap-2"
        >
          <label htmlFor="chat-input" className="sr-only">
            Mensagem de teste
          </label>
          <input
            id="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escreva como um cliente escreveria…"
            className={inputCls}
          />
          <button type="submit" disabled={sending || !input.trim()} className={btnPrimary}>
            Enviar
          </button>
        </form>
      </Card>
    </div>
  );
}

