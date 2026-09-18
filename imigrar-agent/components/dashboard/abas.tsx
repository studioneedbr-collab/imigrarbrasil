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
      <ul className="flex min-w-max items-stretch gap-1 border-b border-ib-line px-1">
        {abas.map((aba) => {
          const ativa = rotaAtiva(pathname, aba.href);
          return (
            <li key={aba.href}>
              <Link
                href={aba.href}
                aria-current={ativa ? "page" : undefined}
                className={`relative block rounded-t-lg px-3 py-2 transition ${
                  ativa ? "bg-ib-bruma text-ib-ink" : "text-ib-slate hover:bg-ib-papel hover:text-ib-ink"
                }`}
              >
                <span className="block text-sm font-semibold leading-tight">{aba.label}</span>
                <span className="hidden text-[11px] leading-tight text-ib-slate sm:block">
                  {aba.nota}
                </span>
                {ativa ? (
                  <span className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-ib-selo" />
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
