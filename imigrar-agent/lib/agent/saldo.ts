// A IA ESTÁ MESMO FUNCIONANDO? — não basta ter chave.
//
// Ter chave e conseguir usar são coisas diferentes, e a distância entre as duas é
// invisível de fora: quando a chamada falha, o atendimento cai no motor determinístico
// e a pessoa recebe resposta do mesmo jeito. O painel mostra a conversa andando, o
// health responde "deepseek", e a agente virou um menu.
//
// Foi o que aconteceu no primeiro teste em produção: `Insufficient Balance`, HTTP 402.
// As duas respostas pareceram do modelo e nenhuma era.

import { llmEmUso, type Llm } from "@/lib/agent/llm";

export interface EstadoDaIa {
  configurado: boolean;
  /** Chave válida E conta em condições de responder. É isto que importa. */
  funcionando: boolean;
  saldo: string | null;
  detalhe: string;
}

const PENSANDO = "A agente está pensando — as respostas estão saindo do modelo.";

/**
 * A OpenAI não expõe saldo por chave de API. O que dá para conferir de graça é o que
 * mais quebra: a chave ainda vale e o modelo escolhido existe para esta conta.
 */
async function estadoDaOpenai(llm: Llm): Promise<EstadoDaIa> {
  const res = await fetch(`${llm.baseUrl}/models/${encodeURIComponent(llm.modelo)}`, {
    headers: { Authorization: `Bearer ${llm.key}` },
    cache: "no-store",
  });
  if (res.ok) return { configurado: true, funcionando: true, saldo: null, detalhe: PENSANDO };
  return {
    configurado: true,
    funcionando: false,
    saldo: null,
    detalhe:
      res.status === 401
        ? "A chave da OpenAI é inválida ou expirou."
        : res.status === 404
          ? `O modelo "${llm.modelo}" não existe para esta conta da OpenAI.`
          : `A conta da OpenAI respondeu ${res.status}.`,
  };
}

export async function estadoDaIa(): Promise<EstadoDaIa> {
  const llm = await llmEmUso();
  if (!llm) {
    return {
      configurado: false,
      funcionando: false,
      saldo: null,
      detalhe: "Sem chave de modelo (DeepSeek ou OpenAI): o atendimento roda no motor determinístico.",
    };
  }
  try {
    if (llm.provedor === "openai") return await estadoDaOpenai(llm);
    const res = await fetch(`${llm.baseUrl}/user/balance`, {
      headers: { Authorization: `Bearer ${llm.key}` },
      cache: "no-store",
    });
    if (!res.ok) {
      return {
        configurado: true,
        funcionando: false,
        saldo: null,
        detalhe:
          res.status === 401
            ? "A chave do DeepSeek é inválida ou expirou."
            : `A conta do DeepSeek respondeu ${res.status}.`,
      };
    }
    const data = (await res.json()) as {
      is_available?: boolean;
      balance_infos?: { currency: string; total_balance: string }[];
    };
    const info = data.balance_infos?.[0];
    const saldo = info ? `${info.total_balance} ${info.currency}` : null;
    return {
      configurado: true,
      funcionando: Boolean(data.is_available),
      saldo,
      // O SALDO NÃO ENTRA NO `detalhe`. Este texto vai para a faixa de alarme da
      // operação, e dinheiro não é saúde operacional: quem lê a faixa está decidindo se
      // a captação parou, não se a conta precisa de recarga. O valor continua exposto no
      // campo `saldo`, que só a tela de Integrações lê.
      detalhe: data.is_available
        ? PENSANDO
        : "A conta do DeepSeek está sem saldo — a agente está respondendo pelo motor determinístico.",
    };
  } catch {
    return {
      configurado: true,
      funcionando: false,
      saldo: null,
      detalhe: `Não foi possível falar com ${llm.nome} para conferir a conta.`,
    };
  }
}
