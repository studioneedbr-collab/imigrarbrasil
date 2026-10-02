import Link from "next/link";
import { getRepository } from "@/lib/data";
import { Card, PageHeader, EmptyState } from "@/components/dashboard/ui";
import { AbasDoSite } from "@/components/dashboard/abas";
import { ATENDIMENTO_LABEL } from "@/lib/domain/rotulos";
import { nomeDoIdioma } from "@/lib/domain/idiomas";

export const dynamic = "force-dynamic";

/**
 * QUEM PREENCHEU O FORMULÁRIO DO SITE.
 *
 * Não é uma lista à parte: são os leads do CRM com origem "site" (a captura grava assim,
 * app/api/captura/site). A página e o formulário de onde a pessoa veio estão na nota que a
 * captura escreve — "Origem: …" e "Página: …" — e é de lá que esta tela os tira.
 */
function daNota(nota: string | null | undefined, campo: "Origem" | "Página") {
  return nota?.match(new RegExp(`^${campo}: (.+)$`, "m"))?.[1]?.trim() ?? null;
}

const ROTULO_FORMULARIO: Record<string, string> = {
  modal: "Botão “Fale com a gente”",
  "home-faq": "Home (dúvidas)",
  "fale-conosco": "Página Fale Conosco",
  blog: "Artigo do blog",
};
const nomeDoFormulario = (o: string | null) =>
  !o ? "—" : ROTULO_FORMULARIO[o] ?? (o.startsWith("servico:") ? `Serviço: ${o.slice(8)}` : o);

export default async function FormulariosPage() {
  const leads = (await getRepository().listLeads({ limite: 2000 }))
    .filter((l) => l.origem === "site")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 300);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Site imigrarbrasil.com" title="Formulários" description="Quem deixou nome e WhatsApp no site. Cada pessoa já está no CRM, na etapa em que o time a deixou." />
      <AbasDoSite />
      {leads.length === 0 ? (
        <EmptyState title="Nenhum formulário ainda" text="Quando alguém preencher o formulário do site, a pessoa aparece aqui e na fila do CRM." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-ib-papel text-left text-[11px] uppercase tracking-[0.12em] text-ib-slate">
                <tr>
                  <th className="px-5 py-3 font-semibold">Quando</th>
                  <th className="px-5 py-3 font-semibold">Quem</th>
                  <th className="px-5 py-3 font-semibold">Formulário</th>
                  <th className="px-5 py-3 font-semibold">Página</th>
                  <th className="px-5 py-3 font-semibold">Idioma</th>
                  <th className="px-5 py-3 font-semibold">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ib-line">
                {leads.map((l) => {
                  const pagina = daNota(l.notes, "Página");
                  return (
                    <tr key={l.id} className="hover:bg-ib-papel/60">
                      <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-ib-slate">{new Date(l.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" })}</td>
                      <td className="px-5 py-3">
                        <Link href={`/dashboard/conversations/${l.conversationId}`} className="font-semibold text-ib-ink hover:text-ib-mar">{l.contactName || "Sem nome"}</Link>
                        {l.email ? <div className="text-xs text-ib-slate">{l.email}</div> : null}
                      </td>
                      <td className="px-5 py-3 text-ib-ink">{nomeDoFormulario(daNota(l.notes, "Origem"))}</td>
                      <td className="max-w-[260px] truncate px-5 py-3 font-mono text-xs text-ib-slate" title={pagina ?? ""}>{pagina ?? "—"}</td>
                      <td className="px-5 py-3 text-ib-slate">{l.idioma ? nomeDoIdioma(l.idioma) : "—"}</td>
                      <td className="px-5 py-3 text-ib-ink">{l.atendimentoStatus ? ATENDIMENTO_LABEL[l.atendimentoStatus] : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
