"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  fmtDateShort,
  fmtTime,
  Card,
  PageHeader,
  StatusBadge,
  ScoreBar,
  Pagination,
  EmptyState,
  Icon,
  btnPrimary,
  Skeleton,
  SkeletonRows,
  dotColorForStatus,
  conversationStatusLabel,
  CONVERSATION_STATUSES,
} from "@/components/dashboard/ui";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { atividadeDaConversa } from "@/lib/dashboard/periodo";
import { NEW_MESSAGE_EVENT } from "@/components/dashboard/new-message-alerts";
import type { Conversation, ConversationStatus } from "@/lib/domain/types";

const PAGE_SIZE = 10;

// Tempo decorrido desde um instante ISO, curtinho ("agora", "há 3h", "há 2d").
function sinceLabel(iso?: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "agora";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}
function hoursSince(iso?: string | null): number {
  if (!iso) return 0;
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

export default function ConversationsPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ConversationStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<Conversation | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function doDelete() {
    const c = pendingDelete;
    if (!c) return;
    setDeleting(true);
    const snapshot = conversations;
    setConversations((prev) => (prev ? prev.filter((x) => x.id !== c.id) : prev));
    try {
      const res = await fetch(`/api/conversations/${c.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPendingDelete(null);
    } catch {
      setConversations(snapshot);
      setError("Não foi possível excluir a conversa.");
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  useEffect(() => {
    let active = true;
    const fetchConversations = async (silent: boolean) => {
      try {
        const res = await fetch("/api/conversations", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { conversations: Conversation[] };
        if (!active) return;
        // Ordem pela ÚLTIMA MENSAGEM, não pela criação: numa fila de atendimento, quem
        // acabou de responder tem de estar no topo. Ordenando por criação, o cliente que
        // voltou hoje numa conversa de semana passada ficava enterrado embaixo de conversas
        // mais novas e paradas — e é por isso que o painel parecia congelado.
        setConversations(
          [...data.conversations].sort(
            (a, b) =>
              new Date(atividadeDaConversa(b)).getTime() - new Date(atividadeDaConversa(a)).getTime(),
          ),
        );
        setError(null);
      } catch (err) {
        if (active && !silent) setError(err instanceof Error ? err.message : "Erro ao carregar");
      }
    };
    fetchConversations(false);
    // Auto-atualização ao vivo — novas conversas aparecem sem apertar refresh.
    const t = setInterval(() => {
      if (document.visibilityState === "visible") fetchConversations(true);
    }, 20000);
    // Chegou mensagem de cliente: atualiza na hora, sem esperar o ciclo de 20s.
    const onNew = () => fetchConversations(true);
    window.addEventListener(NEW_MESSAGE_EVENT, onNew);
    return () => {
      active = false;
      clearInterval(t);
      window.removeEventListener(NEW_MESSAGE_EVENT, onNew);
    };
  }, []);

  const filtered = useMemo(() => {
    if (!conversations) return [];
    const q = query.trim().toLowerCase();
    return conversations.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (!q) return true;
      return (
        (c.contactName ?? "").toLowerCase().includes(q) ||
        c.whatsappNumber.toLowerCase().includes(q)
      );
    });
  }, [conversations, query, statusFilter]);

  const counts = useMemo(() => {
    const base = Object.fromEntries(
      CONVERSATION_STATUSES.map((s) => [s, 0]),
    ) as Record<ConversationStatus, number>;
    (conversations ?? []).forEach((c) => {
      base[c.status] = (base[c.status] ?? 0) + 1;
    });
    return base;
  }, [conversations]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount);
  const pageItems = useMemo(() => {
    const start = (clampedPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, clampedPage]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Atendimento"
        title="Conversas"
        description="Todos os diálogos atendidos pelo agente, do primeiro contato à qualificação."
        actions={
          conversations && conversations.length > 0 ? (
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ib-slate">
                <Icon name="search" className="h-4 w-4" />
              </span>
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Buscar por nome ou número"
                className="w-full rounded-xl border border-ib-line bg-white py-2.5 pl-9 pr-3 text-sm text-ib-ink shadow-sm placeholder:text-ib-slate focus:border-ib-mar focus:outline-none focus:ring-2 focus:ring-ib-mar/20 sm:w-72"
              />
            </div>
          ) : null
        }
      />

      {error ? (
        <div className="rounded-xl border border-ib-danger/20 bg-ib-danger/5 px-4 py-3 text-sm text-ib-danger">
          Não foi possível carregar as conversas: {error}
        </div>
      ) : conversations === null ? (
        <>
          <div className="flex flex-wrap gap-2">
            {CONVERSATION_STATUSES.map((s) => (
              <Skeleton key={s} className="h-8 w-28 rounded-full" />
            ))}
          </div>
          <Card className="overflow-hidden">
            <SkeletonRows rows={8} cols={4} />
          </Card>
        </>
      ) : conversations.length === 0 ? (
        <EmptyState
          title="Nenhuma conversa ainda"
          text="Quando o agente atender um lead pelo WhatsApp, cada conversa aparece aqui com status e lead score em tempo real. Rode uma conversa de teste para começar."
          action={
            <Link href="/simulate" className={btnPrimary}>
              <Icon name="external" className="h-4 w-4" />
              Abrir simulador
            </Link>
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setStatusFilter("all");
                setPage(1);
              }}
              aria-pressed={statusFilter === "all"}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs shadow-sm transition ${
                statusFilter === "all"
                  ? "border-ib-casa bg-ib-casa text-white"
                  : "border-ib-line bg-white text-ib-slate hover:border-ib-mar/30 hover:text-ib-ink"
              }`}
            >
              Todas
              <span className={`font-mono font-semibold tabular-nums ${statusFilter === "all" ? "text-white" : "text-ib-ink"}`}>
                {conversations.length}
              </span>
            </button>
            {CONVERSATION_STATUSES.map((s) => {
              const activeTab = statusFilter === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setStatusFilter(s);
                    setPage(1);
                  }}
                  aria-pressed={activeTab}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs shadow-sm transition ${
                    activeTab
                      ? "border-ib-casa bg-ib-casa text-white"
                      : "border-ib-line bg-white hover:border-ib-mar/30"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${dotColorForStatus("conversation", s)}`} />
                  <span className={activeTab ? "text-white" : "text-ib-slate"}>
                    {conversationStatusLabel[s]}
                  </span>
                  <span className={`font-mono font-semibold tabular-nums ${activeTab ? "text-white" : "text-ib-ink"}`}>
                    {counts[s]}
                  </span>
                </button>
              );
            })}
          </div>

          {filtered.length === 0 ? (
            <Card className="p-6 text-sm text-ib-slate">
              Nenhuma conversa corresponde a{" "}
              <span className="font-medium text-ib-ink">“{query}”</span>.
            </Card>
          ) : (
            <Card className="overflow-hidden">
          <div className="overflow-x-auto console-scroll">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-ib-line bg-ib-papel/70 text-[11px] uppercase tracking-[0.08em] text-ib-slate">
                <tr>
                  <th className="px-5 py-3 font-semibold">Contato</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Lead score</th>
                  <th className="px-5 py-3 text-right font-semibold">Criada em</th>
                  <th className="px-5 py-3 text-right font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => router.push(`/dashboard/conversations/${c.id}`)}
                    className="cursor-pointer border-b border-ib-line/70 transition last:border-0 hover:bg-ib-bruma/50"
                  >
                    <td className="px-5 py-3.5">
                      <span className="font-medium text-ib-ink">
                        {c.contactName ?? c.whatsappNumber}
                      </span>
                      {c.contactName ? (
                        <span className="ml-2 font-mono text-xs tabular-nums text-ib-slate">
                          {c.whatsappNumber}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <StatusBadge kind="conversation" status={c.status} />
                        {c.status === "waiting" && c.lastMessageAt ? (
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] tabular-nums ${
                              hoursSince(c.lastMessageAt) >= 20 ? "font-medium text-ib-danger" : "text-ib-slate"
                            }`}
                            title={hoursSince(c.lastMessageAt) >= 20 ? "Perto do follow-up de 24h" : "Sem resposta do lead"}
                          >
                            {hoursSince(c.lastMessageAt) >= 20 ? (
                              <Icon name="bolt" className="h-3 w-3" />
                            ) : null}
                            {sinceLabel(c.lastMessageAt)}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <ScoreBar score={c.leadScore} />
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-xs tabular-nums text-ib-slate">
                      {fmtDateShort(c.createdAt)} · {fmtTime(c.createdAt)}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPendingDelete(c);
                        }}
                        aria-label="Excluir conversa"
                        title="Excluir conversa"
                        className="inline-flex items-center justify-center rounded-lg border border-ib-line bg-white px-2 py-1.5 text-ib-slate transition hover:border-ib-danger/30 hover:bg-ib-danger/5 hover:text-ib-danger"
                      >
                        <Icon name="trash" className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-ib-line">
            <Pagination
              page={clampedPage}
              pageCount={pageCount}
              onPage={setPage}
              total={filtered.length}
            />
          </div>
        </Card>
          )}
        </>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        loading={deleting}
        title="Excluir conversa"
        message={
          pendingDelete ? (
            <>
              A conversa com{" "}
              <span className="font-semibold">
                {pendingDelete.contactName ?? pendingDelete.whatsappNumber}
              </span>{" "}
              e todo o histórico serão removidos. Esta ação não pode ser desfeita.
            </>
          ) : null
        }
        confirmLabel="Excluir conversa"
        onConfirm={doDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
