import { env } from "@/lib/env";

/**
 * O PAINEL CONVERSA COM O GITHUB PARA DUAS COISAS.
 *
 *  1. Publicar: dispara o workflow .github/workflows/publicar-site.yml (repository_dispatch),
 *     que busca o conteúdo em /api/site/exportar, gera o site e envia ao CloudPanel.
 *  2. Importar: lê o JSON que já está em site/src/data/ — o conteúdo de antes do painel.
 *
 * Sem GITHUB_TOKEN as duas respondem "não configurado" em vez de falhar no escuro: a tela
 * diz o que falta.
 */

export const EVENTO_PUBLICAR = "publicar-site";
export const WORKFLOW_PUBLICAR = "publicar-site.yml";

export const githubConfigurado = () => Boolean(env.githubToken && env.githubRepo);

async function gh(caminho: string, init: RequestInit = {}) {
  return fetch(`https://api.github.com/repos/${env.githubRepo}${caminho}`, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.githubToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers ?? {}),
    },
  });
}

export async function dispararPublicacao(por: string): Promise<void> {
  const r = await gh("/dispatches", {
    method: "POST",
    body: JSON.stringify({ event_type: EVENTO_PUBLICAR, client_payload: { por } }),
  });
  if (r.status !== 204) throw new Error(`GitHub respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

export interface Publicacao {
  id: number;
  status: "queued" | "in_progress" | "completed" | string;
  conclusao: "success" | "failure" | "cancelled" | null | string;
  criadaEm: string;
  url: string;
}

export async function ultimasPublicacoes(quantas = 5): Promise<Publicacao[]> {
  const r = await gh(`/actions/workflows/${WORKFLOW_PUBLICAR}/runs?per_page=${quantas}`);
  if (!r.ok) throw new Error(`GitHub respondeu ${r.status}`);
  type Execucao = { id: number; status: string; conclusion: string | null; created_at: string; html_url: string };
  const d = (await r.json()) as { workflow_runs?: Execucao[] };
  return (d.workflow_runs ?? []).map((w) => ({
    id: w.id, status: w.status, conclusao: w.conclusion, criadaEm: w.created_at, url: w.html_url,
  }));
}

/** Conteúdo de um arquivo do repositório (branch padrão), como texto. */
export async function lerArquivoDoRepo(caminho: string): Promise<string | null> {
  const r = await gh(`/contents/${caminho}`, { headers: { Accept: "application/vnd.github.raw+json" } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub respondeu ${r.status} para ${caminho}`);
  return r.text();
}
