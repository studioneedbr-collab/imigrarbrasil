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
import type { LeadVerdict } from "@/lib/agent/lead-score";

/**
 * A conversa como a lista a recebe: o veredito vem junto quando este contato NÃO é um
 * caso do time jurídico (fornecedor, candidato, imprensa, perfil de Defensoria, opt-out).
 * Sem ele, nota 0 na tabela é ambígua — pode ser quem mandou só "oi" e pode ser gente
 * esperando resposta de outro setor.
 */
type ConversaNaLista = Conversation & {
  verdict?: LeadVerdict;
  verdictLabel?: string;
  verdictReason?: string;
};

const VERDICT_CHIP: Record<LeadVerdict, string> = {
  prioritario: "bg-ib-danger/10 text-ib-danger",
  qualificado: "bg-ib-success/12 text-[#15803D]",
  em_qualificacao: "bg-ib-mar/10 text-ib-mar",
  frio: "bg-slate-100 text-ib-slate",
  dpu: "bg-ib-carimbo/10 text-ib-carimbo",
  fora_do_funil: "bg-ib-warn/10 text-ib-warn",
  fora_do_escopo: "bg-ib-warn/10 text-ib-warn",
  desqualificado: "bg-slate-100 text-ib-slate",
};

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

/**
 * A LISTA DE CONVERSAS, EM DUAS TELAS.
 *
 * `ambiente="teste"` mostra os ENSAIOS — simulador e instâncias de teste. É a mesma
 * lista, com o mesmo trabalho de busca, filtro e paginação, apontada para o outro lado do
 * corte que o resto do painel já fazia na fila, no quadro e nas métricas.
 *
 * Uma tela e não um filtro no canto: quem abre "Conversas" está atendendo gente, e um
 * seletor que pode estar na posição errada é como um ensaio volta a se misturar com
 * conversa real — que é exatamente o defeito que esta separação existe para fechar.
 */
