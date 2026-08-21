"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  BRL,
  Card,
  EmptyState,
  Icon,
  PageHeader,
  Pagination,
  Skeleton,
  btnGhost,
  btnPrimary,
  fmtDate,
} from "@/components/dashboard/ui";
import { maskCpfCnpj, maskPhone } from "@/lib/format/masks";

interface ClienteRow {
  id: string;
  nome?: string;
  cpf?: string;
  empresa?: string;
  email?: string;
  telefone?: string;
  cidade?: string;
  createdAt: string;
}

interface ProposalServiceLine {
  name: string;
  quantity: number;
  unitPrice: number;
  schedule?: string;
}

interface ProposalRow {
  id: string;
  leadId?: string | null;
  conversationId?: string | null;
  services: ProposalServiceLine[];
  totalValue: number;
  createdAt: string;
}

interface ConversationRow {
  id: string;
  clienteId?: string;
}

interface LeadRow {
  id: string;
  clienteId?: string;
}

type EditableField = "nome" | "empresa" | "email" | "telefone" | "cidade" | "cpf";
type EditForm = Record<EditableField, string>;

function maskCpf(cpf?: string) {
  if (!cpf) return "—";
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return cpf;
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

function clienteToForm(c: ClienteRow): EditForm {
  return {
    nome: c.nome ?? "",
    empresa: c.empresa ?? "",
    email: c.email ?? "",
    telefone: c.telefone ?? "",
    cidade: c.cidade ?? "",
    cpf: c.cpf ?? "",
  };
}

const EDIT_FIELDS: { key: EditableField; label: string; type?: string }[] = [
  { key: "nome", label: "Nome" },
  { key: "empresa", label: "Empresa" },
  { key: "email", label: "E-mail", type: "email" },
  { key: "telefone", label: "Telefone" },
  { key: "cidade", label: "Cidade" },
  { key: "cpf", label: "CPF" },
];

export default function ClientesPage() {
  const [clientes, setClientes] = useState<ClienteRow[] | null>(null);
  const [proposals, setProposals] = useState<ProposalRow[]>([]);
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [somentePropostas, setSomentePropostas] = useState(false);
  const [page, setPage] = useState(1);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    try {
      const [clientesRes, proposalsRes, conversationsRes, leadsRes] = await Promise.all([
        fetch("/api/clientes", { cache: "no-store" }),
        fetch("/api/proposals", { cache: "no-store" }),
        fetch("/api/conversations", { cache: "no-store" }),
        fetch("/api/leads", { cache: "no-store" }),
      ]);
      if (clientesRes.ok) {
        setClientes((await clientesRes.json()).clientes ?? []);
        setLoadError(null);
      } else {
        setClientes([]);
        setLoadError("Não foi possível carregar a base de clientes.");
      }
      if (proposalsRes.ok) setProposals((await proposalsRes.json()).proposals ?? []);
      if (conversationsRes.ok) setConversations((await conversationsRes.json()).conversations ?? []);
      if (leadsRes.ok) setLeads((await leadsRes.json()).leads ?? []);
    } catch {
      setClientes([]);
      setLoadError("Não foi possível carregar a base de clientes.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Fecha o drawer com Esc.
  useEffect(() => {
    if (!selectedId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeDrawer();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  // Proposta não tem clienteId direto: liga por conversationId → conversa.clienteId,
  // com fallback por leadId → lead.clienteId (proposta antiga/manual).
  const clienteIdByConversation = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of conversations) if (c.clienteId) map.set(c.id, c.clienteId);
    return map;
  }, [conversations]);
  const clienteIdByLead = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of leads) if (l.clienteId) map.set(l.id, l.clienteId);
    return map;
  }, [leads]);

  const proposalsByCliente = useMemo(() => {
    const map = new Map<string, ProposalRow[]>();
    for (const p of proposals) {
      const clienteId =
        (p.conversationId && clienteIdByConversation.get(p.conversationId)) ||
        (p.leadId && clienteIdByLead.get(p.leadId)) ||
        undefined;
      if (!clienteId) continue;
      if (!map.has(clienteId)) map.set(clienteId, []);
      map.get(clienteId)!.push(p);
    }
    for (const list of Array.from(map.values())) {
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    return map;
  }, [proposals, clienteIdByConversation, clienteIdByLead]);

  const filtered = useMemo(() => {
    if (!clientes) return null;
    const q = query.trim().toLowerCase();
    return clientes.filter((c) => {
      if (somentePropostas && !(proposalsByCliente.get(c.id)?.length ?? 0)) return false;
      if (!q) return true;
      return [c.nome, c.empresa, c.cpf, c.cidade, c.email, c.telefone]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q));
    });
  }, [clientes, query, somentePropostas, proposalsByCliente]);

  const CLIENTES_PAGE_SIZE = 12;
  const pageCount = Math.max(1, Math.ceil((filtered?.length ?? 0) / CLIENTES_PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount);
  const pageItems = useMemo(
    () => (filtered ?? []).slice((clampedPage - 1) * CLIENTES_PAGE_SIZE, clampedPage * CLIENTES_PAGE_SIZE),
    [filtered, clampedPage],
  );
  // Ao mudar o filtro/busca, volta pra página 1.
  useEffect(() => setPage(1), [query, somentePropostas]);

  const selected = useMemo(
    () => (selectedId ? clientes?.find((c) => c.id === selectedId) ?? null : null),
    [selectedId, clientes],
  );
  const selectedProposals = selectedId ? proposalsByCliente.get(selectedId) ?? [] : [];

  function openDrawer(c: ClienteRow) {
    setSelectedId(c.id);
    setEditing(false);
    setEditForm(clienteToForm(c));
    setSaveError(null);
    setConfirmingDelete(false);
  }

  function closeDrawer() {
    setSelectedId(null);
    setEditing(false);
    setEditForm(null);
    setSaveError(null);
    setConfirmingDelete(false);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!selected || !editForm) return;
    setSaving(true);
    setSaveError(null);
    try {
      const patch: Record<string, string> = {};
      for (const { key } of EDIT_FIELDS) {
        const val = editForm[key].trim();
        if (val) patch[key] = val;
      }
      const res = await fetch(`/api/clientes/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("save_failed");
      const { cliente } = await res.json();
      setClientes((prev) => prev?.map((c) => (c.id === cliente.id ? cliente : c)) ?? prev);
      setEditing(false);
    } catch {
      setSaveError("Não foi possível salvar as alterações. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selected) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/clientes/${selected.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete_failed");
      setClientes((prev) => prev?.filter((c) => c.id !== selected.id) ?? prev);
      closeDrawer();
    } catch {
      setSaveError("Não foi possível excluir o cliente. Tente novamente.");
      setConfirmingDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Base comercial"
        title="Clientes"
        description="Dados de clientes já registrados a partir das conversas com o agente, prontos para o time usar no pós-venda."
      />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-ib-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Icon name="book" className="h-[18px] w-[18px] text-ib-mar" />
            <p className="text-sm font-semibold text-ib-ink">
              Clientes cadastrados{clientes ? ` (${filtered?.length ?? 0})` : ""}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="flex items-center gap-2 text-xs font-medium text-ib-slate">
              <input
                type="checkbox"
                checked={somentePropostas}
                onChange={(e) => setSomentePropostas(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-ib-line text-ib-mar focus:ring-ib-mar/30"
              />
              Somente com propostas
            </label>
            <label className="relative block w-full sm:w-72">
              <Icon
                name="search"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ib-slate"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nome, empresa, CPF, e-mail, telefone ou cidade"
                className="w-full rounded-lg border border-ib-line bg-ib-papel py-2 pl-9 pr-3 text-sm text-ib-ink outline-none transition focus:border-ib-mar focus:bg-white focus:ring-4 focus:ring-ib-mar/10"
              />
            </label>
          </div>
        </div>

        {clientes === null ? (
          <div className="divide-y divide-ib-line/70">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3.5">
                <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-1/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-3 w-24" />
              </div>
            ))}
          </div>
        ) : filtered && filtered.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title={
                loadError ??
                (query || somentePropostas
                  ? "Nenhum cliente encontrado"
                  : "Nenhum cliente cadastrado ainda")
              }
              text={
                loadError
                  ? "Tente atualizar a página em alguns instantes."
                  : query || somentePropostas
                    ? "Ajuste a busca ou limpe os filtros para ver todos os clientes."
                    : "Assim que o agente fechar as primeiras conversas, os clientes aparecem aqui automaticamente."
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-ib-line bg-ib-papel/70 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-ib-slate">
                  <th className="px-5 py-3">Nome</th>
                  <th className="px-3 py-3">CPF</th>
                  <th className="px-3 py-3">Empresa</th>
                  <th className="px-3 py-3">E-mail</th>
                  <th className="px-3 py-3">Telefone</th>
                  <th className="px-3 py-3">Cidade</th>
                  <th className="px-3 py-3 text-center">Propostas</th>
                  <th className="px-5 py-3 text-right">Desde</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ib-line">
                {pageItems.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => openDrawer(c)}
                    className="cursor-pointer transition hover:bg-ib-papel/60"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ib-bruma text-xs font-semibold text-ib-casa">
                          {(c.nome || c.empresa || "?").slice(0, 1).toUpperCase()}
                        </span>
                        <span className="truncate font-medium text-ib-ink">
                          {c.nome || "—"}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3.5 font-mono text-xs tabular-nums text-ib-slate">
                      {maskCpf(c.cpf)}
                    </td>
                    <td className="px-3 py-3.5 text-ib-ink">{c.empresa || "—"}</td>
                    <td className="px-3 py-3.5 text-ib-slate">{c.email || "—"}</td>
                    <td className="px-3 py-3.5 text-ib-slate">{c.telefone || "—"}</td>
                    <td className="px-3 py-3.5 text-ib-slate">{c.cidade || "—"}</td>
                    <td className="px-3 py-3.5 text-center">
                      <span className="inline-flex min-w-[1.75rem] items-center justify-center rounded-full bg-ib-bruma px-2 py-0.5 font-mono text-xs tabular-nums text-ib-casa">
                        {proposalsByCliente.get(c.id)?.length ?? 0}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-xs tabular-nums text-ib-slate">
                      {fmtDate(c.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-ib-line">
              <Pagination
                page={clampedPage}
                pageCount={pageCount}
                onPage={setPage}
                total={filtered?.length ?? 0}
              />
            </div>
          </div>
        )}
      </Card>

      {selected ? (
        <div className="fixed inset-0 z-40">
          <button
            type="button"
            aria-label="Fechar"
            onClick={closeDrawer}
            className="absolute inset-0 bg-ib-ink/40 backdrop-blur-[1px]"
          />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col overflow-hidden bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-ib-line px-5 py-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ib-selo">
                  Cliente
                </p>
                <h2 className="truncate text-lg font-semibold text-ib-ink">
                  {selected.nome || selected.empresa || "Sem nome"}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeDrawer}
                aria-label="Fechar"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ib-slate transition hover:bg-ib-papel hover:text-ib-ink"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              {editing && editForm ? (
                <form onSubmit={handleSave} className="space-y-3">
                  {EDIT_FIELDS.map(({ key, label, type }) => (
                    <label key={key} className="block">
                      <span className="text-xs font-semibold text-ib-slate">{label}</span>
                      <input
                        type={type ?? "text"}
                        value={editForm[key]}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const masked =
                            key === "cpf" ? maskCpfCnpj(raw) : key === "telefone" ? maskPhone(raw) : raw;
                          setEditForm({ ...editForm, [key]: masked });
                        }}
                        className="mt-1 w-full rounded-lg border border-ib-line px-3 py-2 text-sm text-ib-ink outline-none transition focus:border-ib-mar focus:ring-4 focus:ring-ib-mar/10"
                      />
                    </label>
                  ))}
                  {saveError ? <p className="text-xs text-ib-danger">{saveError}</p> : null}
                  <div className="flex items-center gap-2 pt-1">
                    <button type="submit" disabled={saving} className={btnPrimary}>
                      {saving ? "Salvando…" : "Salvar"}
                    </button>
                    <button
                      type="button"
                      className={btnGhost}
                      disabled={saving}
                      onClick={() => {
                        setEditing(false);
                        setEditForm(clienteToForm(selected));
                        setSaveError(null);
                      }}
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
                    <div className="col-span-2">
                      <dt className="text-xs font-semibold uppercase tracking-wide text-ib-slate">Empresa</dt>
                      <dd className="mt-0.5 text-ib-ink">{selected.empresa || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-ib-slate">CPF</dt>
                      <dd className="mt-0.5 font-mono text-xs tabular-nums text-ib-ink">{maskCpf(selected.cpf)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-ib-slate">Cidade</dt>
                      <dd className="mt-0.5 text-ib-ink">{selected.cidade || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-ib-slate">E-mail</dt>
                      <dd className="mt-0.5 truncate text-ib-ink">{selected.email || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-ib-slate">Telefone</dt>
                      <dd className="mt-0.5 text-ib-ink">{selected.telefone || "—"}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-xs font-semibold uppercase tracking-wide text-ib-slate">Cliente desde</dt>
                      <dd className="mt-0.5 font-mono text-xs tabular-nums text-ib-ink">{fmtDate(selected.createdAt)}</dd>
                    </div>
                  </dl>

                  <div className="flex items-center gap-2 border-t border-ib-line pt-4">
                    <button
                      type="button"
                      className={btnGhost}
                      onClick={() => {
                        setEditing(true);
                        setEditForm(clienteToForm(selected));
                      }}
                    >
                      <Icon name="doc" className="h-4 w-4" />
                      Editar
                    </button>
                    {!confirmingDelete ? (
                      <button
                        type="button"
                        onClick={() => setConfirmingDelete(true)}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-ib-danger/30 bg-white px-4 py-2.5 text-sm font-semibold text-ib-danger transition hover:bg-ib-danger/5"
                      >
                        <Icon name="trash" className="h-4 w-4" />
                        Excluir
                      </button>
                    ) : null}
                  </div>

                  {confirmingDelete ? (
                    <div className="rounded-xl border border-ib-danger/30 bg-ib-danger/5 p-3">
                      <p className="text-sm font-medium text-ib-ink">
                        Tem certeza? Esta ação não pode ser desfeita.
                      </p>
                      {saveError ? <p className="mt-1 text-xs text-ib-danger">{saveError}</p> : null}
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleDelete}
                          disabled={deleting}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-ib-danger px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {deleting ? "Excluindo…" : "Confirmar exclusão"}
                        </button>
                        <button
                          type="button"
                          className={btnGhost}
                          disabled={deleting}
                          onClick={() => setConfirmingDelete(false)}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="border-t border-ib-line pt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ib-slate">
                      Propostas do cliente ({selectedProposals.length})
                    </p>
                    {selectedProposals.length === 0 ? (
                      <p className="text-sm text-ib-slate">
                        Nenhuma proposta gerada para este cliente ainda.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {selectedProposals.map((p) => (
                          <li
                            key={p.id}
                            className="rounded-xl border border-ib-line px-3 py-2.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-ib-ink">
                                  {p.services.map((s) => s.name).join(", ") || "Serviço não especificado"}
                                </p>
                                <p className="mt-0.5 font-mono text-xs tabular-nums text-ib-slate">
                                  {fmtDate(p.createdAt)}
                                </p>
                              </div>
                              <p className="shrink-0 font-mono text-sm font-semibold tabular-nums text-ib-ink">
                                {BRL(p.totalValue)}
                              </p>
                            </div>
                            <a
                              href={`/api/proposal/${p.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-ib-mar hover:underline"
                            >
                              <Icon name="external" className="h-3.5 w-3.5" />
                              Ver PDF
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
