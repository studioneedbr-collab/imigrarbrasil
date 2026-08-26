import { describe, it, expect } from "vitest";
import { normalizarPapel, podeAdministrar, podeExportar, PAPEIS } from "@/lib/auth/papeis";

// Este painel guarda situação migratória de gente em situação irregular e de
// solicitantes de refúgio. Quem pode tirar isso de dentro do sistema é uma decisão de
// segurança, e é por isso que ela tem teste.

describe("papéis", () => {
  it("o papel legado 'user' vira atendente, o mais restrito", () => {
    expect(normalizarPapel("user")).toBe("atendente");
  });

  it("qualquer papel desconhecido cai no mais restrito, nunca em admin", () => {
    for (const entrada of ["superadmin", "", null, undefined, 42, {}, "ADMIN"]) {
      expect(normalizarPapel(entrada)).toBe("atendente");
    }
  });

  it("atendente não exporta", () => {
    expect(podeExportar("atendente")).toBe(false);
    expect(podeExportar("advogado")).toBe(true);
    expect(podeExportar("admin")).toBe(true);
  });

  it("só o administrador administra", () => {
    expect(PAPEIS.filter(podeAdministrar)).toEqual(["admin"]);
  });
});
