import { describe, it, expect } from "vitest";
import { extractSlots, parseCount, TRANSFER_TRIGGER } from "@/lib/agent/qualification";

describe("extractSlots", () => {
  it("reconhece serviço a partir de sinônimos", () => {
    expect(extractSlots("preciso de limpeza").service).toBe("Auxiliar de Serviços Gerais");
    expect(extractSlots("quero um porteiro").service).toBe("Porteiro");
    expect(extractSlots("recepcionista para o prédio").service).toBe("Recepcionista");
    expect(extractSlots("operador de piscina").service).toBe("Operador de Piscina");
  });

  it("extrai número de funcionários em várias formas", () => {
    expect(extractSlots("2 auxiliares de serviços gerais").employees).toBe(2);
    expect(extractSlots("preciso de 5 funcionários").employees).toBe(5);
    expect(extractSlots("seriam uns 3 porteiros").employees).toBe(3);
  });

  it("extrai CNPJ com ou sem formatação", () => {
    expect(extractSlots("nosso CNPJ é 18.623.185/0001-56").cnpj).toBe("18.623.185/0001-56");
    expect(extractSlots("cnpj 18623185000156").cnpj).toBe("18623185000156");
  });

  it("extrai nome e empresa", () => {
    const s = extractSlots("Olá, meu nome é Cassio, sou do Condomínio Dom José");
    expect(s.name).toBe("Cassio");
    expect(s.company).toContain("José");
  });

  it("NÃO extrai empresa de 'outra empresa' (falso positivo)", () => {
    expect(extractSlots("por que escolher a shine e nao outra empresa   achei caro").company).toBeUndefined();
    expect(extractSlots("já tenho outra empresa boa").company).toBeUndefined();
  });

  it("reconhece bairro como região", () => {
    expect(extractSlots("o prédio fica em Botafogo").region).toBe("Botafogo");
  });

  it("extrai email e múltiplos serviços", () => {
    const s = extractSlots("preciso de limpeza e portaria, meu email é joao@empresa.com.br");
    expect(s.email).toBe("joao@empresa.com.br");
    expect(s.servicesAll).toContain("Porteiro");
    expect(s.servicesAll).toContain("Auxiliar de Serviços Gerais");
  });

  it("mapeia urgência", () => {
    expect(extractSlots("preciso para já, é urgente").urgency).toBe("immediate");
    expect(extractSlots("pode ser mês que vem").urgency).toBe("medium");
  });

  it("acumula slots ao longo da conversa (texto concatenado)", () => {
    const conversa = "preciso de limpeza   somos a empresa Alfa   uns 4 postos";
    const s = extractSlots(conversa);
    expect(s.service).toBe("Auxiliar de Serviços Gerais");
    expect(s.company).toContain("Alfa");
    expect(s.employees).toBe(4);
  });

  it("parseCount lê dígitos e números por extenso, ignorando aspas", () => {
    expect(parseCount("2")).toBe(2);
    expect(parseCount("'2'")).toBe(2);
    expect(parseCount("dois")).toBe(2);
    expect(parseCount("'dois")).toBe(2);
    expect(parseCount("uns dez")).toBe(10);
    expect(parseCount("não sei")).toBeUndefined();
  });

  it("TRANSFER_TRIGGER detecta assuntos de humano", () => {
    expect(TRANSFER_TRIGGER.test("tenho uma questão trabalhista")).toBe(true);
    expect(TRANSFER_TRIGGER.test("quero falar com um humano")).toBe(true);
    expect(TRANSFER_TRIGGER.test("preciso de limpeza")).toBe(false);
  });
});
