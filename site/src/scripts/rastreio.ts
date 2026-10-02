// O QUE O SITE CONTA PARA O PAINEL (aba Site → Visão geral).
//
// Anônimo por construção: nenhum cookie, nenhum identificador, nenhum dado de formulário.
// Só "o que aconteceu, em que página, de que país (pelo fuso), em que aparelho e de onde a
// pessoa veio". Por isso não precisa de banner de consentimento.
//
// Vai para o painel por navigator.sendBeacon, que não segura a navegação: o clique num
// link que troca de página ainda chega. Sem PUBLIC_PAINEL_URL no build, não manda nada.

import { paisProvavel } from "./idioma";

const DESTINO = import.meta.env.PUBLIC_PAINEL_URL ? `${import.meta.env.PUBLIC_PAINEL_URL.replace(/\/$/, "")}/api/site/evento` : null;

function dispositivo() {
  const l = Math.min(screen.width, innerWidth);
  return l < 640 ? "celular" : l < 1024 ? "tablet" : "computador";
}

/** De onde a pessoa veio, guardado na primeira página da visita (depois o referrer é o próprio site). */
function origem(): string | null {
  try {
    const salvo = sessionStorage.getItem("ib-origem");
    if (salvo !== null) return salvo || null;
    const q = new URLSearchParams(location.search);
    let o = q.get("utm_source") || "";
    if (!o && document.referrer) {
      const h = new URL(document.referrer).hostname.replace(/^www\./, "");
      if (h && h !== location.hostname.replace(/^www\./, "")) o = h;
    }
    sessionStorage.setItem("ib-origem", o.slice(0, 80));
    return o || null;
  } catch {
    return null;
  }
}

export function rastrear(tipo: "visita" | "clique" | "formulario", alvo: string | null = null) {
  if (!DESTINO || /bot|crawl|spider|headless/i.test(navigator.userAgent)) return;
  const corpo = JSON.stringify({
    tipo,
    alvo: alvo?.toLowerCase().replace(/[^a-z0-9:_-]/g, "-").slice(0, 80) ?? null,
    pagina: location.pathname,
    idioma: document.documentElement.dataset.idioma || "pt",
    pais: paisProvavel(),
    dispositivo: dispositivo(),
    origem: origem(),
  });
  try {
    if (!navigator.sendBeacon?.(DESTINO, new Blob([corpo], { type: "text/plain" }))) {
      fetch(DESTINO, { method: "POST", body: corpo, keepalive: true, mode: "no-cors" }).catch(() => {});
    }
  } catch { /* contagem nunca quebra o site */ }
}

/** O alvo de um clique: etiqueta explícita (data-rastrear) ou o tipo do link. */
function alvoDoClique(el: Element): string | null {
  const marcado = el.closest<HTMLElement>("[data-rastrear]");
  if (marcado) return marcado.dataset.rastrear!;
  const a = el.closest<HTMLAnchorElement>("a[href]");
  if (!a) return null;
  const h = a.href;
  if (/wa\.me|api\.whatsapp\.com/.test(h)) return "whatsapp";
  if (h.startsWith("tel:")) return "telefone";
  if (h.startsWith("mailto:")) return "email";
  if (/kiwify/.test(h)) return "ebook";
  const s = a.pathname.match(/^\/servico\/([^/]+)/);
  if (s && a.hostname === location.hostname) return `servico:${s[1].slice(0, 70)}`;
  return null;
}

export function iniciarRastreio() {
  if (!DESTINO) return;
  rastrear("visita");
  document.addEventListener("click", (e) => {
    const alvo = e.target instanceof Element ? alvoDoClique(e.target) : null;
    if (alvo) rastrear("clique", alvo);
  }, { capture: true });
}
