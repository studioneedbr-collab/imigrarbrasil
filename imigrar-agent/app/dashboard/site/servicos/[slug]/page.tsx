import { notFound } from "next/navigation";
import { getRepository } from "@/lib/data";
import { getSession } from "@/lib/auth/guard";
import { podeEditarSite } from "@/lib/site/permissoes";
import type { ServicoSite } from "@/lib/site/conteudo";
import FormServico from "@/components/site/form-servico";

export const dynamic = "force-dynamic";

export default async function EditarServicoPage({ params }: { params: { slug: string } }) {
  const sessao = await getSession();
  const novo = params.slug === "novo";
  const item = novo ? null : await getRepository().obterConteudoSite("servico", params.slug);
  if (!novo && !item) notFound();
  return <FormServico inicial={(item?.dados as ServicoSite) ?? null} publicadoInicial={item?.publicado ?? false} podeEditar={podeEditarSite(sessao?.role)} />;
}
