// IDENTIFICADOR TÉCNICO NÃO PODE OCUPAR O LUGAR DO NOME.
//
// Conversas de ensaio e de roteiro não têm telefone: têm `sim:v2-28`, `cand:3`, `fb:12`.
// Isso aparecia no painel exatamente onde vai o nome da pessoa — no título da conversa,
// na linha da fila e nas iniciais do avatar, que viravam "SI" e "CA". Lê-se como dado
// corrompido. O telefone de verdade continua servindo de nome provisório (dá para ligar);
// o identificador interno não.

import { describe, expect, it } from "vitest";
import { AINDA_NAO, rotuloContato } from "@/lib/domain/rotulos";

describe("rótulo do contato", () => {
  it("usa o nome quando existe", () => {
    expect(rotuloContato({ contactName: "Ana Rodríguez", whatsappNumber: "5511999" })).toEqual({
      texto: "Ana Rodríguez",
      conhecido: true,
    });
  });

  it("cai no telefone FORMATADO quando não há nome, marcando que não é nome", () => {
    // Cru ("5511999998888") lia-se como código de sistema no lugar do nome. O card
    // precisa que ali se reconheça um número para o qual dá para ligar.
    expect(rotuloContato({ whatsappNumber: "5511999998888" })).toEqual({
      texto: "+55 11 99999-8888",
      conhecido: false,
    });
  });

  it("nunca mostra identificador de ensaio ou de roteiro como nome", () => {
    for (const id of ["sim:v2-28", "cand:3", "fb:12"]) {
      expect(rotuloContato({ whatsappNumber: id })).toEqual({
        texto: AINDA_NAO,
        conhecido: false,
      });
    }
  });

  it("o nome de verdade vence o identificador de ensaio", () => {
    expect(rotuloContato({ contactName: "Ibrahim", whatsappNumber: "sim:v2-28" })).toEqual({
      texto: "Ibrahim",
      conhecido: true,
    });
  });

  it("sem nome e sem número, devolve o traço", () => {
    expect(rotuloContato({})).toEqual({ texto: AINDA_NAO, conhecido: false });
    expect(rotuloContato({ contactName: "   ", whatsappNumber: "  " })).toEqual({
      texto: AINDA_NAO,
      conhecido: false,
    });
  });
});
