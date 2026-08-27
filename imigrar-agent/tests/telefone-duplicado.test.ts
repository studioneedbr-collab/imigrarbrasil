import { describe, it, expect, beforeEach } from "vitest";
import {
  normalizarTelefone,
  variantesDoTelefone,
  conversaParaReaproveitar,
  JANELA_DE_REAPROVEITAMENTO_DIAS,
} from "@/lib/whatsapp/telefone";
import { MemoryRepository } from "@/lib/data/memory-repository";

// Ana Rodríguez apareceu duas vezes na fila e duas vezes no quadro: uma como
// "Venezuela · Modalidade a definir" em EM ATENDIMENTO, outra como "venezolana · Saber
// qué hacer con una multa migratoria" em NOVO. Mesma pessoa, dois registros — e a multa
// correndo estava só num deles.

describe("a forma canônica do telefone", () => {
  it.each([
    ["+55 95 99123-4567", "5595991234567"],
    ["5595991234567", "5595991234567"],
    ["005595991234567", "5595991234567"],
    ["0055 95 99123 4567", "5595991234567"],
  ])("%j vira %j", (bruto, esperado) => {
    expect(normalizarTelefone(bruto)).toBe(esperado);
  });

  it("o simulador não é telefone e nunca deduplica", () => {
    expect(normalizarTelefone("sim:6f1c-…")).toBe("");
    expect(variantesDoTelefone("sim:6f1c-…")).toEqual([]);
  });
});

describe("o nono dígito é a mesma pessoa", () => {
  it("com e sem o 9 são variantes uma da outra", () => {
    expect(variantesDoTelefone("5595991234567")).toContain("559591234567");
    expect(variantesDoTelefone("559591234567")).toContain("5595991234567");
  });

  it("fora do Brasil não se inventa variante", () => {
    // Juntar duas pessoas numa conversa só é pior do que separar uma pessoa em duas.
    expect(variantesDoTelefone("584121234567")).toEqual(["584121234567"]);
  });
});

describe("qual conversa recebe a mensagem", () => {
  const agora = new Date("2026-08-27T12:00:00Z");
  const diasAtras = (d: number) =>
    new Date(agora.getTime() - d * 24 * 3600 * 1000).toISOString();

  it("reaproveita a conversa aberta mais recente", () => {
    const escolhida = conversaParaReaproveitar(
      [
        { id: "velha", status: "active", atividadeEm: diasAtras(10) },
        { id: "nova", status: "waiting", atividadeEm: diasAtras(2) },
      ],
      agora,
    );
    expect(escolhida?.id).toBe("nova");
  });

  it("não ressuscita conversa encerrada — quem pediu para parar recomeça do zero", () => {
    const escolhida = conversaParaReaproveitar(
      [{ id: "encerrada", status: "finished", atividadeEm: diasAtras(1) }],
      agora,
    );
    expect(escolhida).toBeNull();
  });

  it("fora da janela abre registro novo — seis meses depois é outro caso", () => {
    const escolhida = conversaParaReaproveitar(
      [
        {
          id: "antiga",
          status: "active",
          atividadeEm: diasAtras(JANELA_DE_REAPROVEITAMENTO_DIAS + 1),
        },
      ],
      agora,
    );
    expect(escolhida).toBeNull();
  });
});

describe("o repositório não cria o segundo registro da mesma pessoa", () => {
  let repo: MemoryRepository;
  beforeEach(() => {
    repo = new MemoryRepository();
  });

  it("as duas grafias caem na mesma conversa", async () => {
    const a = await repo.getOrCreateConversation("5595991234567", "Ana Rodríguez");
    const b = await repo.getOrCreateConversation("+55 95 99123-4567");
    expect(b.id).toBe(a.id);
  });

  it("com e sem o nono dígito caem na mesma conversa", async () => {
    const a = await repo.getOrCreateConversation("559591234567");
    const b = await repo.getOrCreateConversation("5595991234567");
    expect(b.id).toBe(a.id);
  });

  it("números diferentes continuam sendo pessoas diferentes", async () => {
    const a = await repo.getOrCreateConversation("5595991234567");
    const b = await repo.getOrCreateConversation("5595991234568");
    expect(b.id).not.toBe(a.id);
  });

  it("duas sessões do simulador continuam separadas", async () => {
    const a = await repo.getOrCreateConversation("sim:um");
    const b = await repo.getOrCreateConversation("sim:dois");
    expect(b.id).not.toBe(a.id);
  });
});
