import { describe, it, expect } from "vitest";
import { computeLeadScore } from "@/lib/agent/lead-score";

const t = (min: number) => new Date(2026, 0, 1, 10, min).toISOString();

describe("computeLeadScore", () => {
  it("contato engajado, qualificado e com prazo pontua alto", () => {
    const r = computeLeadScore({
      messages: [
        { role: "assistant", createdAt: t(0) },
        { role: "user", createdAt: t(1) },
        { role: "assistant", createdAt: t(2) },
        { role: "user", createdAt: t(3) },
        { role: "assistant", createdAt: t(4) },
        { role: "user", createdAt: t(5) },
      ],
      lead: {
        stage: "qualificado",
        servicesInterested: ["Refúgio"],
        region: "Brasil — Boa Vista",
        urgency: "immediate",
      },
    });
    expect(r.score).toBeGreaterThan(70);
    expect(r.breakdown.interesse).toBeGreaterThan(15);
  });

  it("contato frio/sem interação pontua baixo", () => {
    const r = computeLeadScore({
      messages: [{ role: "assistant", createdAt: t(0) }],
      lead: { stage: "novo" },
    });
    expect(r.score).toBeLessThan(40);
  });

  it("score fica sempre entre 0 e 100", () => {
    const r = computeLeadScore({ messages: [], lead: null });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });
});
