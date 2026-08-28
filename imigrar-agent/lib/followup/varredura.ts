// A VARREDURA DA ESPERA — o laço que transforma decisão em ação.
//
// Ele não decide nada. Toda a regra vive em lib/followup/regras.ts, pura e testada; aqui é
// a parte suja: ler o banco, mandar o WhatsApp, gravar o que aconteceu. A separação é o
// que permite testar "caso com prazo processual nunca entra em follow-up automático" sem
// subir banco, sem relógio falso e sem mock de Z-API.
//
// O QUE ACONTECE COM CADA DECISÃO:
//
//   disparar/rascunho   escreve o texto e deixa na fila do responsável
//   disparar/automatico manda na hora, conta o toque e agenda o próximo
//   tarefa_ligar        vira tarefa: prazo processual se resolve por LIGAÇÃO, nunca por
//                       mensagem programada
//   tarefa_manual       vira tarefa: não existe modelo no idioma da pessoa, e mandar em
//                       outra língua destrói o produto
//   encerrar_sumiu      fecha o caso como perdido/"sumiu", com uma última mensagem
//   adiar               não faz nada; o toque continua devendo e sai na próxima passagem
//   bloqueado           tira o caso da régua para sempre (opt-out, DPU, encerrado…)
//
// VIVE AQUI, E NÃO DENTRO DA ROTA, por um motivo prosaico e decisivo: o plano Hobby da
// Vercel aceita poucos cron jobs, e um deploy recusado por causa de uma linha a mais no
// vercel.json é um follow-up que nunca sai. Sendo função, ela roda tanto na própria rota
// (útil para chamar à mão) quanto pendurada no cron que já existe.
//
// ANTIBAN: o espaçamento entre envios é o mesmo do cron irmão (lib/whatsapp/janela.ts) —
// uma mensagem por vez, com intervalo variável. Cadência fixa é padrão de robô, e é
// detectável.

import type { Repository } from "@/lib/data/repository";
import { sendMessage } from "@/lib/whatsapp/send";
import { novaRodada } from "@/lib/whatsapp/janela";
import { ehEnsaio } from "@/lib/domain/ambiente";
import { decidir, type CasoEmEspera, type Decisao } from "@/lib/followup/regras";
import {
  MOTIVO_ESPERA_LABEL,
  proximoToqueSugerido,
  type MotivoEspera,
} from "@/lib/followup/motivos";
import { despedidaDaSequencia, escolherModelo, textoDoToque } from "@/lib/followup/modelos";

export interface ResultadoDaVarredura {
  examinados: number;
  [contagem: string]: number;
}

