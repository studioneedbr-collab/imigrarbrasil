import crypto from "node:crypto";
import { env } from "@/lib/env";

export function validSignature(
  raw: string,
  signature: string | null,
  secret: string = env.whatsappAppSecret,
): boolean {
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error("[webhook] WHATSAPP_APP_SECRET ausente em produção — rejeitando requisição");
      return false;
    }
    console.warn("[webhook] APP_SECRET ausente — pulando HMAC (modo dev)");
    return true;
  }
  if (!signature) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
