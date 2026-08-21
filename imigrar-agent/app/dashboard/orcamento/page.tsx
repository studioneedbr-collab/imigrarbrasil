"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BRL,
  Card,
  SectionTitle,
  PageHeader,
  Icon,
  btnPrimary,
  btnGhost,
  Skeleton,
} from "@/components/dashboard/ui";
import { ServicePicker } from "@/components/dashboard/service-picker";
import type { ServiceSchedule } from "@/lib/domain/types";
import type { PricingParams } from "@/lib/agent/pricing-params";
import { buildProposalEmail } from "@/lib/email/proposal-email";
import { maskCpfCnpj } from "@/lib/format/masks";

type ServiceOption = {
  name: string;
  schedule: ServiceSchedule;
  priceConfirmed: boolean;
};

type Cobertura = "24h" | "12h_diurno" | "12h_noturno";

type LineItem = {
  key: string;
  serviceName: string;
  employeesCount: number;
  schedule: ServiceSchedule;
  /** Com cobertura, employeesCount são POSTOS: 1 posto 24h = 4 funcionários na 12x36. */
  cobertura?: Cobertura;
};

// Rótulos das coberturas. Só existem na 12x36 — é a única escala cujo dimensionamento a
// Shine validou (Eduardo, 17/08/2026).
const COBERTURAS: { value: "" | Cobertura; label: string; nota?: string }[] = [
  { value: "", label: "1 funcionário por posto" },
  { value: "24h", label: "Posto 24h", nota: "4 funcionários, 2 com adicional noturno" },
  { value: "12h_diurno", label: "Posto 12h diurno", nota: "2 funcionários" },
  { value: "12h_noturno", label: "Posto 12h noturno", nota: "2 funcionários com adicional noturno" },
];

type CostBreakdown = {
  salarioBase: number;
  decimoTerceiroFerias: number;
  encargos: number;
  beneficios: number;
  provisaoRescisao: number;
  reposicaoAusencias: number;
  uniforme: number;
  equipamentos: number;
  material: number;
  custoPuro: number;
  bdi: number;
  precoVenda: number;
  priceConfirmed: boolean;
};

type QuoteLine = {
  serviceName: string;
  employeesCount: number;
  schedule: ServiceSchedule;
  sobConsulta: boolean;
  unitSalePrice: number | null;
  totalSalePrice: number | null;
  costBreakdown: CostBreakdown;
  cobertura?: Cobertura;
  funcionariosPorPosto: number;
  funcionariosTotais: number;
  coberturaNaoDimensionavel: boolean;
};

const BREAKDOWN_ROWS: { key: keyof CostBreakdown; label: string }[] = [
  { key: "salarioBase", label: "Salário base" },
  { key: "decimoTerceiroFerias", label: "13º + férias" },
  { key: "encargos", label: "Encargos" },
  { key: "beneficios", label: "Benefícios" },
  { key: "provisaoRescisao", label: "Provisão rescisão" },
  { key: "reposicaoAusencias", label: "Reposição de ausências" },
  { key: "uniforme", label: "Uniforme" },
  { key: "equipamentos", label: "Equipamentos" },
  { key: "material", label: "Material" },
  { key: "custoPuro", label: "Custo puro" },
  { key: "bdi", label: "BDI" },
  { key: "precoVenda", label: "Preço de venda" },
];

type QuoteResult = {
  items: QuoteLine[];
  total: number;
  annual: number;
  hasSobConsulta: boolean;
};

const SCHEDULES: { value: ServiceSchedule; label: string }[] = [
  { value: "5x2_44h", label: "5x2 · 44h" },
  { value: "6x1_44h", label: "6x1 · 44h" },
  { value: "12x36", label: "12x36" },
];
const scheduleLabel = (s: string) => SCHEDULES.find((x) => x.value === s)?.label ?? s;

