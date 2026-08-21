import { describe, it, expect } from "vitest";
import { proximoAtendimento, agoraEmBrasilia } from "@/lib/agent/expediente";

// Todas as datas abaixo são UTC (o "Z"), de propósito: em produção o processo roda em
// UTC e era daí que vinha o erro — às 22h de sexta no Rio, `new Date().getDay()` já
// dizia sábado, e a Shayene mandava o cliente esperar até segunda sem motivo.
const utc = (s: string) => new Date(s);

describe("relógio de Brasília", () => {
  it("lê o dia e a hora no fuso do Rio, não no do servidor", () => {
    // 01h de sábado em UTC = 22h de SEXTA no Rio.
    const r = agoraEmBrasilia(utc("2026-08-22T01:00:00Z"));
    expect(r.diaSemana).toBe(5);
    expect(r.hora).toBe(22);
  });
});

describe("próximo atendimento humano", () => {
  it("dentro do expediente, é agora", () => {
    // Segunda, 14h no Rio.
    const r = proximoAtendimento(utc("2026-08-17T17:00:00Z"));
    expect(r.dentroDoExpediente).toBe(true);
    expect(r.quando).toBe("agora");
  });

  it("domingo não tem ninguém — o retorno é na segunda", () => {
    const r = proximoAtendimento(utc("2026-08-16T18:00:00Z")); // domingo, 15h no Rio
    expect(r.dentroDoExpediente).toBe(false);
    expect(r.quando).toBe("na segunda-feira a partir das 8h");
  });

  it("sábado à tarde também espera a segunda", () => {
    expect(proximoAtendimento(utc("2026-08-15T17:00:00Z")).quando).toBe(
      "na segunda-feira a partir das 8h",
    );
  });

  it("sexta depois das 18h espera a segunda (e não 'amanhã')", () => {
    const r = proximoAtendimento(utc("2026-08-22T01:00:00Z")); // sexta, 22h no Rio
    expect(r.quando).toBe("na segunda-feira a partir das 8h");
  });

  // Nunca "amanhã": a mensagem fica parada no WhatsApp e pode ser lida no dia seguinte.
  it("terça à noite, nomeia a quarta", () => {
    expect(proximoAtendimento(utc("2026-08-19T00:00:00Z")).quando).toBe(
      "na quarta-feira a partir das 8h",
    ); // terça, 21h no Rio
  });

  it("dia útil antes de abrir, o time chega hoje mesmo", () => {
    expect(proximoAtendimento(utc("2026-08-17T09:00:00Z")).quando).toBe(
      "hoje a partir das 8h",
    ); // segunda, 6h no Rio
  });
});
