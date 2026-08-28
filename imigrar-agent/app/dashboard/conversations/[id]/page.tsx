"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  fmtTime,
  Card,
  PageHeader,
  StatusBadge,
  Skeleton,
  Icon,
  urgencyLabel,
} from "@/components/dashboard/ui";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { NEW_MESSAGE_EVENT } from "@/components/dashboard/new-message-alerts";
import type { Conversation, Lead, Message, TransferTicket, Urgency } from "@/lib/domain/types";
import { nomeDoIdioma } from "@/lib/domain/idiomas";
import { rotuloContato } from "@/lib/domain/rotulos";
import RascunhoSombra, { type RascunhoView } from "@/components/agente/rascunho-sombra";
import { QualidadeDoLead } from "@/components/atendimentos/qualidade";
import { Selecao } from "@/components/dashboard/campos";

// PARA ONDE SE TRANSFERE AQUI.
//
// A lista era a de uma assessoria de mão de obra — "Recursos Humanos", "Departamento
// Pessoal", "Suporte" —, e nenhum desses times existe neste escritório. Transferir para
// um setor que não existe é o mesmo que transferir para lugar nenhum: o caso sai da
// conversa e não chega em ninguém.
const SETORES = [
  "Jurídico",
  "Atendimento",
  "Documentação",
  "Financeiro",
  "Diretoria",
];

type DetailResponse = {
  conversation: Conversation;
  messages: Message[];
  lead: Lead | null;
  transferTickets?: TransferTicket[];
  /** Modo sombra: respostas montadas e não enviadas, esperando decisão. */
  rascunhos?: RascunhoView[];
};

function buildSummary(lead: Lead): string {
  // Enquanto o agente não escrever o resumo dele, monta um a partir do que se sabe.
  if (lead.resumo) return lead.resumo.split("\n").join(" ");
  const who = lead.contactName || lead.nacionalidade || "contato";
  const parts: string[] = [`Lead ${who}`];
  const services =
    lead.servicesInterested && lead.servicesInterested.length > 0
      ? lead.servicesInterested.join(", ")
      : null;
  if (services) parts.push(`procurando ${services}`);
  if (lead.region) parts.push(`região ${lead.region}`);
  if (lead.urgency) parts.push(`urgência ${urgencyLabel[lead.urgency as Urgency].toLowerCase()}`);
  return `${parts.join(", ")}.`;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ib-slate">
        {label}
      </span>
      <span className="text-right text-sm font-medium text-ib-ink">{value}</span>
    </div>
  );
}

function LiveTag() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-ib-selo/12 px-2.5 py-1 text-xs font-medium text-[#0B7285]">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full rounded-full bg-ib-selo motion-safe:animate-signal-ping" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-ib-selo" />
      </span>
      ao vivo
    </span>
  );
}

