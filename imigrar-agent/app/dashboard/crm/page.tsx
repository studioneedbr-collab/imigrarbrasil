import Link from "next/link";
import AutoRefresh from "@/components/dashboard/auto-refresh";
import { AvisoDeCorte } from "@/components/dashboard/paginacao";
import { Icon, PageHeader, btnGhost } from "@/components/dashboard/ui";
import QuadroCrm from "@/components/crm/quadro";
import { getSession } from "@/lib/auth/guard";
import { normalizarPapel } from "@/lib/auth/papeis";
import { getRepository } from "@/lib/data";
import { FUNIL_PADRAO, etapasPadrao } from "@/lib/crm/funil";
import { carregarCargaDaFila } from "@/lib/fila/carregar";
import { TETO_DE_CARGA, avaliarCorte } from "@/lib/fila/paginacao";

export const dynamic = "force-dynamic";

/**
 * O CRM.
 *
 * A Fila responde "o que vence primeiro?". Esta tela responde outra coisa: "onde cada caso
 * está?" — e é por isso que são duas telas e não um botão de alternar. Num quadro
 * organizado por etapa, quem tem multa vencendo amanhã fica no meio da primeira coluna
 * junto com quem mandou oi; quem passasse a viver aqui perderia a ordenação por prazo, que
 * é a tese do painel inteiro.
 *
 * As colunas vêm do banco (funis e etapas, migration 026). Quando não vêm — banco sem a
 * migration, erro de rede — a tela cai no funil padrão que vive em código: um CRM que não
 * abre porque falta uma tabela esconde todos os casos de uma vez, e isso é pior do que
 * abrir com as cinco colunas de sempre. Nesse estado o desenho fica travado: criar etapa
 * num funil que não existe no banco daria erro a cada clique.
 *
 * O aviso da Fila continua valendo aqui: conversas filtradas (CURIOSO, DPU, FORA_ESCOPO)
 * não entram no quadro. Elas vivem na aba de auditoria.
 */
export default async function CrmPage() {
  const agora = new Date();
  const repo = getRepository();
  const [{ leads, total }, funis, etapas, sessao] = await Promise.all([
    carregarCargaDaFila({ limite: TETO_DE_CARGA }),
    repo.listFunis().catch(() => []),
    repo.listEtapas().catch(() => []),
    getSession(),
  ]);
  const corte = avaliarCorte(leads.length, total);

  const temDesenho = funis.length > 0 && etapas.length > 0;
  const papel = normalizarPapel(sessao?.role);

  return (
    <div className="space-y-4">
      <AutoRefresh seconds={60} />

      <PageHeader
        eyebrow="CRM"
        title="Onde cada caso está"
        description="Cada coluna é uma etapa do trabalho; a Fila continua sendo quem ordena por urgência."
        actions={
          <Link href="/dashboard" className={btnGhost}>
            <Icon name="bolt" className="h-4 w-4" />
            Fila
          </Link>
        }
      />

      <AvisoDeCorte corte={corte} />

      <QuadroCrm
        leads={leads}
        agoraISO={agora.toISOString()}
        funis={temDesenho ? funis : [FUNIL_PADRAO]}
        etapas={temDesenho ? etapas : etapasPadrao()}
        podeDesenhar={temDesenho && (papel === "admin" || papel === "advogado")}
      />
    </div>
  );
}
