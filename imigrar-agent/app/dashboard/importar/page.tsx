"use client";

import { useState } from "react";
import { Card, Icon, PageHeader, btnGhost, btnPrimary } from "@/components/dashboard/ui";
import { AbasDeAtendimento } from "@/components/dashboard/abas";
import { ATENDIMENTO_LABEL } from "@/lib/domain/rotulos";
import type { AtendimentoStatus } from "@/lib/domain/types";
import type { CampoImportavel, DefinicaoDeCampo } from "@/lib/importacao/campos";
import type { Relatorio, ResultadoDaLinha } from "@/lib/importacao/aplicar";

/**
 * IMPORTAR PLANILHA.
 *
 * A carga inicial do CRM foi um script que sabia de cor as colunas de uma planilha.
 * Serviu uma vez, e a planilha do escritório é viva: vai ser corrigida, ganhar linhas e
 * ser reenviada. Esta tela é o que substitui aquele script.
 *
 * TRÊS PASSOS, E O ENSAIO NÃO É OPCIONAL.
 *
 *   1. o arquivo        — .csv ou .xlsx, como sai do Google Sheets
 *   2. o mapeamento     — qual coluna é o quê, com o palpite já preenchido
 *   3. o ensaio         — linha por linha, o que vai acontecer; e só então gravar
 *
 * O ensaio não é um passo que se pode pular porque esta é a operação em que um erro custa
 * mais caro: ninguém confere setenta e seis fichas depois, e o que entrar torto vira o
 * histórico que o escritório passa a acreditar.
 */

type Analise = {
  arquivo: string;
  cabecalho: string[];
  totalLinhas: number;
  mapaSugerido: Record<CampoImportavel, number | null>;
  campos: DefinicaoDeCampo[];
  amostra: string[][];
};

const CHIP: Record<ResultadoDaLinha["desfecho"], string> = {
  criado: "bg-ib-success/12 text-[#15803D]",
  atualizado: "bg-ib-mar/10 text-ib-mar",
  sem_mudanca: "bg-slate-100 text-ib-slate",
  ignorado: "bg-ib-warn/12 text-[#9A6212]",
};
const NOME_DO_DESFECHO: Record<ResultadoDaLinha["desfecho"], string> = {
  criado: "novo",
  atualizado: "atualizado",
  sem_mudanca: "sem mudança",
  ignorado: "fora",
};

