"use client";

import { useState } from "react";
import { Icon, btnGhost } from "@/components/dashboard/ui";

export default function PrintButton() {
  const [loading, setLoading] = useState(false);

  async function exportPdf() {
    setLoading(true);
    try {
      const res = await fetch("/api/relatorios/pdf", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "relatorio-imigrar-brasil.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // fallback: imprime a página se a geração falhar
      window.print();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button type="button" onClick={exportPdf} disabled={loading} className={btnGhost}>
      <Icon name="doc" className="h-4 w-4" />
      {loading ? "Gerando PDF…" : "Exportar PDF"}
    </button>
  );
}
