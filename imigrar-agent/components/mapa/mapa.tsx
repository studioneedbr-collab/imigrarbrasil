"use client";

import { useState } from "react";
import { Card } from "@/components/dashboard/ui";
import type { EtapaDoMapa, TipoDeEtapa, CenarioFixo } from "@/lib/agent/mapa";

/**
 * O MAPA, NA TELA.
 *
 * Um fluxograma daria a forma e esconderia o que interessa: caixinha com seta não diz
 * POR QUE a etapa existe, e é justamente isso que quem lê precisa saber para confiar (ou
 * desconfiar) do agente. Então o mapa tem duas metades que trabalham juntas:
 *
 *   · a TRILHA, à esquerda — a ordem real das etapas, com as bifurcações à vista;
 *   · o DETALHE, à direita — o que a etapa faz, por que existe e em que arquivo mora.
 *
 * Cor por TIPO, e a legenda diz o que cada uma significa. A separação que mais importa
 * não é estética: PORTÃO e REDE são código determinístico, que decide sem perguntar ao
 * modelo; MODELO é a única caixa onde há um LLM escrevendo. Quem olha o mapa costuma
 * imaginar que o agente decide tudo — e é o contrário: ele escreve dentro de um corredor
 * bem estreito, e o corredor é o resto do desenho.
 */

const TIPO: Record<TipoDeEtapa, { rotulo: string; ponto: string; caixa: string; texto: string }> = {
  entrada: {
    rotulo: "Entrada",
    ponto: "bg-ib-slate",
    caixa: "border-ib-line bg-white",
    texto: "text-ib-slate",
  },
  leitura: {
    rotulo: "Leitura",
    ponto: "bg-ib-carimbo",
    caixa: "border-ib-line bg-white",
    texto: "text-ib-carimbo",
  },
  portao: {
    rotulo: "Portão (código decide)",
    ponto: "bg-ib-mar",
    caixa: "border-ib-mar/30 bg-ib-bruma/40",
    texto: "text-ib-mar",
  },
  modelo: {
    rotulo: "A Ana escreve",
    ponto: "bg-ib-selo",
    caixa: "border-ib-selo/40 bg-ib-selo/[0.06]",
    texto: "text-[#0B7285]",
  },
  rede: {
    rotulo: "Rede de proteção",
    ponto: "bg-ib-danger",
    caixa: "border-ib-danger/30 bg-ib-danger/[0.05]",
    texto: "text-ib-danger",
  },
  saida: {
    rotulo: "Saída",
    ponto: "bg-ib-ink",
    caixa: "border-ib-line bg-ib-papel/70",
    texto: "text-ib-ink",
  },
};

