"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CardDoAtendimento } from "@/components/atendimentos/card";
import { ResumoDoLead } from "@/components/atendimentos/resumo-modal";
import { GerenciarEtapas } from "@/components/crm/etapas";
import { Selecao } from "@/components/dashboard/campos";
import { btnGhost, btnPrimary } from "@/components/dashboard/ui";
import { montarQuadro, funilPadrao, faltamDesfechos } from "@/lib/crm/funil";
import { transicao } from "@/lib/fila/kanban";
import { POR_PAGINA } from "@/lib/fila/paginacao";
import type { LeadDaFila } from "@/lib/fila/ordenacao";
import type { AtendimentoStatus, EtapaCrm, FunilCrm } from "@/lib/domain/types";

/**
 * O CRM.
 *
 * Era "o Quadro": cinco colunas fixas, escritas em código, que descreviam o que o sistema
 * sabe de um caso e não o trabalho. Entre "em atendimento" e "fechado" cabem semanas de
 * "esperando a certidão consular", "protocolo enviado", "exigência a cumprir" — e tudo
 * isso ficava empilhado numa coluna só, indistinguível.
 *
 * Agora as colunas são ETAPAS que o escritório desenha, e os funis são vários porque
 * "multa correndo" e "visto de trabalho de quem ainda está lá fora" não são o mesmo
 * trabalho.
 *
 * O QUE NÃO MUDOU — e é o que segura o resto:
 *
 * Arrastar NÃO escreve no banco por um caminho novo. Cada movimento continua virando uma
 * ação de POST /api/leads/[id]/atendimento, que já sabe que "perdido" exige motivo, que
 * assumir grava responsável e cala o agente, e que tudo entra no log de acesso. Quando a
 * etapa de destino tem o MESMO status da atual, a ação é `mover` e só a etapa muda.
 *
 * NO CELULAR NÃO TEM ARRASTO. Drag em tela de toque erra mais do que acerta, e errar aqui
 * significa fechar o caso de alguém. Lá o card ganha um seletor de etapa, que faz
 * exatamente a mesma chamada.
 */
