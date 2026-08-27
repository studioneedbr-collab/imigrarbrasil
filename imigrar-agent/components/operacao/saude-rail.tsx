import Link from "next/link";
import { saudeEmCache, itensDeAlarme } from "@/lib/operacao/saude";

/**
 * O PAINEL DE OPERAÇÃO DA BARRA LATERAL — SÓ ALARME, NADA MAIS.
 *
 * Ele mostrava, na mesma coluna: status do WhatsApp, o saldo em dólar da conta do
 * DeepSeek e duas contagens de falha. Três coisas erradas em quatro linhas.
 *
 *   · DINHEIRO NÃO É SAÚDE OPERACIONAL. "agente 4.76 USD" obrigava quem passasse o olho
 *     a decidir se aquilo era um problema — sem período, sem denominador, sem
 *     comparação. E colocava gasto na frente de quem estava tentando descobrir por que a
 *     captação parou. Custo foi para Métricas, onde há período e média por conversa.
 *   · ZERO NÃO É NOTÍCIA. Uma coluna de linhas verdes e zeros vira mobília em três dias,
 *     e mobília é a única coisa que o olho não vê. Agora cada item só aparece quando
 *     está ruim, e a operação saudável é UMA linha dizendo que está tudo certo.
 *   · REPETIR NÃO É REFORÇAR. "WhatsApp fora do ar" aqui dizia o mesmo que a faixa
 *     vermelha "A captação está parada" no topo. Dois avisos do mesmo fato competem
 *     entre si; a faixa é mais visível e tem o botão de reconectar, então ela ficou com
 *     o texto e aqui sobrou o indicador compacto.
 *
 * O vocabulário é o mesmo do resto do painel, e isso não é preciosismo: "fora do ar",
 * "captação parada", "quedas do agente" e "agente ligado" eram quatro termos para dois
 * conceitos, e ninguém sabia se eram a mesma coisa. Conexão do WhatsApp é
 * conectado/desconectado. O agente é ligado/desligado (e quem mostra isso é o bloco de
 * ativação, logo abaixo). Falha tem sobrenome: de transcrição, ou de LLM.
 */
export default async function SaudeRail() {
  const s = await saudeEmCache().catch(() => null);
  if (!s) return null;

  const itens = itensDeAlarme(s);

  return (
    <div className="px-2 pb-1">
      <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30">
        Operação
      </p>

      {itens.length === 0 ? (
        <div className="flex items-center gap-2 px-1 py-[3px]">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ib-selo" />
          <span className="text-[11px] text-ib-selo">Tudo certo por aqui</span>
        </div>
      ) : (
        itens.map((item) => {
          const conteudo = (
            <div className="flex items-baseline justify-between gap-2 py-[3px]">
              <span className="text-[11px] text-white/45">{item.rotulo}</span>
              <span className="font-mono text-[11px] tabular-nums text-ib-danger">{item.valor}</span>
            </div>
          );
          return item.href ? (
            <Link
              key={item.chave}
              href={item.href}
              className="block rounded px-1 transition hover:bg-white/[0.06]"
            >
              {conteudo}
            </Link>
          ) : (
            <div key={item.chave} className="px-1">
              {conteudo}
            </div>
          );
        })
      )}
    </div>
  );
}
