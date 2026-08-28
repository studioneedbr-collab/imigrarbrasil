// O MODO SOMBRA NÃO TOCA NO MUNDO.
//
// A promessa do modo, na §8 do PROJETO.md, é "nada é enviado, e a resposta que a Ana daria
// fica gravada para revisão". Ela não era cumprida: `respondToConversation` protegia três
// coisas — não gravava a resposta, não mudava o status, não mexia no relógio — e o flag
// `sombra` PARAVA ALI. As tools rodavam normalmente, e duas delas falam para fora:
//
//   transferir_para_humano  →  sendMessage() para o WhatsApp do advogado (TEAM_WHATSAPP)
//   agendar_followup        →  agenda mensagem que o cron entrega À PESSOA horas depois
//
// Um ensaio acordava o time e marcava um envio para o cliente. E dá para cair em sombra
// sem ninguém escolher: instância não reconhecida vira sombra por segurança
// (`decidirAtendimento`), então um webhook apontado para o lugar errado passava a falar
// com gente por um canal que o painel nem sabia qual era.
//
// Estes testes exercitam os TRÊS caminhos que chegam à tool — o modelo, o motor
// determinístico e a rede anti-repetição —, porque corrigir só um empurra o problema
// para o seguinte.

import { describe, it, expect, beforeEach, vi } from "vitest";

// O envio é espionado, não executado. É o que torna a afirmação "não enviou" verificável:
// sem o mock, o envio cairia no caminho simulado (sem credencial) e o teste passaria
// mesmo com o código mandando mensagem.
vi.mock("@/lib/whatsapp/send", () => ({
  sendMessage: vi.fn(async () => {}),
  sendButtons: vi.fn(async () => {}),
  sendDocument: vi.fn(async () => {}),
}));

import { executeTool } from "@/lib/agent/tools";
import { sendMessage } from "@/lib/whatsapp/send";
import { getRepository } from "@/lib/data";

const repo = getRepository();

/** Uma conversa com ficha suficiente para o portão de encaminhamento liberar. */
async function conversaComCaso() {
  const conv = await repo.getOrCreateConversation(
    `55119${Math.floor(Math.random() * 100000000)}`,
    "Teste Sombra",
  );
  // Texto com sinal de caso jurídico: é o que faz o portão liberar sem ficha completa.
  await repo.addMessage(conv.id, "user", "recebi uma notificação e o prazo está correndo");
  return conv;
}

beforeEach(() => {
  vi.mocked(sendMessage).mockClear();
});

describe("transferir_para_humano em sombra", () => {
  it("NÃO manda WhatsApp para a equipe", async () => {
    const conv = await conversaComCaso();
    await executeTool(
      "transferir_para_humano",
      { conversation_id: conv.id, reason: "prazo correndo", summary: "ensaio" },
      { sombra: true },
    );
    expect(vi.mocked(sendMessage)).not.toHaveBeenCalled();
  });

  it("NÃO marca a conversa como transferida no painel", async () => {
    const conv = await conversaComCaso();
    await executeTool(
      "transferir_para_humano",
      { conversation_id: conv.id, reason: "prazo correndo", summary: "ensaio" },
      { sombra: true },
    );
    const depois = await repo.getConversation(conv.id);
    expect(depois?.status).not.toBe("transferred");
    expect(depois?.handedOffTo ?? null).toBeNull();
  });

  it("mesmo assim responde ok — o rascunho tem de ser o que ela escreveria de verdade", async () => {
    // Se a tool respondesse `ok: false` em sombra, a Ana escreveria a mensagem de quem
    // NÃO conseguiu encaminhar. O rascunho deixaria de ser um ensaio e viraria ficção.
    const conv = await conversaComCaso();
    const r = (await executeTool(
      "transferir_para_humano",
      { conversation_id: conv.id, reason: "prazo correndo", summary: "ensaio" },
      { sombra: true },
    )) as { ok?: boolean; sombra?: boolean };
    expect(r.ok).toBe(true);
    expect(r.sombra).toBe(true);
  });

  it("fora de sombra continua avisando a equipe e marcando a conversa", async () => {
    // O contraste é o que prova que o teste acima mede alguma coisa.
    const conv = await conversaComCaso();
    await repo.setConfig("setor_notify", { comercial: "5511999999999" });
    // `setor` explícito: o número do aviso sai de `setor_notify[setor]`, e sem setor ele
    // cairia em `TEAM_WHATSAPP` — vazia no ambiente de teste. Sem isto o contraste não
    // provaria nada, porque o "não enviou" do caso de sombra seria o mesmo "não enviou"
    // de quem não tinha para quem enviar.
    await executeTool("transferir_para_humano", {
      conversation_id: conv.id,
      reason: "prazo correndo",
      summary: "de verdade",
      setor: "comercial",
    });
    expect(vi.mocked(sendMessage)).toHaveBeenCalled();
    const depois = await repo.getConversation(conv.id);
    expect(depois?.status).toBe("transferred");
    await repo.setConfig("setor_notify", {});
  });
});

describe("agendar_followup em sombra", () => {
  it("NÃO agenda a mensagem que o cron entregaria à pessoa", async () => {
    const conv = await conversaComCaso();
    const r = (await executeTool(
      "agendar_followup",
      { conversation_id: conv.id, message: "oi, tudo bem?", delay_hours: 24 },
      { sombra: true },
    )) as { ok?: boolean; sombra?: boolean; followup_id?: string };

    expect(r.ok).toBe(true);
    expect(r.sombra).toBe(true);
    // Sem id porque nada foi criado — o campo é a diferença entre agendado e ensaiado.
    expect(r.followup_id).toBeUndefined();

    const pendentes = await repo.listPendingFollowups();
    expect(pendentes.some((f) => f.conversationId === conv.id)).toBe(false);
  });

  it("fora de sombra agenda de verdade", async () => {
    const conv = await conversaComCaso();
    const r = (await executeTool("agendar_followup", {
      conversation_id: conv.id,
      message: "oi, tudo bem?",
      delay_hours: 24,
    })) as { followup_id?: string };
    expect(r.followup_id).toBeTruthy();
  });
});

describe("as tools que PODEM rodar em sombra continuam rodando", () => {
  it("registrar_dados_lead grava a ficha — ela não sai do sistema e ajuda quem revisa", async () => {
    const conv = await conversaComCaso();
    // Os nomes são os do schema da tool (`contact_name`, `client_type`), não os do
    // domínio. `leadSchema` é `.passthrough()`, então campo com nome errado passa na
    // validação e é ignorado no mapeamento — em silêncio.
    await executeTool(
      "registrar_dados_lead",
      { conversation_id: conv.id, contact_name: "Édgar", client_type: "Bolívia" },
      { sombra: true },
    );
    const lead = await repo.getLeadByConversation(conv.id);
    expect(lead?.contactName).toBe("Édgar");
  });
});
