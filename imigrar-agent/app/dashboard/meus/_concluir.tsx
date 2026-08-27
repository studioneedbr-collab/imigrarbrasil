"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ConcluirLembrete({ id }: { id: string }) {
  const router = useRouter();
  const [salvando, setSalvando] = useState(false);
  return (
    <button
      type="button"
      disabled={salvando}
      onClick={async () => {
        setSalvando(true);
        await fetch(`/api/lembretes/${id}`, { method: "POST" }).catch(() => null);
        setSalvando(false);
        router.refresh();
      }}
      className="shrink-0 rounded-lg border border-ib-line bg-white px-3 py-1.5 text-xs font-semibold text-ib-ink transition hover:border-ib-mar/40 hover:bg-ib-bruma"
    >
      {salvando ? "Concluindo…" : "Marcar retorno como feito"}
    </button>
  );
}