export function MapaDoAtendimento({
  etapas,
  cenariosFixos,
  cenariosConfigurados,
  classificacoes,
  acervo,
}: {
  etapas: EtapaDoMapa[];
  cenariosFixos: CenarioFixo[];
  /** Objeções e regras de encaminhamento vindas de /dashboard/treinar. */
  cenariosConfigurados: { pergunta: string; resposta: string; origem: string }[];
  classificacoes: { chave: string; rotulo: string; ajuda: string }[];
  acervo: { titulo: string; cobre: string; colecao: string }[];
}) {
  const [aberta, setAberta] = useState(etapas[0]?.id ?? "");
  const etapa = etapas.find((e) => e.id === aberta) ?? etapas[0];
  const [busca, setBusca] = useState("");

  const cenarios = [
    ...cenariosFixos.map((c) => ({ pergunta: c.pergunta, resposta: c.resposta, origem: c.onde, fixo: true })),
    ...cenariosConfigurados.map((c) => ({ ...c, fixo: false })),
  ].filter((c) =>
    busca.trim()
      ? `${c.pergunta} ${c.resposta}`.toLowerCase().includes(busca.trim().toLowerCase())
      : true,
  );

  return (
    <div className="space-y-5">
      {/* ─── LEGENDA ─── */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {(Object.keys(TIPO) as TipoDeEtapa[]).map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5 text-xs text-ib-slate">
              <span className={`h-2.5 w-2.5 rounded-full ${TIPO[t].ponto}`} aria-hidden="true" />
              {TIPO[t].rotulo}
            </span>
          ))}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-ib-slate">
          A separação que importa não é de cor: <strong className="text-ib-ink">portão</strong> e{" "}
          <strong className="text-ib-ink">rede</strong> são código determinístico, que decide sem
          perguntar ao modelo. Só uma caixa do mapa inteiro tem um LLM escrevendo — o resto é o
          corredor por onde ele pode andar.
        </p>
      </Card>

      {/* ─── O FLUXO INTEIRO, DE UMA VEZ ───
          A trilha embaixo é boa para percorrer etapa a etapa e ruim para responder "quantas
          decisões existem entre a mensagem chegar e a resposta sair?". Esta faixa responde
          isso de um olhar: treze caixas, as cores dizendo onde é código e onde é modelo, e
          o percurso inteiro cabendo numa linha. Clicar em qualquer uma abre o detalhe. */}
      <Card className="overflow-hidden">
        <div className="border-b border-ib-line px-5 py-3">
          <h2 className="text-sm font-semibold text-ib-ink">O caminho inteiro</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-ib-slate">
            Da mensagem no WhatsApp até o caso na fila. Clique em qualquer caixa para ver o que
            ela faz e por quê.
          </p>
        </div>
        <div className="overflow-x-auto p-4">
          <ol className="flex min-w-max items-stretch gap-1">
            {etapas.map((e, i) => {
              const ativa = e.id === etapa?.id;
              return (
                <li key={e.id} className="flex items-stretch gap-1">
                  <button
                    type="button"
                    onClick={() => setAberta(e.id)}
                    aria-current={ativa ? "step" : undefined}
                    className={`w-36 rounded-xl border px-2.5 py-2 text-left transition ${
                      TIPO[e.tipo].caixa
                    } ${
                      ativa
                        ? "ring-2 ring-ib-mar"
                        : "opacity-90 hover:opacity-100 hover:shadow-[0_1px_3px_rgba(16,24,40,0.08)]"
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${TIPO[e.tipo].ponto}`} aria-hidden="true" />
                      <span className="font-mono text-[10px] tabular-nums text-ib-slate">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                    </span>
                    <span className="mt-1 block text-[12px] font-semibold leading-tight text-ib-ink">
                      {e.titulo}
                    </span>
                    {e.caminhos?.length ? (
                      <span className="mt-1 block text-[10px] text-ib-slate">
                        {e.caminhos.length} bifurcações
                      </span>
                    ) : null}
                  </button>
                  {i < etapas.length - 1 ? (
                    <span aria-hidden="true" className="flex items-center text-ib-line">
                      →
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      </Card>

      {/* ─── A TRILHA + O DETALHE ─── */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start">
        <Card className="p-3">
          <ol className="relative space-y-1 pl-5">
            {/* A linha que liga as etapas. É o que faz a lista virar percurso. */}
            <span
              aria-hidden="true"
              className="absolute bottom-3 left-[0.4rem] top-3 w-px bg-ib-line"
            />
            {etapas.map((e, i) => {
              const ativa = e.id === etapa?.id;
              return (
                <li key={e.id} className="relative">
                  <span
                    aria-hidden="true"
                    className={`absolute -left-[0.85rem] top-3 h-2.5 w-2.5 rounded-full ring-2 ring-white ${TIPO[e.tipo].ponto}`}
                  />
                  <button
                    type="button"
                    onClick={() => setAberta(e.id)}
                    aria-current={ativa ? "step" : undefined}
                    className={`w-full rounded-lg px-3 py-2 text-left transition ${
                      ativa ? "bg-ib-bruma/50 ring-1 ring-inset ring-ib-mar/30" : "hover:bg-ib-papel"
                    }`}
                  >
                    <span className="flex items-baseline gap-2">
                      <span className="font-mono text-[10px] tabular-nums text-ib-slate">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className={`text-sm font-semibold ${ativa ? "text-ib-ink" : "text-ib-ink/90"}`}>
                        {e.titulo}
                      </span>
                    </span>
                    <span className={`mt-0.5 block text-[11px] ${TIPO[e.tipo].texto}`}>
                      {TIPO[e.tipo].rotulo}
                      {e.caminhos?.length ? ` · ${e.caminhos.length} caminhos` : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </Card>

        {etapa ? (
          <Card className={`border ${TIPO[etapa.tipo].caixa} p-5`}>
            <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${TIPO[etapa.tipo].texto}`}>
              {TIPO[etapa.tipo].rotulo}
            </p>
            <h2 className="mt-1 font-display text-xl font-semibold tracking-tight text-ib-ink">
              {etapa.titulo}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ib-ink">{etapa.oQue}</p>

            <div className="mt-4 rounded-xl border border-ib-line bg-white/70 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ib-slate">
                Por que existe
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-ib-ink">{etapa.porQue}</p>
            </div>

            {etapa.caminhos?.length ? (
              <div className="mt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ib-slate">
                  As bifurcações
                </p>
                <ul className="mt-2 space-y-2">
                  {etapa.caminhos.map((c) => (
                    <li
                      key={c.se}
                      className="grid gap-1 rounded-lg border border-ib-line bg-white px-3 py-2 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:items-baseline sm:gap-3"
                    >
                      <span className="text-[13px] font-medium text-ib-ink">
                        <span className="mr-1 text-ib-slate">se</span>
                        {c.se}
                      </span>
                      <span className="text-[13px] leading-snug text-ib-slate">
                        <span className="mr-1 text-ib-mar">→</span>
                        {c.entao}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <p className="mt-4 font-mono text-[11px] text-ib-slate">{etapa.arquivo}</p>
          </Card>
        ) : null}
      </div>

      {/* ─── SE A PESSOA PERGUNTAR X ─── */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ib-line px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-ib-ink">Se a pessoa disser X, ela faz o quê</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-ib-slate">
              As linhas marcadas como <strong className="text-ib-ink">em código</strong> não se
              editam na tela de treinar: mudam com uma versão nova. As demais vêm do que a equipe
              cadastrou — mudar lá muda aqui.
            </p>
          </div>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="procurar situação…"
            aria-label="Procurar situação"
            className="w-56 rounded-lg border border-ib-line bg-white px-3 py-1.5 text-sm text-ib-ink placeholder:text-ib-slate focus:outline-none focus-visible:ring-2 focus-visible:ring-ib-mar"
          />
        </div>
        {cenarios.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ib-slate">Nada com esse termo.</p>
        ) : (
          <ul className="divide-y divide-ib-line">
            {cenarios.map((c, i) => (
              <li key={`${c.pergunta}-${i}`} className="grid gap-1 px-5 py-3 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ib-ink">{c.pergunta}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-ib-slate">
                    {c.fixo ? "em código · " : "configurado · "}
                    {c.origem}
                  </p>
                </div>
                <p className="text-[13px] leading-relaxed text-ib-slate">{c.resposta}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ─── ONDE O CASO VAI PARAR ─── */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="border-b border-ib-line px-5 py-3">
            <h2 className="text-sm font-semibold text-ib-ink">Como ela classifica o caso</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-ib-slate">
              A classificação decide onde o caso aparece — e as três últimas tiram a conversa da
              frente do time. Discordar dela na tela do caso é o que calibra o agente.
            </p>
          </div>
          <ul className="divide-y divide-ib-line">
            {classificacoes.map((c) => (
              <li key={c.chave} className="px-5 py-2.5">
                <p className="text-sm font-medium text-ib-ink">{c.rotulo}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-ib-slate">{c.ajuda}</p>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-ib-line px-5 py-3">
            <h2 className="text-sm font-semibold text-ib-ink">De onde vêm as respostas</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-ib-slate">
              O acervo oficial. Tema fora desta lista ela não responde: diz que não é a área dela e
              encaminha.
            </p>
          </div>
          <ul className="divide-y divide-ib-line">
            {acervo.map((d) => (
              <li key={d.titulo} className="px-5 py-2.5">
                <p className="text-sm font-medium text-ib-ink">
                  {d.titulo}
                  <span className="ml-2 rounded-full bg-ib-papel px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ib-slate ring-1 ring-inset ring-ib-line">
                    {d.colecao}
                  </span>
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-ib-slate">{d.cobre}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
