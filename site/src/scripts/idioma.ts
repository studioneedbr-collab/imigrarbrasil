// IDIOMA DO SITE
//
// O site é escrito em português — é onde está o SEO, e as URLs não mudam. As outras
// línguas são tradução automática no navegador (Google Tradutor), como no WordPress.
// O que mudou:
//
//  · o motor só é carregado quando alguém escolhe outra língua. Antes o script do
//    GTranslate pesava em toda visita, inclusive nas 100% em português;
//  · o seletor é nosso, com o nome da língua e sem bandeira (o antigo mostrava a bandeira
//    do México para "espanhol" e a do Québec para "francês");
//  · as línguas são as que a operação ATENDE (lib/domain/idiomas.ts do imigrar-agent).
//    Alemão e italiano saíram: traduzir o site para alguém que não vai ser atendido na
//    língua dele é prometer o que o WhatsApp não entrega;
//  · quem chega de fora vê um aviso, NA LÍNGUA DELE, oferecendo a tradução — em vez de
//    o site trocar sozinho. Robôs do Google e brasileiros no exterior nunca são traduzidos
//    à força.

export const IDIOMAS = {
  pt: { nome: "Português", curto: "PT" },
  es: { nome: "Español", curto: "ES" },
  en: { nome: "English", curto: "EN" },
  fr: { nome: "Français", curto: "FR" },
} as const;
export type Idioma = keyof typeof IDIOMAS;
const LISTA = Object.keys(IDIOMAS) as Idioma[];

// País → língua sugerida. Só entram países onde a sugestão é óbvia.
const LINGUA_DO_PAIS: Record<string, Idioma> = {};
const reg = (l: Idioma, ps: string) => ps.split(" ").forEach((p) => (LINGUA_DO_PAIS[p] = l));
reg("es", "ES MX AR CO CL PE VE EC BO PY UY CU DO GT HN SV NI CR PA PR GQ");
reg("en", "US GB IE AU NZ ZA NG GH KE JM TT GY BS BB ZW ZM UG SL LR PH SG IN PK BD");
reg("fr", "FR BE LU MC SN CI CM CD CG HT ML BF NE TG BJ GA GN MG MA DZ TN RW BI TD CF DJ MR");
reg("pt", "BR PT AO MZ CV GW ST TL");

// Fuso horário → país. O navegador não informa o país; o fuso é o melhor sinal sem
// servidor. Fusos que cobrem vários países (Europe/Brussels…) apontam para o principal.
const PAIS_DO_FUSO: Record<string, string> = {
  "Europe/Madrid": "ES", "Atlantic/Canary": "ES", "Africa/Ceuta": "ES",
  "America/Mexico_City": "MX", "America/Monterrey": "MX", "America/Cancun": "MX", "America/Tijuana": "MX", "America/Merida": "MX", "America/Chihuahua": "MX", "America/Hermosillo": "MX", "America/Mazatlan": "MX",
  "America/Argentina/Buenos_Aires": "AR", "America/Buenos_Aires": "AR", "America/Argentina/Cordoba": "AR", "America/Argentina/Mendoza": "AR",
  "America/Bogota": "CO", "America/Santiago": "CL", "America/Lima": "PE", "America/Caracas": "VE", "America/Guayaquil": "EC",
  "America/La_Paz": "BO", "America/Asuncion": "PY", "America/Montevideo": "UY", "America/Havana": "CU", "America/Santo_Domingo": "DO",
  "America/Guatemala": "GT", "America/Tegucigalpa": "HN", "America/El_Salvador": "SV", "America/Managua": "NI", "America/Costa_Rica": "CR",
  "America/Panama": "PA", "America/Puerto_Rico": "PR", "Africa/Malabo": "GQ",
  "America/New_York": "US", "America/Chicago": "US", "America/Denver": "US", "America/Los_Angeles": "US", "America/Phoenix": "US", "America/Anchorage": "US", "Pacific/Honolulu": "US", "America/Detroit": "US",
  "Europe/London": "GB", "Europe/Dublin": "IE", "Australia/Sydney": "AU", "Australia/Melbourne": "AU", "Australia/Brisbane": "AU", "Australia/Perth": "AU", "Pacific/Auckland": "NZ",
  "Africa/Johannesburg": "ZA", "Africa/Lagos": "NG", "Africa/Accra": "GH", "Africa/Nairobi": "KE", "America/Jamaica": "JM", "Asia/Manila": "PH", "Asia/Singapore": "SG", "Asia/Kolkata": "IN", "Asia/Calcutta": "IN", "Asia/Karachi": "PK", "Asia/Dhaka": "BD",
  "Europe/Paris": "FR", "Europe/Brussels": "BE", "Europe/Luxembourg": "LU", "Europe/Monaco": "MC", "Africa/Dakar": "SN", "Africa/Abidjan": "CI", "Africa/Douala": "CM",
  "Africa/Kinshasa": "CD", "Africa/Lubumbashi": "CD", "Africa/Brazzaville": "CG", "America/Port-au-Prince": "HT", "Africa/Bamako": "ML", "Africa/Ouagadougou": "BF",
  "Africa/Niamey": "NE", "Africa/Lome": "TG", "Africa/Porto-Novo": "BJ", "Africa/Libreville": "GA", "Africa/Conakry": "GN", "Indian/Antananarivo": "MG",
  "Africa/Casablanca": "MA", "Africa/Algiers": "DZ", "Africa/Tunis": "TN", "Africa/Kigali": "RW", "Africa/Bujumbura": "BI", "Africa/Ndjamena": "TD", "Africa/Bangui": "CF", "Africa/Djibouti": "DJ",
  "America/Montreal": "CA", "America/Toronto": "CA", "America/Vancouver": "CA",
  "Europe/Lisbon": "PT", "Africa/Luanda": "AO", "Africa/Maputo": "MZ", "Atlantic/Cape_Verde": "CV",
};

