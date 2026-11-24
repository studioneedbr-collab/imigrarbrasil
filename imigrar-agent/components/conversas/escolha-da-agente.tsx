"use client";

import type { ModoDaAgente } from "@/lib/crm/agente-na-transferencia";

/** A agente para ou continua? Igual nos três lugares que dão dono a uma conversa. */
export function EscolhaDaAgente({
  valor,
  onChange,
  calada = false,
}: {
  valor: ModoDaAgente;
  onChange: (m: ModoDaAgente) => void;
  /** Ela já está calada nesta conversa: "continua" significa que ela volta. */
  calada?: boolean;
}) {
  const opcoes: { valor: ModoDaAgente; titulo: string; texto: string }[] = [
    { valor: "para", titulo: "A agente para", texto: "Só a pessoa responde ao cliente." },
    {
      valor: "continua",
      titulo: calada ? "A agente volta a responder" : "A agente continua",
      texto: "Ela atende até alguém assumir a conversa.",
    },
  ];
  return (
    <fieldset>
      <legend className="text-xs font-semibold uppercase tracking-[0.08em] text-ib-slate">E a agente?</legend>
      <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
        {opcoes.map((o) => (
          <label
            key={o.valor}
            className={`flex cursor-pointer gap-2 rounded-xl border px-3 py-2 text-left ${
              valor === o.valor ? "border-ib-mar ring-2 ring-ib-mar/20" : "border-ib-line"
            }`}
          >
            <input
              type="radio"
              name="agente-na-transferencia"
              checked={valor === o.valor}
              onChange={() => onChange(o.valor)}
              className="mt-0.5 accent-ib-mar"
            />
            <span>
              <span className="block text-sm font-medium text-ib-ink">{o.titulo}</span>
              <span className="block text-xs text-ib-slate">{o.texto}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
