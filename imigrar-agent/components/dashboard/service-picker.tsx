"use client";

// BUSCA POR DIGITAÇÃO NO CATÁLOGO DE FUNÇÕES.
//
// O catálogo tem mais de 100 funções, e num <select> nativo achar "Auxiliar de Serviços
// Gerais" é rolar uma lista de tela cheia até a letra certa. Aqui o campo é um combobox:
// digita "aux serv", a lista filtra, seta e Enter escolhem. Sem dependência nova — é
// input + lista; o casamento dos termos está em lib/agent/function-search.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { filtrarServicos } from "@/lib/comercial/function-search";

export interface ServicePickerOption {
  name: string;
  priceConfirmed: boolean;
}

export function ServicePicker({
  options,
  value,
  onChange,
  inputClass,
  placeholder = "Digite para buscar a função…",
}: {
  options: ServicePickerOption[];
  value: string;
  onChange: (name: string) => void;
  inputClass: string;
  placeholder?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [destaque, setDestaque] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listaRef = useRef<HTMLUListElement>(null);
  const listaId = useId();

  const filtrados = useMemo(() => filtrarServicos(options, aberto ? busca : ""), [options, busca, aberto]);

  // Clique fora fecha e devolve o campo ao serviço escolhido — nunca deixa a busca
  // pela metade no lugar do valor real.
  useEffect(() => {
    if (!aberto) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setAberto(false);
        setBusca("");
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [aberto]);

  // Mantém a opção destacada visível durante a navegação por teclado.
  useEffect(() => {
    if (!aberto) return;
    listaRef.current?.children[destaque]?.scrollIntoView({ block: "nearest" });
  }, [destaque, aberto]);

  const escolher = (nome: string) => {
    onChange(nome);
    setBusca("");
    setAberto(false);
  };

  return (
    <div ref={boxRef} className="relative">
      <input
        type="text"
        role="combobox"
        aria-expanded={aberto}
        aria-controls={listaId}
        aria-activedescendant={aberto && filtrados[destaque] ? `${listaId}-${destaque}` : undefined}
        aria-autocomplete="list"
        value={aberto ? busca : value}
        placeholder={value ? undefined : placeholder}
        onChange={(e) => {
          setBusca(e.target.value);
          setDestaque(0);
          if (!aberto) setAberto(true);
        }}
        onFocus={() => {
          setAberto(true);
          setBusca("");
          setDestaque(Math.max(0, options.findIndex((o) => o.name === value)));
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!aberto) setAberto(true);
            setDestaque((d) => Math.min(d + 1, filtrados.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setDestaque((d) => Math.max(d - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const alvo = filtrados[destaque];
            if (alvo) escolher(alvo.name);
          } else if (e.key === "Escape") {
            setAberto(false);
            setBusca("");
          }
        }}
        className={inputClass}
      />

      {aberto ? (
        <ul
          ref={listaRef}
          id={listaId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-ib-line bg-white py-1 shadow-lg"
        >
          {filtrados.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-ib-slate">
              Nenhuma função encontrada para “{busca}”.
            </li>
          ) : (
            filtrados.map((s, idx) => (
              <li key={s.name} id={`${listaId}-${idx}`} role="option" aria-selected={s.name === value}>
                <button
                  type="button"
                  onMouseEnter={() => setDestaque(idx)}
                  onClick={() => escolher(s.name)}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${
                    idx === destaque ? "bg-ib-bruma text-ib-ink" : "text-ib-ink"
                  }`}
                >
                  <span className={s.name === value ? "font-semibold" : undefined}>{s.name}</span>
                  {s.priceConfirmed !== true ? (
                    <span className="shrink-0 text-[11px] text-ib-warn">sob consulta</span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
