// A SAÚDE DA OPERAÇÃO.
//
// A fila vazia é ambígua, e essa ambiguidade é o defeito mais caro que um painel destes
// pode ter: pode ser um dia tranquilo, ou pode ser que a instância do WhatsApp caiu às
// 9h e nenhuma mensagem entrou desde então. As duas coisas parecem exatamente iguais na
// tela — calma.
//
// Este módulo existe para desfazer essa ambiguidade. Ele não decora o painel com
// indicadores: ele responde uma pergunta, "a captação está funcionando?", e quando a
// resposta é não, isso vira a coisa mais visível da tela até alguém resolver.

import { getRepository } from "@/lib/data";
import { statusDoWhatsapp, type StatusWhatsapp } from "@/lib/whatsapp/status";
import { estadoDaIa, type EstadoDaIa } from "@/lib/agent/saldo";
import { HORAS_SEM_MENSAGEM_ALARME, dentroDoExpediente } from "@/lib/operacao/limites";

export interface SaudeDaOperacao {
  /** Quando true, o painel inteiro mostra a faixa vermelha. */
  captacaoParada: boolean;
  /** Uma frase dizendo o que está errado. Vai direto para a faixa. */
  motivo: string | null;
  whatsapp: StatusWhatsapp;
  /**
   * A Ana está pensando, ou virou um menu? Chave presente não é chave funcionando —
   * e a diferença não aparece em lugar nenhum sem isto.
   */
  ia: EstadoDaIa;
  ultimaMensagem: { em: string | null; haMinutos: number | null };
  falhas24h: { transcricao: number; deepseek: number };
  /** Lembretes cuja data já passou e ninguém tratou. */
  lembretesVencidos: number;
  conferidoEm: string;
}

function minutosDesde(iso: string | null, agora: Date): number | null {
  if (!iso) return null;
  const ms = agora.getTime() - Date.parse(iso);
  return Number.isFinite(ms) ? Math.floor(ms / 60_000) : null;
}

/**
 * Cache curto, em memória do processo.
 *
 * Esta leitura roda em TODA página do painel, e uma delas é uma chamada de rede à Z-API.
 * Sem cache, cada navegação pagaria esse ida-e-volta. Trinta segundos é curto o bastante
 * para o alarme continuar sendo um alarme e longo o bastante para o painel não ficar
 * pendurado na Z-API o dia inteiro.
 */
let cache: { em: number; valor: SaudeDaOperacao } | null = null;
const CACHE_MS = 30_000;

export async function saudeEmCache(): Promise<SaudeDaOperacao> {
  const agora = Date.now();
  if (cache && agora - cache.em < CACHE_MS) return cache.valor;
  const valor = await lerSaudeDaOperacao();
  cache = { em: agora, valor };
  return valor;
}

export async function lerSaudeDaOperacao(agora: Date = new Date()): Promise<SaudeDaOperacao> {
  const repo = getRepository();
  const ontem = new Date(agora.getTime() - 24 * 3600_000).toISOString();
  const hoje = agora.toISOString().slice(0, 10);

  // Tudo em paralelo, e cada consulta com seu próprio catch: esta função roda em TODA
  // página do painel. Se o alarme ficar lento ou quebrar, ele leva o painel junto — e um
  // indicador de saúde que derruba a operação é uma piada de mau gosto.
  const [whatsapp, ia, recentes, falhasTranscricao, falhasDeepseek, lembretes] = await Promise.all([
    statusDoWhatsapp().catch(
      (): StatusWhatsapp => ({ configurado: false, conectado: false, detalhe: "Falha ao conferir a conexão." }),
    ),
    estadoDaIa().catch(
      (): EstadoDaIa => ({ configurado: false, funcionando: false, saldo: null, detalhe: "Falha ao conferir a IA." }),
    ),
    repo.listRecentUserMessages(1).catch(() => []),
    repo.listEventosOperacao({ tipo: "transcricao_falhou", desde: ontem }).catch(() => []),
    repo.listEventosOperacao({ tipo: "deepseek_falhou", desde: ontem }).catch(() => []),
    repo.listLembretes({ apenasPendentes: true }).catch(() => []),
  ]);

  const ultimaEm = recentes[0]?.createdAt ?? null;
  const haMinutos = minutosDesde(ultimaEm, agora);

  // SILÊNCIO SÓ ALARMA DENTRO DO EXPEDIENTE. Fora dele, silêncio é o esperado — e um
  // alarme que dispara toda madrugada é um alarme que o time aprende a ignorar.
  const noExpediente = dentroDoExpediente(agora);
  const silencioLongo =
    noExpediente && (haMinutos === null || haMinutos > HORAS_SEM_MENSAGEM_ALARME * 60);

  // A IA fora do ar não impede mensagem de chegar — impede o ATENDIMENTO de acontecer.
  // Entra no mesmo alarme porque o efeito prático é o mesmo: o produto não está
  // entregando, e ninguém percebe olhando a tela.
  const motivo = !ia.funcionando && ia.configurado
    ? ia.detalhe
    : !whatsapp.configurado
    ? "O WhatsApp não está configurado. Nenhuma mensagem entra nem sai."
    : !whatsapp.conectado
      ? "O WhatsApp está desconectado. Nenhuma mensagem está entrando."
      : silencioLongo
        ? haMinutos === null
          ? "Nenhuma mensagem recebida até agora."
          : `Nenhuma mensagem há ${Math.floor(haMinutos / 60)}h, em horário de atendimento.`
        : null;

  return {
    captacaoParada: motivo !== null,
    motivo,
    whatsapp,
    ia,
    ultimaMensagem: { em: ultimaEm, haMinutos },
    falhas24h: { transcricao: falhasTranscricao.length, deepseek: falhasDeepseek.length },
    lembretesVencidos: lembretes.filter((l) => l.quando <= hoje).length,
    conferidoEm: agora.toISOString(),
  };
}