export default function ImportarPage() {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [analise, setAnalise] = useState<Analise | null>(null);
  const [mapa, setMapa] = useState<Record<string, number | null>>({});
  const [relatorio, setRelatorio] = useState<Relatorio | null>(null);
  const [aplicado, setAplicado] = useState(false);
  const [moverEtapa, setMoverEtapa] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function chamar(corpo: FormData) {
    setOcupado(true);
    setErro(null);
    const r = await fetch("/api/importacao", { method: "POST", body: corpo }).catch(() => null);
    setOcupado(false);
    const json = await r?.json().catch(() => null);
    if (!r?.ok) {
      setErro(json?.error ?? "Não foi possível continuar.");
      return null;
    }
    return json;
  }

  async function analisar(f: File) {
    setArquivo(f);
    setAnalise(null);
    setRelatorio(null);
    setAplicado(false);
    const fd = new FormData();
    fd.set("arquivo", f);
    const json = await chamar(fd);
    if (!json) return;
    setAnalise(json);
    setMapa(json.mapaSugerido);
  }

  async function executar(aplicar: boolean) {
    if (!arquivo) return;
    const fd = new FormData();
    fd.set("arquivo", arquivo);
    fd.set("mapa", JSON.stringify(mapa));
    fd.set("aplicar", String(aplicar));
    fd.set("moverEtapa", String(moverEtapa));
    const json = await chamar(fd);
    if (!json) return;
    setRelatorio(json.relatorio);
    setAplicado(aplicar);
  }

  function recomecar() {
    setArquivo(null);
    setAnalise(null);
    setRelatorio(null);
    setAplicado(false);
    setErro(null);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="CRM"
        title="Importar planilha"
        description="Traz uma planilha de casos para o funil. Reimportar a mesma planilha atualiza os casos que já existem — não duplica."
      />
      <AbasDeAtendimento />

      {erro ? (
        <div role="alert" className="rounded-xl border border-ib-danger/30 bg-ib-danger/[0.06] px-4 py-3 text-sm text-ib-danger">
          {erro}
        </div>
      ) : null}

      {/* ─── PASSO 1 ─── */}
      {!analise ? (
        <Card className="p-6">
          <label className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-ib-line px-6 py-12 text-center transition hover:border-ib-mar/50 hover:bg-ib-papel/60">
            <Icon name="doc" className="h-8 w-8 text-ib-slate" />
            <span className="text-sm font-semibold text-ib-ink">
              {ocupado ? "Lendo a planilha…" : "Escolher a planilha"}
            </span>
            <span className="max-w-md text-xs leading-relaxed text-ib-slate">
              .csv ou .xlsx — os dois formatos que o Google Sheets oferece em “Fazer
              download”. A primeira aba é a que vale, e as linhas de título antes do
              cabeçalho são ignoradas sozinhas.
            </span>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              disabled={ocupado}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void analisar(f);
              }}
            />
          </label>
        </Card>
      ) : null}

      {/* ─── PASSO 2 ─── */}
      {analise && !relatorio ? (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ib-line px-5 py-3">
            <h2 className="text-sm font-semibold text-ib-ink">
              Qual coluna é o quê
              <span className="ml-2 font-normal text-ib-slate">
                {analise.arquivo} · {analise.totalLinhas} linhas
              </span>
            </h2>
            <button type="button" onClick={recomecar} className="text-xs font-semibold text-ib-slate hover:underline">
              trocar de arquivo
            </button>
          </div>

          <p className="border-b border-ib-line bg-ib-papel/50 px-5 py-2.5 text-xs leading-relaxed text-ib-slate">
            O palpite já vem preenchido. Confira olhando o exemplo ao lado de cada coluna —
            é assim que se percebe que “Cidade / Estado” foi para o campo errado.
          </p>

          <ul className="divide-y divide-ib-line">
            {analise.campos.map((def) => {
              const escolhida = mapa[def.campo];
              const exemplo =
                escolhida === null || escolhida === undefined
                  ? null
                  : analise.amostra.map((l) => l[escolhida]).find((v) => v && v.trim());
              return (
                <li key={def.campo} className="grid gap-2 px-5 py-3 sm:grid-cols-[14rem_1fr_1fr] sm:items-center">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ib-ink">
                      {def.rotulo}
                      {def.campo === "telefone" ? (
                        <span className="ml-1 text-ib-danger" title="Obrigatório">*</span>
                      ) : null}
                    </p>
                    <p className="text-[11px] leading-snug text-ib-slate">{def.ajuda}</p>
                  </div>
                  <select
                    value={escolhida ?? ""}
                    onChange={(e) =>
                      setMapa((m) => ({
                        ...m,
                        [def.campo]: e.target.value === "" ? null : Number(e.target.value),
                      }))
                    }
                    className="w-full rounded-lg border border-ib-line bg-white px-2.5 py-1.5 text-sm text-ib-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ib-mar"
                  >
                    <option value="">— não importar —</option>
                    {analise.cabecalho.map((c, i) => (
                      <option key={i} value={i}>{c || `coluna ${i + 1}`}</option>
                    ))}
                  </select>
                  <p className="min-w-0 truncate font-mono text-[11px] text-ib-slate" title={exemplo ?? ""}>
                    {exemplo ? `ex.: ${exemplo}` : ""}
                  </p>
                </li>
              );
            })}
          </ul>

          <div className="flex items-center justify-end gap-2 border-t border-ib-line px-5 py-3">
            <button type="button" disabled={ocupado} onClick={() => void executar(false)} className={btnPrimary}>
              {ocupado ? "Conferindo…" : "Ver o que vai acontecer"}
            </button>
          </div>
        </Card>
      ) : null}

      {/* ─── PASSO 3 ─── */}
      {relatorio ? (
        <>
          <Card className="overflow-hidden">
            <div className="grid grid-cols-2 divide-x divide-y divide-ib-line sm:grid-cols-4 sm:divide-y-0">
              <Contador n={relatorio.criados} label="casos novos" tom="bom" />
              <Contador n={relatorio.atualizados} label="atualizados" />
              <Contador n={relatorio.semMudanca} label="sem mudança" />
              <Contador n={relatorio.ignorados} label="fora" tom={relatorio.ignorados ? "alerta" : "normal"} />
            </div>
          </Card>

          {relatorio.conflitosDeEtapa.length > 0 ? (
            <div className="rounded-xl border border-ib-warn/30 bg-ib-warn/[0.07] px-4 py-3 text-sm text-[#9A6212]">
              <p>
                <strong>{relatorio.conflitosDeEtapa.length}</strong>{" "}
                {relatorio.conflitosDeEtapa.length === 1 ? "caso está" : "casos estão"} numa
                etapa diferente da que a planilha diz.
              </p>
              {/* A planilha costuma estar mais desatualizada que o painel: quem move um
                  card o faz olhando a conversa. Por isso mover é opção, e não padrão. */}
              <label className="mt-2 flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={moverEtapa}
                  onChange={(e) => {
                    setMoverEtapa(e.target.checked);
                    setRelatorio(null);
                  }}
                />
                Deixar a planilha mover esses casos de coluna
              </label>
              <ul className="mt-2 space-y-0.5 text-xs">
                {relatorio.conflitosDeEtapa.slice(0, 5).map((c) => (
                  <li key={c.numero}>
                    linha {c.numero} · {c.nome ?? "sem nome"} — está em{" "}
                    <strong>{ATENDIMENTO_LABEL[c.de as AtendimentoStatus] ?? c.de}</strong>, a
                    planilha diz{" "}
                    <strong>{ATENDIMENTO_LABEL[c.para as AtendimentoStatus] ?? c.para}</strong>
                  </li>
                ))}
                {relatorio.conflitosDeEtapa.length > 5 ? (
                  <li>… e mais {relatorio.conflitosDeEtapa.length - 5}.</li>
                ) : null}
              </ul>
            </div>
          ) : null}

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ib-line px-5 py-3">
              <h2 className="text-sm font-semibold text-ib-ink">
                {aplicado ? "O que foi feito" : "O que vai acontecer, linha por linha"}
              </h2>
              {aplicado ? (
                <button type="button" onClick={recomecar} className={btnGhost}>
                  Importar outra
                </button>
              ) : (
                <span className="flex items-center gap-2">
                  <button type="button" onClick={() => setRelatorio(null)} className={btnGhost}>
                    Voltar ao mapeamento
                  </button>
                  <button
                    type="button"
                    disabled={ocupado || relatorio.criados + relatorio.atualizados === 0}
                    onClick={() => void executar(true)}
                    className={btnPrimary}
                  >
                    {ocupado ? "Gravando…" : "Gravar no CRM"}
                  </button>
                </span>
              )}
            </div>

            <div className="max-h-[28rem] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 border-b border-ib-line bg-ib-papel text-[11px] uppercase tracking-[0.08em] text-ib-slate">
                  <tr>
                    <th className="px-5 py-2 text-left font-semibold">Linha</th>
                    <th className="px-5 py-2 text-left font-semibold">Quem</th>
                    <th className="px-5 py-2 text-left font-semibold">O quê</th>
                    <th className="px-5 py-2 text-left font-semibold">Detalhe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ib-line">
                  {relatorio.linhas.map((l) => (
                    <tr key={l.numero}>
                      <td className="px-5 py-2 font-mono text-xs tabular-nums text-ib-slate">{l.numero}</td>
                      <td className="px-5 py-2">
                        <p className="truncate text-ib-ink">{l.nome ?? "sem nome"}</p>
                        <p className="font-mono text-[11px] text-ib-slate">{l.telefone}</p>
                      </td>
                      <td className="px-5 py-2">
                        <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${CHIP[l.desfecho]}`}>
                          {NOME_DO_DESFECHO[l.desfecho]}
                        </span>
                      </td>
                      <td className="px-5 py-2 text-xs text-ib-slate">
                        <p>{l.detalhe}</p>
                        {l.avisos.map((a) => (
                          <p key={a} className="text-[#9A6212]">⚠ {a}</p>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function Contador({ n, label, tom = "normal" }: { n: number; label: string; tom?: "normal" | "bom" | "alerta" }) {
  return (
    <div className="px-5 py-4">
      <p
        className={`font-display text-2xl font-semibold tabular-nums ${
          tom === "bom" ? "text-ib-success" : tom === "alerta" ? "text-[#9A6212]" : "text-ib-ink"
        }`}
      >
        {n}
      </p>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ib-slate">{label}</p>
    </div>
  );
}
