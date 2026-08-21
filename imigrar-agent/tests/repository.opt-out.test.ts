import { describe, it, expect, beforeEach } from "vitest";
import { MemoryRepository } from "@/lib/data/memory-repository";

// A detecção do pedido de parar não vale nada se a fila do cron continuar entregando o
// número. Aqui o que se testa é o outro lado: quem pediu silêncio SAI da varredura de
// follow-up. Era exatamente esse o furo — o lead pedia para parar e levava o lembrete
// automático 24h depois assim mesmo.
describe("opt-out corta o follow-up automático", () => {
  let repo: MemoryRepository;
  const ontem = () => new Date(Date.now() - 25 * 3600 * 1000).toISOString();

  beforeEach(() => {
    repo = new MemoryRepository();
  });

  /** Conversa parada há mais de 24h — exatamente o alvo do cron de follow-up. */
  async function conversaEsquecida(numero: string) {
    const c = await repo.getOrCreateConversation(numero, "Fulano");
    await repo.updateConversation(c.id, { status: "waiting", lastMessageAt: ontem() });
    return c;
  }

  it("sem opt-out, a conversa esquecida entra na fila", async () => {
    const c = await conversaEsquecida("5521999990001");
    const fila = await repo.getConversationsForFollowup();
    expect(fila.map((x) => x.id)).toContain(c.id);
  });

  it("quem pediu para parar sai da fila", async () => {
    const c = await conversaEsquecida("5521999990002");
    await repo.marcarOptOut(c.id, "bloquear");
    const fila = await repo.getConversationsForFollowup();
    expect(fila.map((x) => x.id)).not.toContain(c.id);
  });

  it("quem disse que não tem interesse também sai da fila", async () => {
    const c = await conversaEsquecida("5521999990003");
    await repo.marcarOptOut(c.id, "sem_followup");
    const fila = await repo.getConversationsForFollowup();
    expect(fila.map((x) => x.id)).not.toContain(c.id);
  });

  it("marcar um número não afeta os outros", async () => {
    const bloqueado = await conversaEsquecida("5521999990004");
    const normal = await conversaEsquecida("5521999990005");
    await repo.marcarOptOut(bloqueado.id, "bloquear");
    const fila = await repo.getConversationsForFollowup();
    expect(fila.map((x) => x.id)).toEqual([normal.id]);
  });

  it("o contato que volta a escrever pode ser liberado e volta à fila", async () => {
    const c = await conversaEsquecida("5521999990006");
    await repo.marcarOptOut(c.id, "bloquear");
    // É o que o webhook faz quando o próprio contato reabre a conversa: quem puxou
    // agora foi ele, então a Shayene pode falar de novo.
    await repo.updateConversation(c.id, { optOutAt: null, noFollowupAt: null });
    const fila = await repo.getConversationsForFollowup();
    expect(fila.map((x) => x.id)).toContain(c.id);
  });
});
