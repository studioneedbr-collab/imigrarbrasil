import { describe, it, expect } from "vitest";
import { buildProposalEmail } from "@/lib/email/proposal-email";

describe("e-mail da proposta", () => {
  it("monta assunto, corpo e link mailto", () => {
    const e = buildProposalEmail({
      toEmail: "cliente@empresa.com", clienteNome: "João", empresa: "Alfa",
      totalValue: 4873.52, viewUrl: "http://localhost:3000/api/proposal/abc",
    });
    expect(e.subject).toContain("Alfa");
    expect(e.body).toMatch(/Shine Rio/);
    expect(e.body).toMatch(/4\.873,52|4873/);
    expect(e.mailto.startsWith("mailto:cliente@empresa.com")).toBe(true);
    expect(e.mailto).toContain("subject=");
  });
});
