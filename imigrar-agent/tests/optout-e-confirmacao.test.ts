import { it, expect } from "vitest";
import { detectarOptOut } from "@/lib/agent/opt-out";
import { PEDIDO_DE_CONFIRMACAO } from "@/lib/agent/transfer-gate";
it("os casos da revisão: falsos positivos fora, pedidos reais dentro", () => {
  for (const t of ["espero não perturbar, preciso de ajuda", "meu patrão ficou com meu passaporte e eu vou denunciar", "como faço pra tirar meu nome da lista?"]) expect(detectarOptOut(t), t).toBeNull();
  for (const t of ["dejen de enviarme mensajes", "please stop messaging me", "arrêtez de m'envoyer des messages", "não me perturbe", "vou denunciar!", "me tira da lista", "quero ser removido da lista"]) expect(detectarOptOut(t), t).toBe("bloquear");
  for (const t of ["¿Me confirmas de qué país eres?", "Would you like to tell me more about it?", "Posso pedir para você me contar o que aconteceu?", "May I ask where you are now?"]) expect(PEDIDO_DE_CONFIRMACAO.test(t), t).toBe(false);
  for (const t of ["Posso pedir para o time jurídico falar com você?", "Posso passar o seu contato?", "¿Puedo pasar tu contacto al equipo?", "Would you like me to pass your case to our team?", "May I ask our team to contact you?"]) expect(PEDIDO_DE_CONFIRMACAO.test(t), t).toBe(true);
});

it("a terceira revisão: relato não é pedido de parar, e passar informação não é passar o contato", () => {
  for (const t of [
    "Mi jefe no me deja en paz y no quiero recibir más mensajes de él, necesito ayuda con mi visa",
    "I told my employer stop texting me, but he keeps my passport. I need help.",
    "Please don't text me, call me instead",
    "don't contact me before monday",
    "how do I unsubscribe from the university course? I need a visa",
    "je veux me désinscrire de l'université",
    "a patroa ficou com meu passaporte. Ela não me deixa em paz, preciso de ajuda.",
  ]) expect(detectarOptOut(t), t).toBeNull();
  for (const t of ["please stop texting me", "don't message me anymore", "unsubscribe", "me deixa em paz"]) {
    expect(detectarOptOut(t), t).toBe("bloquear");
  }
  expect(PEDIDO_DE_CONFIRMACAO.test("Posso passar para você algumas informações sobre o visto?")).toBe(false);
  expect(PEDIDO_DE_CONFIRMACAO.test("Poderia pedir ao time jurídico para falar com você?")).toBe(true);
  expect(PEDIDO_DE_CONFIRMACAO.test("Posso encaminhar o seu caso para o time?")).toBe(true);
});
