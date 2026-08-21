import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { validSignature } from "@/lib/whatsapp/signature";

const sign = (raw: string, secret: string) =>
  "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");

describe("validSignature", () => {
  const raw = JSON.stringify({ hello: "world" });

  it("aceita assinatura válida", () => {
    expect(validSignature(raw, sign(raw, "topsecret"), "topsecret")).toBe(true);
  });
  it("rejeita assinatura inválida", () => {
    expect(validSignature(raw, sign(raw, "wrong"), "topsecret")).toBe(false);
  });
  it("rejeita quando falta o header de assinatura", () => {
    expect(validSignature(raw, null, "topsecret")).toBe(false);
  });
  it("dev (sem segredo) aceita — bypass de desenvolvimento", () => {
    expect(validSignature(raw, null, "")).toBe(true);
  });
  it("produção sem segredo rejeita", () => {
    // O runner (vitest) não permite Object.defineProperty em process.env, mas
    // aceita atribuição direta — usamos isso para simular NODE_ENV=production.
    const proc = process.env as Record<string, string | undefined>;
    const prev = proc.NODE_ENV;
    try {
      proc.NODE_ENV = "production";
      expect(validSignature(raw, null, "")).toBe(false);
    } finally {
      proc.NODE_ENV = prev;
    }
  });
});
