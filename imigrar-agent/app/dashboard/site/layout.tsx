import type { ReactNode } from "react";
import { getRepository } from "@/lib/data";
import { Card, PageHeader } from "@/components/dashboard/ui";

export const dynamic = "force-dynamic";

/**
 * A SEÇÃO DO SITE NÃO PODE CAIR COM "APPLICATION ERROR".
 *
 * Todas as telas daqui leem duas tabelas (site_conteudo e site_eventos, migration 035).
 * Quando a leitura falha — e o caso real é o banco de produção ainda sem a 035 —, a
 * página estourava no servidor e a pessoa via só um código de erro, sem saber que a
 * saída é rodar um arquivo no Supabase.
 *
 * Este layout faz as duas leituras mais baratas possíveis antes de desenhar qualquer
 * tela. Se alguma falha, mostra o que falhou e o que fazer, no lugar da tela. É uma
 * sonda, não um tratamento: as páginas continuam lançando erro em falha de verdade no
 * meio do uso.
 */
async function porqueNaoAbre(): Promise<string | null> {
  try {
    const repo = getRepository();
    await Promise.all([
      repo.obterConteudoSite("config", "__sonda__"),
      // Data no futuro: nenhuma linha volta, só se prova que a tabela responde.
      repo.listarEventosSite(new Date(Date.now() + 86_400_000)),
    ]);
    return null;
  } catch (err) {
    const m = (err as { message?: unknown } | null)?.message;
    return typeof m === "string" && m ? m.slice(0, 240) : "O banco não respondeu.";
  }
}

export default async function SiteLayout({ children }: { children: ReactNode }) {
  const erro = await porqueNaoAbre();
  if (!erro) return <>{children}</>;

  const faltaTabela = /site_conteudo|site_eventos|schema cache|does not exist/i.test(erro);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Site imigrarbrasil.com"
        title="Site"
        description="Esta área ainda não consegue abrir neste banco."
      />
      <Card className="border-ib-warn/40 p-5">
        <h2 className="font-display text-base font-semibold text-ib-ink">
          {faltaTabela ? "Falta criar as tabelas do site no banco" : "O banco recusou a leitura do site"}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ib-slate">
          {faltaTabela
            ? "Rode o arquivo supabase/migrations/035_site.sql no SQL Editor do Supabase e recarregue esta página. O resto do painel não depende disso e segue funcionando."
            : "O resto do painel segue funcionando. Recarregue em instantes; se continuar, a mensagem abaixo diz o que o banco respondeu."}
        </p>
        <p className="mt-3 rounded-lg bg-ib-papel px-3 py-2 font-mono text-xs text-ib-slate">{erro}</p>
      </Card>
    </div>
  );
}