function EmailProposalModal({
  open,
  onClose,
  defaultTo,
  subject,
  body,
  onSend,
  sending,
}: {
  open: boolean;
  onClose: () => void;
  defaultTo: string;
  subject: string;
  body: string;
  onSend: (to: string, cc: string) => void;
  sending: boolean;
}) {
  const [to, setTo] = useState(defaultTo);
  const [cc, setCc] = useState("");

  useEffect(() => {
    if (open) {
      setTo(defaultTo);
      setCc("");
    }
  }, [open, defaultTo]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const inputClass =
    "w-full rounded-xl border border-ib-line bg-white px-3 py-2.5 text-sm text-ib-ink placeholder:text-ib-slate focus:border-ib-mar focus:outline-none focus:ring-2 focus:ring-ib-mar/20";
  const labelClass = "mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ib-slate";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ib-ink/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="email-modal-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-ib-line bg-white p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <p id="email-modal-title" className="text-sm font-semibold text-ib-ink">
            Enviar proposta por e-mail
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-lg leading-none text-ib-slate transition hover:bg-ib-papel hover:text-ib-ink"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className={labelClass}>Para</label>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Cc (opcional, separado por vírgula)</label>
            <input
              type="text"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="cc1@empresa.com, cc2@empresa.com"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Assunto</label>
            <p className="rounded-xl border border-ib-line bg-ib-papel/50 px-3 py-2.5 text-sm text-ib-ink">
              {subject}
            </p>
          </div>
          <div>
            <label className={labelClass}>Mensagem</label>
            <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl border border-ib-line bg-ib-papel/50 px-3 py-2.5 font-sans text-xs leading-relaxed text-ib-ink">
              {body}
            </pre>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className={btnGhost}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onSend(to, cc)}
            disabled={sending || !to.trim()}
            className={btnPrimary}
          >
            <Icon name="mail" className="h-4 w-4" />
            {sending ? "Abrindo…" : "Abrir e-mail"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OrcamentoPage() {
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [items, setItems] = useState<LineItem[]>([]);
  const [quote, setQuote] = useState<QuoteResult | null>(null);

  const [serviceName, setServiceName] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [schedule, setSchedule] = useState<ServiceSchedule>("5x2_44h");
  const [cobertura, setCobertura] = useState<"" | Cobertura>("");

  const [contactName, setContactName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [email, setEmail] = useState("");

  const [generating, setGenerating] = useState(false);
  const [success, setSuccess] = useState<{
    url: string;
    filename?: string;
    proposalId?: string;
  } | null>(null);
  const [genNote, setGenNote] = useState<{ kind: "error" | "warn"; text: string } | null>(null);

  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailNote, setEmailNote] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/pricing-params", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { items: PricingParams[] };
        const options: ServiceOption[] = data.items.map((p) => ({
          name: p.functionName,
          schedule: p.schedule as ServiceSchedule,
          priceConfirmed: p.priceConfirmed,
        }));
        setServices(options);
        // Campo começa VAZIO, com o placeholder de busca à mostra. Preencher com a
        // primeira função do catálogo (um "Agente Administrativo" qualquer) fazia o
        // orçamento nascer com um posto que ninguém escolheu.
      } catch {
        /* ignore */
      } finally {
        setServicesLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (items.length === 0) {
      setQuote(null);
      return;
    }
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: items.map((i) => ({
              serviceName: i.serviceName,
              employeesCount: i.employeesCount,
              schedule: i.schedule,
              ...(i.cobertura ? { cobertura: i.cobertura } : {}),
            })),
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as QuoteResult;
        if (active) setQuote(data);
      } catch {
        if (active) setQuote(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [items]);

  function addItem() {
    if (!serviceName || quantity < 1) return;
    setItems((prev) => [
      ...prev,
      {
        key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        serviceName,
        employeesCount: quantity,
        schedule,
        ...(cobertura && schedule === "12x36" ? { cobertura } : {}),
      },
    ]);
    setSuccess(null);
    setGenNote(null);
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((i) => i.key !== key));
  }

  async function generateProposal() {
    if (items.length === 0) {
      setGenNote({ kind: "error", text: "Adicione ao menos um item ao orçamento." });
      return;
    }
    setGenNote(null);
    setSuccess(null);
    setGenerating(true);
    try {
      const res = await fetch("/api/quote/proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadData: {
            contact_name: contactName || undefined,
            company_name: companyName || undefined,
            cnpj: cnpj || undefined,
            email: email || undefined,
          },
          items: items.map((i) => ({
            serviceName: i.serviceName,
            employeesCount: i.employeesCount,
            schedule: i.schedule,
            ...(i.cobertura ? { cobertura: i.cobertura } : {}),
          })),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        view_url?: string;
        filename?: string;
        proposal_id?: string;
        error?: string;
        message?: string;
      };
      // Itens sob consulta → 422: mostra a orientação do consultor, sem falhar em silêncio.
      if (res.status === 422 && data.error === "sob_consulta") {
        setGenNote({
          kind: "warn",
          text:
            data.message ??
            "Há itens sob consulta no orçamento. Um consultor confirma o valor exato.",
        });
        return;
      }
      if (!res.ok || !data.ok || !data.view_url) {
        throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);
      }
      window.open(data.view_url, "_blank", "noopener,noreferrer");
      setSuccess({ url: data.view_url, filename: data.filename, proposalId: data.proposal_id });
      setEmailNote(null);
    } catch (err) {
      setGenNote({
        kind: "error",
        text: err instanceof Error ? err.message : "Erro ao gerar proposta",
      });
    } finally {
      setGenerating(false);
    }
  }

  async function handleSendEmail(to: string, cc: string) {
    if (!success || !to.trim()) return;
    setSendingEmail(true);
    setEmailNote(null);
    try {
      const proposalEmail = buildProposalEmail({
        toEmail: to.trim(),
        clienteNome: contactName || undefined,
        empresa: companyName || undefined,
        totalValue: monthly,
        viewUrl: success.url,
      });
      const ccList = cc
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      let mailto = `mailto:${encodeURIComponent(to.trim())}?subject=${encodeURIComponent(
        proposalEmail.subject,
      )}&body=${encodeURIComponent(proposalEmail.body)}`;
      if (ccList.length > 0) {
        mailto += `&cc=${encodeURIComponent(ccList.join(","))}`;
      }
      window.location.href = mailto;
      if (success.proposalId) {
        await fetch(`/api/proposals/${success.proposalId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email_status: "rascunho_aberto" }),
        });
      }
      setEmailNote({
        kind: "ok",
        text: "Rascunho de e-mail aberto no seu cliente de e-mail padrão.",
      });
      setEmailModalOpen(false);
    } catch (err) {
      setEmailNote({
        kind: "error",
        text: err instanceof Error ? err.message : "Erro ao preparar o e-mail",
      });
    } finally {
      setSendingEmail(false);
    }
  }

  const priced = useMemo(
    () => items.map((it, idx) => ({ ...it, line: quote?.items[idx] })),
    [items, quote],
  );

  const monthly = quote?.total ?? 0;
  const annual = quote?.annual ?? 0;
  const totalPosts = items.reduce((s, i) => s + i.employeesCount, 0);
  const hasSobConsulta = quote?.hasSobConsulta ?? false;
  const confirmedCount = quote?.items.filter((l) => !l.sobConsulta).length ?? 0;
  const onlySobConsulta = items.length > 0 && !!quote && confirmedCount === 0;
  const selectedSobConsulta =
    !servicesLoading &&
    !!serviceName &&
    services.some((s) => s.name === serviceName && s.priceConfirmed !== true);

  const hasClientDataForEmail =
    email.trim().length > 0 && (contactName.trim().length > 0 || companyName.trim().length > 0);
  const canSendEmail = !!success && hasClientDataForEmail;

  const emailPreview = success
    ? buildProposalEmail({
        toEmail: email || "cliente@empresa.com",
        clienteNome: contactName || undefined,
        empresa: companyName || undefined,
        totalValue: monthly,
        viewUrl: success.url,
      })
    : null;

  const inputClass =
    "w-full rounded-xl border border-ib-line bg-white px-3 py-2.5 text-sm text-ib-ink placeholder:text-ib-slate focus:border-ib-mar focus:outline-none focus:ring-2 focus:ring-ib-mar/20";
  const labelClass = "mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ib-slate";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Simulador"
        title="Orçamento"
        description="Monte a folha de orçamento, veja os preços recalcularem ao vivo e gere a proposta em PDF."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        {/* LEFT — builder */}
        <div className="space-y-6">
          <Card className="p-5">
            <p className="text-sm font-semibold text-ib-ink">Adicionar posto</p>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div className="min-w-[220px] flex-1 basis-[220px]">
                <label className={labelClass}>Serviço</label>
                {servicesLoading ? (
                  <Skeleton className="h-[42px] w-full rounded-xl" />
                ) : (
                  <ServicePicker
                    options={services}
                    value={serviceName}
                    onChange={setServiceName}
                    inputClass={inputClass}
                  />
                )}
                {selectedSobConsulta ? (
                  <p className="mt-1.5 text-xs text-ib-warn">
                    Preço sob consulta — não entra no total automático.
                  </p>
                ) : null}
              </div>
              <div className="w-24">
                <label className={labelClass}>Qtd.</label>
                <input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                  className={`${inputClass} font-mono tabular-nums`}
                />
              </div>
              <div className="w-40">
                <label className={labelClass}>Escala</label>
                <select
                  value={schedule}
                  onChange={(e) => setSchedule(e.target.value as ServiceSchedule)}
                  className={inputClass}
                >
                  {SCHEDULES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              {/* Cobertura do posto. Só na 12x36: um posto 24h são 4 funcionários se
                  alternando (2 com adicional noturno), e é a única escala cujo
                  dimensionamento a Shine validou. */}
              <div className="w-52">
                <label className={labelClass}>Cobertura</label>
                <select
                  value={schedule === "12x36" ? cobertura : ""}
                  disabled={schedule !== "12x36"}
                  onChange={(e) => setCobertura(e.target.value as "" | Cobertura)}
                  className={`${inputClass} disabled:opacity-50`}
                >
                  {COBERTURAS.map((c) => (
                    <option key={c.value || "unit"} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-ib-slate">
                  {schedule !== "12x36"
                    ? "Dimensionamento por cobertura só na escala 12x36."
                    : (COBERTURAS.find((c) => c.value === cobertura)?.nota ??
                       "A quantidade acima é de funcionários.")}
                </p>
              </div>
              <button
                type="button"
                onClick={addItem}
                disabled={!serviceName}
                className={`${btnPrimary} h-[42px] w-full sm:w-auto`}
              >
                <Icon name="plus" className="h-4 w-4" />
                Adicionar
              </button>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <SectionTitle
              right={
                <span className="font-mono text-xs tabular-nums text-ib-slate">
                  {items.length} {items.length === 1 ? "item" : "itens"}
                </span>
              }
            >
              Folha de orçamento
            </SectionTitle>
            {items.length === 0 ? (
              <div className="p-6 sm:p-8">
                <div className="rounded-xl border border-dashed border-ib-line bg-ib-papel/50 p-6">
                  <p className="text-sm font-medium text-ib-ink">
                    A folha está vazia
                  </p>
                  <p className="mt-1 text-sm text-ib-slate">
                    Escolha um serviço, defina quantidade e escala e clique em{" "}
                    <span className="font-medium text-ib-ink">Adicionar</span>. Os preços são
                    calculados pela tabela oficial da Imigrar Brasil a cada mudança.
                  </p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto console-scroll">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-ib-line bg-ib-papel/70 text-[11px] uppercase tracking-[0.08em] text-ib-slate">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Serviço</th>
                      <th className="px-5 py-3 text-right font-semibold">Qtd.</th>
                      <th className="px-5 py-3 font-semibold">Escala</th>
                      <th className="px-5 py-3 text-right font-semibold">Unitário</th>
                      <th className="px-5 py-3 text-right font-semibold">Total</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {priced.map((it) => (
                      <tr key={it.key} className="border-b border-ib-line/70 last:border-0">
                        <td className="px-5 py-3 font-medium text-ib-ink">
                          {it.serviceName}
                          {it.cobertura ? (
                            <span className="block text-xs font-normal text-ib-slate">
                              {COBERTURAS.find((c) => c.value === it.cobertura)?.label} ·{" "}
                              {(it.line?.funcionariosTotais ?? 0) || "—"} funcionário(s)
                              {it.line?.coberturaNaoDimensionavel
                                ? " · dimensionamento com a Mesa de Operação"
                                : ""}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums text-ib-slate">
                          {it.employeesCount}
                        </td>
                        <td className="px-5 py-3 text-ib-slate">
                          {scheduleLabel(it.schedule)}
                        </td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums">
                          {!it.line ? (
                            <span className="text-ib-slate">…</span>
                          ) : it.line.sobConsulta || it.line.unitSalePrice == null ? (
                            <span className="font-sans text-xs font-medium text-ib-warn">
                              Sob consulta
                            </span>
                          ) : (
                            <span className="text-ib-slate">{BRL(it.line.unitSalePrice)}</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums">
                          {!it.line ? (
                            <span className="text-ib-slate">…</span>
                          ) : it.line.sobConsulta || it.line.totalSalePrice == null ? (
                            <span className="font-sans text-xs font-medium text-ib-warn">
                              Sob consulta
                            </span>
                          ) : (
                            <span className="text-ib-ink">{BRL(it.line.totalSalePrice)}</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => removeItem(it.key)}
                            aria-label={`Remover ${it.serviceName}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ib-slate transition hover:bg-ib-danger/10 hover:text-ib-danger"
                          >
                            <Icon name="trash" className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {priced.some((it) => it.line) ? (
            <Card className="overflow-hidden">
              <SectionTitle>Memória de cálculo</SectionTitle>
              <div className="space-y-5 p-5 pt-0">
                {priced
                  .filter((it) => it.line)
                  .map((it) => {
                    const cb = it.line!.costBreakdown;
                    return (
                      <div key={it.key}>
                        <p className="mb-2 flex items-center gap-2 text-sm font-medium text-ib-ink">
                          {it.serviceName}
                          <span className="text-xs font-normal text-ib-slate">
                            · {scheduleLabel(it.schedule)} · valores por posto
                          </span>
                          {!cb.priceConfirmed ? (
                            <span className="rounded-full bg-ib-warn/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#9A6212]">
                              Estimativa
                            </span>
                          ) : null}
                        </p>
                        <div className="overflow-x-auto console-scroll rounded-xl border border-ib-line">
                          <table className="w-full text-left text-xs">
                            <tbody>
                              {BREAKDOWN_ROWS.map((row, idx) => (
                                <tr
                                  key={row.key}
                                  className={`${
                                    idx === BREAKDOWN_ROWS.length - 1
                                      ? "bg-ib-papel/70 font-semibold text-ib-ink"
                                      : "border-b border-ib-line/70 last:border-0"
                                  }`}
                                >
                                  <td className="px-4 py-2 text-ib-slate">{row.label}</td>
                                  <td className="px-4 py-2 text-right font-mono tabular-nums">
                                    {BRL(cb[row.key] as number)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </Card>
          ) : null}
        </div>

        {/* RIGHT — summary + client */}
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <div className="relative overflow-hidden bg-gradient-to-br from-ib-casa to-ib-ink p-5 text-white">
              <div className="grid-field-dark pointer-events-none absolute inset-0 opacity-40" aria-hidden="true" />
              <div className="relative">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ib-selo">
                  Total mensal{hasSobConsulta && !onlySobConsulta ? " (itens com preço)" : ""}
                </p>
                {onlySobConsulta ? (
                  <p className="mt-1.5 text-2xl font-semibold tracking-tight text-white/90">
                    Sob consulta
                  </p>
                ) : (
                  <p className="mt-1.5 font-mono text-4xl font-semibold tracking-tight tabular-nums">
                    {BRL(monthly)}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between px-5 py-3.5">
              <span className="text-sm text-ib-slate">Total anual</span>
              <span className="font-mono text-lg font-semibold tabular-nums text-ib-ink">
                {onlySobConsulta ? "—" : BRL(annual)}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-ib-line px-5 py-3 text-xs text-ib-slate">
              <span>Postos no orçamento</span>
              <span className="font-mono tabular-nums">{totalPosts}</span>
            </div>
            {hasSobConsulta ? (
              <div className="border-t border-ib-line bg-ib-warn/[0.06] px-5 py-3.5">
                <p className="text-xs leading-relaxed text-[#9A6212]">
                  <span className="font-semibold">Itens sob consulta:</span> um consultor confirma o
                  valor exato. O total acima soma apenas funções com preço definido (ex.: Auxiliar de
                  Serviços Gerais); a proposta automática também usa somente essas.
                </p>
              </div>
            ) : null}
          </Card>

          <Card className="p-5">
            <p className="text-sm font-semibold text-ib-ink">Dados do cliente</p>
            <p className="mt-0.5 text-xs text-ib-slate">
              Nome/empresa e e-mail habilitam o envio da proposta por e-mail.
            </p>
            <div className="mt-4 space-y-3">
              <input
                placeholder="Nome do contato"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className={inputClass}
              />
              <input
                placeholder="Empresa"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className={inputClass}
              />
              <input
                placeholder="CNPJ / CPF"
                value={cnpj}
                onChange={(e) => setCnpj(maskCpfCnpj(e.target.value))}
                className={`${inputClass} font-mono tabular-nums`}
              />
              <input
                placeholder="E-mail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </div>

            <button
              type="button"
              onClick={generateProposal}
              disabled={generating || items.length === 0}
              className={`${btnPrimary} mt-4 w-full`}
            >
              <Icon name="doc" className="h-4 w-4" />
              {generating ? "Gerando proposta…" : "Gerar proposta em PDF"}
            </button>

            {genNote ? (
              <p
                className={`mt-3 rounded-xl border px-3 py-2 text-xs leading-relaxed ${
                  genNote.kind === "warn"
                    ? "border-ib-warn/25 bg-ib-warn/[0.08] text-[#9A6212]"
                    : "border-ib-danger/20 bg-ib-danger/5 text-ib-danger"
                }`}
              >
                {genNote.text}
              </p>
            ) : null}
            {success ? (
              <div className="mt-3 rounded-xl border border-ib-success/25 bg-ib-success/8 px-3 py-2 text-xs text-[#15803D]">
                Proposta gerada com sucesso.{" "}
                <a
                  href={success.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold underline"
                >
                  Abrir PDF
                </a>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => setEmailModalOpen(true)}
              disabled={!canSendEmail}
              className={`${btnGhost} mt-2 w-full`}
              title={
                !canSendEmail
                  ? "Preencha os dados do cliente e gere a proposta primeiro"
                  : undefined
              }
            >
              <Icon name="mail" className="h-4 w-4" />
              Enviar por e-mail
            </button>
            {!canSendEmail ? (
              <p className="mt-1.5 text-xs text-ib-slate">
                Preencha os dados do cliente e gere a proposta primeiro.
              </p>
            ) : null}

            {emailNote ? (
              <p
                className={`mt-3 rounded-xl border px-3 py-2 text-xs leading-relaxed ${
                  emailNote.kind === "ok"
                    ? "border-ib-success/25 bg-ib-success/8 text-[#15803D]"
                    : "border-ib-danger/20 bg-ib-danger/5 text-ib-danger"
                }`}
              >
                {emailNote.text}
              </p>
            ) : null}
          </Card>
        </div>
      </div>

      {emailPreview ? (
        <EmailProposalModal
          open={emailModalOpen}
          onClose={() => setEmailModalOpen(false)}
          defaultTo={email}
          subject={emailPreview.subject}
          body={emailPreview.body}
          onSend={handleSendEmail}
          sending={sendingEmail}
        />
      ) : null}
    </div>
  );
}
