import Link from "next/link";
import AutoRefresh from "@/components/dashboard/auto-refresh";
import { AvisoDeCorte } from "@/components/dashboard/paginacao";
import { Icon, PageHeader, btnGhost } from "@/components/dashboard/ui";
import Quadro from "@/components/atendimentos/quadro";
import { carregarCargaDaFila } from "@/lib/fila/carregar";
import { TETO_DE_CARGA, avaliarCorte } from "@/lib/fila/paginacao";

export const dynamic = "force-dynamic";

/**
 * O QUADRO DE ATENDIMENTOS.
 *
 * A Fila responde "o que vence primeiro?". Esta tela responde outra coisa: "onde cada
 * caso está?" — e é por isso que são duas telas e não um botão de alternar. Num quadro
 * organizado por status, quem tem multa vencendo amanhã fica no meio da coluna "Novo"
 * junto com quem mandou oi; quem passasse a viver aqui perderia a ordenação por prazo,
 * que é a tese do painel inteiro.
 *
 * O aviso da Fila continua valendo aqui: conversas filtradas (CURIOSO, DPU, FORA_ESCOPO)
 * não entram no quadro. Elas vivem na aba de auditoria.
 */
export default async function AtendimentosPage() {
  const agora = new Date();
  const { leads, total } = await carregarCargaDaFila({ limite: TETO_DE_CARGA });
  const corte = avaliarCorte(leads.length, total);

  return (
    <div className="space-y-4">
      <AutoRefresh seconds={60} />

      <PageHeader
        eyebrow="Atendimentos"
        title="Onde cada caso está"
        description="Arraste o card para mudar o status. Quem tem prazo processual sobe dentro da coluna, mas é a Fila que ordena por urgência — este quadro serve para organizar, não para priorizar."
        actions={
          <Link href="/dashboard" className={btnGhost}>
            <Icon name="bolt" className="h-4 w-4" />
            Fila
          </Link>
        }
      />

      <AvisoDeCorte corte={corte} />

      <Quadro leads={leads} agoraISO={agora.toISOString()} />
    </div>
  );
}
