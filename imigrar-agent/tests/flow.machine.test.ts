import { describe, it, expect } from "vitest";
import { nextState, initialState } from "@/lib/agent/flow/machine";

describe("máquina de estados (menu-estrito)", () => {
  it("S0 boas-vindas → S1 identidade", () => {
    const r = nextState("S0", "");
    expect(r.state).toBe("S1");
    expect(r.reply.toLowerCase()).toMatch(/chamar/);
  });
  it("S2 triagem: '1' Cliente → S3 setor", () => {
    expect(nextState("S2", "1").state).toBe("S3");
  });
  it("S3 setor: '1' Comercial → S4 menu comercial", () => {
    const r = nextState("S3", "1");
    expect(r.state).toBe("S4");
    expect(r.reply).toMatch(/orçamento/i);
  });
  it("S4 comercial: '1' Orçamento → S5", () => {
    expect(nextState("S4", "1").state).toBe("S5");
  });
  it("S4 comercial: '3' Falar com consultor → S7 (transfere)", () => {
    const r = nextState("S4", "3");
    expect(r.state).toBe("S7");
    expect(r.transfer).toBe(true);
  });
  it("opção inválida no menu repete o mesmo estado", () => {
    const r = nextState("S4", "banana");
    expect(r.state).toBe("S4");
    expect(r.reply.toLowerCase()).toMatch(/digite|opção/);
  });
  it("initialState é S0", () => {
    expect(initialState()).toBe("S0");
  });
});
