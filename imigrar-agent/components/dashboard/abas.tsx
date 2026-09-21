"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
function Faixa({ abas, rotulo }: { abas: Aba[]; rotulo: string }) {
  const pathname = usePathname() ?? "";
  return (
    <nav aria-label={rotulo} className="-mx-1 overflow-x-auto">
      <ul className="flex min-w-max items-stretch gap-0.5 border-b border-ib-line px-1">
        {abas.map((aba) => {
          const ativa = rotaAtiva(pathname, aba.href);
          return (
            <li key={aba.href}>
              <Link
                href={aba.href}
                aria-current={ativa ? "page" : undefined}
                /* A ABA ATIVA PRECISA GANHAR DE LONGE.
                   Era `bg-ib-bruma` com o texto na mesma cor das irmãs: de relance, as
                   quatro pareciam iguais e a faixa deixava de responder "onde eu estou?",
                   que é a única pergunta dela. Agora a ativa tem fundo branco, o título em
                   tinta cheia e a barra do selo embaixo; as outras ficam em cinza e só
                   ganham cor no hover. */
                className={`relative block rounded-t-lg px-3.5 py-2 transition ${
                  ativa
                    ? "bg-white text-ib-ink shadow-[0_-1px_0_rgba(16,24,40,0.06)_inset]"
                    : "text-ib-slate hover:bg-ib-papel hover:text-ib-ink"
                }`}
              >
                <span
                  className={`block text-sm leading-tight ${
                    ativa ? "font-semibold text-ib-ink" : "font-medium"
                  }`}
                >
                  {aba.label}
                </span>
                <span
                  className={`hidden text-[11px] leading-tight sm:block ${
                    ativa ? "text-ib-carimbo" : "text-ib-slate/70"
                  }`}
                >
                  {aba.nota}
                </span>
                {ativa ? (
                  <span className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-ib-selo" />
                ) : null}
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
