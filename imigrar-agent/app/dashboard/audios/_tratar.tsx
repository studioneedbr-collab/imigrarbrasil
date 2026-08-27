"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { btnGhost } from "@/components/dashboard/ui";

export default function BotaoTratar({ id }: { id: string }) {
  const router = useRouter();
  const [salvando, setSalvando] = useState(false);
  return (
    <button
      type="button"
      disabled={salvando}
      onClick={async () => {
        setSalvando(true);
        await fetch(`/api/operacao/eventos/${id}`, { method: "POST" }).catch(() => null);
        setSalvando(false);
        router.refresh();
      }}
      className={`${btnGhost} shrink-0 px-3 py-1.5 text-xs`}
    >
      {salvando ? "Marcando…" : "Marcar como ouvido"}
    </button>
  );
}
