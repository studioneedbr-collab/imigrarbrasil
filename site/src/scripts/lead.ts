// FORMULÁRIO DE LEAD
//
// Vai para /api/lead.php (no mesmo servidor do site), que repassa para a captura do CRM
// (imigrar-agent: /api/captura/site) com o token guardado do lado do servidor. O token
// não pode estar aqui: tudo que está neste arquivo qualquer pessoa lê no navegador.
//
// Depois de gravar, abre o WhatsApp com a mensagem pronta — o mesmo comportamento do
// formulário do WordPress. Se o CRM falhar, abre o WhatsApp do mesmo jeito: o lead que
// a pessoa vai digitar lá vale mais do que o registro que não chegou.

import { PAISES, mascarar, telefoneValido, bandeira, type Pais } from "../lib/paises";
import { paisProvavel } from "./idioma";
import { rastrear } from "./rastreio";

import config from "../data/site.json";

const ZAP = config.whatsapp; // editável no painel
const porIso = new Map(PAISES.map((p) => [p.iso, p]));

/** Seletor de país + máscara. O país começa no que o fuso horário indica (Espanha → +34). */
function iniciarTelefones() {
  const inicial = paisProvavel();
  document.querySelectorAll<HTMLElement>("[data-tel]").forEach((raiz) => {
    const sel = raiz.querySelector<HTMLSelectElement>("[data-tel-pais]")!;
    const ver = raiz.querySelector<HTMLElement>("[data-tel-ver]")!;
    const num = raiz.querySelector<HTMLInputElement>("[data-tel-numero]")!;
    const pais = () => porIso.get(sel.value)!;
    const exemplo = (p: Pais) => mascarar("91234567890123".slice(0, p.max ?? 9), p);
    const trocar = () => {
      const p = pais();
      ver.textContent = `${bandeira(p.iso)} +${p.ddi}`;
      num.placeholder = exemplo(p);
      num.value = mascarar(num.value.replace(/\D/g, ""), p);
    };
    if (inicial && porIso.has(inicial)) sel.value = inicial;
    sel.addEventListener("change", () => { trocar(); num.focus(); });
    num.addEventListener("input", () => {
      // Quem cola o número já com DDI ("+34 612…") troca o país sozinho.
      const cru = num.value.trim();
      if (cru.startsWith("+")) {
        const d = cru.replace(/\D/g, "");
        const achado = [...PAISES].sort((a, b) => b.ddi.length - a.ddi.length).find((p) => d.startsWith(p.ddi));
        if (achado) { sel.value = achado.iso; num.value = d.slice(achado.ddi.length); trocar(); return; }
      }
      const pos = num.selectionStart === num.value.length;
      num.value = mascarar(cru.replace(/\D/g, ""), pais());
      if (pos) num.setSelectionRange(num.value.length, num.value.length);
    });
    trocar();
  });
}

function capturarRef() {
  const ref = new URLSearchParams(location.search).get("ref");
  if (ref) try { sessionStorage.setItem("ib-ref", ref.slice(0, 80)); } catch {}
}

const refGuardado = () => { try { return sessionStorage.getItem("ib-ref") || ""; } catch { return ""; } };

export function iniciarFormularios() {
  capturarRef();
  iniciarTelefones();
  document.querySelectorAll<HTMLFormElement>("form[data-lead]").forEach((form) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const erro = form.querySelector<HTMLElement>(".erro")!;
      const botao = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
      const d = Object.fromEntries(new FormData(form)) as Record<string, string>;
      erro.hidden = true;

      const pais = porIso.get(d.ddi) ?? porIso.get("BR")!;
      const tel = (d.telefone || "").replace(/\D/g, "").replace(/^0+/, "");
      if (!d.nome?.trim()) return mostrar(erro, "Informe seu nome.");
      if (!tel && !d.email?.trim()) return mostrar(erro, "Informe seu WhatsApp para retornarmos o contato.");
      if (tel && !telefoneValido(tel, pais)) return mostrar(erro, `Confira o número: para ${pais.nome} (+${pais.ddi}) ele tem ${pais.min === pais.max ? pais.min : `de ${pais.min ?? 6} a ${pais.max ?? 14}`} dígitos, sem o código do país.`);

      botao.disabled = true;
      const textoOriginal = botao.innerHTML;
      botao.textContent = "Enviando…";

      const corpo = {
        nome: d.nome.trim(),
        // SEMPRE com "+DDI": é o que faz o CRM guardar o número como veio (comDdiProvavel).
        telefone: tel ? `+${pais.ddi}${tel}` : undefined,
        email: d.email?.trim() || undefined,
        mensagem: d.mensagem?.trim() || undefined,
        origem: form.dataset.lead || "formulario",
        idioma: document.documentElement.dataset.idioma || "pt",
        pagina: location.pathname,
        ref: refGuardado() || undefined,
        website: d.website || undefined, // armadilha de robô
      };

      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 8000);
        await fetch("/api/lead.php", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo), signal: ctl.signal });
        clearTimeout(t);
      } catch { /* segue para o WhatsApp mesmo assim */ }

      rastrear("formulario", (form.dataset.lead || "formulario").split(":")[0]);

      if (form.dataset.depois === "obrigado") {
        location.href = "/email-enviado-com-sucesso/";
        return;
      }
      const msg = `Olá, sou ${corpo.nome}. Estive no site da Imigrar Brasil e gostaria de mais informações.` + (corpo.mensagem ? `\n\n${corpo.mensagem}` : "");
      window.open(`https://wa.me/${ZAP}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
      botao.disabled = false;
      botao.innerHTML = textoOriginal;
      form.reset();
      form.closest("dialog")?.close();
    });
  });

  // botões que abrem o modal de contato
  const modal = document.getElementById("modal-lead") as HTMLDialogElement | null;
  document.querySelectorAll("[data-abrir-lead]").forEach((b) =>
    b.addEventListener("click", (e) => { if (!modal) return; e.preventDefault(); modal.showModal(); }),
  );
  modal?.querySelector(".fechar")?.addEventListener("click", () => modal.close());
  modal?.addEventListener("click", (e) => { if (e.target === modal) modal.close(); });
}

function mostrar(el: HTMLElement, msg: string) {
  el.textContent = msg;
  el.hidden = false;
}
