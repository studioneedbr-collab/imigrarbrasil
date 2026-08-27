"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, SectionTitle, Icon, fmtDate } from "@/components/dashboard/ui";

/**
 * OS PROVEDORES DE IA — o que a tela de Integrações não mostrava.
 *
 * Ela pedia WhatsApp e Z-API e ficava por aí. DeepSeek e OpenAI já estavam conectados,
 * respondendo e gastando, e não apareciam em lugar nenhum do painel — o que tornava
 * impossível responder, sem abrir código, a pergunta que mais aparece quando algo está
 * estranho: qual provedor está sendo usado para quê, e quando ele funcionou pela última
 * vez?
 *
 * Três decisões deste cartão:
 *
 *   · A CHAVE NÃO APARECE. Nem mascarada. "Configurada" e "não configurada" é tudo o que
 *     existe aqui, e é tudo o que alguém precisa para decidir. Ver o comentário no topo
 *     de lib/integracoes/provedores.ts.
 *   · CONFIGURADO E OCIOSO É UM ESTADO, e é mostrado. Credencial posta sem nenhuma
 *     chamada em 24h quase sempre quer dizer que o roteamento deixou de passar por ali —
 *     e essa é a falha que não quebra nada, então ninguém descobre.
 *   · O TESTE MOSTRA LATÊNCIA. "Conectado" não distingue um provedor saudável de um que
 *     responde em oito segundos e está fazendo cada atendimento parecer travado.
 */

type Categoria = "llm" | "transcricao" | "embedding";

interface Provedor {
  chave: string;
  nome: string;
  categoria: Categoria;
  credencial: "configurada" | "nao_configurada";
  modelo: string;
  usos: string[];
  usosEsperados: string[];
  chamadas24h: number;
  falhas24h: number;
  ultimaOk: string | null;
  ultimaFalha: string | null;
  ocioso: boolean;
}

const ROTULO_USO: Record<string, string> = {
  redacao: "redação",
  extracao: "extração",
  classificacao: "classificação",
  transcricao: "transcrição",
  embedding: "embedding",
};

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-ib-line/70 py-2 first:border-t-0">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-ib-slate">{rotulo}</span>
      <span className="text-sm text-ib-ink">{children}</span>
    </div>
  );
}

