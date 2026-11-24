import type { Repository } from "@/lib/data/repository";

/**
 * O ANEXO ENTRA NO HISTÓRICO NA HORA EM QUE CHEGA; o conteúdo lido entra depois.
 *
 * Transcrever um áudio ou ler uma foto leva de 3 a 20 segundos, e a mensagem só era
 * gravada no fim. Quem mandava a foto e logo em seguida "é o meu passaporte" tinha o texto
 * gravado ANTES, respondido sem a foto, e a foto respondida depois — duas respostas, a
 * primeira errada. E se a função morresse no meio, a mensagem da pessoa sumia.
 */
export const MARCA_DE_PENDENTE = "[Este arquivo acabou de chegar e o conteúdo ainda não foi lido. Não comente o conteúdo e não peça para reenviar.]";

export const conteudoPendente = (nome: string, legenda?: string | null) =>
  [`📎 Arquivo recebido: ${nome}`, legenda ? `Legenda do cliente: ${legenda}` : "", MARCA_DE_PENDENTE].filter(Boolean).join("\n");

/** Depois disto, a leitura morreu (a função tem 60 s): não se espera por ela. */
const VALIDADE_MS = 45_000;

/**
 * Espera os arquivos desta conversa serem lidos, até o limite. Quem espera é o turno que
 * vai responder — o limite existe porque ele também tem os 60 s dele.
 */
export async function esperarAnexos(
  repo: Pick<Repository, "listMessages">,
  conversationId: string,
  p: { limiteMs?: number; intervaloMs?: number } = {},
): Promise<void> {
  const ate = Date.now() + (p.limiteMs ?? 15_000);
  for (;;) {
    const pendente = (await repo.listMessages(conversationId)).some(
      (m) =>
        m.role === "user" &&
        m.content.includes(MARCA_DE_PENDENTE) &&
        Date.now() - new Date(m.createdAt).getTime() < VALIDADE_MS,
    );
    if (!pendente || Date.now() >= ate) return;
    await new Promise((r) => setTimeout(r, p.intervaloMs ?? 1_500));
  }
}
