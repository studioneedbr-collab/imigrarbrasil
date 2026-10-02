import { getRepository } from "@/lib/data";
import { getSession } from "@/lib/auth/guard";
import { PageHeader } from "@/components/dashboard/ui";
import { AbasDoSite } from "@/components/dashboard/abas";
import { podeEditarSite } from "@/lib/site/permissoes";
import { SLUG_CONFIG, type ConfigSite } from "@/lib/site/conteudo";
import FormConfig from "@/components/site/form-config";

export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage() {
  const sessao = await getSession();
  const item = await getRepository().obterConteudoSite("config", SLUG_CONFIG);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Site imigrarbrasil.com" title="Configurações" description="Contato, redes sociais, os números da home e os textos dos botões. Vale para o site inteiro na próxima publicação." />
      <AbasDoSite />
      <FormConfig inicial={(item?.dados as ConfigSite) ?? null} podeEditar={podeEditarSite(sessao?.role)} />
    </div>
  );
}