const CHAVE = "ib-idioma"; // escolha explícita da pessoa (inclusive "pt")
const ler = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const gravar = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} };

function idiomaAtual(): Idioma {
  const m = document.cookie.match(/(?:^|;\s*)googtrans=\/pt\/([a-z]{2})/);
  return m && LISTA.includes(m[1] as Idioma) ? (m[1] as Idioma) : "pt";
}

function definirCookie(l: Idioma) {
  const host = location.hostname;
  const dominios = ["", host, "." + host.replace(/^www\./, "")];
  for (const d of dominios) {
    const dom = d ? `;domain=${d}` : "";
    document.cookie = l === "pt"
      ? `googtrans=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/${dom}`
      : `googtrans=/pt/${l};path=/;max-age=31536000;SameSite=Lax${dom}`;
  }
}

let motorCarregado = false;
function carregarMotor() {
  if (motorCarregado) return;
  motorCarregado = true;
  const host = document.createElement("div");
  host.id = "gt-host";
  document.body.appendChild(host);
  (window as any).ibIniciarTradutor = () => {
    const g = (window as any).google;
    new g.translate.TranslateElement({ pageLanguage: "pt", includedLanguages: LISTA.join(","), autoDisplay: false }, "gt-host");
  };
  const s = document.createElement("script");
  s.src = "https://translate.google.com/translate_a/element.js?cb=ibIniciarTradutor";
  s.async = true;
  document.head.appendChild(s);
}

/** País pelo fuso horário (ou ?simular-pais=), para o seletor de telefone começar certo. */
export function paisProvavel(): string | null {
  if (simulado) return simulado;
  try { return PAIS_DO_FUSO[Intl.DateTimeFormat().resolvedOptions().timeZone] ?? null; } catch { return null; }
}

export function escolherIdioma(l: Idioma) {
  gravar(CHAVE, l);
  if (l === idiomaAtual()) return;
  definirCookie(l);
  // Recarregar é o único jeito confiável: o motor lê o cookie ao iniciar, e desfazer
  // uma tradução já aplicada sem recarregar deixa pedaços traduzidos para trás.
  location.reload();
}

// Para conferir o aviso sem viajar: /?simular-pais=ES (ou FR, US, CO…). Ignora o idioma
// do navegador e a escolha já gravada.
const simulado = new URLSearchParams(location.search).get("simular-pais")?.toUpperCase() || null;

