"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, Icon, Skeleton, btnGhost, btnPrimary, fmtTime } from "@/components/dashboard/ui";
import { ChipIdioma, ContadorPrazo } from "@/components/fila/linha";
import { nomeDoIdioma } from "@/lib/domain/idiomas";
import {
  ATENDIMENTO_LABEL,
  CLASSIFICACAO_AJUDA,
  CLASSIFICACAO_LABEL,
  INTENCAO_AJUDA,
  INTENCAO_LABEL,
  PRAZO_TIPO_LABEL,
} from "@/lib/domain/rotulos";
import { CLASSIFICACOES } from "@/lib/domain/types";
import type {
  Classificacao, Conversation, Intencao, Lead, Lembrete, Message, PrazoTipo, Reclassificacao,
} from "@/lib/domain/types";
import type { EventoDaLinha } from "@/lib/operacao/linha-do-tempo";
import { RELOGIO_APERTADO_DIAS, diasRestantes, faixaDoPrazo } from "@/lib/fila/ordenacao";

/**
 * O DETALHE DO LEAD.
 *
 * À esquerda a conversa inteira, com os áudios originais para ouvir junto da
 * transcrição: quem atende precisa poder conferir o que a pessoa realmente disse, e a
 * transcrição automática erra nome próprio, cidade e número de protocolo justamente nas
 * conversas em que isso mais importa.
 *
 * À direita a ficha, toda editável. O que a IA errou, o humano conserta — e quando o que
 * ele conserta é a CLASSIFICAÇÃO, o par (de → para) fica registrado: é esse par que
 * calibra o agente.
 *
 * No topo da coluna direita, quando há prazo sinalizado, a confirmação de prazo. É a
 * primeira coisa que a pessoa vê porque é a primeira coisa que precisa acontecer.
 */

type Detalhe = {
  lead: Lead;
  conversation: Conversation | null;
  messages: Message[];
  reclassificacoes: Reclassificacao[];
  lembretes: Lembrete[];
  linhaDoTempo: EventoDaLinha[];
  usuarios: { id: string; nome: string }[];
};

