import { env } from "@/lib/env";
import { getRepository } from "@/lib/data";

type BrevoStored = { apiKey?: string; senderEmail?: string; senderName?: string };

export interface BrevoResolved {
  apiKey: string;
  senderEmail: string;
  senderName: string;
  configured: boolean;
}

// Config do Brevo: painel (agent_config "brevo") com ENV de fallback.
export async function getBrevoConfig(): Promise<BrevoResolved> {
  let stored: BrevoStored = {};
  try {
    stored = (await getRepository().getConfig<BrevoStored>("brevo")) ?? {};
  } catch {
    // banco indisponível — usa ENV
  }
  const apiKey = stored.apiKey || env.brevoApiKey;
  const senderEmail = stored.senderEmail || env.brevoSenderEmail;
  const senderName = stored.senderName || env.brevoSenderName || "Shine Rio";
  return { apiKey, senderEmail, senderName, configured: Boolean(apiKey && senderEmail) };
}

// Envia um e-mail transacional com PDF anexado, via API do Brevo.
export async function sendBrevoEmail(opts: {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  pdfBase64: string;
  pdfName: string;
}): Promise<void> {
  const cfg = await getBrevoConfig();
  if (!cfg.configured) throw new Error("Brevo não configurado (falta API key ou remetente).");
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": cfg.apiKey, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { email: cfg.senderEmail, name: cfg.senderName },
      to: [{ email: opts.to, name: opts.toName || opts.to }],
      subject: opts.subject,
      htmlContent: opts.html,
      attachment: [{ content: opts.pdfBase64, name: opts.pdfName }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Brevo ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

// Envia e-mail com um anexo por URL (ex.: documento/currículo recebido no WhatsApp).
export async function sendBrevoEmailWithUrl(opts: {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  attachmentUrl?: string;
  attachmentName?: string;
}): Promise<void> {
  const cfg = await getBrevoConfig();
  if (!cfg.configured) throw new Error("Brevo não configurado.");
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": cfg.apiKey, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { email: cfg.senderEmail, name: cfg.senderName },
      to: [{ email: opts.to, name: opts.toName || opts.to }],
      subject: opts.subject,
      htmlContent: opts.html,
      ...(opts.attachmentUrl
        ? { attachment: [{ url: opts.attachmentUrl, name: opts.attachmentName || "anexo" }] }
        : {}),
    }),
  });
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
