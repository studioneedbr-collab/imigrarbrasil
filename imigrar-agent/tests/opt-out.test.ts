import { describe, it, expect } from "vitest";
import { detectarOptOut, MENSAGEM_DESPEDIDA } from "@/lib/agent/opt-out";

// O custo dos dois erros aqui é MUITO diferente, e é isso que define a régua:
// deixar passar um "para de me mandar mensagem" custa um Bloquear + Denunciar (que é o
// que derruba o número no WhatsApp); silenciar um lead por engano custa uma venda.
// Por isso o detector é conservador: exige a frase inteira, nunca uma palavra solta.
describe("detectarOptOut — pedidos explícitos de parar (silêncio total)", () => {
  const bloquear = [
    "para de me mandar mensagem",
    "Pare de mandar mensagens por favor",
    "parem de me enviar isso",
    "não quero mais receber mensagens de vocês",
    "nao quero receber nada de voces",
    "não me manda mais nada",
    "nao me mande mais mensagem",
    "me tira dessa lista",
    "quero ser removido da lista",
    "me descadastra",
    "descadastrar",
    "me deixa em paz",
    "para de me perturbar",
    "não perturbe mais",
    "vou bloquear esse número",
    "vou denunciar vocês",
    "isso é spam",
    "STOP",
  ];
  for (const texto of bloquear) {
    it(`bloqueia: "${texto}"`, () => {
      expect(detectarOptOut(texto)).toBe("bloquear");
    });
  }
});

describe("detectarOptOut — desinteresse (só corta o follow-up, não silencia)", () => {
  const semFollowup = [
    "não tenho interesse",
    "nao temos interesse no momento",
    "sem interesse, obrigado",
    "já contratei outra empresa",
    "ja fechamos com outro fornecedor",
    "obrigado, já resolvi",
    "não quero mais",
  ];
  for (const texto of semFollowup) {
    it(`corta follow-up: "${texto}"`, () => {
      expect(detectarOptOut(texto)).toBe("sem_followup");
    });
  }
});

// Estes são os falsos positivos que custariam venda. Todos falam de "parar", "cancelar",
// "sair" ou "não querer" — mas sobre o NEGÓCIO, não sobre receber mensagem.
describe("detectarOptOut — não confunde assunto de negócio com pedido de parar", () => {
  const conversaNormal = [
    "quero cancelar o contrato que tenho com outra empresa",
    "não quero mais o serviço de portaria, quero limpeza mesmo",
    "o funcionário vai sair às 18h",
    "pode me mandar mensagem quando tiver o orçamento",
    "parar o serviço em janeiro é possível?",
    "não quero mais de 3 postos por enquanto",
    "quantos dias a pessoa para para o almoço?",
    "manda a proposta por favor",
    "sair do prédio depois das 22h tem adicional?",
    "preciso de 2 ASG para o meu condomínio",
    "bom dia",
    "",
  ];
  for (const texto of conversaNormal) {
    it(`deixa passar: "${texto}"`, () => {
      expect(detectarOptOut(texto)).toBeNull();
    });
  }
});

describe("detectarOptOut — precedência", () => {
  it("pedido explícito de parar vence desinteresse na mesma mensagem", () => {
    expect(detectarOptOut("não tenho interesse, para de me mandar mensagem")).toBe("bloquear");
  });

  it("a despedida existe e não promete retorno nenhum", () => {
    expect(MENSAGEM_DESPEDIDA.length).toBeGreaterThan(10);
    expect(MENSAGEM_DESPEDIDA).not.toMatch(/retorno|entro em contato|volto a falar/i);
  });
});