export default function LeadDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [data, setData] = useState<Detalhe | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const r = await fetch(`/api/leads/${id}`, { cache: "no-store" });
    if (!r.ok) {
      setErro(r.status === 404 ? "Este lead não existe mais." : "Não foi possível carregar.");
      return;
    }
    setData(await r.json());
  }, [id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (erro) {
    return (
      <Card className="p-6">
        <p className="text-sm text-ib-ink">{erro}</p>
        <Link href="/dashboard" className={`${btnGhost} mt-4`}>
          Voltar para a fila
        </Link>
      </Card>
    );
  }

  if (!data) {
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <Card className="p-5">
          <Skeleton className="h-4 w-40" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <Skeleton className="h-4 w-32" />
        </Card>
      </div>
    );
  }

  const { lead } = data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-ib-mar hover:underline"
          >
            <Icon name="arrow" className="h-3.5 w-3.5 rotate-180" />
            Fila
          </Link>
          <h1 className="mt-1 flex items-center gap-2.5 font-display text-2xl font-semibold tracking-tight text-ib-ink">
            <ChipIdioma idioma={lead.idioma} />
            <span className="truncate">
              {lead.contactName ?? lead.whatsappNumber}
            </span>
          </h1>
          <p className="mt-1 text-sm text-ib-slate">
            {[
              lead.nacionalidade,
              lead.localizacao === "exterior"
                ? `no exterior${lead.paisExterior ? ` (${lead.paisExterior})` : ""}`
                : lead.localizacao === "brasil"
                  ? "no Brasil"
                  : null,
              lead.idioma ? `fala ${nomeDoIdioma(lead.idioma)}` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "Sem dados de identificação ainda."}
          </p>
        </div>
        <span className="rounded-full bg-ib-papel px-3 py-1 text-xs font-semibold text-ib-slate ring-1 ring-inset ring-ib-line">
          {ATENDIMENTO_LABEL[lead.atendimentoStatus ?? "novo"]}
        </span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start">
        <Transcricao messages={data.messages} />
        <div className="space-y-5 lg:sticky lg:top-4">
          {lead.temPrazoCorrendo ? <BlocoPrazo lead={lead} aoSalvar={carregar} /> : null}
          <Acoes detalhe={data} aoSalvar={carregar} />
          <Retornos detalhe={data} aoSalvar={carregar} />
          <Ficha lead={lead} aoSalvar={carregar} />
          <Classificar detalhe={data} aoSalvar={carregar} />
          <LinhaDoTempo eventos={data.linhaDoTempo} />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────── Transcrição ─────────────────────────────── */

function Transcricao({ messages }: { messages: Message[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-ib-line px-5 py-3">
        <h2 className="text-sm font-semibold text-ib-ink">Conversa</h2>
        <span className="font-mono text-xs tabular-nums text-ib-slate">
          {messages.length} mensagens
        </span>
      </div>
      <div className="max-h-[70vh] space-y-3 overflow-y-auto bg-ib-papel/50 p-4">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-ib-slate">
            Nenhuma mensagem registrada nesta conversa.
          </p>
        ) : (
          messages.map((m) => {
            const daPessoa = m.role === "user";
            return (
              <div key={m.id} className={`flex ${daPessoa ? "justify-start" : "justify-end"}`}>
                <div className="max-w-[85%]">
                  <div
                    className={`rounded-xl px-3.5 py-2.5 text-sm ${
                      daPessoa
                        ? "rounded-bl-sm border border-ib-line bg-white text-ib-ink"
                        : "rounded-br-sm bg-ib-carimbo text-white"
                    }`}
                  >
                    {m.mediaUrl ? <Anexo m={m} daPessoa={daPessoa} /> : null}
                    {m.content ? (
                      <p className="whitespace-pre-wrap break-words leading-relaxed">{m.content}</p>
                    ) : null}
                  </div>
                  <p className="mt-1 px-1 font-mono text-[11px] tabular-nums text-ib-slate">
                    {daPessoa ? "Pessoa" : "Agente"} · {fmtTime(m.createdAt)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}

/**
 * O ÁUDIO ORIGINAL FICA JUNTO DA TRANSCRIÇÃO, não no lugar dela.
 *
 * A transcrição automática erra nome próprio, cidade e número de protocolo — e é
 * exatamente disso que uma conversa de imigração é feita. Quem vai cuidar do caso precisa
 * poder ouvir, sobretudo quando a pessoa fala português com sotaque ou mistura idiomas.
 */
function Anexo({ m, daPessoa }: { m: Message; daPessoa: boolean }) {
  if (m.mediaType === "audio") {
    return (
      <div className="mb-2">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio controls preload="none" src={m.mediaUrl ?? undefined} className="w-full max-w-xs" />
        {m.mediaText ? (
          <p
            className={`mt-1.5 border-l-2 pl-2 text-xs italic leading-relaxed ${
              daPessoa ? "border-ib-line text-ib-slate" : "border-white/30 text-white/80"
            }`}
          >
            transcrição: {m.mediaText}
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <a href={m.mediaUrl ?? "#"} target="_blank" rel="noreferrer" className="mb-2 block">
      {m.mediaType === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={m.mediaUrl ?? ""}
          alt={m.mediaName ?? "anexo"}
          className="max-h-64 w-full rounded-lg object-contain"
        />
      ) : (
        <span
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
            daPessoa ? "bg-ib-papel text-ib-ink" : "bg-white/15"
          }`}
        >
          <Icon name="doc" className="h-3.5 w-3.5" />
          {m.mediaName ?? "Abrir arquivo"}
        </span>
      )}
    </a>
  );
}

/* ──────────────────────────── Confirmação de prazo ───────────────────────── */

const TIPOS: PrazoTipo[] = ["multa", "indeferimento", "notificacao_saida", "outro"];

function BlocoPrazo({ lead, aoSalvar }: { lead: Lead; aoSalvar: () => void }) {
  const [tipo, setTipo] = useState<PrazoTipo>(lead.prazoTipo ?? "outro");
  const [notificacao, setNotificacao] = useState(lead.prazoDataNotificacao ?? "");
  const [limite, setLimite] = useState(lead.prazoDataLimite ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const confirmado = !!lead.prazoDataLimite;
  const dias = lead.prazoDataLimite ? diasRestantes(lead.prazoDataLimite) : null;

  async function confirmar() {
    setSalvando(true);
    setErro(null);
    const r = await fetch(`/api/leads/${lead.id}/prazo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo, notificacao, limite }),
    });
    setSalvando(false);
    if (!r.ok) {
      setErro((await r.json().catch(() => ({}))).error ?? "Não foi possível confirmar o prazo.");
      return;
    }
    aoSalvar();
  }

  return (
    <Card
      className={`overflow-hidden ${confirmado ? "" : "ring-2 ring-ib-danger/40"}`}
    >
      <div
        className={`px-5 py-3 ${confirmado ? "border-b border-ib-line bg-ib-papel/70" : "bg-ib-danger text-white"}`}
      >
        <h2 className={`text-sm font-semibold ${confirmado ? "text-ib-ink" : "text-white"}`}>
          {confirmado ? "Prazo confirmado" : "Prazo a confirmar"}
        </h2>
        <p className={`mt-0.5 text-xs ${confirmado ? "text-ib-slate" : "text-white/85"}`}>
          {confirmado
            ? `Confirmado por ${lead.prazoConfirmadoPor ?? "—"}.`
            : "O agente sinalizou prazo. Ligue, confirme a data com a pessoa e registre aqui."}
        </p>
      </div>

      <div className="space-y-3 p-5">
        {confirmado && dias !== null ? (
          <div className="flex items-center gap-2">
            <ContadorPrazo dias={dias} faixa={faixaDoPrazo(dias)} />
            <span className="text-xs text-ib-slate">{PRAZO_TIPO_LABEL[lead.prazoTipo ?? "outro"]}</span>
          </div>
        ) : null}

        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ib-slate">
            Que prazo é este
          </span>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as PrazoTipo)}
            className="mt-1 w-full rounded-lg border border-ib-line bg-white px-3 py-2 text-sm text-ib-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ib-mar"
          >
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {PRAZO_TIPO_LABEL[t]}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ib-slate">
              Data da notificação
            </span>
            <input
              type="date"
              value={notificacao}
              onChange={(e) => setNotificacao(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ib-line bg-white px-3 py-2 font-mono text-sm text-ib-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ib-mar"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ib-slate">
              Data limite
            </span>
            <input
              type="date"
              value={limite}
              onChange={(e) => setLimite(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ib-line bg-white px-3 py-2 font-mono text-sm text-ib-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ib-mar"
            />
          </label>
        </div>

        <p className="text-xs leading-relaxed text-ib-slate">
          Digite a data que está no documento — ela não é calculada a partir da
          notificação. O prazo depende do tipo de ato e de quando a pessoa foi
          efetivamente notificada, que raramente é o dia em que ela pegou o papel.
        </p>

        {erro ? <p className="text-xs font-medium text-ib-danger">{erro}</p> : null}

        <button type="button" onClick={confirmar} disabled={salvando} className={`${btnPrimary} w-full`}>
          {salvando ? "Confirmando prazo…" : "Confirmar prazo"}
        </button>
      </div>
    </Card>
  );
}

/* ────────────────────────────────── Ações ────────────────────────────────── */

function Acoes({ detalhe, aoSalvar }: { detalhe: Detalhe; aoSalvar: () => void }) {
  const { lead } = detalhe;
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [pedindoMotivo, setPedindoMotivo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function acao(nome: "assumir" | "agendar" | "fechar" | "perder", extra?: object) {
    setOcupado(nome);
    setErro(null);
    const r = await fetch(`/api/leads/${lead.id}/atendimento`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: nome, ...extra }),
    });
    setOcupado(null);
    if (!r.ok) {
      setErro((await r.json().catch(() => ({}))).error ?? "Não foi possível concluir.");
      return;
    }
    setPedindoMotivo(false);
    setMotivo("");
    aoSalvar();
  }

  const responsavel = detalhe.usuarios.find((u) => u.id === lead.responsavelId);

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-ib-ink">Atendimento</h2>
      <p className="mt-1 text-xs text-ib-slate">
        {responsavel
          ? `Com ${responsavel.nome} desde ${lead.assumidoEm ? fmtTime(lead.assumidoEm) : "—"}.`
          : "Ninguém assumiu este atendimento ainda."}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {/* O nome da ação se mantém do botão até a confirmação. */}
        <button
          type="button"
          onClick={() => acao("assumir")}
          disabled={ocupado !== null}
          className={`${btnPrimary} col-span-2`}
        >
          {ocupado === "assumir" ? "Assumindo atendimento…" : "Assumir atendimento"}
        </button>
        <button type="button" onClick={() => acao("agendar")} disabled={ocupado !== null} className={btnGhost}>
          {ocupado === "agendar" ? "Agendando…" : "Agendar reunião"}
        </button>
        <button type="button" onClick={() => acao("fechar")} disabled={ocupado !== null} className={btnGhost}>
          {ocupado === "fechar" ? "Fechando…" : "Marcar como fechado"}
        </button>
      </div>

      {pedindoMotivo ? (
        <div className="mt-3 space-y-2 rounded-lg border border-ib-line bg-ib-papel/60 p-3">
          <label className="block text-xs font-semibold text-ib-ink" htmlFor="motivo-perda">
            Por que este caso foi perdido?
          </label>
          <input
            id="motivo-perda"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="não respondeu, contratou outro escritório, desistiu…"
            className="w-full rounded-lg border border-ib-line bg-white px-3 py-2 text-sm text-ib-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ib-mar"
          />
          <p className="text-[11px] leading-relaxed text-ib-slate">
            É o que se lê daqui a seis meses, quando alguém perguntar por que estes casos
            não viraram atendimento.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => acao("perder", { motivo })}
              disabled={ocupado !== null || !motivo.trim()}
              className={btnPrimary}
            >
              {ocupado === "perder" ? "Marcando como perdido…" : "Marcar como perdido"}
            </button>
            <button type="button" onClick={() => setPedindoMotivo(false)} className={btnGhost}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPedindoMotivo(true)}
          className="mt-2 text-xs font-semibold text-ib-slate underline hover:text-ib-danger"
        >
          Marcar como perdido
        </button>
      )}

      {lead.motivoPerda ? (
        <p className="mt-2 text-xs text-ib-slate">Perdido: {lead.motivoPerda}</p>
      ) : null}
      {erro ? <p className="mt-2 text-xs font-medium text-ib-danger">{erro}</p> : null}
    </Card>
  );
}

/* ─────────────────────────────────── Ficha ───────────────────────────────── */

type CampoTexto = {
  chave: keyof Lead;
  label: string;
  multi?: boolean;
  dica?: string;
};

const CAMPOS: CampoTexto[] = [
  { chave: "contactName", label: "Nome" },
  { chave: "nacionalidade", label: "Nacionalidade" },
  { chave: "paisExterior", label: "País (se está fora do Brasil)" },
  { chave: "objetivo", label: "O que a pessoa quer conseguir", multi: true },
  { chave: "relogioDoCaso", label: "O relógio do caso", multi: true, dica: "O que pressiona e quando: início das aulas, contrato, vencimento de passaporte ou CRNM. Prazo processual fica no bloco de prazo, acima." },
  { chave: "modalidadeProvavel", label: "Modalidade provável", dica: "Hipótese para conferir, não orientação dada à pessoa." },
  { chave: "situacaoDocumental", label: "Situação documental", multi: true },
  { chave: "documentosPossui", label: "Documentos que tem", multi: true },
  { chave: "documentosFaltantes", label: "Documentos que faltam", multi: true },
  { chave: "vinculoFamiliarBrasil", label: "Vínculo familiar no Brasil", multi: true },
  { chave: "resumo", label: "Resumo (2 linhas)", multi: true },
  { chave: "notes", label: "Observações internas", multi: true },
];

function Ficha({ lead, aoSalvar }: { lead: Lead; aoSalvar: () => void }) {
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [salvando, setSalvando] = useState(false);
  const [ok, setOk] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // O formulário parte do que está gravado e guarda só o que foi mexido: enviar a ficha
  // inteira a cada salvamento sobrescreveria, com o que estava na tela, o que o agente
  // descobriu enquanto ela ficou aberta.
  const valor = (k: keyof Lead) =>
    (form[k as string] as string | undefined) ?? ((lead[k] as string | null) ?? "");

  function mexer(k: keyof Lead, v: unknown) {
    setForm((f) => ({ ...f, [k as string]: v }));
    setOk(false);
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const r = await fetch(`/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSalvando(false);
    if (!r.ok) {
      setErro((await r.json().catch(() => ({}))).error ?? "Não foi possível salvar.");
      return;
    }
    setForm({});
    setOk(true);
    aoSalvar();
  }

  const mexeu = Object.keys(form).length > 0;

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-ib-ink">Ficha</h2>
      <p className="mt-1 text-xs text-ib-slate">
        O que o agente errou, corrija aqui. A correção fica registrada.
      </p>

      <div className="mt-3 space-y-3">
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ib-slate">
            Onde a pessoa está
          </span>
          <select
            value={(form.localizacao as string) ?? lead.localizacao ?? ""}
            onChange={(e) => mexer("localizacao", e.target.value || null)}
            className="mt-1 w-full rounded-lg border border-ib-line bg-white px-3 py-2 text-sm text-ib-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ib-mar"
          >
            <option value="">não se sabe</option>
            <option value="brasil">no Brasil</option>
            <option value="exterior">no exterior</option>
          </select>
        </label>

        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ib-slate">
            Data do relógio (opcional)
          </span>
          <input
            type="date"
            value={(form.relogioData as string) ?? lead.relogioData ?? ""}
            onChange={(e) => mexer("relogioData", e.target.value || null)}
            className="mt-1 w-full rounded-lg border border-ib-line bg-white px-3 py-2 text-sm text-ib-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ib-mar"
          />
          <span className="mt-0.5 block text-[11px] text-ib-slate">
            Só preencha se a pessoa confirmou a data. A menos de {RELOGIO_APERTADO_DIAS} dias, o caso sobe na
            fila normal e ganha marcador — não vira prazo processual e não entra no bloco de prazos.
          </span>
        </label>

        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ib-slate">
            Intenção declarada
          </span>
          <select
            value={(form.intencao as string) ?? lead.intencao ?? ""}
            onChange={(e) => mexer("intencao", e.target.value || null)}
            className="mt-1 w-full rounded-lg border border-ib-line bg-white px-3 py-2 text-sm text-ib-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ib-mar"
          >
            <option value="">ainda não perguntaram</option>
            {(Object.keys(INTENCAO_LABEL) as Intencao[]).map((i) => (
              <option key={i} value={i}>
                {INTENCAO_LABEL[i]}
              </option>
            ))}
          </select>
          <span className="mt-0.5 block text-[11px] text-ib-slate">
            {lead.intencao ? INTENCAO_AJUDA[lead.intencao] : "Sai do teste de intenção, feito uma vez antes de encaminhar."}
          </span>
        </label>

        <label className="flex items-start gap-2 text-sm text-ib-ink">
          <input
            type="checkbox"
            checked={
              (form.entradaControleMigratorio as boolean | undefined) ??
              lead.entradaControleMigratorio ??
              false
            }
            onChange={(e) => mexer("entradaControleMigratorio", e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-ib-line text-ib-mar focus-visible:ring-2 focus-visible:ring-ib-mar"
          />
          <span>
            Entrou pelo controle migratório
            <span className="block text-xs text-ib-slate">
              Marque só se a pessoa contou. Não é para ser perguntado como fiscalização.
            </span>
          </span>
        </label>

        {CAMPOS.map((c) => (
          <label key={c.chave as string} className="block">
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ib-slate">
              {c.label}
            </span>
            {c.multi ? (
              <textarea
                rows={2}
                value={valor(c.chave)}
                onChange={(e) => mexer(c.chave, e.target.value)}
                className="mt-1 w-full resize-y rounded-lg border border-ib-line bg-white px-3 py-2 text-sm leading-relaxed text-ib-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ib-mar"
              />
            ) : (
              <input
                value={valor(c.chave)}
                onChange={(e) => mexer(c.chave, e.target.value)}
                className="mt-1 w-full rounded-lg border border-ib-line bg-white px-3 py-2 text-sm text-ib-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ib-mar"
              />
            )}
            {c.dica ? <span className="mt-0.5 block text-[11px] text-ib-slate">{c.dica}</span> : null}
          </label>
        ))}
      </div>

      {erro ? <p className="mt-2 text-xs font-medium text-ib-danger">{erro}</p> : null}
      {ok ? <p className="mt-2 text-xs font-medium text-ib-success">Ficha salva.</p> : null}

      <button
        type="button"
        onClick={salvar}
        disabled={salvando || !mexeu}
        className={`${btnPrimary} mt-4 w-full`}
      >
        {salvando ? "Salvando ficha…" : "Salvar ficha"}
      </button>
    </Card>
  );
}

/* ────────────────────────────── Reclassificação ──────────────────────────── */

function Classificar({ detalhe, aoSalvar }: { detalhe: Detalhe; aoSalvar: () => void }) {
  const { lead, reclassificacoes } = detalhe;
  const [nova, setNova] = useState<Classificacao>(lead.classificacao ?? "MORNO_ADMINISTRATIVO");
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function reclassificar() {
    setSalvando(true);
    setErro(null);
    const r = await fetch(`/api/leads/${lead.id}/classificacao`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classificacao: nova, motivo }),
    });
    setSalvando(false);
    if (!r.ok) {
      setErro((await r.json().catch(() => ({}))).error ?? "Não foi possível reclassificar.");
      return;
    }
    setMotivo("");
    aoSalvar();
  }

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-ib-ink">Classificação</h2>
      <p className="mt-1 text-xs text-ib-slate">
        O agente classificou como{" "}
        <strong className="text-ib-ink">
          {lead.classificacaoIa ? CLASSIFICACAO_LABEL[lead.classificacaoIa] : "—"}
        </strong>
        . Discordar aqui é o que calibra o agente.
      </p>

      <select
        value={nova}
        onChange={(e) => setNova(e.target.value as Classificacao)}
        className="mt-3 w-full rounded-lg border border-ib-line bg-white px-3 py-2 text-sm text-ib-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ib-mar"
      >
        {CLASSIFICACOES.map((c) => (
          <option key={c} value={c}>
            {CLASSIFICACAO_LABEL[c]}
          </option>
        ))}
      </select>
      <p className="mt-1 text-[11px] leading-relaxed text-ib-slate">{CLASSIFICACAO_AJUDA[nova]}</p>

      <input
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="por que a classificação estava errada (opcional)"
        className="mt-2 w-full rounded-lg border border-ib-line bg-white px-3 py-2 text-sm text-ib-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ib-mar"
      />

      {erro ? <p className="mt-2 text-xs font-medium text-ib-danger">{erro}</p> : null}

      <button
        type="button"
        onClick={reclassificar}
        disabled={salvando || nova === lead.classificacao}
        className={`${btnGhost} mt-3 w-full`}
      >
        {salvando ? "Reclassificando…" : "Reclassificar"}
      </button>

      {reclassificacoes.length > 0 ? (
        <ul className="mt-4 space-y-1.5 border-t border-ib-line pt-3">
          {reclassificacoes.map((r) => (
            <li key={r.id} className="text-[11px] leading-relaxed text-ib-slate">
              <span className="font-mono tabular-nums">{fmtTime(r.criadoEm)}</span> ·{" "}
              {r.de ? CLASSIFICACAO_LABEL[r.de] : "sem classificação"} →{" "}
              <strong className="text-ib-ink">{CLASSIFICACAO_LABEL[r.para]}</strong> · {r.autor}
              {r.motivo ? ` — ${r.motivo}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

/* ────────────────────────── Retornos agendados ───────────────────────────── */

/**
 * O CICLO AQUI É LONGO — e é isso que faz o lembrete valer mais do que parece.
 *
 * A pessoa some três semanas esperando a certidão do consulado. Não é desinteresse, é o
 * processo. Sem uma data e um motivo escritos, ela vira "lead frio" e alguém eventualmente
 * fecha o caso por engano.
 *
 * A nota é obrigatória de propósito: "ligar dia 12" não diz nada a quem abrir o painel
 * duas semanas depois — inclusive a quem escreveu.
 */
function Retornos({ detalhe, aoSalvar }: { detalhe: Detalhe; aoSalvar: () => void }) {
  const { lead, lembretes } = detalhe;
  const [quando, setQuando] = useState("");
  const [nota, setNota] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function agendar() {
    setSalvando(true);
    setErro(null);
    const r = await fetch(`/api/leads/${lead.id}/lembretes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quando, nota }),
    });
    setSalvando(false);
    if (!r.ok) {
      setErro((await r.json().catch(() => ({}))).error ?? "Não foi possível agendar.");
      return;
    }
    setQuando("");
    setNota("");
    aoSalvar();
  }

  async function concluir(id: string) {
    await fetch(`/api/lembretes/${id}`, { method: "POST" }).catch(() => null);
    aoSalvar();
  }

  const pendentes = lembretes.filter((l) => !l.feitoEm);

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-ib-ink">Retornos</h2>
      <p className="mt-1 text-xs leading-relaxed text-ib-slate">
        No dia marcado, este caso sobe para o topo de <strong>Meus atendimentos</strong> com
        a sua nota à vista.
      </p>

      {pendentes.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {pendentes.map((l) => (
            <li
              key={l.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-ib-line bg-ib-papel/60 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="font-mono text-xs tabular-nums text-ib-carimbo">{l.quando}</p>
                <p className="mt-0.5 text-[13px] leading-snug text-ib-ink">{l.nota}</p>
              </div>
              <button
                type="button"
                onClick={() => concluir(l.id)}
                className="shrink-0 text-[11px] font-semibold text-ib-mar hover:underline"
              >
                concluir
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 space-y-2">
        <input
          type="date"
          value={quando}
          onChange={(e) => setQuando(e.target.value)}
          aria-label="Data do retorno"
          className="w-full rounded-lg border border-ib-line bg-white px-3 py-2 font-mono text-sm text-ib-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ib-mar"
        />
        <input
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="por que voltar a falar (ex.: quando ele conseguir a certidão consular)"
          className="w-full rounded-lg border border-ib-line bg-white px-3 py-2 text-sm text-ib-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ib-mar"
        />
        {erro ? <p className="text-xs font-medium text-ib-danger">{erro}</p> : null}
        <button
          type="button"
          onClick={agendar}
          disabled={salvando || !quando || nota.trim().length < 3}
          className={`${btnGhost} w-full`}
        >
          {salvando ? "Agendando retorno…" : "Agendar retorno"}
        </button>
      </div>
    </Card>
  );
}

/* ─────────────────────────── Linha do tempo ──────────────────────────────── */

/**
 * O que já foi feito neste caso, em ordem.
 *
 * É o que alguém precisa ler primeiro quando pega um caso do colega. A conversa inteira
 * não responde isso: ela conta o que a PESSOA disse, não o que o time fez.
 */
function LinhaDoTempo({ eventos }: { eventos: EventoDaLinha[] }) {
  if (!eventos.length) return null;
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-ib-ink">Linha do tempo</h2>
      <ol className="mt-3 space-y-2.5 border-l border-ib-line pl-4">
        {eventos.map((e, i) => (
          <li key={`${e.em}-${i}`} className="relative">
            <span
              className={`absolute -left-[1.3rem] top-1.5 h-1.5 w-1.5 rounded-full ${
                e.peso === "marco" ? "bg-ib-mar" : "bg-ib-line"
              }`}
            />
            <p className={`text-[13px] leading-snug ${e.peso === "marco" ? "text-ib-ink" : "text-ib-slate"}`}>
              {e.texto}
            </p>
            <p className="font-mono text-[11px] tabular-nums text-ib-slate">
              {fmtTime(e.em)}
              {e.autor ? ` · ${e.autor}` : ""}
            </p>
          </li>
        ))}
      </ol>
    </Card>
  );
}
