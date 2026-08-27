"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader, Icon } from "@/components/dashboard/ui";
import RascunhoSombra, { type RascunhoView } from "@/components/agente/rascunho-sombra";

/**
 * A FILA DE SOMBRA.
 *
 * Durante a fase de testes, esta tela vale mais do que o botão de ligar/desligar: é aqui
 * que a Ana é avaliada contra conversa real, sem risco nenhum. Cada linha é uma resposta
 * que ela montou lendo uma mensagem de verdade e que não foi para lugar nenhum.
 *
 * A tela não ordena por "mais recente" por acaso — do outro lado de cada rascunho tem
 * uma pessoa esperando, e quem espera há mais tempo importa mais. Por isso o pendente
 * mais ANTIGO aparece primeiro.
 */
export default function SombraPage() {
  const [rascunhos, setRascunhos] = useState<RascunhoView[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [verHistorico, setVerHistorico] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch(`/api/agente/rascunhos?status=${verHistorico ? "todos" : "pendente"}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        const lista: RascunhoView[] = data.rascunhos ?? [];
        setRascunhos(
          verHistorico
            ? lista
            : [...lista].sort((a, b) => a.criadoEm.localeCompare(b.criadoEm)),
        );
      }
    } finally {
      setCarregando(false);
    }
  }, [verHistorico]);

  useEffect(() => {
    setCarregando(true);
    carregar();
    const t = setInterval(carregar, 20_000);
    return () => clearInterval(t);
  }, [carregar]);

  const pendentes = rascunhos.filter((r) => r.status === "pendente").length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Agente"
        title="Modo sombra"
        description="O que a Ana teria respondido, e não foi enviado. Cada decisão aqui vira dado de treinamento."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ib-slate">
          {carregando ? (
            "Carregando…"
          ) : pendentes > 0 ? (
            <>
              <strong className="text-ib-ink">{pendentes}</strong>{" "}
              {pendentes === 1 ? "resposta esperando decisão" : "respostas esperando decisão"} —
              a mais antiga primeiro.
            </>
          ) : (
            "Nada esperando decisão."
          )}
        </p>
        <button
          type="button"
          onClick={() => setVerHistorico((v) => !v)}
          className="text-sm font-medium text-ib-mar transition hover:underline"
        >
          {verHistorico ? "Ver só o que está pendente" : "Ver o que já foi decidido"}
        </button>
      </div>

      {!carregando && rascunhos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ib-line bg-white p-8 text-center">
          <p className="text-sm text-ib-slate">
            Nenhum rascunho.{" "}
            {verHistorico
              ? "Ainda ninguém decidiu nada por aqui."
              : "O modo sombra só grava quando o agente está desligado numa instância configurada com esse modo — confira em Integrações."}
          </p>
          <Link
            href="/dashboard/integracoes"
            className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-ib-mar hover:underline"
          >
            <Icon name="plug" className="h-4 w-4" />
            Ver as instâncias
          </Link>
        </div>
      ) : null}

      <div className="space-y-4">
        {rascunhos.map((r) => (
          <div key={r.id} className="space-y-2">
            <Link
              href={`/dashboard/conversations/${r.conversationId}`}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-ib-mar hover:underline"
            >
              <Icon name="chat" className="h-4 w-4" />
              {r.contato?.nome || r.contato?.whatsappNumber || "Abrir a conversa"}
            </Link>
            <RascunhoSombra
              rascunho={r}
              mostrarContato
              // Sai da lista assim que é decidido: um rascunho já resolvido ocupando a
              // fila é como duas pessoas acabam respondendo a mesma coisa.
              onDecidido={(id) => setRascunhos((atual) => atual.filter((x) => x.id !== id))}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
