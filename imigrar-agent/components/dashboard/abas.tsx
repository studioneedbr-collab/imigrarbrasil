"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/dashboard/ui";
import { ABAS_ATENDIMENTO, ABAS_CONVERSAS, rotaAtiva, type Aba } from "@/lib/dashboard/abas";

/**
 * A FAIXA DE ABAS DE UM ASSUNTO.
 *
 * Fica embaixo do cabeçalho da tela, e não no topo da página, porque ela pertence ao
 * assunto — não ao painel. Quem está na Fila precisa ver, sem procurar, que "Meus" e
 * "Funil" são a mesma carteira vista de outro jeito.
 *
 * A nota embaixo do nome é o que faz a aba valer mais do que o item de menu que ela
 * substituiu: ela diz o que AQUELE recorte responde, ao lado dos irmãos, onde a
 * comparação é possível. No celular ela some — ali a faixa rola na horizontal e o que
 * precisa caber é o nome.
 */
/**
 * A FAIXA DE ABAS DE UM ASSUNTO — um controle segmentado, não quatro links soltos.
 *
 * A primeira versão empilhava nome e descrição em cada aba, sublinhava a ativa e deixava
 * as outras em cinza. Informava, e parecia um índice de documento: quatro parágrafos
 * ocupando o topo de toda tela de atendimento.
 *
 * O que uma faixa de abas precisa responder é uma coisa só — ONDE EU ESTOU —, e ela
 * responde melhor por forma do que por texto. A ativa é uma pastilha branca sobre o
 * trilho cinza, com o ícone no tom do selo; as outras são texto em cinza que só ganha
 * fundo no hover. A descrição virou tooltip: continua lá para quem tem a dúvida, sem
 * cobrar a tela inteira de quem já não tem.
 */
function Faixa({ abas, rotulo }: { abas: Aba[]; rotulo: string }) {
  const pathname = usePathname() ?? "";
  return (
    <nav aria-label={rotulo} className="-mx-1 overflow-x-auto px-1">
      <ul className="inline-flex min-w-max items-center gap-1 rounded-xl bg-ib-papel p-1 ring-1 ring-inset ring-ib-line">
        {abas.map((aba) => {
          const ativa = rotaAtiva(pathname, aba.href);
          return (
            <li key={aba.href}>
              <Link
                href={aba.href}
                title={aba.nota}
                aria-current={ativa ? "page" : undefined}
                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                  ativa
                    ? "bg-white text-ib-ink shadow-sm ring-1 ring-ib-line"
                    : "text-ib-slate hover:bg-white/70 hover:text-ib-ink"
                }`}
              >
                <Icon
                  name={aba.icone}
                  className={`h-4 w-4 shrink-0 ${ativa ? "text-ib-selo" : "text-ib-slate"}`}
                />
                {aba.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function AbasDeAtendimento() {
  return <Faixa abas={ABAS_ATENDIMENTO} rotulo="Recortes do atendimento" />;
}

export function AbasDeConversas() {
  return <Faixa abas={ABAS_CONVERSAS} rotulo="Recortes das conversas" />;
}
