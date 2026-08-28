// O CALENDÁRIO NÃO PODE ABRIR EM "undefined de NaN".
//
// O campo de data guarda o mês visível como "YYYY-MM". Quem chama o campo grava string
// VAZIA quando não há data (`onChange={(v) => setLimite(v ?? "")}` na ficha do lead), e
// `"" ?? hoje` devolve "" — o `??` só cobre null/undefined. O mês visível virava "",
// `"".split("-")` virava [NaN], e o cabeçalho do calendário saía "undefined de NaN" com
// a grade de dias vazia: o calendário abria quebrado em todo campo de data em branco,
// que é justamente o estado inicial de "Data do relógio (opcional)".

import { describe, expect, it } from "vitest";
import { mesInicial, paraBr, paraIso } from "@/components/dashboard/campos";

const MES_ATUAL = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
})();

describe("mês inicial do calendário", () => {
  it("usa o mês da data quando há data", () => {
    expect(mesInicial("2026-03-14")).toBe("2026-03");
  });

  it("cai no mês corrente quando o campo está vazio", () => {
    // Os três jeitos de dizer "sem data" que o campo aceita. O "" era o que quebrava.
    expect(mesInicial("")).toBe(MES_ATUAL);
    expect(mesInicial(null)).toBe(MES_ATUAL);
    expect(mesInicial(undefined)).toBe(MES_ATUAL);
  });

  it("cai no mês corrente quando o valor não é uma data ISO", () => {
    expect(mesInicial("27/08/2026")).toBe(MES_ATUAL);
    expect(mesInicial("sem data")).toBe(MES_ATUAL);
    expect(mesInicial("2026-13-01")).toBe(MES_ATUAL);
  });

  it("nunca devolve algo que renderize NaN", () => {
    for (const entrada of ["", null, undefined, "x", "2026", "2026-99-99"]) {
      const [ano, m] = mesInicial(entrada).split("-").map(Number);
      expect(Number.isInteger(ano)).toBe(true);
      expect(m >= 1 && m <= 12).toBe(true);
    }
  });
});

describe("conversão de data (regressão)", () => {
  it("ISO → BR e BR → ISO continuam de pé", () => {
    expect(paraBr("2026-08-27")).toBe("27/08/2026");
    expect(paraIso("27082026")).toBe("2026-08-27");
    expect(paraIso("31022026")).toBeNull();
  });
});