export default function ConversationDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const [data, setData] = useState<DetailResponse | null>(null);
  const [notFound, setNotFound] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const lastCountRef = useRef(0);

  // Transferência manual + exclusão
  const [showTransfer, setShowTransfer] = useState(false);
  const [setor, setSetor] = useState(SETORES[0]);
  const [pessoa, setPessoa] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [users, setUsers] = useState<{ id: string; name?: string; email: string }[]>([]);

  // Quem sou eu — para distinguir "Você assumiu" de "Fulano está atendendo".
  const [meEmail, setMeEmail] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/users", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((d) => setUsers(d.users ?? []))
      .catch(() => setUsers([]));
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setMeEmail(d?.email ?? null))
      .catch(() => setMeEmail(null));
  }, []);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Resposta manual (assumir a conversa) + pausar/retomar a IA
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [iaToggling, setIaToggling] = useState(false);

  async function doTransfer() {
    if (!pessoa.trim()) {
      setTransferError("Informe o nome da pessoa.");
      return;
    }
    setTransferring(true);
    setTransferError(null);
    try {
      const res = await fetch(`/api/conversations/${id}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setor, pessoa: pessoa.trim() }),
      });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !d.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      setShowTransfer(false);
      setPessoa("");
      // o polling (3s) já traz a nota + o novo status.
    } catch (e) {
      setTransferError(e instanceof Error ? e.message : "Falha ao transferir.");
    } finally {
      setTransferring(false);
    }
  }

  async function doDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.push("/dashboard/conversations");
    } catch {
      setDeleting(false);
      setPendingDelete(false);
    }
  }

  // Envia resposta manual pro WhatsApp do cliente (assume a conversa, pausa a IA).
  async function sendReply() {
    const msg = replyText.trim();
    if (!msg) return;
    setSending(true);
    setReplyError(null);
    try {
      const res = await fetch(`/api/conversations/${id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !d.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      setReplyText("");
      // o polling (3s) traz a mensagem enviada e o status atualizado.
    } catch (e) {
      setReplyError(e instanceof Error ? e.message : "Falha ao enviar a mensagem.");
    } finally {
      setSending(false);
    }
  }

  // Pausar (deixar com o humano) ou devolver a conversa pro agente.
  async function toggleIa(active: boolean) {
    setIaToggling(true);
    try {
      await fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iaActive: active }),
      });
    } catch {
      /* o polling reflete o estado real */
    } finally {
      setIaToggling(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch(`/api/conversations/${id}`);
        if (res.status === 404) {
          if (active) setNotFound(true);
          return;
        }
        if (!res.ok) return;
        const json = (await res.json()) as DetailResponse;
        if (active) setData(json);
      } catch {
        /* ignore transient poll errors */
      }
    }
    load();
    const t = setInterval(load, 3000);
    // Chegou mensagem de cliente: atualiza na hora, sem esperar o próximo ciclo.
    const onNew = () => load();
    window.addEventListener(NEW_MESSAGE_EVENT, onNew);
    return () => {
      active = false;
      clearInterval(t);
      window.removeEventListener(NEW_MESSAGE_EVENT, onNew);
    };
  }, [id]);

  useEffect(() => {
    const count = data?.messages.length ?? 0;
    if (count !== lastCountRef.current) {
      lastCountRef.current = count;
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [data?.messages.length]);

  if (notFound) {
    return (
      <Card className="p-10 text-center">
        <p className="text-lg font-semibold text-ib-ink">Conversa não encontrada</p>
        <p className="mt-1 text-sm text-ib-slate">
          O identificador informado não corresponde a nenhuma conversa.
        </p>
        <Link
          href="/dashboard/conversations"
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ib-mar hover:underline"
        >
          <Icon name="arrow" className="h-4 w-4 rotate-180" />
          Voltar para conversas
        </Link>
      </Card>
    );
  }

  const BackLink = (
    <Link
      href="/dashboard/conversations"
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-ib-mar hover:underline"
    >
      <Icon name="arrow" className="h-4 w-4 rotate-180" />
      Conversas
    </Link>
  );

  // Initial load — skeleton for chat + dossier
  if (data === null) {
    return (
      <div className="space-y-4">
        {BackLink}
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ib-selo">
            Conversa ao vivo
          </p>
          <div className="mt-1.5">
            <Skeleton className="h-8 w-64" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
          <Card className="flex h-[calc(100vh-13rem)] min-h-[440px] flex-col overflow-hidden">
            <div className="flex items-center gap-3 border-b border-ib-line px-5 py-4">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <div className="flex-1 space-y-3 bg-ib-papel/50 px-5 py-4">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}>
                  <Skeleton
                    className={`h-12 rounded-2xl ${i % 2 === 0 ? "w-3/5" : "w-1/2"}`}
                  />
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-8 w-10" />
            </div>
            <Skeleton className="mt-4 h-20 w-full rounded-xl" />
            <Skeleton className="mt-4 h-14 w-full rounded-xl" />
            <div className="mt-4 space-y-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          </Card>
        </div>
      </div>
    );
  }

  const conversation = data.conversation;
  const messages = data.messages ?? [];
  const lead = data.lead ?? null;
  const transferTickets = data.transferTickets ?? [];
  const rascunhos = data.rascunhos ?? [];
  const transferTicket = transferTickets[0] ?? null;
  /*
   * O NOME VEM DO LEAD PRIMEIRO.
   *
   * A conversa só sabe o nome quando o WhatsApp manda `senderName`; quem escreve pela
   * primeira vez, ou entra pelo simulador, chega sem ele. O NOME de verdade é o que a Ana
   * extraiu durante o atendimento, e esse mora no lead — a lateral desta mesma página já
   * lia de lá, só o cabeçalho e o avatar é que não. Sem isto, o título da conversa era o
   * identificador cru (`sim:v2-28`, `cand:3`) e as iniciais do avatar viravam "SI"/"CA".
   * A mesma precedência que o webhook e a transferência já praticam.
   */
  const contato = rotuloContato({
    contactName: lead?.contactName ?? conversation.contactName,
    whatsappNumber: conversation.whatsappNumber,
  });
  const title = contato.texto;

  // A lista do que falta NÃO mora mais aqui: é a ficha mínima do domínio
  // (lib/domain/ficha.ts), lida pelo bloco de qualidade. Uma definição só, para a
  // conversa, o quadro e o detalhe do caso contarem a mesma coisa.

  // Nem todo contato é lead comercial: operacional/RH/DP são SOLICITAÇÕES (suporte),
  // e não fazem sentido com "qualificação" e "score" de venda.
  const SETOR_LABEL: Record<string, string> = {
    // "comercial" é a chave herdada do funil da base que originou este código, e é a que
    // já está gravada em todo lead do banco. O que o time lê é OUTRA coisa: aqui esse
    // destino é o jurídico de imigração, e chamá-lo de "Comercial" na tela fazia parecer
    // que existe um funil de vendas paralelo ao atendimento.
    comercial: "Jurídico",
    operacional: "Operacional",
    rh: "RH",
    departamento_pessoal: "Departamento Pessoal",
    suprimentos: "Suprimentos",
    diretoria: "Diretoria",
  };
  // Assumida = tem uma PESSOA no comando (o agente cala). Encaminhar pro setor não
  // assume: `status: 'transferred'` sozinho não significa que alguém pegou a conversa.
  const documentos = messages.filter((m) => !!m.mediaUrl);
  const assumida = !!conversation.assumedBy;
  const euAssumi = assumida && !!meEmail && conversation.assumedBy === meEmail;

  const isSolicitacao = !!(lead?.setor && lead.setor !== "comercial");
  const setorLabel = lead?.setor ? SETOR_LABEL[lead.setor] ?? lead.setor : null;

  return (
    <div className="space-y-4">
      {BackLink}

      <PageHeader
        eyebrow="Conversa ao vivo"
        title={title}
        // O número só vira subtítulo quando o título é um nome de verdade; senão a mesma
        // informação apareceria duas vezes.
        description={contato.conhecido ? conversation.whatsappNumber : undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge kind="conversation" status={conversation.status} />
            <LiveTag />
            <button
              type="button"
              onClick={() => {
                setTransferError(null);
                setShowTransfer(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-ib-mar px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-ib-carimbo"
            >
              <Icon name="users" className="h-3.5 w-3.5" />
              Transferir p/ humano
            </button>
            <button
              type="button"
              onClick={() => setPendingDelete(true)}
              aria-label="Excluir conversa"
              title="Excluir conversa"
              className="inline-flex items-center gap-1.5 rounded-lg border border-ib-line bg-white px-3 py-1.5 text-xs font-medium text-ib-slate shadow-sm transition hover:border-ib-danger/30 hover:bg-ib-danger/5 hover:text-ib-danger"
            >
              <Icon name="trash" className="h-3.5 w-3.5" />
              Excluir
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
        {/* LEFT — live chat */}
        <Card className="flex h-[calc(100vh-15rem)] min-h-[440px] flex-col overflow-hidden">
          <div className="flex items-center gap-3 border-b border-ib-line px-5 py-4">
            {/* Iniciais só quando há nome. Sem isso o avatar carimbava "SI"/"CA" — as
                duas primeiras letras de `sim:` e `cand:` — como se fossem as iniciais de
                alguém. */}
            <span
              title={contato.conhecido ? title : "Nome ainda não identificado"}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-ib-bruma font-mono text-sm font-semibold text-ib-mar"
            >
              {contato.conhecido ? title.slice(0, 2).toUpperCase() : "—"}
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold text-ib-ink">{title}</p>
              <p className="flex items-center gap-2 font-mono text-xs tabular-nums text-ib-slate">
                {conversation.whatsappNumber}
                {/* O idioma do contato, detectado no atendimento. Quem assume a conversa
                    precisa saber em que língua responder ANTES de escrever a primeira
                    linha — o histórico acima pode terminar num "ok" que não diz nada. */}
                {conversation.idioma && conversation.idioma !== "pt" ? (
                  <span className="rounded-full bg-ib-selo/12 px-2 py-0.5 font-sans text-[11px] font-medium uppercase tracking-wide text-[#0B7285]">
                    fala {nomeDoIdioma(conversation.idioma)}
                  </span>
                ) : null}
              </p>
            </div>
          </div>

          <div className="console-scroll flex-1 space-y-3 overflow-y-auto bg-ib-papel/50 px-5 py-4">
            {conversation.handedOffTo ? (
              <div className="flex items-start gap-2.5 rounded-xl border border-ib-warn/30 bg-ib-warn/10 px-4 py-3 text-sm text-ib-ink">
                <span className="text-base leading-none">🤝</span>
                <p className="leading-relaxed">
                  <span className="font-semibold">Encaminhada para {conversation.handedOffTo}</span>
                  {conversation.handoffReason ? (
                    <>
                      {" "}
                      · motivo: <span className="font-medium">{conversation.handoffReason}</span>
                    </>
                  ) : null}
                </p>
              </div>
            ) : null}
            {conversation.ambiente === "teste" ? (
              // ONDE ESTA CONVERSA ACONTECEU. Sem isto, um ensaio e um caso de verdade
              // são visualmente idênticos — e alguém vai tratar um dos dois errado.
              <div className="flex items-start gap-2.5 rounded-xl border border-ib-line bg-ib-papel px-4 py-2.5 text-xs text-ib-slate">
                <Icon name="pulse" className="mt-px h-3.5 w-3.5 shrink-0" />
                <p>
                  Conversa de <strong className="text-ib-ink">teste</strong>. Não entra nas
                  métricas nem na fila de trabalho.
                </p>
              </div>
            ) : null}
            {messages.length === 0 ? (
              <p className="rounded-xl border border-dashed border-ib-line bg-white p-6 text-center text-sm text-ib-slate">
                Nenhuma mensagem nesta conversa ainda.
              </p>
            ) : (
              messages.map((m) => {
                const isUser = m.role === "user";
                return (
                  <div key={m.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                    <div className="max-w-[80%]">
                      <div
                        className={`rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                          isUser
                            ? "rounded-br-md bg-ib-mar text-white"
                            : "rounded-bl-md border border-ib-line bg-white text-ib-ink"
                        }`}
                      >
                        {/* Anexo recebido: imagem aparece aqui mesmo; PDF/doc vira link.
                            Antes a URL era descartada e só restava o texto "📎 …". */}
                        {m.mediaUrl ? (
                          <a
                            href={m.mediaUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mb-2 block overflow-hidden rounded-xl"
                          >
                            {m.mediaType === "image" ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={m.mediaUrl}
                                alt={m.mediaName ?? "anexo"}
                                className="max-h-64 w-full object-contain"
                              />
                            ) : (
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                                  isUser ? "bg-white/15" : "bg-ib-papel text-ib-ink"
                                }`}
                              >
                                <Icon name="doc" className="h-3.5 w-3.5" />
                                {m.mediaName ?? "Abrir arquivo"}
                              </span>
                            )}
                          </a>
                        ) : null}
                        <p className="whitespace-pre-wrap break-words leading-relaxed">
                          {m.content}
                        </p>
                      </div>
                      <p
                        className={`mt-1 font-mono text-[11px] tabular-nums text-ib-slate ${
                          isUser ? "text-right" : "text-left"
                        }`}
                      >
                        {isUser ? "Cliente" : "Agente"} · {fmtTime(m.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}

            {/* MODO SOMBRA: a resposta que a Ana montou aparece EXATAMENTE onde ela teria
                ido, no fim da conversa — e com as três saídas. Fora do lugar (numa aba,
                num painel lateral) ela vira uma lista de textos sem contexto, e o
                contexto é justamente o que se está avaliando. */}
            {rascunhos.map((r) => (
              <div key={r.id} className="pt-1">
                <RascunhoSombra
                  rascunho={r}
                  onDecidido={() =>
                    setData((atual) =>
                      atual
                        ? { ...atual, rascunhos: (atual.rascunhos ?? []).filter((x) => x.id !== r.id) }
                        : atual,
                    )
                  }
                />
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Compositor — responder como humano (assume a conversa e pausa a IA).
              Em conversas do simulador (sem WhatsApp real) mostra só um aviso. */}
          {conversation.whatsappNumber.startsWith("sim:") ? (
            <div className="border-t border-ib-line bg-ib-papel/40 px-4 py-3 text-center text-xs text-ib-slate">
              Conversa do simulador (teste). A resposta manual pelo painel aparece nas conversas
              reais de WhatsApp.
            </div>
          ) : (
            <div className="border-t border-ib-line bg-white px-4 py-3">
              {/* Quem está no comando. `status: 'transferred'` só diz que o agente
                  ENCAMINHOU pro setor — não que alguém assumiu. Quem assumiu de fato
                  é `assumedBy`; antes os dois estados usavam a mesma faixa, e toda
                  conversa encaminhada aparecia como "Você assumiu esta conversa". */}
              <div className="mb-2 flex items-center justify-between gap-2">
                {assumida ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#9A6212]">
                    <span className="h-1.5 w-1.5 rounded-full bg-ib-warn" />
                    {euAssumi
                      ? "Você assumiu esta conversa. O agente está pausada."
                      : `${conversation.assumedBy} assumiu esta conversa. O agente está pausada.`}
                  </span>
                ) : conversation.status === "transferred" ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-ib-slate">
                    <span className="h-1.5 w-1.5 rounded-full bg-ib-success" />
                    Encaminhada
                    {conversation.handedOffTo ? ` para ${conversation.handedOffTo}` : ""} — ninguém
                    assumiu ainda. O agente segue atendendo.
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs text-ib-slate">
                    <span className="h-1.5 w-1.5 rounded-full bg-ib-success" />
                    Agente ativa. Ao responder, você assume a conversa.
                  </span>
                )}
                <button
                  type="button"
                  disabled={iaToggling}
                  onClick={() => toggleIa(assumida)}
                  className="shrink-0 text-xs font-semibold text-ib-mar transition hover:underline disabled:opacity-50"
                >
                  {assumida ? "Devolver pra IA" : "Assumir conversa"}
                </button>
              </div>
              <div className="flex items-end gap-2">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendReply();
                    }
                  }}
                  rows={1}
                  placeholder="Responder como humano…"
                  className="max-h-32 min-h-[42px] flex-1 resize-none rounded-xl border border-ib-line bg-ib-papel px-3 py-2.5 text-sm text-ib-ink outline-none transition focus:border-ib-mar focus:bg-white focus:ring-2 focus:ring-ib-mar/20"
                />
                <button
                  type="button"
                  onClick={sendReply}
                  disabled={sending || !replyText.trim()}
                  className="inline-flex h-[42px] items-center gap-1.5 rounded-xl bg-ib-mar px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-ib-carimbo disabled:opacity-50"
                >
                  <Icon name="chat" className="h-4 w-4" />
                  {sending ? "Enviando…" : "Enviar"}
                </button>
              </div>
              {replyError ? <p className="mt-1.5 text-xs text-ib-danger">{replyError}</p> : null}
            </div>
          )}
        </Card>

        {/* RIGHT — lead dossier */}
        <div className="space-y-5">
          {/* Documentos deste contato. Sai das próprias mensagens, então acompanha o
              polling de 3s sem uma segunda chamada de API. */}
          {documentos.length > 0 ? (
            <Card>
              <div className="flex items-center justify-between border-b border-ib-line px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ib-selo">
                  Documentos recebidos
                </p>
                <span className="font-mono text-xs tabular-nums text-ib-slate">
                  {documentos.length}
                </span>
              </div>
              <div className="divide-y divide-ib-line">
                {documentos.map((m) => (
                  <div key={m.id} className="flex gap-3 p-4">
                    <a
                      href={m.mediaUrl!}
                      target="_blank"
                      rel="noreferrer"
                      className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-ib-papel"
                    >
                      {m.mediaType === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={m.mediaUrl!}
                          alt={m.mediaName ?? "anexo"}
                          className="h-14 w-14 object-cover"
                        />
                      ) : (
                        <span className="flex h-14 w-14 items-center justify-center">
                          <Icon name="doc" className="h-5 w-5 text-ib-slate" />
                        </span>
                      )}
                    </a>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ib-ink">
                        {m.mediaName ?? "arquivo"}
                      </p>
                      <p className="font-mono text-[11px] tabular-nums text-ib-slate">
                        {fmtTime(m.createdAt)}
                      </p>
                      {m.mediaText ? (
                        <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-ib-slate">
                          {m.mediaText}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs italic text-ib-slate">
                          Conteúdo não lido.
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-ib-line px-5 py-3">
                <Link
                  href="/dashboard/documentos"
                  className="text-xs font-semibold text-ib-mar hover:underline"
                >
                  Ver todos os documentos
                </Link>
              </div>
            </Card>
          ) : null}
          {transferTicket ? (
            <Card>
              <div className="border-b border-ib-line px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ib-selo">
                  Dossiê de transferência
                </p>
                <p className="mt-0.5 text-sm font-semibold text-ib-ink">
                  {transferTicket.dossie.empresa ?? transferTicket.dossie.nome ?? "Cliente"}
                </p>
              </div>
              <div className="p-5">
                <p className="rounded-xl bg-ib-bruma px-3.5 py-3 text-sm leading-relaxed text-ib-ink">
                  {transferTicket.reason}
                  {transferTicket.priority === "urgent" ? (
                    <span className="ml-2 inline-flex items-center rounded-full bg-ib-danger/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-ib-danger">
                      Urgente
                    </span>
                  ) : null}
                </p>
                <div className="mt-2 divide-y divide-ib-line">
                  <Field label="Nome" value={transferTicket.dossie.nome ?? "—"} />
                  <Field label="Empresa" value={transferTicket.dossie.empresa ?? "—"} />
                  <Field label="CPF" value={transferTicket.dossie.cpf ?? "—"} />
                  <Field label="Cidade" value={transferTicket.dossie.cidade ?? "—"} />
                  <Field
                    label="O que procura"
                    value={
                      transferTicket.dossie.servicos && transferTicket.dossie.servicos.length > 0
                        ? transferTicket.dossie.servicos.join(", ")
                        : "—"
                    }
                  />
                  <Field label="Necessidade" value={transferTicket.dossie.necessidade ?? "—"} />
                </div>
                {transferTicket.dossie.historicoResumo ? (
                  <div className="mt-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ib-slate">
                      Resumo do histórico
                    </p>
                    <p className="mt-1.5 text-sm leading-relaxed text-ib-ink">
                      {transferTicket.dossie.historicoResumo}
                    </p>
                  </div>
                ) : null}
                <p className="mt-3 font-mono text-[11px] tabular-nums text-ib-slate">
                  aberto em {fmtTime(transferTicket.createdAt)}
                </p>
              </div>
            </Card>
          ) : null}
          <Card>
            <div className="flex items-center justify-between border-b border-ib-line px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ib-selo">
                  {isSolicitacao ? "Solicitação de suporte" : "Dossiê do lead"}
                </p>
                <p className="mt-0.5 text-sm font-semibold text-ib-ink">
                  {lead?.contactName ?? conversation?.contactName ?? "Coletando…"}
                </p>
              </div>
              {/* O "score" saiu daqui. Era um número de 0 a 100 do funil comercial que
                  originou este código — "43" não dizia 43 de quê, não mudava o que alguém
                  faria e competia em tamanho com o nome da pessoa. Quem responde essa
                  pergunta agora é o bloco de qualidade abaixo, que separa o que se sabe
                  (completude) do que pressiona (prioridade). */}
              {isSolicitacao && setorLabel ? (
                <span className="rounded-full border border-ib-line bg-ib-papel px-2.5 py-1 text-[11px] font-medium text-ib-slate">
                  {setorLabel}
                </span>
              ) : null}
            </div>

            {lead ? (
              <div className="p-5">
                {isSolicitacao ? (
                  /* Solicitação (operacional/RH/DP): sem qualificação de venda */
                  <div className="rounded-xl border border-ib-line bg-ib-papel/60 p-4 text-sm text-ib-ink">
                    <p className="font-medium">Encaminhada para {setorLabel}.</p>
                    <p className="mt-1 text-ib-slate">
                      Este contato é uma solicitação de suporte, não um lead comercial. O time
                      responsável dá sequência.
                    </p>
                  </div>
                ) : (
                <>
                {/* A QUALIDADE DO LEAD, a mesma do quadro e do resumo.
                    Antes esta caixa tinha uma lista de cinco itens escrita à mão AQUI,
                    e a ficha mínima do domínio tem seis: a conversa dizia "2/5" enquanto
                    o resto do painel dizia que faltavam quatro coisas. Duas contas da
                    mesma coisa é como um time passa a não confiar na tela. */}
                <QualidadeDoLead
                  lead={lead}
                  className="rounded-xl border border-ib-line bg-ib-papel/60 p-4"
                />
                </>
                )}

                <p className="mt-4 rounded-xl bg-ib-bruma px-3.5 py-3 text-sm leading-relaxed text-ib-ink">
                  {buildSummary(lead)}
                </p>

                <div className="mt-2 divide-y divide-ib-line">
                  <Field label="Contato" value={lead.contactName ?? "—"} />
                  <Field
                    label="Serviços"
                    value={
                      lead.servicesInterested && lead.servicesInterested.length > 0
                        ? lead.servicesInterested.join(", ")
                        : "—"
                    }
                  />
                  <Field label="Idioma" value={nomeDoIdioma(lead.idioma) ?? "—"} />
                  <Field
                    label="Nacionalidade"
                    value={lead.nacionalidade ?? lead.clientType ?? "—"}
                  />
                  <Field
                    label="Onde está"
                    value={
                      lead.localizacao === "exterior"
                        ? `Exterior${lead.paisExterior ? ` — ${lead.paisExterior}` : ""}`
                        : lead.localizacao === "brasil"
                          ? "Brasil"
                          : lead.region ?? "—"
                    }
                  />
                  <Field label="Objetivo" value={lead.objetivo ?? "—"} />
                  <Field label="Modalidade provável" value={lead.modalidadeProvavel ?? "—"} />
                  <Field
                    label="Urgência"
                    value={lead.urgency ? urgencyLabel[lead.urgency as Urgency] : "—"}
                  />
                  <Field
                    label="Prazo"
                    value={
                      lead.prazoDataLimite
                        ? `limite ${lead.prazoDataLimite}`
                        : lead.temPrazoCorrendo
                          ? "a confirmar"
                          : "sem prazo sinalizado"
                    }
                  />
                  <div className="flex items-center justify-between gap-4 py-2.5">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ib-slate">
                      Status
                    </span>
                    <StatusBadge kind="lead" status={lead.status} />
                  </div>
                </div>

                {/* A ficha completa, editável, e a confirmação de prazo ficam no
                    detalhe do lead — aqui é a conversa ao vivo. */}
                <Link
                  href={`/dashboard/leads/${lead.id}`}
                  className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-ib-mar hover:underline"
                >
                  <Icon name="doc" className="h-4 w-4" />
                  Abrir ficha do lead
                </Link>
              </div>
            ) : (
              <div className="p-5">
                <div className="rounded-xl border border-dashed border-ib-line bg-ib-papel/50 p-6 text-center">
                  <div className="mx-auto flex w-fit items-center gap-2 text-sm font-medium text-ib-ink">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-ib-selo motion-safe:animate-signal-ping" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-ib-selo" />
                    </span>
                    Coletando dados do lead
                  </div>
                  <p className="mt-1.5 text-sm text-ib-slate">
                    O dossiê se preenche automaticamente conforme o agente conduz a qualificação.
                  </p>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Modal de transferência manual (setor + pessoa) */}
      {showTransfer ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-ib-casa/45 backdrop-blur-[2px]"
            onClick={() => !transferring && setShowTransfer(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-md rounded-2xl border border-ib-line bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ib-bruma text-ib-mar">
                <Icon name="users" className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-ib-ink">Transferir para um humano</h2>
                <p className="mt-1 text-sm leading-relaxed text-ib-slate">
                  Escolha o setor e quem vai assumir. Entra uma nota na conversa e a equipe é avisada.
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <Selecao
                  valor={setor}
                  onChange={setSetor}
                  label="Setor de destino"
                  opcoes={SETORES.map((s) => ({ valor: s, rotulo: s }))}
                />
              </div>
              <div>
                {users.length > 0 ? (
                  <Selecao
                    valor={pessoa}
                    onChange={setPessoa}
                    label="Quem assume"
                    placeholder="Selecione…"
                    opcoes={users.map((u) => ({ valor: u.name || u.email, rotulo: u.name || u.email }))}
                  />
                ) : (
                  <input
                    value={pessoa}
                    onChange={(e) => setPessoa(e.target.value)}
                    aria-label="Quem assume"
                    placeholder="quem assume (ex.: Pedro Lucas)"
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && !transferring && doTransfer()}
                    className="mt-1.5 w-full rounded-xl border border-ib-line bg-white px-3 py-2.5 text-sm text-ib-ink placeholder:text-ib-slate focus:border-ib-mar focus:outline-none focus:ring-2 focus:ring-ib-mar/20"
                  />
                )}
              </div>
              {transferError ? (
                <p className="text-xs font-medium text-ib-danger">{transferError}</p>
              ) : null}
            </div>

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowTransfer(false)}
                disabled={transferring}
                className="rounded-xl border border-ib-line bg-white px-4 py-2 text-sm font-medium text-ib-ink transition hover:bg-ib-papel disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={doTransfer}
                disabled={transferring}
                className="rounded-xl bg-ib-mar px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-ib-carimbo disabled:opacity-60"
              >
                {transferring ? "Transferindo…" : "Transferir atendimento"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={pendingDelete}
        loading={deleting}
        title="Excluir conversa"
        message="A conversa e todo o histórico de mensagens serão removidos. Esta ação não pode ser desfeita."
        confirmLabel="Excluir conversa"
        onConfirm={doDelete}
        onCancel={() => setPendingDelete(false)}
      />
    </div>
  );
}