function CartaoProvedor({
  p,
  teste,
  testando,
  onTestar,
}: {
  p: Provedor;
  teste?: { ok: boolean; latenciaMs: number; detalhe: string };
  testando: boolean;
  onTestar: () => void;
}) {
  const configurada = p.credencial === "configurada";
  // SAUDÁVEL É CREDENCIAL POSTA **E** ÚLTIMA CHAMADA BEM-SUCEDIDA. Chave presente não é
  // chave funcionando, e a distância entre as duas é invisível de fora — foi assim que
  // um `Insufficient Balance` passou por dois atendimentos parecendo normal.
  const saudavel = configurada && Boolean(p.ultimaOk) && p.falhas24h === 0;

  return (
    <div className="rounded-2xl border border-ib-line bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-ib-ink">{p.nome}</span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                !configurada
                  ? "bg-slate-100 text-ib-slate"
                  : saudavel
                    ? "bg-ib-success/10 text-[#15803D]"
                    : "bg-ib-danger/10 text-ib-danger"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  !configurada ? "bg-slate-400" : saudavel ? "bg-ib-success" : "bg-ib-danger"
                }`}
              />
              {configurada ? "credencial configurada" : "credencial não configurada"}
            </span>
          </div>
          <p className="mt-1 font-mono text-xs text-ib-slate">{p.modelo}</p>
        </div>

        <button
          type="button"
          onClick={onTestar}
          disabled={testando || !configurada}
          className="shrink-0 rounded-lg border border-ib-line px-3.5 py-2 text-sm font-semibold text-ib-slate transition hover:bg-ib-papel hover:text-ib-ink disabled:opacity-50"
        >
          <Icon name="pulse" className="mr-1.5 inline h-4 w-4" />
          {testando ? "Testando…" : "Testar conexão"}
        </button>
      </div>

      <div className="mt-3">
        <Linha rotulo="Última chamada bem-sucedida">
          {p.ultimaOk ? (
            fmtDate(p.ultimaOk)
          ) : (
            <span className="text-ib-danger">nunca</span>
          )}
        </Linha>

        <Linha rotulo="Usado hoje para">
          {p.usos.length ? (
            p.usos.map((u) => ROTULO_USO[u] ?? u).join(", ")
          ) : configurada ? (
            // O SINTOMA SILENCIOSO. Nada quebrou, nada aparece em log, e o provedor
            // simplesmente parou de ser chamado — quase sempre porque o roteamento mudou.
            <span className="text-ib-danger">
              nada nas últimas 24h — o roteamento provavelmente não está usando este provedor
            </span>
          ) : (
            <span className="text-ib-slate">—</span>
          )}
        </Linha>

        {p.usosEsperados.length ? (
          <Linha rotulo="Deveria atender">
            <span className="text-ib-slate">
              {p.usosEsperados.map((u) => ROTULO_USO[u] ?? u).join(", ")}
            </span>
          </Linha>
        ) : null}

        <Linha rotulo="Falhas nas últimas 24h">
          <span className={p.falhas24h > 0 ? "font-semibold text-ib-danger" : "text-ib-slate"}>
            {p.falhas24h}
            {p.chamadas24h > 0 ? (
              <span className="ml-1 font-normal text-ib-slate">de {p.chamadas24h} chamadas</span>
            ) : null}
          </span>
        </Linha>

        {p.ultimaFalha && p.falhas24h > 0 ? (
          <Linha rotulo="Última falha">
            <span className="text-ib-danger">{fmtDate(p.ultimaFalha)}</span>
          </Linha>
        ) : null}
      </div>

      {teste ? (
        <p
          className={`mt-3 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium ${
            teste.ok
              ? "border border-ib-success/25 bg-ib-success/8 text-[#15803D]"
              : "border border-ib-danger/20 bg-ib-danger/5 text-ib-danger"
          }`}
        >
          <Icon name={teste.ok ? "check" : "bolt"} className="h-3.5 w-3.5" />
          {teste.detalhe} {teste.latenciaMs ? `· ${teste.latenciaMs} ms` : ""}
        </p>
      ) : null}
    </div>
  );
}

export default function Provedores() {
  const [lista, setLista] = useState<Provedor[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [testes, setTestes] = useState<Record<string, { ok: boolean; latenciaMs: number; detalhe: string }>>({});
  const [testando, setTestando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/provedores", { cache: "no-store" });
      if (res.ok) setLista(((await res.json()) as { provedores: Provedor[] }).provedores ?? []);
    } catch {
      /* a lista fica como está */
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function testar(chave: string) {
    setTestando(chave);
    try {
      const res = await fetch("/api/integrations/provedores", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provedor: chave }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        latenciaMs?: number;
        detalhe?: string;
        error?: string;
      };
      setTestes((t) => ({
        ...t,
        [chave]: {
          ok: Boolean(data.ok),
          latenciaMs: data.latenciaMs ?? 0,
          detalhe: data.detalhe ?? data.error ?? "Não foi possível testar.",
        },
      }));
      await carregar();
    } finally {
      setTestando(null);
    }
  }

  const secao = (titulo: string, descricao: string, quais: Categoria[]) => {
    const itens = lista.filter((p) => quais.includes(p.categoria));
    return (
      <Card>
        <SectionTitle>{titulo}</SectionTitle>
        <div className="space-y-4 p-5 sm:p-6">
          <p className="text-sm leading-relaxed text-ib-slate">{descricao}</p>
          {carregando ? (
            <p className="text-sm text-ib-slate">Carregando…</p>
          ) : (
            itens.map((p) => (
              <CartaoProvedor
                key={p.chave}
                p={p}
                teste={testes[p.chave]}
                testando={testando === p.chave}
                onTestar={() => testar(p.chave)}
              />
            ))
          )}
        </div>
      </Card>
    );
  };

  return (
    <>
      {secao(
        "Provedores de LLM",
        "Quem escreve as respostas da Ana e lê os documentos que chegam. A chave nunca aparece aqui, nem mascarada — o que se decide olhando meia chave se decide igual olhando “configurada” e a data da última chamada que funcionou.",
        ["llm"],
      )}
      {secao(
        "Transcrição e embeddings",
        "As duas coisas que o provedor do agente não faz: ouvir o áudio que a pessoa mandou e vetorizar a consulta ao material oficial. Quando a transcrição para, o atendimento continua — a Ana pede para a pessoa escrever —, e é por isso que ela precisa ser vigiada aqui.",
        ["transcricao", "embedding"],
      )}
    </>
  );
}
