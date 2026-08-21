"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Atualiza os dados de uma página de Server Component em intervalos, chamando
 * router.refresh() (re-executa o fetch no servidor sem recarregar a página).
 * Pausa quando a aba não está visível para não gastar à toa.
 */
export default function AutoRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const t = setInterval(tick, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
