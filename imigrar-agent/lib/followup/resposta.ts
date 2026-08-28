// A PESSOA VOLTOU A FALAR — e isso zera a sequência.
//
// O contador de toques existe para que o follow-up tenha fim: três sem resposta e o caso
// vira PERDIDO com motivo "sumiu". Se ele não zerasse quando a pessoa responde, alguém
// que escreve a cada duas semanas dizendo "ainda estou esperando o consulado" seria
// encerrado como se tivesse sumido — exatamente a pessoa que está fazendo tudo certo.
//
// O MOTIVO DA ESPERA NÃO É APAGADO AQUI. Responder não quer dizer que a espera acabou:
// quase sempre a resposta é justamente sobre a espera ("o consulado marcou para março").
// Quem diz que o caso destravou é o humano, na tela — o sistema só reinicia o relógio.
//
// Isto vive fora do webhook porque é regra, não é plumbing: um dia haverá outra porta de
// entrada (e-mail, formulário), e a resposta terá de zerar a sequência do mesmo jeito.

import type { Repository } from "@/lib/data/repository";
import { proximoToqueSugerido, type MotivoEspera } from "@/lib/followup/motivos";

export async function registrarRespostaDoContato(
  repo: Repository,
  conversationId: string,
  agora: Date = new Date(),
): Promise<void> {
  const lead = await repo.getLeadByConversation(conversationId).catch(() => null);
  if (!lead) return;

  // Todo toque que estava esperando aprovação morre: ele foi escrito para o silêncio dela,
  // e mandá-lo agora seria responder a uma pergunta que ela não fez. O rascunho fica
  // gravado como cancelado — é dado sobre a régua, não lixo.
  const toques = await repo.listToques(lead.id).catch(() => []);
  const agoraISO = agora.toISOString();
  for (const t of toques) {
    if (t.status === "rascunho") {
      await repo.atualizarToque(t.id, { status: "cancelado" }).catch(() => {});
    } else if (t.status === "enviado" && !t.respondidoEm) {
      // O que fecha o par pergunta/resposta: é dele que sai a taxa de resposta por motivo
      // e por idioma — o número que diz se os modelos traduzidos estão bons.
      await repo.atualizarToque(t.id, { respondidoEm: agoraISO }).catch(() => {});
    }
  }

  if (!lead.esperaMotivo && !lead.toquesNoMotivo) return;

  const motivo = lead.esperaMotivo as MotivoEspera | null;
  const proximo = motivo ? proximoToqueSugerido(motivo, agora) : null;
  await repo
    .updateLead(lead.id, {
      toquesNoMotivo: 0,
      proximoToqueEm: proximo ? proximo.toISOString() : null,
    })
    .catch(() => {});
}
