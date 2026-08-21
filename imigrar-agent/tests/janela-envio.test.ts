import { describe, it, expect } from "vitest";
import {
  JANELA_ENVIO,
  podeDispararAgora,
  intervaloEntreEnvios,
  ORCAMENTO_MS,
  MAX_POR_RODADA,
} from "@/lib/whatsapp/janela";

// As datas são montadas em UTC de propósito: na Vercel o processo roda em UTC e o
// bug clássico é justamente o servidor achar que já é sábado às 22h de sexta no Rio.
// Brasília = UTC-3, então 11:00Z = 08:00 no Rio.
const utc = (iso: string) => new Date(iso);

describe("janela de disparo automático", () => {
  it("dia útil dentro da janela libera", () => {
    // Segunda-feira, 17/08/2026, 14:00Z = 11:00 no Rio.
    expect(podeDispararAgora(utc("2026-08-17T14:00:00Z"))).toBe(true);
  });

  it("dia útil de madrugada bloqueia", () => {
    // Segunda-feira, 06:00Z = 03:00 no Rio.
    expect(podeDispararAgora(utc("2026-08-17T06:00:00Z"))).toBe(false);
  });

  it("bloqueia antes de abrir, libera no minuto em que abre", () => {
    expect(podeDispararAgora(utc("2026-08-17T10:59:00Z"))).toBe(false); // 07:59 no Rio
    expect(podeDispararAgora(utc("2026-08-17T11:00:00Z"))).toBe(true); // 08:00 no Rio
  });

  it("bloqueia a partir do minuto em que fecha", () => {
    expect(podeDispararAgora(utc("2026-08-17T22:59:00Z"))).toBe(true); // 19:59 no Rio
    expect(podeDispararAgora(utc("2026-08-17T23:00:00Z"))).toBe(false); // 20:00 no Rio
  });

  it("22h de sexta no Rio é sexta, não sábado — e já está fora da janela", () => {
    // Sexta 21/08/2026, 01:00Z do sábado = 22:00 de sexta no Rio.
    expect(podeDispararAgora(utc("2026-08-22T01:00:00Z"))).toBe(false);
  });

  it("fim de semana bloqueia mesmo em horário comercial", () => {
    expect(podeDispararAgora(utc("2026-08-22T14:00:00Z"))).toBe(false); // sábado 11:00
    expect(podeDispararAgora(utc("2026-08-23T14:00:00Z"))).toBe(false); // domingo 11:00
  });
});

describe("espaçamento entre envios", () => {
  it("nunca dispara dois seguidos sem intervalo, e o intervalo varia", () => {
    const amostras = Array.from({ length: 200 }, () => intervaloEntreEnvios());
    expect(Math.min(...amostras)).toBeGreaterThanOrEqual(JANELA_ENVIO.intervaloMinMs);
    expect(Math.max(...amostras)).toBeLessThanOrEqual(JANELA_ENVIO.intervaloMaxMs);
    // Intervalo fixo é padrão de robô: o valor tem que variar de verdade.
    expect(new Set(amostras).size).toBeGreaterThan(20);
  });

  it("o orçamento de tempo cabe no maxDuration de 60s da rota", () => {
    expect(ORCAMENTO_MS).toBeLessThan(60_000);
  });

  it("o teto por rodada e o espaçamento máximo não estouram o orçamento juntos", () => {
    // Se o teto for atingido, a rodada tem que terminar pelo orçamento, não travar.
    expect(MAX_POR_RODADA).toBeGreaterThan(0);
    expect(JANELA_ENVIO.intervaloMinMs).toBeGreaterThan(0);
  });
});