export async function varrerEspera(
  repo: Repository,
  agora: Date = new Date(),
): Promise<ResultadoDaVarredura> {
  const rodada = novaRodada();
  const rodada = novaRodada();

  const [vencidos, modelos, instancias, pendentes] = await Promise.all([
    repo.listLeadsComToqueVencido(agora).catch(() => []),
    repo.listModelosFollowup().catch(() => []),
    repo.listInstancias().catch(() => []),
    repo.listToquesPendentes().catch(() => []),
  ]);

  // Um rascunho já esperando aprovação vale por todos: gerar outro a cada passagem do
  // cron encheria a fila do responsável com o mesmo recado, e a fila deixaria de ser
  // legível exatamente para quem precisa dela.
  const jaTemRascunho = new Set(
    pendentes.filter((t) => t.status === "rascunho").map((t) => t.leadId).filter(Boolean) as string[],
  );

  const tetoPorInstancia = new Map(instancias.map((i) => [i.id, tetoDe(i)]));
  const enviadosHoje = new Map<string | null, number>();

  const contagem: Record<string, number> = {};
  const conta = (k: string) => (contagem[k] = (contagem[k] ?? 0) + 1);

  for (const lead of vencidos) {
    try {
      const conv = await repo.getConversation(lead.conversationId);
      if (!conv) continue;
      const instanciaId = conv.instanciaId ?? null;

      if (!enviadosHoje.has(instanciaId)) {
        enviadosHoje.set(
          instanciaId,
          await repo.contarToquesEnviadosHoje(instanciaId, agora).catch(() => 0),
        );
      }

      const motivo = lead.esperaMotivo as MotivoEspera | null;
      const modelo = motivo ? escolherModelo(modelos, motivo, conv.idioma) : null;

      // A PESSOA JÁ RESPONDEU ALGUMA VEZ? Disparar para quem nunca respondeu é a
      // assinatura mais clara de disparo em massa que existe — e é o padrão que os
      // classificadores do WhatsApp procuram.
      const mensagens = await repo.listMessages(lead.conversationId).catch(() => []);
      const jaRespondeuAlguma = mensagens.some((m) => m.role === "user");

      const caso: CasoEmEspera = {
        motivo,
        proximoToqueEm: lead.proximoToqueEm ?? null,
        toquesNoMotivo: lead.toquesNoMotivo ?? 0,
        ultimoToqueEm: ultimoEnvio(await repo.listToques(lead.id).catch(() => [])),
        optOutAt: conv.optOutAt ?? null,
        noFollowupAt: conv.noFollowupAt ?? null,
        jaRespondeuAlguma,
        temPrazoProcessual: Boolean(lead.temPrazoCorrendo || lead.prazoDataLimite),
        perfilDpu: lead.classificacao === "DPU",
        ensaio: ehEnsaio(conv.whatsappNumber) || conv.ambiente === "teste",
        encerrado: lead.atendimentoStatus === "fechado" || lead.atendimentoStatus === "perdido",
        noExterior: lead.localizacao === "exterior",
        temModeloNoIdioma: Boolean(modelo),
        envioDoModelo: modelo?.envio,
      };

      const decisao = decidir(
        caso,
        {
          enviadosHoje: enviadosHoje.get(instanciaId) ?? 0,
          tetoDiario: (instanciaId && tetoPorInstancia.get(instanciaId)) || TETO_PADRAO,
        },
        agora,
      );
      conta(rotuloDaDecisao(decisao));

      if (decisao.tipo === "adiar") continue;

      if (decisao.tipo === "bloqueado") {
        // Sai da régua. Não é um erro nem um adiamento: é um caso que nunca mais recebe
        // mensagem automática, e mantê-lo na varredura seria relê-lo todo dia para nada.
        await repo.updateLead(lead.id, { proximoToqueEm: null });
        continue;
      }

      if (decisao.tipo === "encerrar_sumiu") {
        const despedida = despedidaDaSequencia(conv.idioma);
        // Sem idioma conhecido o caso fecha EM SILÊNCIO. Uma despedida na língua errada é
        // pior do que despedida nenhuma: é a confirmação, na última mensagem, de que o
        // escritório nunca soube com quem estava falando.
        if (despedida && conv.whatsappNumber && !ehEnsaio(conv.whatsappNumber) && rodada.podeMais()) {
          await sendMessage(conv.whatsappNumber, despedida);
          await repo.addMessage(conv.id, "assistant", despedida);
          await rodada.registrarEnvio();
        }
        await repo.updateLead(lead.id, {
          atendimentoStatus: "perdido",
          motivoPerdaCategoria: "sumiu",
          motivoPerda: `Sem resposta após ${lead.toquesNoMotivo ?? 0} toques — ${
            motivo ? MOTIVO_ESPERA_LABEL[motivo] : "espera sem motivo"
          }.`,
          proximoToqueEm: null,
          esperaMotivo: null,
        });
        continue;
      }

      // As duas TAREFAS: o sistema escreve o que precisa ser feito e um humano faz. O
      // caso sai da régua automática e volta a ela quando alguém repausar — senão o cron
      // produziria a mesma tarefa todo dia, e a fila deixaria de ser lida.
      if (decisao.tipo === "tarefa_ligar" || decisao.tipo === "tarefa_manual") {
        await repo.registrarToque({
          leadId: lead.id,
          conversationId: conv.id,
          instanciaId,
          motivo: motivo!,
          idioma: conv.idioma ?? null,
          modeloId: null,
          canal: decisao.tipo === "tarefa_ligar" ? "ligacao" : "manual",
          texto:
            decisao.tipo === "tarefa_ligar"
              ? "LIGAR. Há prazo processual correndo neste caso — prazo não se resolve com mensagem programada."
              : `ESCREVER À MÃO. Não existe modelo de "${motivo ? MOTIVO_ESPERA_LABEL[motivo] : "—"}" no idioma desta pessoa (${conv.idioma ?? "idioma não identificado"}).`,
          status: "tarefa",
          toque: (lead.toquesNoMotivo ?? 0) + 1,
        });
        await repo.updateLead(lead.id, { proximoToqueEm: null });
        continue;
      }

      // ─── DISPARAR ───
      if (!modelo || !motivo) continue;
      if (decisao.envio === "rascunho" && jaTemRascunho.has(lead.id)) continue;

      const texto = textoDoToque(modelo, {
        nome: conv.contactName ?? lead.contactName,
        servico: lead.propostaServico ?? lead.modalidadeProvavel,
        chave: lead.id,
        toque: (lead.toquesNoMotivo ?? 0) + 1,
      });

      if (decisao.envio === "rascunho") {
        await repo.registrarToque({
          leadId: lead.id,
          conversationId: conv.id,
          instanciaId,
          motivo,
          idioma: conv.idioma ?? null,
          modeloId: modelo.id,
          canal: "whatsapp",
          texto,
          status: "rascunho",
          toque: (lead.toquesNoMotivo ?? 0) + 1,
        });
        jaTemRascunho.add(lead.id);
        // O rascunho NÃO adianta o relógio nem conta o toque: nada foi para a pessoa
        // ainda. Quem aprova é que conta.
        continue;
      }

      if (!rodada.podeMais()) {
        conta("adiado_orcamento_da_rodada");
        continue;
      }
      if (!conv.whatsappNumber) continue;
      await sendMessage(conv.whatsappNumber, texto);
      await repo.addMessage(conv.id, "assistant", texto);
      await repo.registrarToque({
        leadId: lead.id,
        conversationId: conv.id,
        instanciaId,
        motivo,
        idioma: conv.idioma ?? null,
        modeloId: modelo.id,
        canal: "whatsapp",
        texto,
        status: "enviado",
        toque: (lead.toquesNoMotivo ?? 0) + 1,
        enviadoEm: new Date().toISOString(),
      });
      const proximo = proximoToqueSugerido(motivo, agora);
      await repo.updateLead(lead.id, {
        toquesNoMotivo: (lead.toquesNoMotivo ?? 0) + 1,
        // Sem cadência ("retomar depois") o caso sai da régua: a próxima data é a que a
        // PESSOA indicar, e o sistema não a inventa.
        proximoToqueEm: proximo ? proximo.toISOString() : null,
      });
      enviadosHoje.set(instanciaId, (enviadosHoje.get(instanciaId) ?? 0) + 1);
      await rodada.registrarEnvio();
    } catch (err) {
      console.error("[cron/espera] falha no caso", lead.id, err instanceof Error ? err.message : err);
      conta("erro");
    }
  }

  return { examinados: vencidos.length, ...contagem };
}

/** Teto padrão quando a instância não tem um configurado (ou não há instância). */
const TETO_PADRAO = 40;

function tetoDe(i: { tetoFollowupsDia?: number | null }): number {
  return i.tetoFollowupsDia && i.tetoFollowupsDia > 0 ? i.tetoFollowupsDia : TETO_PADRAO;
}

function ultimoEnvio(toques: { status: string; enviadoEm?: string | null }[]): string | null {
  const enviados = toques
    .filter((t) => t.status === "enviado" && t.enviadoEm)
    .map((t) => t.enviadoEm!)
    .sort();
  return enviados[enviados.length - 1] ?? null;
}

function rotuloDaDecisao(d: Decisao): string {
  return d.tipo === "adiar"
    ? `adiado_${d.porque}`
    : d.tipo === "bloqueado"
      ? `bloqueado_${d.porque}`
      : d.tipo === "disparar"
        ? `disparo_${d.envio}`
        : d.tipo;
}
