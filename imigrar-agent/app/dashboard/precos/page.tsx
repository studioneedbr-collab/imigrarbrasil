"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Card,
  PageHeader,
  Icon,
  btnPrimary,
  btnGhost,
  Skeleton,
  SkeletonCard,
  EmptyState,
} from "@/components/dashboard/ui";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { computeCostBreakdown } from "@/lib/comercial/pricing";
import { SCHEDULE_POSTS } from "@/lib/comercial/catalog";

type FunctionPricing = {
  functionName: string;
  baseSalary: number;
  schedule: string;
  beneficios?: number;
  uniformeMes: number;
  equipamentosFunc: number;
  materialFunc: number;
  priceConfirmed: boolean;
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Feedback = { kind: "success" | "error"; text: string } | null;

const EMPTY_FUNCTION_PRICING: FunctionPricing = {
  functionName: "",
  baseSalary: 0,
  schedule: "5x2_44h",
  uniformeMes: 46.97,
  equipamentosFunc: 0,
  materialFunc: 0,
  priceConfirmed: false,
};

const inputClass =
  "w-full rounded-xl border border-ib-line bg-white px-3 py-2.5 text-sm text-ib-ink placeholder:text-ib-slate focus:border-ib-mar focus:outline-none focus:ring-2 focus:ring-ib-mar/20";

function FeedbackNote({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  const ok = feedback.kind === "success";
  return (
    <p
      className={`mt-3 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium ${
        ok
          ? "border border-ib-success/25 bg-ib-success/8 text-[#15803D]"
          : "border border-ib-danger/20 bg-ib-danger/5 text-ib-danger"
      }`}
    >
      <Icon name={ok ? "check" : "bolt"} className="h-3.5 w-3.5" />
      {feedback.text}
    </p>
  );
}

export default function PrecosPage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [functionPricing, setFunctionPricing] = useState<FunctionPricing[]>([]);
  const [fpForm, setFpForm] = useState<FunctionPricing>(EMPTY_FUNCTION_PRICING);
  const [savingFp, setSavingFp] = useState(false);
  const [fpFeedback, setFpFeedback] = useState<Feedback>(null);
  const [pendingDelete, setPendingDelete] = useState<FunctionPricing | null>(null);
  const [deletingFp, setDeletingFp] = useState(false);
  // O catálogo tem ~100 funções — sem busca a tabela vira um rolo.
  const [busca, setBusca] = useState("");

  async function deleteFunctionPricing() {
    const p = pendingDelete;
    if (!p) return;
    setDeletingFp(true);
    setFpFeedback(null);
    try {
      const res = await fetch(`/api/pricing-params?name=${encodeURIComponent(p.functionName)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setFunctionPricing((prev) => prev.filter((x) => x.functionName !== p.functionName));
      setPendingDelete(null);
      setFpFeedback({ kind: "success", text: `Função "${p.functionName}" excluída.` });
    } catch {
      setFpFeedback({ kind: "error", text: "Não foi possível excluir a função." });
      setPendingDelete(null);
    } finally {
      setDeletingFp(false);
    }
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/pricing-params", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { items: FunctionPricing[] };
        if (!active) return;
        setFunctionPricing(data.items ?? []);
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

  function editFunctionPricing(p: FunctionPricing) {
    setFpFeedback(null);
    setFpForm({ ...p });
  }

  async function saveFunctionPricing() {
    setFpFeedback(null);
    if (!fpForm.functionName.trim()) {
      setFpFeedback({ kind: "error", text: "Informe o nome da função." });
      return;
    }
    setSavingFp(true);
    try {
      const res = await fetch("/api/pricing-params", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fpForm),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        item?: FunctionPricing;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.item) throw new Error(data.error ?? `HTTP ${res.status}`);
      setFunctionPricing((prev) => {
        const idx = prev.findIndex(
          (p) => p.functionName.toLowerCase() === data.item!.functionName.toLowerCase(),
        );
        if (idx === -1) return [...prev, data.item!];
        const next = [...prev];
        next[idx] = data.item!;
        return next;
      });
      setFpFeedback({ kind: "success", text: `Preço de "${data.item.functionName}" salvo.` });
      setFpForm(EMPTY_FUNCTION_PRICING);
    } catch (err) {
      setFpFeedback({ kind: "error", text: err instanceof Error ? err.message : "Erro ao salvar" });
    } finally {
      setSavingFp(false);
    }
  }

  // Composição de custos ao vivo (mesma conta do agente) para conferir antes de salvar.
  const preview = useMemo(() => {
    const s = Number(fpForm.baseSalary);
    if (!s || s <= 0) return null;
    const bd = computeCostBreakdown({
      functionName: fpForm.functionName || "—",
      baseSalary: s,
      schedule: fpForm.schedule,
      beneficios: fpForm.beneficios,
      uniformeMes: Number(fpForm.uniformeMes) || 0,
      equipamentosFunc: Number(fpForm.equipamentosFunc) || 0,
      materialFunc: Number(fpForm.materialFunc) || 0,
      priceConfirmed: fpForm.priceConfirmed,
    });
    const posts = SCHEDULE_POSTS[fpForm.schedule as keyof typeof SCHEDULE_POSTS] ?? 1;
    return { bd, posts, contrato: Math.round(bd.precoVenda * posts * 100) / 100 };
  }, [fpForm]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return functionPricing;
    return functionPricing.filter((p) => p.functionName.toLowerCase().includes(q));
  }, [functionPricing, busca]);

  const confirmadas = useMemo(
    () => functionPricing.filter((p) => p.priceConfirmed).length,
    [functionPricing],
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Comercial"
          title="Preços por função"
          description="Parâmetros que alimentam o motor de precificação. Só funções com 'preço confirmado' recebem preço final — as demais aparecem como 'sob consulta' para o agente."
        />
        <SkeletonCard lines={5} />
        <div className="flex flex-wrap gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[58px] w-52 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Comercial" title="Preços por função" />
        <div className="rounded-xl border border-ib-danger/20 bg-ib-danger/5 px-4 py-3 text-sm text-ib-danger">
          Não foi possível carregar os preços: {loadError}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Comercial"
        title="Preços por função"
        description="Parâmetros que alimentam o motor de precificação. Só funções com 'preço confirmado' recebem preço final — as demais aparecem como 'sob consulta' para o agente."
      />

      <Card className="p-5 sm:p-6">
        {functionPricing.length === 0 ? (
          <EmptyState
            title="Nenhuma função cadastrada"
            text="Cadastre a primeira função no formulário abaixo para o motor de precificação começar a calcular preços — apenas funções com 'preço confirmado' aparecem com valor final."
          />
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar função…"
                aria-label="Buscar função"
                className={`${inputClass} sm:max-w-xs`}
              />
              <p className="text-xs text-ib-slate">
                {functionPricing.length} funções · {confirmadas} com preço confirmado
              </p>
            </div>
            <div className="overflow-x-auto rounded-xl border border-ib-line">
            <table className="min-w-full divide-y divide-ib-line text-sm">
              <thead className="bg-ib-papel/40">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-ib-slate">Função</th>
                  <th className="px-3 py-2 text-left font-semibold text-ib-slate">Salário base</th>
                  <th className="px-3 py-2 text-left font-semibold text-ib-slate">Escala</th>
                  <th className="px-3 py-2 text-left font-semibold text-ib-slate">Preço confirmado</th>
                  <th className="px-3 py-2 text-left font-semibold text-ib-slate">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ib-line bg-white">
                {visiveis.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-sm text-ib-slate">
                      Nenhuma função encontrada para “{busca}”.
                    </td>
                  </tr>
                )}
                {visiveis.map((p) => (
                  <tr key={p.functionName}>
                    <td className="px-3 py-2 font-medium text-ib-ink">{p.functionName}</td>
                    <td className="px-3 py-2 tabular-nums text-ib-ink">
                      {p.baseSalary > 0 ? (
                        brl(p.baseSalary)
                      ) : (
                        <span className="text-ib-slate" title="Piso da CCT ainda não cadastrado">
                          a definir
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-ib-slate">{p.schedule}</td>
                    <td className="px-3 py-2">
                      {p.priceConfirmed ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-ib-success/25 bg-ib-success/8 px-2 py-0.5 text-xs font-medium text-[#15803D]">
                          <Icon name="check" className="h-3 w-3" /> Confirmado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-ib-warn/25 bg-ib-warn/8 px-2 py-0.5 text-xs font-medium text-[#9A6212]">
                          Sob consulta
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => editFunctionPricing(p)}
                          className="text-xs font-medium text-ib-mar hover:underline"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(p)}
                          aria-label={`Excluir ${p.functionName}`}
                          title="Excluir função"
                          className="inline-flex items-center text-ib-slate transition hover:text-ib-danger"
                        >
                          <Icon name="trash" className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </>
        )}
      </Card>

      <Card className="p-5 sm:p-6">
        <div className="border-b border-ib-line pb-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ib-selo">
            Cadastro
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-ib-ink">
            {fpForm.functionName ? `Editar função — ${fpForm.functionName}` : "Nova função"}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-ib-slate">
            Preencha os parâmetros de custo da função. Marque &ldquo;preço confirmado&rdquo; quando o
            valor final já estiver validado para uso pelo agente.
          </p>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs font-medium text-ib-slate">
            Função
            <input
              value={fpForm.functionName}
              onChange={(e) => setFpForm((f) => ({ ...f, functionName: e.target.value }))}
              placeholder="Ex.: Porteiro"
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="text-xs font-medium text-ib-slate">
            Salário base (R$)
            <input
              type="number"
              step="0.01"
              value={fpForm.baseSalary}
              onChange={(e) => setFpForm((f) => ({ ...f, baseSalary: Number(e.target.value) }))}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="text-xs font-medium text-ib-slate">
            Escala
            <select
              value={fpForm.schedule}
              onChange={(e) => setFpForm((f) => ({ ...f, schedule: e.target.value }))}
              className={`${inputClass} mt-1`}
            >
              <option value="5x2_44h">5x2 (44h)</option>
              <option value="6x1_44h">6x1 (44h)</option>
              <option value="12x36">12x36</option>
            </select>
          </label>
          <label className="text-xs font-medium text-ib-slate">
            Benefícios/mês — VT + VR/VA (R$)
            <input
              type="number"
              step="0.01"
              value={fpForm.beneficios ?? ""}
              placeholder="Padrão ~666,19"
              onChange={(e) =>
                setFpForm((f) => ({
                  ...f,
                  beneficios: e.target.value === "" ? undefined : Number(e.target.value),
                }))
              }
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="text-xs font-medium text-ib-slate">
            Uniforme/mês (R$)
            <input
              type="number"
              step="0.01"
              value={fpForm.uniformeMes}
              onChange={(e) => setFpForm((f) => ({ ...f, uniformeMes: Number(e.target.value) }))}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="text-xs font-medium text-ib-slate">
            Equipamentos (R$)
            <input
              type="number"
              step="0.01"
              value={fpForm.equipamentosFunc}
              onChange={(e) => setFpForm((f) => ({ ...f, equipamentosFunc: Number(e.target.value) }))}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="text-xs font-medium text-ib-slate">
            Material (R$)
            <input
              type="number"
              step="0.01"
              value={fpForm.materialFunc}
              onChange={(e) => setFpForm((f) => ({ ...f, materialFunc: Number(e.target.value) }))}
              className={`${inputClass} mt-1`}
            />
          </label>
        </div>

        {preview ? (
          <div className="mt-5 rounded-xl border border-ib-line bg-ib-papel/30 p-4">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ib-selo">
                Composição (CCT + lei)
              </p>
              <p className="text-[11px] text-ib-slate">
                A mesma conta que o agente usa na proposta
              </p>
            </div>
            <dl className="mt-3 space-y-1 text-sm">
              {[
                ["Salário base (piso da categoria)", preview.bd.salarioBase],
                ["13º + férias + 1/3", preview.bd.decimoTerceiroFerias],
                ["Encargos (INSS, FGTS, RAT, Sistema S)", preview.bd.encargos],
                ["Benefícios (VT + VR/VA)", preview.bd.beneficios],
                ["Provisão de rescisão", preview.bd.provisaoRescisao],
                ["Reposição de ausências", preview.bd.reposicaoAusencias],
                ["Uniforme", preview.bd.uniforme],
                ["Equipamentos", preview.bd.equipamentos],
                ["Material", preview.bd.material],
              ].map(([label, value]) => (
                <div key={label as string} className="flex justify-between gap-4 text-ib-slate">
                  <dt>{label}</dt>
                  <dd className="tabular-nums text-ib-ink">{brl(value as number)}</dd>
                </div>
              ))}
              <div className="mt-1 flex justify-between gap-4 border-t border-ib-line pt-2 font-medium text-ib-ink">
                <dt>Custo mensal (sem margem)</dt>
                <dd className="tabular-nums">{brl(preview.bd.custoPuro)}</dd>
              </div>
              <div className="flex justify-between gap-4 text-ib-slate">
                <dt>Tributos + margem (BDI)</dt>
                <dd className="tabular-nums text-ib-ink">{brl(preview.bd.bdi)}</dd>
              </div>
            </dl>
            <div className="mt-3 flex items-end justify-between rounded-lg bg-ib-casa px-4 py-3">
              <span className="text-xs font-medium uppercase tracking-wide text-white/70">
                Preço de venda / posto
              </span>
              <span className="text-xl font-semibold tabular-nums text-white">
                {brl(preview.bd.precoVenda)}
              </span>
            </div>
            {preview.posts > 1 ? (
              <p className="mt-2 text-xs text-ib-slate">
                A escala {fpForm.schedule} precisa de {preview.posts} postos para cobertura ·
                preço no contrato: <span className="font-medium text-ib-ink">{brl(preview.contrato)}</span>
              </p>
            ) : null}
            {!fpForm.priceConfirmed ? (
              <p className="mt-2 text-xs text-[#9A6212]">
                Marque &ldquo;preço confirmado&rdquo; abaixo para o agente usar este valor na proposta (senão fica &ldquo;sob consulta&rdquo;).
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-5 text-xs text-ib-slate">
            Preencha o salário base (piso da categoria) para ver a composição de custos e o preço final.
          </p>
        )}

        <label className="mt-3 inline-flex items-center gap-2 text-sm text-ib-ink">
          <input
            type="checkbox"
            checked={fpForm.priceConfirmed}
            onChange={(e) => setFpForm((f) => ({ ...f, priceConfirmed: e.target.checked }))}
            className="h-4 w-4 rounded border-ib-line text-ib-mar focus:ring-ib-mar/30"
          />
          Preço confirmado (mostrar como preço final, não &ldquo;sob consulta&rdquo;)
        </label>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={saveFunctionPricing} disabled={savingFp} className={btnPrimary}>
            <Icon name="check" className="h-4 w-4" />
            {savingFp ? "Salvando…" : "Salvar função"}
          </button>
          {fpForm.functionName ? (
            <button
              type="button"
              onClick={() => {
                setFpForm(EMPTY_FUNCTION_PRICING);
                setFpFeedback(null);
              }}
              className={btnGhost}
            >
              Cancelar edição
            </button>
          ) : null}
        </div>
        <FeedbackNote feedback={fpFeedback} />
      </Card>

      <ConfirmDialog
        open={pendingDelete !== null}
        loading={deletingFp}
        title="Excluir função"
        message={
          pendingDelete ? (
            <>
              A função <span className="font-semibold">{pendingDelete.functionName}</span> será
              removida da precificação. Esta ação não pode ser desfeita.
            </>
          ) : null
        }
        confirmLabel="Excluir função"
        onConfirm={deleteFunctionPricing}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
