import Link from "next/link";
import { Icon } from "@/components/dashboard/ui";
import { saudeEmCache } from "@/lib/operacao/saude";
import { fmtDate } from "@/components/dashboard/ui";
import { lerChaveGeral } from "@/lib/agent/estado";
import { faixaDaChaveGeral } from "@/lib/agent/ativacao";

/**
 * QUANDO A CAPTAÇÃO PARA, O PAINEL PRECISA GRITAR.
 *
 * Antes isto era um chip cinza no canto superior dizendo "WhatsApp desconectado". Um
 * alarme vestido de enfeite: se a instância cai às 9h, nenhum lead entra o dia todo e a
 * fila vazia parece calmaria. É o pior defeito que um painel de captação pode ter —
 * ele mente por omissão, e a mentira é tranquilizadora.
 *
 * Agora é uma faixa vermelha no topo de TODAS as telas, com a hora da última mensagem
 * recebida e o caminho para reconectar. E ela não aparece quando está tudo bem: alarme
 * permanente é decoração, e decoração é ignorada.
 *
 * O AGENTE DESLIGADO USA A MESMA FAIXA, de propósito.
 *
 * "Desligado" e "desconectado" são coisas diferentes — no primeiro caso as mensagens
 * continuam entrando —, mas a consequência para quem chega às 9h é a mesma: existe uma
 * coisa importante acontecendo que a tela precisa gritar. Um segundo canal visual, mais
 * discreto, seria o começo de alguém não perceber. Desligado vem primeiro porque é um
 * estado que ALGUÉM escolheu, e portanto alguém pode desfazer agora.
 */
export default async function FaixaAlerta() {
  const [saude, chave] = await Promise.all([
    saudeEmCache().catch(() => null),
    lerChaveGeral().catch(() => null),
  ]);

  const agenteDesligado = chave ? faixaDaChaveGeral(chave) : null;
  if (agenteDesligado) {
    return (
      <div
        role="alert"
        className="mb-5 overflow-hidden rounded-xl bg-ib-danger text-white shadow-[0_8px_24px_-12px_rgba(196,44,44,0.6)]"
      >
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="relative mt-0.5 flex h-2.5 w-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full rounded-full bg-white/70 motion-safe:animate-signal-ping" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">{agenteDesligado}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-white/90">
                As mensagens continuam chegando e sendo gravadas. Cada conversa que entrar
                fica esperando resposta humana, com o prazo correndo.
              </p>
            </div>
          </div>

          <Link
            href="/dashboard/sombra"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-ib-danger transition hover:bg-white/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <Icon name="chat" className="h-4 w-4" />
            Ver o que está esperando
          </Link>
        </div>
      </div>
    );
  }

  if (!saude?.captacaoParada) return null;

  const { ultimaMensagem } = saude;

  return (
    <div
      role="alert"
      className="mb-5 overflow-hidden rounded-xl bg-ib-danger text-white shadow-[0_8px_24px_-12px_rgba(196,44,44,0.6)]"
    >
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="relative mt-0.5 flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full rounded-full bg-white/70 motion-safe:animate-signal-ping" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {saude.ia.configurado && !saude.ia.funcionando
                ? "O agente não está pensando"
                : "A captação está parada"}
            </p>
            <p className="mt-0.5 text-sm leading-relaxed text-white/90">
              {saude.motivo}{" "}
              {saude.ia.configurado && !saude.ia.funcionando ? (
                <>As conversas continuam sendo respondidas, mas pelo caminho determinístico — ela acolhe e encaminha, sem conduzir.</>
              ) : ultimaMensagem.em ? (
                <>Última mensagem recebida em {fmtDate(ultimaMensagem.em)}.</>
              ) : (
                <>Nenhuma mensagem foi recebida até agora.</>
              )}
            </p>
          </div>
        </div>

        <Link
          href="/dashboard/integracoes"
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-ib-danger transition hover:bg-white/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <Icon name="plug" className="h-4 w-4" />
          {saude.ia.configurado && !saude.ia.funcionando ? "Ver a conta da IA" : "Reconectar o WhatsApp"}
        </Link>
      </div>
    </div>
  );
}
