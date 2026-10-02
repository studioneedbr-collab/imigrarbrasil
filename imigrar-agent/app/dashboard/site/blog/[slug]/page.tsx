import { notFound } from "next/navigation";
import { getRepository } from "@/lib/data";
import { getSession } from "@/lib/auth/guard";
import { podeEditarSite } from "@/lib/site/permissoes";
import type { PostSite } from "@/lib/site/conteudo";
import FormPost from "@/components/site/form-post";

export const dynamic = "force-dynamic";

export default async function EditarPostPage({ params }: { params: { slug: string } }) {
  const sessao = await getSession();
  const novo = params.slug === "novo";
  const item = novo ? null : await getRepository().obterConteudoSite("post", params.slug);
  if (!novo && !item) notFound();
  return <FormPost inicial={(item?.dados as PostSite) ?? null} publicadoInicial={item?.publicado ?? false} podeEditar={podeEditarSite(sessao?.role)} />;
}
