export function scoreTone(score: number): { chip: string; label: string; text: string } {
  if (score >= 70) return { chip: "bg-ib-success/12 text-ib-success", label: "Quente", text: "text-ib-success" };
  if (score >= 40) return { chip: "bg-ib-warn/12 text-[#9A6212]", label: "Morno", text: "text-[#9A6212]" };
  return { chip: "bg-ib-danger/10 text-ib-danger", label: "Frio", text: "text-ib-danger" };
}

export function timeAgo(iso?: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

/** Digits only, for wa.me links. Returns undefined if too short to be a phone number. */
export function digitsOf(value?: string | null): string | undefined {
  if (!value) return undefined;
  if (/^(sim:|flow|clarify|op:|test)/i.test(value)) return undefined; // conversa de teste, não é telefone
  const digits = value.replace(/\D/g, "");
  if (digits.length < 8) return undefined;
  return digits.startsWith("55") ? digits : `55${digits}`;
}

/** Exibição amigável do número: conversa de teste → "Simulador"; real → (DD) XXXXX-XXXX. */
export function formatWhatsapp(value?: string | null): string {
  if (!value) return "—";
  if (/^(sim:|flow|clarify|op:|test)/i.test(value)) return "Simulador (teste)";
  const d = value.replace(/\D/g, "");
  if (d.length < 8) return value;
  const local = d.startsWith("55") && d.length > 11 ? d.slice(2) : d;
  const ddd = local.slice(0, 2);
  const rest = local.slice(2);
  if (rest.length === 9) return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
  if (rest.length === 8) return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  return value;
}

/* -------------------------------------------------------------------- */
/* Date helpers — DD/MM/AAAA text fields, no native <input type=date>    */
/* -------------------------------------------------------------------- */

/** Formats a Date as DD/MM/AAAA. */
export function formatDDMMYYYY(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/** Parses a DD/MM/AAAA string into a local Date (midnight), or null if invalid/incomplete. */
export function parseDDMMYYYY(value: string): Date | null {
  const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  if (d.getMonth() !== Number(mm) - 1) return null; // rolled over → invalid day
  return d;
}

/** Applies a raw text-input mask so typed digits become DD/MM/AAAA as-you-go. */
export function maskDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean);
  return parts.join("/");
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