/**
 * A língua mais provável de quem chegou: pelo país (fuso horário) quando ele tem uma
 * língua óbvia, senão pela língua do navegador, senão inglês.
 */
function sugerir(): Idioma {
  const navegador = (navigator.languages?.[0] || navigator.language || "pt").slice(0, 2).toLowerCase() as Idioma;
  const pais = paisProvavel();
  const pelaLocalizacao = pais ? LINGUA_DO_PAIS[pais] : undefined;
  if (simulado) return pelaLocalizacao ?? "en";
  if (navegador === "pt") return "pt";
  return pelaLocalizacao ?? (LISTA.includes(navegador) ? navegador : "en");
}

/**
 * BOAS-VINDAS NA PRIMEIRA VISITA: em que língua a pessoa quer ser atendida.
 *
 * Só para quem ainda não escolheu, e não para quem já lê em português no navegador — a
 * maior parte do público é brasileira, e uma janela que cobre a página logo na entrada
 * custa conversão (e o Google penaliza intersticial no celular). Para mostrar a todo
 * mundo, tire a condição `navegadorEmPortugues` em iniciarIdioma.
 *
 * Fechar sem escolher conta como "português": o popup não volta a cada página.
 */
function mostrarBoasVindas() {
  const modal = document.getElementById("boas-vindas") as HTMLDialogElement | null;
  if (!modal || modal.open) return;
  const sugerida = sugerir();
  modal.querySelectorAll<HTMLButtonElement>("[data-escolher]").forEach((b) => {
    const l = b.dataset.escolher as Idioma;
    if (l === sugerida) {
      b.classList.add("sugerida");
      b.querySelector<HTMLElement>(".boas-vindas-sugerido")!.hidden = false;
    }
    b.onclick = () => { modal.close(); escolherIdioma(l); };
  });
  const fechar = () => { if (!ler(CHAVE)) gravar(CHAVE, "pt"); };
  modal.addEventListener("close", fechar, { once: true });
  modal.querySelector<HTMLButtonElement>("[data-fechar]")!.onclick = () => modal.close();
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.close(); });
  modal.showModal();
  modal.querySelector<HTMLButtonElement>(".sugerida")?.focus();
}

export function iniciarIdioma() {
  const atual = idiomaAtual();
  document.documentElement.dataset.idioma = atual;
  if (atual !== "pt") carregarMotor();

  // seletor do cabeçalho: bandeira e sigla da língua atual
  document.querySelectorAll<HTMLElement>("[data-idioma]").forEach((raiz) => {
    const botao = raiz.querySelector<HTMLButtonElement>(".idioma-botao")!;
    const lista = raiz.querySelector<HTMLElement>(".idioma-lista")!;
    raiz.querySelector("[data-atual]")!.textContent = IDIOMAS[atual].curto;
    const bandeiraAtual = lista.querySelector(`button[data-l="${atual}"] .idioma-bandeira`);
    if (bandeiraAtual) raiz.querySelector("[data-bandeira]")!.innerHTML = bandeiraAtual.innerHTML;
    lista.querySelectorAll<HTMLButtonElement>("button[data-l]").forEach((b) => {
      b.setAttribute("aria-current", String(b.dataset.l === atual));
      b.onclick = () => escolherIdioma(b.dataset.l as Idioma);
    });
    const abrir = (v: boolean) => { lista.hidden = !v; botao.setAttribute("aria-expanded", String(v)); };
    botao.onclick = (e) => { e.stopPropagation(); abrir(lista.hidden); };
    document.addEventListener("click", () => abrir(false));
    document.addEventListener("keydown", (e) => e.key === "Escape" && abrir(false));
  });

  const navegadorEmPortugues = (navigator.languages?.[0] || navigator.language || "").toLowerCase().startsWith("pt");
  const robo = /bot|crawl|spider|lighthouse|headless/i.test(navigator.userAgent);
  if (simulado || (!ler(CHAVE) && atual === "pt" && !robo && !navegadorEmPortugues)) {
    setTimeout(mostrarBoasVindas, 700);
  }
}
