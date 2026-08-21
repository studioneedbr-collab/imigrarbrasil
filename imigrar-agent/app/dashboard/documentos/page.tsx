"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Card,
  EmptyState,
  Icon,
  PageHeader,
  Pagination,
  SkeletonRows,
  fmtDate,
} from "@/components/dashboard/ui";

export interface DocumentRow {
  messageId: string;
  conversationId: string;
  contactName: string | null;
  whatsappNumber: string;
  url: string;
  kind: "image" | "document" | "audio";
  name: string;
  text?: string | null;
  createdAt: string;
}

const PAGE_SIZE = 12;

export default function DocumentosPage() {
  const [docs, setDocs] = useState<DocumentRow[] | null>(null);
  const [busca, setBusca] = useState("");
  const [page, setPage] = useState(1);
  const [aberto, setAberto] = useState<DocumentRow | null>(null);

  useEffect(() => {
    fetch("/api/documentos", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { documents: [] }))
      .then((d) => setDocs(d.documents ?? []))
      .catch(() => setDocs([]));
  }, []);

  // A busca cobre o texto LIDO do arquivo — é o que torna um contracheque
  // fotografado localizável por nome, CPF ou empresa.
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return docs ?? [];
    return (docs ?? []).filter((d) =>
      [d.name, d.contactName ?? "", d.whatsappNumber, d.text ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [docs, busca]);

  const pageCount = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const clamped = Math.min(page, pageCount);
  const items = filtrados.slice((clamped - 1) * PAGE_SIZE, clamped * PAGE_SIZE);

  return (
    <div className="space-y-6 pt-6">
      <PageHeader
        eyebrow="CRM"
        title="Documentos"
        description="Tudo que os clientes, colaboradores e candidatos enviaram pelo WhatsApp — com o conteúdo já lido pelo agente."
      />

      <div className="relative max-w-md">
        <Icon
          name="search"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ib-slate"
        />
        <input
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            setPage(1);
          }}
          placeholder="Buscar por nome, telefone ou conteúdo do documento…"
          className="w-full rounded-xl border border-ib-line bg-white py-2.5 pl-9 pr-3 text-sm text-ib-ink outline-none transition focus:border-ib-mar focus:ring-2 focus:ring-ib-mar/20"
        />
      </div>

      {docs === null ? (
        <Card className="p-5">
          <SkeletonRows rows={5} cols={3} />
        </Card>
      ) : items.length === 0 ? (
        <EmptyState
          variant="grid"
          title={busca ? "Nenhum documento encontrado" : "Nenhum documento recebido ainda"}
          text={
            busca
              ? "Tente outro nome, telefone ou trecho do conteúdo."
              : "Quando alguém enviar uma foto ou um arquivo no WhatsApp, ele aparece aqui — com o que o agente conseguiu ler."
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((d) => (
              <Card key={d.messageId} className="flex flex-col overflow-hidden">
                <button
                  type="button"
                  onClick={() => setAberto(d)}
                  className="block h-40 w-full bg-ib-papel"
                >
                  {d.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={d.url} alt={d.name} className="h-40 w-full object-cover" />
                  ) : (
                    <span className="flex h-40 w-full items-center justify-center">
                      <Icon name="doc" className="h-10 w-10 text-ib-slate" />
                    </span>
                  )}
                </button>
                <div className="flex-1 space-y-2 p-4">
                  <p className="truncate text-sm font-semibold text-ib-ink">{d.name}</p>
                  <p className="truncate text-xs text-ib-slate">
                    {d.contactName || d.whatsappNumber} · {fmtDate(d.createdAt)}
                  </p>
                  {d.text ? (
                    <p className="line-clamp-3 text-xs leading-relaxed text-ib-slate">{d.text}</p>
                  ) : (
                    <p className="text-xs italic text-ib-slate">Conteúdo não lido.</p>
                  )}
                </div>
                <div className="flex items-center justify-between border-t border-ib-line px-4 py-2.5">
                  <Link
                    href={`/dashboard/conversations/${d.conversationId}`}
                    className="text-xs font-semibold text-ib-mar hover:underline"
                  >
                    Abrir conversa
                  </Link>
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-ib-slate hover:text-ib-ink"
                  >
                    <Icon name="external" className="h-3.5 w-3.5" />
                    Baixar
                  </a>
                </div>
              </Card>
            ))}
          </div>
          <Pagination page={clamped} pageCount={pageCount} onPage={setPage} />
        </>
      )}

      {aberto ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setAberto(null)}
        >
          <div
            className="max-h-full w-full max-w-3xl overflow-auto rounded-2xl bg-white p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-ib-ink">{aberto.name}</p>
                <p className="truncate text-xs text-ib-slate">
                  {aberto.contactName || aberto.whatsappNumber} · {fmtDate(aberto.createdAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAberto(null)}
                className="shrink-0 text-sm font-semibold text-ib-slate hover:text-ib-ink"
              >
                Fechar
              </button>
            </div>
            {aberto.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={aberto.url} alt={aberto.name} className="max-h-[60vh] w-full object-contain" />
            ) : (
              <a
                href={aberto.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-ib-mar hover:underline"
              >
                <Icon name="external" className="h-4 w-4" />
                Abrir arquivo
              </a>
            )}
            {aberto.text ? (
              <div className="mt-4 rounded-xl bg-ib-papel p-4">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ib-slate">
                  Conteúdo lido
                </p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-ib-ink">
                  {aberto.text}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
