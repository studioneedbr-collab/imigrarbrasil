"use client";

import { useEffect, useRef } from "react";
import { Icon } from "./ui";

// Modal de confirmação do sistema (substitui window.confirm nativo). Usado para
// ações destrutivas — excluir proposta, lead, conversa etc. Fecha no ESC, no clique
// fora e no Cancelar; foca o botão de confirmar ao abrir.
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Excluir",
  cancelLabel = "Cancelar",
  tone = "danger",
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onCancel();
    };
    window.addEventListener("keydown", onKey);
    // Trava o scroll do fundo enquanto o modal está aberto.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, loading, onCancel]);

  if (!open) return null;

  const confirmClass =
    tone === "danger"
      ? "bg-ib-danger text-white hover:bg-ib-danger/90 focus-visible:outline-ib-danger"
      : "bg-ib-mar text-white hover:bg-ib-carimbo focus-visible:outline-ib-mar";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-ib-casa/45 backdrop-blur-[2px] animate-in fade-in"
        onClick={() => !loading && onCancel()}
        aria-hidden
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="relative w-full max-w-sm rounded-2xl border border-ib-line bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              tone === "danger" ? "bg-ib-danger/10 text-ib-danger" : "bg-ib-bruma text-ib-mar"
            }`}
          >
            <Icon name={tone === "danger" ? "trash" : "bolt"} className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 id="confirm-title" className="text-base font-semibold text-ib-ink">
              {title}
            </h2>
            <div className="mt-1.5 text-sm leading-relaxed text-ib-slate">{message}</div>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-xl border border-ib-line bg-white px-4 py-2 text-sm font-medium text-ib-ink transition hover:bg-ib-papel disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`rounded-xl px-4 py-2 text-sm font-semibold shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60 ${confirmClass}`}
          >
            {loading ? "Excluindo…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
