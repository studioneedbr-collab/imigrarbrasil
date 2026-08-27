import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guard";
import { getRepository } from "@/lib/data";
import { nomeDoIdioma } from "@/lib/domain/idiomas";

export const dynamic = "force-dynamic";

/**
 * BUSCA GLOBAL.
 *
 * O topo do painel era ocupado por um motivo de zona legível de passaporte — bonito, e
 * inerte, no lugar mais valioso da tela. Agora responde à pergunta que o time faz o dia
 * inteiro: "aquela venezuelana de Boa Vista que ligou semana passada, cadê?".
 *
 * Procura no que a pessoa é (nome, telefone, nacionalidade), no que ela quer (objetivo,
 * modalidade, resumo) e no que ela disse (o texto da conversa).
 *
 * SOBRE O DESEMPENHO, com honestidade: isto varre os leads e as mensagens em memória, e
 * não no banco. Serve bem para centenas de conversas e vai ficar lento com dezenas de
 * milhares. Quando chegar lá, o caminho é um índice de texto no Postgres — não é uma
 * otimização que valha a pena adivinhar agora.
 */
function normalizar(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Só dígitos: quem procura por telefone digita de tudo (com +55, com traço, sem nada). */
function digitos(s: string): string {
  return s.replace(/\D/g, "");
}

export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const bruto = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (bruto.length < 2) return NextResponse.json({ resultados: [] });

  const termo = normalizar(bruto);
  const termoNumerico = digitos(bruto);

  const repo = getRepository();
  const leads = await repo.listLeads();
  const mensagens = await repo
    .listMessagesForConversations(leads.map((l) => l.conversationId))
    .catch(() => new Map());

  const resultados = leads
    .map((lead) => {
      const campos = [
        lead.contactName, lead.nacionalidade, lead.clientType, lead.objetivo,
        lead.modalidadeProvavel, lead.resumo, lead.situacaoDocumental,
        lead.paisExterior, lead.notes,
      ].filter(Boolean).join(" ");

      const achouNaFicha = normalizar(campos).includes(termo);
      const achouNoTelefone =
        termoNumerico.length >= 4 && digitos(lead.whatsappNumber ?? "").includes(termoNumerico);

      // O trecho da conversa vem com o contexto em volta: achar sem mostrar ONDE achou
      // obriga a abrir a conversa inteira para descobrir por que aquele lead apareceu.
      let trecho: string | null = null;
      if (!achouNaFicha && !achouNoTelefone) {
        for (const m of (mensagens.get(lead.conversationId) ?? [])) {
          const pos = normalizar(m.content ?? "").indexOf(termo);
          if (pos >= 0) {
            const ini = Math.max(0, pos - 40);
            trecho = `${ini > 0 ? "…" : ""}${(m.content ?? "").slice(ini, pos + termo.length + 60).trim()}…`;
            break;
          }
        }
        if (!trecho) return null;
      }

      return {
        id: lead.id,
        nome: lead.contactName ?? lead.whatsappNumber,
        idioma: lead.idioma,
        idiomaNome: nomeDoIdioma(lead.idioma),
        nacionalidade: lead.nacionalidade ?? lead.clientType ?? null,
        classificacao: lead.classificacao ?? null,
        temPrazo: !!lead.temPrazoCorrendo,
        // Sem trecho da conversa, mostra o resumo — é o que diz quem é a pessoa.
        contexto: trecho ?? (lead.resumo ?? "").split("\n")[0] ?? null,
      };
    })
    .filter(Boolean)
    .slice(0, 12);

  return NextResponse.json({ resultados });
}