export function ListaDeConversas({ ambiente = "producao" }: { ambiente?: "producao" | "teste" }) {
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversaNaLista[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /*
   * ERRO DE EXCLUIR NÃO É ERRO DE CARREGAR.
   *
   * Os dois dividiam o mesmo `error`, e o bloco que o desenha começa com "Não foi
   * possível carregar as conversas:". Uma exclusão recusada saía como
   * "Não foi possível carregar as conversas: Não foi possível excluir a conversa." —
   * duas frases que se contradizem, nenhuma delas verdadeira, e a lista continuava ali
   * na tela desmentindo a primeira. Agora cada falha tem o seu lugar e o seu motivo.
   */
  const [erroExcluir, setErroExcluir] = useState<string | null>(null);
  /** null = ainda não sabemos o papel. Excluir conversa é privilégio de administrador. */
  const [ehAdmin, setEhAdmin] = useState<boolean | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ConversationStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<ConversaNaLista | null>(null);
  const [deleting, setDeleting] = useState(false);
  /**
   * SELEÇÃO MÚLTIPLA. Só existe para administrador — quem não pode excluir uma conversa
   * também não pode excluir trinta, e mostrar a caixinha para quem vai levar 403 é a
   * mesma promessa quebrada que a lixeira fazia antes de existir a checagem de papel.
   */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingBulk, setPendingBulk] = useState(false);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function doBulkDelete() {
    const ids = Array.from(selected);
    if (!ids.length) return;
    setDeleting(true);
    setErroExcluir(null);
    const snapshot = conversations;
    setConversations((prev) => (prev ? prev.filter((x) => !selected.has(x.id)) : prev));
    try {
      const res = await fetch("/api/conversations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        throw new Error(
          res.status === 403
            ? "Só um administrador pode excluir conversas. Peça a quem administra o painel."
            : "A exclusão falhou no servidor. Tente de novo em instantes.",
        );
      }
      const data = (await res.json()) as { deleted: string[]; failed: string[] };
      // O que o servidor não conseguiu apagar volta para a lista: sumir da tela sem ter
      // sumido do banco é a pior das duas mentiras possíveis aqui.
      if (data.failed?.length && snapshot) {
        const restaurar = snapshot.filter((c) => data.failed.includes(c.id));
        setConversations((prev) => (prev ? [...restaurar, ...prev] : prev));
        setErroExcluir(
          `${data.failed.length} conversa(s) não puderam ser excluídas e continuam na lista.`,
        );
      }
      setSelected(new Set());
      setPendingBulk(false);
    } catch (err) {
      setConversations(snapshot);
      setErroExcluir(err instanceof Error ? err.message : "A exclusão falhou.");
      setPendingBulk(false);
    } finally {
      setDeleting(false);
    }
  }

  async function doDelete() {
    const c = pendingDelete;
    if (!c) return;
    setDeleting(true);
    setErroExcluir(null);
    const snapshot = conversations;
    setConversations((prev) => (prev ? prev.filter((x) => x.id !== c.id) : prev));
    try {
      const res = await fetch(`/api/conversations/${c.id}`, { method: "DELETE" });
      if (!res.ok) {
        // O motivo importa: 403 é uma regra da casa, não uma falha. Dizer "não foi
        // possível" para quem simplesmente não tem permissão manda a pessoa tentar de
        // novo, recarregar a página e abrir chamado — três voltas até descobrir que o
        // sistema está funcionando exatamente como foi desenhado.
        throw new Error(
          res.status === 403
            ? "Só um administrador pode excluir conversas. Peça a quem administra o painel."
            : res.status === 404
              ? "Esta conversa já não existe. Atualize a lista."
              : "A exclusão falhou no servidor. Tente de novo em instantes.",
        );
      }
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(c.id);
        return next;
      });
      setPendingDelete(null);
    } catch (err) {
      setConversations(snapshot);
      setErroExcluir(err instanceof Error ? err.message : "A exclusão falhou.");
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  /*
   * O BOTÃO NÃO PODE PROMETER O QUE A ROTA RECUSA.
   *
   * `DELETE /api/conversations/[id]` exige administrador, mas a lixeira aparecia para
   * todo mundo. Quem é atendente via o ícone, abria o diálogo de confirmação, confirmava
   * — e só então levava um 403. Oferecer uma ação e negá-la no último passo é pior do que
   * não a oferecer: a pessoa acha que quebrou alguma coisa.
   */
  useEffect(() => {
    let vivo = true;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { role?: string } | null) => {
        if (vivo) setEhAdmin(d?.role === "admin");
      })
      .catch(() => vivo && setEhAdmin(false));
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const fetchConversations = async (silent: boolean) => {
      try {
        const res = await fetch(
          ambiente === "teste" ? "/api/conversations?ambiente=teste" : "/api/conversations",
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { conversations: ConversaNaLista[] };
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
  }, [ambiente]);

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

  // Conta só o que ainda está na lista: a seleção sobrevive ao refetch de 20s e à
  // paginação, e um contador que soma conversa já apagada mente no diálogo de confirmação.
  const selectedCount = useMemo(
    () => (conversations ?? []).filter((c) => selected.has(c.id)).length,
    [conversations, selected],
  );
  const pageAllSelected = pageItems.length > 0 && pageItems.every((c) => selected.has(c.id));

  function togglePage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (pageAllSelected) pageItems.forEach((c) => next.delete(c.id));
      else pageItems.forEach((c) => next.add(c.id));
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={ambiente === "teste" ? "Ensaio" : "Atendimento"}
        title={ambiente === "teste" ? "Ensaios" : "Conversas"}
        description={
          ambiente === "teste"
            ? "Simulador e instâncias de teste. Não entram na fila, não entram no quadro e não entram nas métricas — é aqui que se olha o que foi ensaiado."
            : "Todos os diálogos atendidos pelo agente, do primeiro contato à qualificação."
        }
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

      {/* Falha ao EXCLUIR: fica acima da lista, que continua ali e utilizável. Some
          sozinho quando a pessoa fecha, porque não é um estado da tela — é um recado. */}
      {erroExcluir ? (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-xl border border-ib-danger/20 bg-ib-danger/5 px-4 py-3 text-sm text-ib-danger"
        >
          <span>{erroExcluir}</span>
          <button
            type="button"
            onClick={() => setErroExcluir(null)}
            aria-label="Fechar aviso"
            className="shrink-0 rounded px-1 text-ib-danger/70 transition hover:text-ib-danger"
          >
            ✕
          </button>
        </div>
      ) : null}

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
          {ehAdmin && selectedCount > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ib-line bg-ib-bruma/60 px-5 py-3">
              <span className="text-sm text-ib-ink">
                <span className="font-semibold tabular-nums">{selectedCount}</span>{" "}
                {selectedCount === 1 ? "conversa selecionada" : "conversas selecionadas"}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="rounded-lg border border-ib-line bg-white px-3 py-1.5 text-xs text-ib-slate transition hover:text-ib-ink"
                >
                  Limpar seleção
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(new Set(filtered.map((c) => c.id)))}
                  className="rounded-lg border border-ib-line bg-white px-3 py-1.5 text-xs text-ib-slate transition hover:text-ib-ink"
                >
                  Selecionar todas ({filtered.length})
                </button>
                <button
                  type="button"
                  onClick={() => setPendingBulk(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-ib-danger/30 bg-ib-danger/5 px-3 py-1.5 text-xs font-medium text-ib-danger transition hover:bg-ib-danger/10"
                >
                  <Icon name="trash" className="h-3.5 w-3.5" />
                  Excluir selecionadas
                </button>
              </div>
            </div>
          ) : null}
          <div className="overflow-x-auto console-scroll">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-ib-line bg-ib-papel/70 text-[11px] uppercase tracking-[0.08em] text-ib-slate">
                <tr>
                  {ehAdmin ? (
                    <th className="w-10 px-5 py-3">
                      <input
                        type="checkbox"
                        checked={pageAllSelected}
                        onChange={togglePage}
                        aria-label="Selecionar todas as conversas desta página"
                        className="h-4 w-4 cursor-pointer rounded border-ib-line accent-ib-casa"
                      />
                    </th>
                  ) : null}
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
                    className={`cursor-pointer border-b border-ib-line/70 transition last:border-0 hover:bg-ib-bruma/50 ${
                      selected.has(c.id) ? "bg-ib-bruma/60" : ""
                    }`}
                  >
                    {ehAdmin ? (
                      <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(c.id)}
                          onChange={() => toggleOne(c.id)}
                          aria-label={`Selecionar conversa com ${c.contactName ?? c.whatsappNumber}`}
                          className="h-4 w-4 cursor-pointer rounded border-ib-line accent-ib-casa"
                        />
                      </td>
                    ) : null}
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
                      {c.verdict ? (
                        <span
                          className={`inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-medium ${VERDICT_CHIP[c.verdict]}`}
                          title={c.verdictReason}
                        >
                          {c.verdictLabel}
                        </span>
                      ) : (
                        <ScoreBar score={c.leadScore} />
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-xs tabular-nums text-ib-slate">
                      {fmtDateShort(c.createdAt)} · {fmtTime(c.createdAt)}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {/* Enquanto o papel não chegou, nada aparece: um botão que pisca e
                          some é pior do que um que demora um instante. */}
                      {ehAdmin ? (
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
                      ) : null}
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
        open={pendingBulk}
        loading={deleting}
        title="Excluir conversas selecionadas"
        message={
          <>
            <span className="font-semibold tabular-nums">{selectedCount}</span>{" "}
            {selectedCount === 1 ? "conversa" : "conversas"} e todo o histórico serão
            removidos. Esta ação não pode ser desfeita.
          </>
        }
        confirmLabel={`Excluir ${selectedCount}`}
        onConfirm={doBulkDelete}
        onCancel={() => setPendingBulk(false)}
      />

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
