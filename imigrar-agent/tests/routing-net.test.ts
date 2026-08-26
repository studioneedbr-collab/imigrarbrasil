import { describe, it, expect } from "vitest";
import { classifyRouting } from "@/lib/agent/routing-net";

// A rede perdeu os ramos "operacional" (colaborador alocado no prédio do cliente) e
// "departamento_pessoal" (folha de funcionário interno): eram da empresa de terceirização
// que originou este código. Sobrou o único caso que existe de verdade numa assessoria de
// imigração — alguém que escreve procurando VAGA aqui, e não ajuda com o próprio visto.
describe("classifyRouting — rede de segurança", () => {
  it("candidato: quer trabalhar NA ASSESSORIA", () => {
    expect(classifyRouting("tenho interesse em trabalhar aí com vocês")?.kind).toBe("candidato");
  });

  it("candidato: enviar currículo", () => {
    expect(classifyRouting("posso mandar meu currículo?")?.kind).toBe("candidato");
    expect(classifyRouting("posso mandar meu currículo?")?.setor).toBe("rh");
  });

  // A armadilha deste domínio: quem quer trabalhar NO BRASIL está pedindo atendimento de
  // imigração, não vaga de emprego. Se a rede confundisse os dois, metade do público real
  // cairia no funil de RH em vez de chegar ao time jurídico.
  it("quem quer trabalhar NO BRASIL não é candidato a vaga", () => {
    for (const msg of [
      "quero trabalhar no Brasil, como faço?",
      "posso trabalhar com esse visto?",
      "estou procurando emprego, preciso de documento para isso",
      "preciso de autorização de trabalho",
    ]) {
      expect(classifyRouting(msg)?.kind, msg).not.toBe("candidato");
    }
  });

  // O atendimento de imigração NUNCA pode cair na rede: quem tem um caso vai para o time
  // jurídico pelo caminho normal, não desviado para RH.
  it("atendimento de imigração → null", () => {
    for (const msg of [
      "meu visto venceu, o que eu faço?",
      "quero trazer minha esposa para o Brasil",
      "preciso pedir refúgio",
      "sou boliviano e quero regularizar minha residência",
    ]) {
      expect(classifyRouting(msg), msg).toBeNull();
    }
  });

  // O vocabulário da base herdada não classifica mais nada.
  it("vocabulário de terceirização não roteia nada", () => {
    expect(classifyRouting("preciso de 3 porteiros na Barra da Tijuca")).toBeNull();
    expect(classifyRouting("o porteiro não apareceu hoje")).toBeNull();
    expect(classifyRouting("meu salário não caiu esse mês")).toBeNull();
  });

  it("vazio → null", () => {
    expect(classifyRouting("")).toBeNull();
  });
});
