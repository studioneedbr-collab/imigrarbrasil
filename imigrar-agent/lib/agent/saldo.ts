// A IA ESTÁ MESMO FUNCIONANDO? — não basta ter chave.
//
// Ter chave e conseguir usar são coisas diferentes, e a distância entre as duas é
// invisível de fora: quando a chamada falha, o atendimento cai no motor determinístico
// e a pessoa recebe resposta do mesmo jeito. O painel mostra a conversa andando, o
// health responde "deepseek", e a Ana virou um menu.
//
// Foi o que aconteceu no primeiro teste em produção: `Insufficient Balance`, HTTP 402.
// As duas respostas pareceram do modelo e nenhuma era.

import { env, useDeepseek } from "@/lib/env";

export interface EstadoDaIa {
  configurado: boolean;
  /** Chave válida E conta em condições de responder. É isto que importa. */
  funcionando: boolean;
  saldo: string | null;
  detalhe: string;
}

export async function estadoDaIa(): Promise<EstadoDaIa> {
  if (!useDeepseek) {
    return {
      configurado: false,
      funcionando: false,
      saldo: null,
      detalhe: "Sem chave do DeepSeek: o atendimento roda no motor determinístico.",
    };
  }
  try {
    const res = await fetch(`${env.deepseekBaseUrl}/user/balance`, {
      headers: { Authorization: `Bearer ${env.deepseekKey}` },
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
      detalhe: data.is_available
        ? `IA no ar${saldo ? ` · saldo ${saldo}` : ""}.`
        : "A conta do DeepSeek está sem saldo — a Ana está respondendo pelo motor determinístico.",
    };
  } catch {
    return {
      configurado: true,
      funcionando: false,
      saldo: null,
      detalhe: "Não foi possível falar com o DeepSeek para conferir a conta.",
    };
  }
}
