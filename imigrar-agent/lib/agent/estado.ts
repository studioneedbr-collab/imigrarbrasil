// O ESTADO DE ATIVAÇÃO, LIDO E ESCRITO.
//
// `lib/agent/ativacao.ts` tem as regras e não fala com o banco. Este arquivo é a outra
// metade: lê a chave geral, resolve de qual instância veio a mensagem, e registra toda
// mudança de estado na auditoria.
//
// A AUDITORIA NÃO É OPCIONAL AQUI. Toda mudança em qualquer um dos três níveis passa por
// uma destas funções, e cada uma grava autor, timestamp, estado anterior, estado novo e
// motivo. Sem isso, "quem desligou o agente na quinta?" não tem resposta — e essa é
// exatamente a pergunta que aparece na segunda-feira seguinte.

import { getRepository } from "@/lib/data";
import type { ChaveGeral, ZapiInstancia } from "@/lib/domain/types";
import { CHAVE_GERAL_PADRAO } from "@/lib/agent/ativacao";
import { getZapiConfig } from "@/lib/whatsapp/config";

export const CHAVE_GERAL_KEY = "chave_geral";

/** Ações da auditoria. Prefixo comum para a tela de acessos filtrar por elas. */
export const ACAO_CHAVE_GERAL = "agente.chave_geral";
export const ACAO_INSTANCIA_ATIVACAO = "agente.instancia.ativacao";
export const ACAO_INSTANCIA_AMBIENTE = "agente.instancia.ambiente";
export const ACAO_INSTANCIA_CRIADA = "agente.instancia.criada";
export const ACAO_INSTANCIA_MODO = "agente.instancia.modo_desligado";
export const ACAO_CONVERSA = "agente.conversa";
export const ACAO_RASCUNHO = "agente.rascunho";

export async function lerChaveGeral(): Promise<ChaveGeral> {
  try {
    const bruto = await getRepository().getConfig<Partial<ChaveGeral>>(CHAVE_GERAL_KEY);
    if (!bruto || typeof bruto.ligada !== "boolean") return CHAVE_GERAL_PADRAO;
    return {
      ligada: bruto.ligada,
      autor: bruto.autor ?? null,
      em: bruto.em ?? null,
      motivo: bruto.motivo ?? null,
    };
  } catch {
    // Banco fora do ar no meio de um atendimento. Assumir DESLIGADO calaria o agente
    // por causa de uma falha de leitura de config; assumir LIGADO mantém o atendimento
    // de pé, que é o comportamento de hoje. A falha aparece por outros caminhos.
    return CHAVE_GERAL_PADRAO;
  }
}

/**
 * NÍVEL 1 — liga e desliga tudo. Desligar exige motivo, e a validação é aqui e não só
 * no formulário: "desligado sem motivo" é o estado que ninguém sabe explicar depois.
 */
export async function definirChaveGeral(
  ligada: boolean,
  autor: string,
  motivo: string | null,
): Promise<ChaveGeral> {
  const texto = (motivo ?? "").trim();
  if (!ligada && !texto) throw new Error("motivo_obrigatorio");

  const nova: ChaveGeral = {
    ligada,
    autor,
    em: new Date().toISOString(),
    motivo: texto || null,
  };
  await getRepository().setConfig(CHAVE_GERAL_KEY, nova);
  return nova;
}

/**
 * DE QUAL INSTÂNCIA VEIO ESTA MENSAGEM.
 *
 * A Z-API manda `instanceId` no payload do webhook — é por ele que se resolve. Duas
 * quedas com rede de proteção, nesta ordem:
 *
 * 1. Payload sem `instanceId` (a Z-API varia entre versões) e existe UMA instância só
 *    cadastrada: é ela, sem ambiguidade possível.
 * 2. Ainda nada, mas o `instanceId` bate com a credencial legada de agent_config['zapi']:
 *    é o banco que ainda não rodou a migration 023. Devolve uma instância sintética de
 *    produção e ligada, para o comportamento de hoje continuar de pé.
 *
 * Fora isso devolve null, e a decisão vira modo sombra — grava tudo, não envia nada.
 * Responder por um canal que não se sabe qual é seria o pior dos dois erros.
 */
export async function resolverInstancia(instanceIdDoPayload?: string | null): Promise<ZapiInstancia | null> {
  const repo = getRepository();
  const chave = (instanceIdDoPayload ?? "").trim();

  if (chave) {
    const achada = await repo.getInstanciaPorInstanceId(chave).catch(() => null);
    if (achada) return achada;
  }

  const todas = await repo.listInstancias().catch(() => [] as ZapiInstancia[]);
  if (!chave && todas.length === 1) return todas[0];

  // Banco ainda sem a migration 023: cai na credencial única de agent_config.
  if (!todas.length) {
    const legado = await getZapiConfig().catch(() => null);
    if (legado?.configured && (!chave || legado.instanceId === chave)) {
      return instanciaLegada(legado);
    }
  }
  return null;
}

/**
 * A credencial única de agent_config['zapi'], vestida de instância.
 *
 * Produção e ligada porque é o que ela É hoje: um número atendendo gente de verdade. O
 * `id` vazio marca que ela não existe como linha — nada tenta atualizá-la no banco.
 */
function instanciaLegada(cfg: { instanceId: string; token: string; clientToken: string; baseUrl: string }): ZapiInstancia {
  const agora = new Date().toISOString();
  return {
    id: "", nome: "Produção (credencial anterior à migration 023)", ambiente: "producao",
    instanceId: cfg.instanceId, token: cfg.token, clientToken: cfg.clientToken,
    baseUrl: cfg.baseUrl, ativo: true, ativadoPor: null, ativadoEm: null,
    modoDesligado: "sombra", respostaFixa: null, slaMinutos: 30,
    criadoEm: agora, atualizadoEm: agora,
  };
}

/** Linha de auditoria legível: "ligado → desligado · motivo". */
export function detalheDaMudanca(de: string, para: string, motivo?: string | null): string {
  const base = `${de} → ${para}`;
  const texto = (motivo ?? "").trim();
  return texto ? `${base} · ${texto}` : base;
}
