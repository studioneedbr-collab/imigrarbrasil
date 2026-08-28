import Link from "next/link";
import { Icon, PageHeader, btnGhost } from "@/components/dashboard/ui";
import { MapaDoAtendimento } from "@/components/mapa/mapa";
import { getTrainingConfig } from "@/lib/agent/system-prompt";
import { ACERVO_DO_MAPA, CENARIOS_FIXOS, CLASSIFICACOES_DO_MAPA, ETAPAS } from "@/lib/agent/mapa";

export const dynamic = "force-dynamic";

/**
 * O MAPA DO ATENDIMENTO.
 *
 * A tela que responde a pergunta que ninguém consegue responder abrindo o código: se a
 * pessoa disser X, o que a Ana faz? A resposta sempre existiu — espalhada por doze
 * arquivos —, e quem precisa dela (o sócio decidindo se confia no agente, o atendente
 * entendendo por que um caso não foi encaminhado) não vai ler `lib/agent/index.ts`.
 *
 * DUAS FONTES, DECLARADAS COMO TAIS. As etapas e as decisões em código vêm de
 * lib/agent/mapa.ts, com o arquivo de cada uma à vista; objeções e regras de
 * encaminhamento vêm do que a equipe cadastrou em /dashboard/treinar. A tela diz de onde
 * veio cada linha porque a diferença é prática: uma muda editando, a outra muda subindo
 * uma versão — e tentar mudar a segunda na tela é meia hora perdida.
 */
export default async function MapaPage() {
  const training = await getTrainingConfig().catch(() => null);

  // O que a equipe cadastrou, virando cenário. Objeção é "o que ela diz quando ouve X";
  // regra de encaminhamento é "o que faz a conversa sair da Ana e ir para uma pessoa".
  const cenariosConfigurados = [
    ...(training?.objections ?? [])
      .filter((o) => o.ativo)
      .map((o) => ({
        pergunta: `“${o.objecao}”`,
        resposta: o.resposta,
        origem: o.querDizer ? `objeção · quer dizer: ${o.querDizer}` : "objeção",
      })),
    ...(training?.transferRules ?? [])
      .filter((r) => r.ativo)
      .map((r) => ({
        pergunta: r.keywords.slice(0, 4).map((k) => `“${k}”`).join(" · "),
        resposta: r.resposta,
        origem: `encaminhamento · ${r.categoria}`,
      })),
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Agente"
        title="O mapa do atendimento"
        description="O caminho de uma mensagem, do WhatsApp até virar caso na fila — com as bifurcações à vista. Cada etapa diz o que faz, por que existe e onde mora no código; se o código mudar e o mapa não, a divergência aparece aqui, e não numa conversa real."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/dashboard/treinar" className={btnGhost}>
              <Icon name="gear" className="h-4 w-4" />
              Treinar o agente
            </Link>
            <Link href="/simulate" className={btnGhost}>
              <Icon name="external" className="h-4 w-4" />
              Testar no simulador
            </Link>
          </div>
        }
      />

      <MapaDoAtendimento
        etapas={ETAPAS}
        cenariosFixos={CENARIOS_FIXOS}
        cenariosConfigurados={cenariosConfigurados}
        classificacoes={CLASSIFICACOES_DO_MAPA}
        acervo={ACERVO_DO_MAPA}
      />
    </div>
  );
}
