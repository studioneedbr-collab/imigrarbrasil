"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BRL,
  fmtDate,
  fmtDateShort,
  Card,
  PageHeader,
  StatusBadge,
  StatStrip,
  Kpi,
  Pagination,
  EmptyState,
  Icon,
  btnPrimary,
  proposalStatusLabel,
  PROPOSAL_STATUSES,
  Skeleton,
  SkeletonRows,
} from "@/components/dashboard/ui";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import type { Proposal, ProposalEmailStatus, ProposalStatus } from "@/lib/domain/types";

const PAGE_SIZE = 10;

const emailStatusLabel: Record<ProposalEmailStatus, string> = {
  nao_enviado: "não enviado",
  rascunho_aberto: "rascunho aberto",
  enviado: "enviado",
};

const emailStatusTone: Record<ProposalEmailStatus, string> = {
  nao_enviado: "bg-slate-100 text-ib-slate",
  rascunho_aberto: "bg-ib-warn/12 text-[#9A6212]",
  enviado: "bg-ib-success/12 text-[#15803D]",
};

function EmailChip({ status }: { status?: ProposalEmailStatus | null }) {
  if (!status) return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${emailStatusTone[status]}`}
    >
      <Icon name="mail" className="h-3 w-3" />
      E-mail: {emailStatusLabel[status]}
    </span>
  );
}

function ServiceChips({ p }: { p: Proposal }) {
  if (!p.services || p.services.length === 0) {
    return <span className="text-ib-slate">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {p.services.map((s, i) => (
        <span
          key={i}
          className="inline-flex items-center rounded-lg border border-ib-line bg-ib-papel/60 px-2 py-0.5 text-xs text-ib-ink"
          title={`${s.quantity}× ${s.name}${s.schedule ? ` · ${s.schedule}` : ""}`}
        >
          <span className="mr-1 font-mono font-semibold tabular-nums text-ib-mar">
            {s.quantity}×
          </span>
          {s.name}
        </span>
      ))}
    </div>
  );
}

export default function ProposalsPage() {
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Proposal | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [emailFor, setEmailFor] = useState<Proposal | null>(null);
  const [emailTo, setEmailTo] = useState("");
  const [emailToName, setEmailToName] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailOk, setEmailOk] = useState<string | null>(null);

  async function sendEmail() {
    const p = emailFor;
    if (!p) return;
    setSendingEmail(true);
    setEmailError(null);
    try {
      const res = await fetch(`/api/proposal/${p.id}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: emailTo.trim(), toName: emailToName.trim() || undefined }),
      });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !d.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      setProposals((prev) =>
        prev ? prev.map((x) => (x.id === p.id ? { ...x, emailStatus: "enviado" } : x)) : prev,
      );
      setEmailOk(`Proposta enviada para ${emailTo.trim()}.`);
      setEmailFor(null);
      setEmailTo("");
      setEmailToName("");
    } catch (e) {
      setEmailError(e instanceof Error ? e.message : "Falha ao enviar o e-mail.");
    } finally {
      setSendingEmail(false);
    }
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/proposals", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { proposals: Proposal[] };
        if (!active) return;
        setProposals(
          [...data.proposals].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          ),
        );
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Erro ao carregar");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function changeStatus(prop: Proposal, status: ProposalStatus) {
    const previous = prop.status;
    setProposals((prev) =>
      prev ? prev.map((p) => (p.id === prop.id ? { ...p, status } : p)) : prev,
    );
    try {
      const res = await fetch(`/api/proposals/${prop.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      setProposals((prev) =>
        prev ? prev.map((p) => (p.id === prop.id ? { ...p, status: previous } : p)) : prev,
      );
    }
  }

  async function confirmDelete() {
    const prop = pendingDelete;
    if (!prop) return;
    setDeleting(true);
    const snapshot = proposals;
    setError(null);
    setProposals((prev) => (prev ? prev.filter((p) => p.id !== prop.id) : prev));
    try {
      const res = await fetch(`/api/proposal/${prop.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPendingDelete(null);
    } catch {
      setProposals(snapshot); // reverte a remoção otimista se a API falhar
      setError("Não foi possível excluir a proposta. Tente novamente.");
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  const stats = useMemo(() => {
    const list = proposals ?? [];
    const total = list.reduce((s, p) => s + (p.totalValue ?? 0), 0);
    const openValue = list
      .filter((p) => p.status !== "rejected")
      .reduce((s, p) => s + (p.totalValue ?? 0), 0);
    const accepted = list.filter((p) => p.status === "accepted").length;
    return { total, openValue, accepted, count: list.length };
  }, [proposals]);

  const filteredProposals = useMemo(() => {
    const list = proposals ?? [];
    const term = filter.trim().toLowerCase();
    if (!term) return list;
    return list.filter((p) => {
      const haystack = [p.id, ...(p.services ?? []).map((s) => s.name)]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [proposals, filter]);

  const pageCount = Math.max(1, Math.ceil(filteredProposals.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount);
  const pageItems = useMemo(() => {
    const start = (clampedPage - 1) * PAGE_SIZE;
    return filteredProposals.slice(start, start + PAGE_SIZE);
  }, [filteredProposals, clampedPage]);

  useEffect(() => {
    setPage(1);
  }, [filter]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="CRM"
        title="Propostas"
        description="Todas as propostas geradas pelo agente, com valor, status e PDF pronto para envio ao cliente."
        actions={
          <Link href="/dashboard/orcamento" className={btnPrimary}>
            <Icon name="calc" className="h-4 w-4" />
            Novo orçamento
          </Link>
        }
      />

      {error ? (
        <div className="rounded-xl border border-ib-danger/20 bg-ib-danger/5 px-4 py-3 text-sm text-ib-danger">
          Não foi possível carregar as propostas: {error}
        </div>
      ) : proposals === null ? (
        <>
          <Card className="overflow-hidden">
            <div className="grid grid-cols-2 divide-x divide-y divide-ib-line sm:grid-cols-4 sm:divide-y-0">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="p-4">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="mt-2 h-6 w-16" />
                </div>
              ))}
            </div>
          </Card>
          <Card className="overflow-hidden">
            <SkeletonRows rows={8} cols={6} />
          </Card>
        </>
      ) : proposals.length === 0 ? (
        <EmptyState
          title="Nenhuma proposta ainda"
          text="Monte um orçamento no simulador para gerar a primeira proposta em PDF. Ela aparece aqui com valor, status editável e um botão direto para o documento."
          action={
            <Link href="/dashboard/orcamento" className={btnPrimary}>
              <Icon name="calc" className="h-4 w-4" />
              Criar orçamento
            </Link>
          }
        />
      ) : (
        <>
          {/* Pipeline summary */}
          <StatStrip>
            <Kpi label="Propostas" value={String(stats.count)} />
            <Kpi label="Aceitas" value={String(stats.accepted)} sparkStroke="#15803D" />
            <Kpi label="Valor em aberto" value={BRL(stats.openValue)} />
            <Kpi label="Valor em pipeline" value={BRL(stats.total)} sparkStroke="#23B5D3" />
          </StatStrip>

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ib-line px-4 py-3">
              <div className="relative min-w-[240px] flex-1 sm:max-w-xs">
                <Icon
                  name="search"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ib-slate"
                />
                <input
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filtrar por cliente ou serviço…"
                  className="w-full rounded-lg border border-ib-line bg-white py-2 pl-9 pr-3 text-sm text-ib-ink placeholder:text-ib-slate focus:border-ib-mar focus:outline-none focus:ring-2 focus:ring-ib-mar/20"
                />
              </div>
              <div className="flex items-center gap-3 text-xs text-ib-slate">
                <span>
                  {filteredProposals.length}{" "}
                  {filteredProposals.length === 1 ? "proposta" : "propostas"}
                  {filter.trim() ? ` de ${proposals.length}` : ""}
                </span>
                {filter.trim() ? (
                  <button
                    type="button"
                    onClick={() => setFilter("")}
                    className="font-medium text-ib-mar underline-offset-2 hover:underline"
                  >
                    Limpar
                  </button>
                ) : null}
              </div>
            </div>
            {filteredProposals.length === 0 ? (
              <div className="p-6 sm:p-8">
                <EmptyState
                  title="Nenhuma proposta encontrada"
                  text={`Nenhuma proposta corresponde a "${filter}". Tente outro termo ou limpe o filtro.`}
                  action={
                    <button type="button" onClick={() => setFilter("")} className={btnPrimary}>
                      Limpar filtro
                    </button>
                  }
                />
              </div>
            ) : (
            <div className="overflow-x-auto console-scroll">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-ib-line bg-ib-papel/70 text-[11px] uppercase tracking-[0.08em] text-ib-slate">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Proposta</th>
                    <th className="px-4 py-3 font-semibold">Serviços</th>
                    <th className="px-4 py-3 text-right font-semibold">Total</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Criada em</th>
                    <th className="px-4 py-3 text-right font-semibold">Documento</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b border-ib-line/70 align-top transition last:border-0 hover:bg-ib-bruma/40"
                    >
                      <td className="px-4 py-3 font-mono text-xs tabular-nums text-ib-slate">
                        #{p.id.slice(0, 8)}
                      </td>
                      <td className="max-w-xs px-4 py-3">
                        <ServiceChips p={p} />
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-ib-ink">
                        {BRL(p.totalValue)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-start gap-1.5">
                          <div className="flex items-center gap-2">
                            <StatusBadge kind="proposal" status={p.status} />
                            <select
                              aria-label="Alterar status da proposta"
                              value={p.status}
                              onChange={(e) => changeStatus(p, e.target.value as ProposalStatus)}
                              className="rounded-lg border border-ib-line bg-white px-2 py-1 text-xs text-ib-ink transition focus:border-ib-mar focus:outline-none focus:ring-2 focus:ring-ib-mar/20"
                            >
                              {PROPOSAL_STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {proposalStatusLabel[s]}
                                </option>
                              ))}
                            </select>
                          </div>
                          <EmailChip status={p.emailStatus} />
                        </div>
                      </td>
                      <td
                        className="px-4 py-3 font-mono text-xs tabular-nums text-ib-slate"
                        title={fmtDate(p.createdAt)}
                      >
                        {fmtDateShort(p.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <a
                            href={`/api/proposal/${p.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-ib-mar px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-ib-carimbo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ib-mar"
                          >
                            <Icon name="doc" className="h-3.5 w-3.5" />
                            Ver PDF
                          </a>
                          {/* Planilha de composição: um posto por aba, com a cláusula da
                              CCT ao lado de cada célula. É interna — mostra custo, margem
                              e BDI, que não vão para o cliente. */}
                          <a
                            href={`/api/proposal/${p.id}/planilha`}
                            title="Baixar a planilha de composição de custos (uso interno)"
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-ib-line bg-white px-2.5 py-1.5 text-xs font-medium text-ib-mar shadow-sm transition hover:bg-ib-bruma"
                          >
                            <Icon name="doc" className="h-3.5 w-3.5" />
                            Composição
                          </a>
                          <button
                            type="button"
                            onClick={() => {
                              setEmailFor(p);
                              setEmailError(null);
                              setEmailOk(null);
                            }}
                            aria-label="Enviar por e-mail"
                            title={p.emailStatus === "enviado" ? "Reenviar por e-mail" : "Enviar por e-mail"}
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-ib-line bg-white px-2.5 py-1.5 text-xs font-medium text-ib-mar shadow-sm transition hover:bg-ib-bruma"
                          >
                            <Icon name="mail" className="h-3.5 w-3.5" />
                            {p.emailStatus === "enviado" ? "Reenviar" : "E-mail"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDelete(p)}
                            aria-label="Excluir proposta"
                            title="Excluir proposta"
                            className="inline-flex items-center justify-center rounded-lg border border-ib-line bg-white px-2 py-1.5 text-ib-slate shadow-sm transition hover:border-ib-danger/30 hover:bg-ib-danger/5 hover:text-ib-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ib-danger"
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
            )}
            {filteredProposals.length > 0 ? (
              <div className="border-t border-ib-line">
                <Pagination
                  page={clampedPage}
                  pageCount={pageCount}
                  onPage={setPage}
                  total={filteredProposals.length}
                />
              </div>
            ) : null}
          </Card>
        </>
      )}

      {emailOk ? (
        <div className="fixed bottom-5 left-1/2 z-[70] -translate-x-1/2 rounded-xl border border-ib-success/25 bg-white px-4 py-2.5 text-sm font-medium text-[#15803D] shadow-lg">
          {emailOk}
          <button type="button" onClick={() => setEmailOk(null)} className="ml-3 text-ib-slate hover:text-ib-ink">✕</button>
        </div>
      ) : null}

      {emailFor ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-ib-casa/45 backdrop-blur-[2px]"
            onClick={() => !sendingEmail && setEmailFor(null)}
            aria-hidden
          />
          <div role="dialog" aria-modal="true" className="relative w-full max-w-md rounded-2xl border border-ib-line bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ib-bruma text-ib-mar">
                <Icon name="mail" className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-ib-ink">Enviar Proposta Imigrar Brasil</h2>
                <p className="mt-1 text-sm text-ib-slate">
                  A proposta <span className="font-mono">nº {emailFor.id.slice(0, 8)}</span> vai por e-mail com o PDF em anexo, direto para o cliente.
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.08em] text-ib-slate">E-mail do destinatário</label>
                <input
                  type="email"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="cliente@empresa.com"
                  autoFocus
                  className="mt-1.5 w-full rounded-xl border border-ib-line bg-white px-3 py-2.5 text-sm text-ib-ink placeholder:text-ib-slate focus:border-ib-mar focus:outline-none focus:ring-2 focus:ring-ib-mar/20"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.08em] text-ib-slate">Nome (opcional)</label>
                <input
                  value={emailToName}
                  onChange={(e) => setEmailToName(e.target.value)}
                  placeholder="Ex.: João Silva"
                  className="mt-1.5 w-full rounded-xl border border-ib-line bg-white px-3 py-2.5 text-sm text-ib-ink placeholder:text-ib-slate focus:border-ib-mar focus:outline-none focus:ring-2 focus:ring-ib-mar/20"
                />
              </div>
              {emailError ? <p className="text-xs font-medium text-ib-danger">{emailError}</p> : null}
            </div>
            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setEmailFor(null)}
                disabled={sendingEmail}
                className="rounded-xl border border-ib-line bg-white px-4 py-2 text-sm font-medium text-ib-ink transition hover:bg-ib-papel disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={sendEmail}
                disabled={sendingEmail || !emailTo.trim()}
                className="rounded-xl bg-ib-mar px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-ib-carimbo disabled:opacity-60"
              >
                {sendingEmail ? "Enviando…" : "Enviar e-mail"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        loading={deleting}
        title="Excluir proposta"
        message={
          pendingDelete ? (
            <>
              A proposta <span className="font-mono font-semibold">#{pendingDelete.id.slice(0, 8)}</span>{" "}
              e o PDF serão removidos. Esta ação não pode ser desfeita.
            </>
          ) : null
        }
        confirmLabel="Excluir proposta"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