export default function QuadroCrm({
  leads: iniciais,
  agoraISO,
  funis: funisIniciais,
  etapas: etapasIniciais,
  podeDesenhar,
}: {
  leads: LeadDaFila[];
  agoraISO: string;
  funis: FunilCrm[];
  etapas: EtapaCrm[];
  /** Advogado e administrador desenham o quadro. Atendente usa o quadro desenhado. */
  podeDesenhar: boolean;
}) {
  const router = useRouter();
  const agora = useMemo(() => new Date(agoraISO), [agoraISO]);
  const [leads, setLeads] = useState(iniciais);
  const [funis, setFunis] = useState(funisIniciais);
  const [etapas, setEtapas] = useState(etapasIniciais);
  const [funilId, setFunilId] = useState(() => funilPadrao(funisIniciais).id);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [visiveis, setVisiveis] = useState<Record<string, number>>({});
  const [perda, setPerda] = useState<{ lead: LeadDaFila; etapa: EtapaCrm; motivo: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [criandoFunil, setCriandoFunil] = useState(false);
  const [nomeNovoFunil, setNomeNovoFunil] = useState("");
  // O card aberto em resumo. Guardamos o ID e não o objeto: depois de assumir, o lead
  // muda (ganha responsável) e um objeto congelado mostraria o estado anterior.
  const [aberto, setAberto] = useState<string | null>(null);
  const [assumindo, setAssumindo] = useState(false);

  const vivos = funis.filter((f) => !f.arquivado);
  const funil = vivos.find((f) => f.id === funilId) ?? funilPadrao(funis);
  const colunas = useMemo(
    () => montarQuadro(leads, funil, etapas, agora),
    [leads, funil, etapas, agora],
  );
  const doFunil = etapas.filter((e) => e.funilId === funil.id && !e.arquivada);
  const semDesfecho = faltamDesfechos(doFunil);
  const leadAberto = aberto ? leads.find((l) => l.id === aberto) ?? null : null;

  async function assumirDoResumo(lead: LeadDaFila) {
    setAssumindo(true);
    const destino =
      doFunil.find((e) => e.status === "em_atendimento") ??
      colunas.find((c) => c.etapa.status === "em_atendimento")?.etapa;
    if (destino) await mover(lead, destino);
    setAssumindo(false);
    setAberto(null);
  }

  /**
   * Move o card na tela, chama o endpoint e desfaz se ele recusar.
   *
   * A tradução "soltei nesta coluna" → "que ação é essa" acontece pelo STATUS da etapa,
   * não pelo nome dela: é o que faz uma etapa nova chamada "aguardando certidão" herdar
   * as regras de "em atendimento" sem uma linha de código a mais.
   */
  async function mover(lead: LeadDaFila, etapa: EtapaCrm, motivo?: string) {
    const de = lead.atendimentoStatus ?? "novo";
    const mesmaEtapa = lead.etapaId === etapa.id && lead.funilId === etapa.funilId;
    if (mesmaEtapa) return;

    const t = de === etapa.status ? null : transicao(de, etapa.status);
    if (de !== etapa.status && !t) return;
    const acao = t?.acao ?? "mover";

    setErro(null);
    const antes = leads;
    setLeads((atual) =>
      atual.map((l) =>
        l.id === lead.id
          ? { ...l, atendimentoStatus: etapa.status, etapaId: etapa.id, funilId: etapa.funilId }
          : l,
      ),
    );

    const r = await fetch(`/api/leads/${lead.id}/atendimento`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        acao,
        para: t?.para,
        motivo,
        etapaId: etapa.id,
        funilId: etapa.funilId,
      }),
    }).catch(() => null);

    if (!r?.ok) {
      setLeads(antes);
      setErro(
        (await r?.json().catch(() => null))?.error ??
          "Não foi possível mover este atendimento. Nada foi alterado.",
      );
      return;
    }
    router.refresh();
  }

  /** "Perdido" para aqui e pede o motivo antes de gravar — o endpoint recusa sem ele. */
  function pedirOuMover(lead: LeadDaFila, etapa: EtapaCrm) {
    const de = lead.atendimentoStatus ?? "novo";
    const t = de === etapa.status ? null : transicao(de, etapa.status);
    if (t?.exigeMotivo) setPerda({ lead, etapa, motivo: "" });
    else void mover(lead, etapa);
  }

  function soltar(etapa: EtapaCrm) {
    const lead = leads.find((l) => l.id === arrastando);
    setArrastando(null);
    setSobre(null);
    if (lead) pedirOuMover(lead, etapa);
  }

  async function criarFunil() {
    const nome = nomeNovoFunil.trim();
    if (nome.length < 2) return;
    const r = await fetch("/api/crm/funis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome }),
    }).catch(() => null);
    const corpo = await r?.json().catch(() => null);
    if (!r?.ok) {
      setErro(corpo?.error ?? "Não foi possível criar o funil.");
      return;
    }
    // Um funil sem etapa é um quadro vazio. O primeiro desenho vem pronto com as três
    // colunas de trabalho e as duas de desfecho — dá para renomear tudo em seguida.
    const base: { nome: string; status: AtendimentoStatus; ajuda: string }[] = [
      { nome: "Novo", status: "novo", ajuda: "Chegou e ninguém pegou." },
      { nome: "Em atendimento", status: "em_atendimento", ajuda: "Alguém do time está com a bola." },
      { nome: "Reunião agendada", status: "agendado", ajuda: "Reunião marcada com a pessoa." },
      { nome: "Fechado", status: "fechado", ajuda: "Virou cliente ou o assunto se resolveu." },
      { nome: "Perdido", status: "perdido", ajuda: "Não virou atendimento — com o motivo registrado." },
    ];
    const novas: EtapaCrm[] = [];
    for (let i = 0; i < base.length; i++) {
      const e = base[i];
      const resp = await fetch("/api/crm/etapas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...e, funilId: corpo.funil.id, ordem: i }),
      }).catch(() => null);
      const c = await resp?.json().catch(() => null);
      if (c?.etapa) novas.push(c.etapa);
    }
    setFunis((f) => [...f, corpo.funil]);
    setEtapas((e) => [...e, ...novas]);
    setFunilId(corpo.funil.id);
    setNomeNovoFunil("");
    setCriandoFunil(false);
    setEditando(true);
  }

  return (
    <div className="space-y-3">
      {erro ? (
        <div role="alert" className="rounded-xl border border-ib-danger/30 bg-ib-danger/[0.06] px-4 py-3 text-sm text-ib-danger">
          {erro}
        </div>
      ) : null}

      {/* ─── A BARRA DE FUNIS ───
          Um funil por vez. Mostrar dois ao mesmo tempo faria o mesmo caso aparecer em dois
          lugares — e um caso contado duas vezes é trabalho alocado duas vezes. */}
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Funis" className="flex flex-wrap gap-1">
          {vivos.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={f.id === funil.id}
              onClick={() => setFunilId(f.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                f.id === funil.id
                  ? "bg-ib-carimbo text-white"
                  : "bg-white text-ib-slate ring-1 ring-inset ring-ib-line hover:text-ib-ink"
              }`}
            >
              {f.nome}
              {f.padrao ? <span className="ml-1 opacity-60">·padrão</span> : null}
            </button>
          ))}
        </div>

        {podeDesenhar ? (
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={() => setEditando((e) => !e)} className={btnGhost}>
              {editando ? "Fechar etapas" : "Editar etapas"}
            </button>
            {criandoFunil ? (
              <span className="flex items-center gap-1">
                <input
                  autoFocus
                  value={nomeNovoFunil}
                  onChange={(e) => setNomeNovoFunil(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void criarFunil()}
                  placeholder="nome do funil"
                  className="w-40 rounded-lg border border-ib-line bg-white px-2.5 py-1.5 text-xs text-ib-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ib-mar"
                />
                <button type="button" onClick={() => void criarFunil()} className={btnPrimary}>
                  Criar
                </button>
                <button
                  type="button"
                  onClick={() => setCriandoFunil(false)}
                  className="text-xs font-semibold text-ib-slate hover:underline"
                >
                  cancelar
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setCriandoFunil(true)} className={btnGhost}>
                Novo funil
              </button>
            )}
          </div>
        ) : null}
      </div>

      {funil.descricao ? (
        <p className="text-xs text-ib-slate">{funil.descricao}</p>
      ) : null}

      {semDesfecho.length ? (
        <p className="rounded-lg border border-ib-line bg-ib-papel/70 px-3 py-2 text-xs text-ib-slate">
          Este funil não tem etapa de {semDesfecho.map((s) => (s === "fechado" ? "fechamento" : "perda")).join(" nem de ")}.
          Sem ela o caso entra e não sai — e o desfecho deixa de ser contado.
        </p>
      ) : null}

      {editando && podeDesenhar ? (
        <GerenciarEtapas
          funil={funil}
          etapas={doFunil}
          podeApagarFunil={!funil.padrao && vivos.length > 1}
          aoMudar={(proximas) =>
            setEtapas((todas) => [...todas.filter((e) => e.funilId !== funil.id), ...proximas])
          }
          aoMudarFunil={(f) => {
            if (!f) {
              setFunis((atual) => atual.filter((x) => x.id !== funil.id));
              setEtapas((atual) => atual.filter((e) => e.funilId !== funil.id));
              setFunilId(funilPadrao(funis.filter((x) => x.id !== funil.id)).id);
              setEditando(false);
              return;
            }
            setFunis((atual) => atual.map((x) => (x.id === f.id ? f : f.padrao ? { ...x, padrao: false } : x)));
          }}
          aoErrar={setErro}
        />
      ) : null}

      {colunas.length === 0 ? (
        <p className="rounded-xl border border-ib-line bg-ib-papel/50 px-4 py-8 text-center text-sm text-ib-slate">
          Este funil ainda não tem etapas. {podeDesenhar ? "Crie a primeira em “Editar etapas”." : "Peça a um advogado para desenhá-lo."}
        </p>
      ) : (
        <div
          className="grid gap-3 md:grid-cols-2 xl:grid-cols-[repeat(auto-fit,minmax(14rem,1fr))]"
        >
          {colunas.map((coluna) => {
            const limite = visiveis[coluna.etapa.id] ?? POR_PAGINA;
            const mostrando = coluna.leads.slice(0, limite);
            const restam = coluna.leads.length - mostrando.length;
            return (
              <section
                key={coluna.etapa.id}
                aria-label={coluna.etapa.nome}
                onDragOver={(e) => {
                  e.preventDefault();
                  setSobre(coluna.etapa.id);
                }}
                onDragLeave={() => setSobre((s) => (s === coluna.etapa.id ? null : s))}
                onDrop={() => soltar(coluna.etapa)}
                className={`flex min-h-[8rem] flex-col rounded-xl border bg-ib-papel/50 transition ${
                  sobre === coluna.etapa.id ? "border-ib-mar bg-ib-bruma" : "border-ib-line"
                }`}
              >
                <header className="border-b border-ib-line px-3 py-2">
                  <div className="flex items-center gap-2">
                    <h2 className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide text-ib-ink">
                      {coluna.etapa.nome}
                    </h2>
                    <span className="rounded-full bg-white px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-ib-slate ring-1 ring-inset ring-ib-line">
                      {coluna.leads.length}
                    </span>
                  </div>
                  {coluna.etapa.ajuda ? (
                    <p className="mt-0.5 text-[11px] leading-snug text-ib-slate">{coluna.etapa.ajuda}</p>
                  ) : null}
                </header>

                <div className="flex flex-1 flex-col gap-2 p-2">
                  {mostrando.length === 0 ? (
                    <p className="px-1 py-4 text-[11px] leading-relaxed text-ib-slate">Nada aqui.</p>
                  ) : null}

                  {mostrando.map((lead) => (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={() => setArrastando(lead.id)}
                      onDragEnd={() => setArrastando(null)}
                      className={`cursor-grab active:cursor-grabbing ${
                        arrastando === lead.id ? "opacity-40" : ""
                      }`}
                    >
                      <CardDoAtendimento lead={lead} agora={agora} onAbrir={(l) => setAberto(l.id)} />
                      {/* O caminho sem arrasto: existe sempre, e no celular é o único. */}
                      {/* O caminho sem arrasto — no celular é o único que existe, e
                          por isso ele some no desktop (`xl:hidden`), onde arrastar já
                          resolve e um seletor por card viraria ruído em cinco colunas. */}
                      <div className="mt-1 px-1 xl:hidden">
                        <Selecao
                          compacto
                          label="mover para"
                          valor={coluna.etapa.id}
                          onChange={(id) => {
                            const destino = doFunil.find((x) => x.id === id);
                            if (destino) pedirOuMover(lead, destino);
                          }}
                          opcoes={doFunil.map((e) => ({
                            valor: e.id,
                            rotulo: e.nome,
                            ajuda: e.ajuda ?? undefined,
                          }))}
                        />
                      </div>
                    </div>
                  ))}

                  {restam > 0 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setVisiveis((v) => ({ ...v, [coluna.etapa.id]: limite + POR_PAGINA }))
                      }
                      className="rounded-md border border-ib-line bg-white px-2 py-1.5 text-[11px] font-medium text-ib-carimbo transition hover:bg-ib-papel"
                    >
                      Carregar mais {restam > POR_PAGINA ? POR_PAGINA : restam} ({restam} restantes)
                    </button>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {leadAberto ? (
        <ResumoDoLead
          lead={leadAberto}
          agora={agora}
          assumindo={assumindo}
          onFechar={() => setAberto(null)}
          onAssumir={assumirDoResumo}
          funis={vivos}
          etapas={etapas.filter((e) => !e.arquivada)}
          onMover={(l, etapa) => pedirOuMover(l, etapa)}
        />
      ) : null}

      {perda ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ib-ink/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-lg">
            <h2 className="text-sm font-semibold text-ib-ink">Por que este caso foi perdido?</h2>
            <p className="mt-1 text-xs leading-relaxed text-ib-slate">
              É o que alguém vai ler daqui a seis meses tentando entender por que{" "}
              {perda.lead.contactName ?? "esta pessoa"} não virou atendimento.
            </p>
            <textarea
              autoFocus
              rows={3}
              value={perda.motivo}
              onChange={(e) => setPerda({ ...perda, motivo: e.target.value })}
              className="mt-3 w-full resize-y rounded-lg border border-ib-line px-3 py-2 text-sm text-ib-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ib-mar"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className={btnGhost} onClick={() => setPerda(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className={btnPrimary}
                disabled={!perda.motivo.trim()}
                onClick={() => {
                  const { lead, etapa, motivo } = perda;
                  setPerda(null);
                  void mover(lead, etapa, motivo.trim());
                }}
              >
                Marcar como perdido
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
