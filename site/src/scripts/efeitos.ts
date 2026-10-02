// Animações que precisam de JavaScript. Tudo é progressivo: sem JS (ou com "reduzir
// movimento" ligado) o conteúdo aparece inteiro e parado.

const reduzir = matchMedia("(prefers-reduced-motion: reduce)").matches;

function revelarAoRolar() {
  const els = document.querySelectorAll<HTMLElement>("[data-revelar]");
  if (reduzir || !("IntersectionObserver" in window)) { els.forEach((e) => e.classList.add("visivel")); return; }
  // Irmãos que entram juntos aparecem em cascata.
  els.forEach((e) => {
    const irmaos = e.parentElement ? [...e.parentElement.children].filter((x) => x.hasAttribute("data-revelar")) : [];
    const i = irmaos.indexOf(e);
    if (i > 0) e.style.setProperty("--atraso", `${Math.min(i, 6) * 0.08}s`);
  });
  const obs = new IntersectionObserver((es) => es.forEach((x) => {
    if (x.isIntersecting) { x.target.classList.add("visivel"); obs.unobserve(x.target); }
  }), { rootMargin: "0px 0px -8% 0px" });
  els.forEach((e) => obs.observe(e));
}

/** Os números já estão no HTML (é o que o Google lê); a contagem é só na tela. */
function contarNumeros() {
  if (reduzir) return;
  const els = document.querySelectorAll<HTMLElement>("[data-contar]");
  const obs = new IntersectionObserver((es) => es.forEach((x) => {
    if (!x.isIntersecting) return;
    obs.unobserve(x.target);
    const el = x.target as HTMLElement;
    const final = el.textContent!;
    const m = final.match(/\d+/);
    if (!m) return;
    const alvo = +m[0], ini = performance.now(), dur = 1400;
    const passo = (t: number) => {
      const k = Math.min(1, (t - ini) / dur), v = Math.round(alvo * (1 - Math.pow(1 - k, 3)));
      el.textContent = final.replace(m[0], String(v));
      if (k < 1) requestAnimationFrame(passo); else el.textContent = final;
    };
    requestAnimationFrame(passo);
  }), { threshold: 0.6 });
  els.forEach((e) => obs.observe(e));
}

function dobras() {
  document.querySelectorAll<HTMLElement>("[data-dobra]").forEach((d) => {
    const corpo = d.querySelector<HTMLElement>(".dobra-corpo")!;
    const botao = d.querySelector<HTMLButtonElement>(".dobra-botao")!;
    const limite = parseInt(getComputedStyle(d).getPropertyValue("--altura")) || 260;
    // Texto curto: nada a dobrar.
    if (corpo.scrollHeight <= limite + 80) { d.classList.remove("fechada"); return; }
    botao.hidden = false;
    botao.addEventListener("click", () => {
      const abrir = d.classList.contains("fechada");
      if (abrir) {
        corpo.style.maxHeight = corpo.scrollHeight + "px";
        d.classList.remove("fechada");
        corpo.addEventListener("transitionend", () => { corpo.style.maxHeight = "none"; }, { once: true });
      } else {
        corpo.style.maxHeight = corpo.scrollHeight + "px";
        requestAnimationFrame(() => { d.classList.add("fechada"); corpo.style.maxHeight = ""; });
        d.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
      botao.setAttribute("aria-expanded", String(abrir));
      botao.textContent = abrir ? botao.dataset.menos! : botao.dataset.mais!;
    });
  });
}

/** Brilho que segue o mouse nos cards de categoria. */
function brilhoNoMouse() {
  if (reduzir) return;
  document.querySelectorAll<HTMLElement>(".card-categoria").forEach((c) =>
    c.addEventListener("pointermove", (e) => {
      const r = c.getBoundingClientRect();
      c.style.setProperty("--mx", `${e.clientX - r.left}px`);
      c.style.setProperty("--my", `${e.clientY - r.top}px`);
    }),
  );
}

function progressoDeLeitura() {
  const barra = document.querySelector<HTMLElement>(".progresso");
  const artigo = document.querySelector<HTMLElement>("[data-artigo]");
  if (!barra || !artigo) return;
  const atualizar = () => {
    const r = artigo.getBoundingClientRect();
    const k = Math.min(1, Math.max(0, -r.top / (r.height - innerHeight)));
    barra.style.transform = `scaleX(${k})`;
  };
  addEventListener("scroll", atualizar, { passive: true });
  atualizar();
}

export function iniciarEfeitos() {
  revelarAoRolar();
  contarNumeros();
  dobras();
  brilhoNoMouse();
  progressoDeLeitura();
}
