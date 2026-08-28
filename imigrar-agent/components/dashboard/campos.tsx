"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * OS CAMPOS DO SISTEMA — seleção e data, sem controle nativo do navegador.
 *
 * O `<select>` e o `<input type="date">` do navegador têm três problemas que só aparecem
 * num painel usado o dia inteiro:
 *
 *   1. São DIFERENTES em cada máquina. O calendário do Chrome no Windows, o do Safari no
 *      Mac e o do celular não se parecem entre si nem com o resto da tela — e num painel
 *      onde a data é prazo processual, "onde eu clico para escolher o dia" não pode ser
 *      uma pergunta nova a cada computador.
 *   2. Não cabem explicação. Aqui quase toda escolha precisa de uma linha dizendo o que
 *      ela implica ("perdido exige motivo", "isto não é prazo processual"), e o `<option>`
 *      é texto puro.
 *   3. O `dd/mm/aaaa` vazio do input de data parece campo obrigatório em branco, mesmo
 *      quando é opcional — e leva gente a preencher data que ninguém confirmou.
 *
 * O que segue substitui os dois. Teclado inteiro: setas, Home/End, Enter, Esc, e o campo
 * de data continua aceitando DIGITAR a data, porque quem tem o papel na mão digita mais
 * rápido do que navega num calendário.
 */

const campoBase =
  "w-full rounded-lg border border-ib-line bg-white px-3 py-2 text-left text-sm text-ib-ink transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ib-mar disabled:cursor-not-allowed disabled:bg-ib-papel disabled:text-ib-slate";

/*
 * ─── POR QUE A LISTA E O CALENDÁRIO SAEM DO FLUXO DA PÁGINA ───
 *
 * Os dois eram `position: absolute` dentro do próprio campo. Isso funciona até o campo
 * cair dentro de um contêiner que corta o que transborda — e no painel do caso ele cai:
 * o cartão das abas é `overflow-hidden` e o miolo é `overflow-y-auto` (a ficha tem quinze
 * campos e precisa rolar por dentro). O resultado era a lista de classificação aparecendo
 * cortada na borda do cartão, com as últimas opções inalcançáveis, e o calendário
 * espremido do mesmo jeito. Nenhum `z-index` resolve: recorte não é ordem de camada.
 *
 * A saída é tirar o painel flutuante da árvore visual e prendê-lo ao <body>, posicionado
 * em coordenadas de tela a partir do campo. Aí nenhum contêiner acima consegue cortá-lo —
 * vale para o painel do caso, para o quadro do CRM e para dentro dos modais, sem que cada
 * tela precise saber disso.
 */

interface PosicaoFlutuante {
  top: number;
  left: number;
  width: number;
  /** True quando não coube abaixo e o painel foi virado para cima do campo. */
  acima: boolean;
}

const ESPACO = 4;

/**
 * Segue o campo na tela: recalcula ao abrir, ao rolar (em qualquer contêiner, por isso o
 * listener é de captura) e ao redimensionar. Sem isso, rolar a ficha deixaria a lista
 * parada no ar, longe do campo que a abriu.
 */
function usePosicaoFlutuante(
  ancora: React.RefObject<HTMLElement>,
  aberto: boolean,
  alturaEstimada: number,
  larguraMinima = 0,
): PosicaoFlutuante | null {
  const [pos, setPos] = useState<PosicaoFlutuante | null>(null);

  const medir = useCallback(() => {
    const el = ancora.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const abaixo = window.innerHeight - r.bottom;
    const acima = abaixo < Math.min(alturaEstimada, 240) && r.top > abaixo;
    // O painel costuma ser mais largo que o campo (a lista mostra a linha de ajuda, o
    // calendário tem sete colunas). Num campo encostado na direita — a ficha vive numa
    // coluna estreita à direita da tela — essa sobra saía pela borda da janela, e a
    // última coluna de dias ficava fora do alcance. Encosta na margem em vez de vazar.
    const largura = Math.max(r.width, larguraMinima);
    const limite = window.innerWidth - largura - ESPACO * 2;
    setPos({
      top: acima ? r.top - ESPACO : r.bottom + ESPACO,
      left: Math.max(ESPACO * 2, Math.min(r.left, limite)),
      width: largura,
      acima,
    });
  }, [ancora, alturaEstimada, larguraMinima]);

  useLayoutEffect(() => {
    if (!aberto) {
      setPos(null);
      return;
    }
    medir();
    // `true` = captura: pega a rolagem do contêiner interno também, não só a da janela.
    window.addEventListener("scroll", medir, true);
    window.addEventListener("resize", medir);
    return () => {
      window.removeEventListener("scroll", medir, true);
      window.removeEventListener("resize", medir);
    };
  }, [aberto, medir]);

  return pos;
}

/** O estilo do painel preso ao <body>, já virado para cima quando foi o caso. */
function estiloFlutuante(pos: PosicaoFlutuante): React.CSSProperties {
  return {
    position: "fixed",
    top: pos.top,
    left: pos.left,
    width: pos.width,
    transform: pos.acima ? "translateY(-100%)" : undefined,
  };
}

export interface OpcaoSelecao<T extends string> {
  valor: T;
  rotulo: string;
  /** A linha que explica o que essa escolha implica. Aparece na lista e sob o campo. */
  ajuda?: string;
}

/**
 * A SELEÇÃO.
 *
 * Botão + lista flutuante. A lista fecha ao escolher, ao apertar Esc e ao clicar fora;
 * o item marcado volta focado quando ela abre, para que Enter → setas → Enter seja o
 * caminho inteiro sem tirar a mão do teclado.
 */
export function Selecao<T extends string>({
  valor,
  opcoes,
  onChange,
  label,
  ajuda,
  placeholder = "escolher",
  disabled,
  className = "",
  compacto,
}: {
  valor: T | null | undefined;
  opcoes: OpcaoSelecao<T>[];
  onChange: (v: T) => void;
  /** Rótulo acima do campo. Sem ele, passe `aria-label` pelo `label` mesmo assim. */
  label?: string;
  /** Texto fixo embaixo. Quando ausente, mostra a ajuda da opção escolhida. */
  ajuda?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Versão miúda, para dentro de card e de linha de tabela. */
  compacto?: boolean;
}) {
  const id = useId();
  const [aberto, setAberto] = useState(false);
  const [marcado, setMarcado] = useState(0);
  const caixa = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLUListElement>(null);

  const atual = opcoes.find((o) => o.valor === valor) ?? null;
  const indiceAtual = Math.max(0, opcoes.findIndex((o) => o.valor === valor));
  const gatilho = useRef<HTMLButtonElement>(null);
  // ~56px por opção (rótulo + a linha de ajuda), limitado pelo max-h da lista.
  const pos = usePosicaoFlutuante(gatilho, aberto, Math.min(opcoes.length * 56 + 8, 288), 220);

  useEffect(() => {
    if (!aberto) return;
    setMarcado(indiceAtual);
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Node;
      // A lista mora no <body>, fora de `caixa` — sem conferi-la aqui, clicar numa opção
      // contaria como "clique fora" e fecharia o campo antes da escolha acontecer.
      if (caixa.current?.contains(alvo) || lista.current?.contains(alvo)) return;
      setAberto(false);
    };
    // O Esc fecha a LISTA, e só ela. Sem `stopImmediatePropagation` o mesmo Esc chegava
    // ao modal que contém o campo (o resumo do caso ouve Esc no document também), e
    // cancelar um seletor aberto fechava a janela inteira junto.
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", tecla, true);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", tecla, true);
    };
  }, [aberto, indiceAtual]);

  useEffect(() => {
    if (aberto) lista.current?.focus();
  }, [aberto]);

  function escolher(i: number) {
    const o = opcoes[i];
    if (!o) return;
    onChange(o.valor);
    setAberto(false);
  }

  const dica = ajuda ?? atual?.ajuda;

  return (
    <div className={className}>
      {label ? (
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ib-slate">
          {label}
        </span>
      ) : null}
      <div ref={caixa} className={`relative ${label ? "mt-1" : ""}`}>
        <button
          ref={gatilho}
          type="button"
          id={id}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={aberto}
          aria-label={label}
          onClick={() => setAberto((a) => !a)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setAberto(true);
            }
          }}
          className={`${campoBase} flex items-center justify-between gap-2 ${
            compacto ? "px-2.5 py-1.5 text-xs" : ""
          } ${aberto ? "ring-2 ring-ib-mar" : ""}`}
        >
          <span className={`truncate ${atual ? "" : "text-ib-slate"}`}>
            {atual?.rotulo ?? placeholder}
          </span>
          <span aria-hidden="true" className={`shrink-0 text-ib-slate transition ${aberto ? "rotate-180" : ""}`}>
            ▾
          </span>
        </button>

        {aberto && pos
          ? createPortal(
          <ul
            ref={lista}
            style={estiloFlutuante(pos)}
            role="listbox"
            tabIndex={-1}
            aria-activedescendant={`${id}-op-${marcado}`}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setMarcado((m) => (m + 1) % opcoes.length);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setMarcado((m) => (m - 1 + opcoes.length) % opcoes.length);
              } else if (e.key === "Home") {
                e.preventDefault();
                setMarcado(0);
              } else if (e.key === "End") {
                e.preventDefault();
                setMarcado(opcoes.length - 1);
              } else if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                escolher(marcado);
              }
            }}
            className="z-[60] max-h-72 overflow-y-auto rounded-xl border border-ib-line bg-white py-1 shadow-lg focus:outline-none"
          >
            {opcoes.map((o, i) => {
              const escolhida = o.valor === valor;
              return (
                <li
                  key={o.valor}
                  id={`${id}-op-${i}`}
                  role="option"
                  aria-selected={escolhida}
                  onMouseEnter={() => setMarcado(i)}
                  onClick={() => escolher(i)}
                  className={`cursor-pointer px-3 py-2 ${
                    i === marcado ? "bg-ib-bruma/60" : ""
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className={`text-xs ${escolhida ? "text-ib-mar" : "text-transparent"}`}
                    >
                      ✓
                    </span>
                    <span className={`text-sm ${escolhida ? "font-semibold text-ib-ink" : "text-ib-ink"}`}>
                      {o.rotulo}
                    </span>
                  </span>
                  {o.ajuda ? (
                    <span className="ml-6 block text-[11px] leading-snug text-ib-slate">{o.ajuda}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>,
              document.body,
            )
          : null}
      </div>
      {dica ? <span className="mt-0.5 block text-[11px] leading-snug text-ib-slate">{dica}</span> : null}
    </div>
  );
}

// ─── A DATA ───

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const DIAS = ["D", "S", "T", "Q", "Q", "S", "S"];

/** ISO (YYYY-MM-DD) → 27/08/2026. Sem `new Date`: fuso não pode mover um prazo um dia. */
export function paraBr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** 27/08/2026 (ou 27082026) → ISO. Devolve null quando ainda não é uma data. */
export function paraIso(br: string): string | null {
  const so = br.replace(/\D/g, "");
  if (so.length !== 8) return null;
  const d = Number(so.slice(0, 2));
  const mes = Number(so.slice(2, 4));
  const ano = Number(so.slice(4, 8));
  if (d < 1 || d > 31 || mes < 1 || mes > 12 || ano < 1900) return null;
  const iso = `${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  // 31/02 não existe: o Date corrige em silêncio (vira 03/03), então conferimos a volta.
  // Meio-dia LOCAL comparado com getters LOCAIS — misturar com getUTC* faria a conferência
  // depender do fuso de quem está digitando.
  const v = new Date(`${iso}T12:00:00`);
  return v.getDate() === d && v.getMonth() + 1 === mes ? iso : null;
}

function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Qual mês o calendário abre.
 *
 * Era `(valor ?? hojeIso()).slice(0, 7)`, e o `??` foi o bug: ele só cobre null e
 * undefined. Quem usa o campo grava string VAZIA quando não há data — a ficha do lead faz
 * `onChange={(v) => setLimite(v ?? "")}` —, então o mês visível virava "", o
 * `"".split("-")` virava [NaN], e o cabeçalho saía "undefined de NaN" com a grade de dias
 * vazia. Ou seja: o calendário abria quebrado exatamente no caso mais comum, o campo em
 * branco.
 *
 * Aqui a regra é a mesma para as três formas de "sem data" ("", null, undefined) e para
 * lixo (um "27/08/2026" que escapou sem converter): cai no mês corrente. O que esta
 * função NUNCA pode devolver é algo que vire NaN na tela.
 */
export function mesInicial(valor: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(valor ?? "");
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return `${m[1]}-${m[2]}`;
  return hojeIso().slice(0, 7);
}

/**
 * O CAMPO DE DATA.
 *
 * Digitar vem primeiro: quem está com a notificação na mão digita 27082026 e segue. O
 * calendário é o segundo caminho, para quem está combinando um retorno por telefone e
 * pensa em "quinta que vem", não em número.
 *
 * Enquanto a data não está completa, o valor NÃO sobe: um `onChange` a cada tecla gravaria
 * 27/08/0002 no caminho até 27/08/2026.
 */
export function CampoData({
  valor,
  onChange,
  label,
  ajuda,
  disabled,
  className = "",
  autoFocus,
  ariaLabel,
}: {
  /** ISO YYYY-MM-DD, ou "" / null quando vazio. */
  valor: string | null | undefined;
  onChange: (iso: string | null) => void;
  label?: string;
  ajuda?: string;
  disabled?: boolean;
  className?: string;
  autoFocus?: boolean;
  ariaLabel?: string;
}) {
  const [texto, setTexto] = useState(() => (valor ? paraBr(valor) : ""));
  const [aberto, setAberto] = useState(false);
  const [mes, setMes] = useState(() => mesInicial(valor));
  const caixa = useRef<HTMLDivElement>(null);
  const painel = useRef<HTMLDivElement>(null);
  // Mesma razão da lista de seleção: o calendário é preso ao <body> para não ser cortado
  // pelo `overflow` da ficha, que rola por dentro. ~320px é a altura do calendário cheio.
  const pos = usePosicaoFlutuante(caixa, aberto, 320, 256);
  /** O último valor que ESTE campo emitiu — ver o efeito abaixo. */
  const emitido = useRef<string | null | undefined>(valor);

  function emitir(v: string | null) {
    emitido.current = v;
    onChange(v);
  }

  // O valor pode mudar por fora (recarregou a ficha, outra pessoa salvou) e aí o texto
  // acompanha. O que ele NÃO pode fazer é acompanhar a própria emissão: apagar um dígito
  // de "27/08/2026" invalida a data e emite `null`, e sem esta guarda o efeito voltaria
  // aqui e limparia o campo inteiro no meio da digitação.
  useEffect(() => {
    if (valor === emitido.current) return;
    emitido.current = valor;
    setTexto(valor ? paraBr(valor) : "");
    // O mês visível acompanha: sem isto, uma ficha recarregada com outra data abria o
    // calendário no mês antigo.
    setMes(mesInicial(valor));
  }, [valor]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Node;
      // O calendário mora no <body>: sem conferi-lo aqui, clicar num dia contaria como
      // clique fora e fecharia o campo sem escolher nada.
      if (caixa.current?.contains(alvo) || painel.current?.contains(alvo)) return;
      setAberto(false);
    };
    // Mesmo motivo do seletor: o Esc fecha o calendário, não o modal atrás dele.
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", tecla, true);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", tecla, true);
    };
  }, [aberto]);

  const grade = useMemo(() => {
    const [ano, m] = mes.split("-").map(Number);
    const primeiro = new Date(ano, m - 1, 1);
    const dias = new Date(ano, m, 0).getDate();
    const vazios = primeiro.getDay();
    const celulas: (string | null)[] = Array.from({ length: vazios }, () => null);
    for (let d = 1; d <= dias; d++) {
      celulas.push(`${ano}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
    return { celulas, titulo: `${MESES[m - 1]} de ${ano}` };
  }, [mes]);

  function mudarMes(delta: number) {
    const [ano, m] = mes.split("-").map(Number);
    const d = new Date(ano, m - 1 + delta, 1);
    setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  function digitar(bruto: string) {
    const so = bruto.replace(/\D/g, "").slice(0, 8);
    const partes = [so.slice(0, 2), so.slice(2, 4), so.slice(4, 8)].filter(Boolean);
    setTexto(partes.join("/"));
    const iso = so.length === 8 ? paraIso(so) : null;
    // DATA PELA METADE NÃO É A DATA ANTERIOR.
    //
    // Enquanto só se emitia data completa, apagar um dígito deixava o campo mostrando
    // "27/08/202" e o formulário segurando 27/08/2026 — e salvar gravava a data velha,
    // que ninguém mais estava vendo na tela. Num campo que é prazo processual, isso é a
    // pior forma possível de errar: silenciosa e com aparência de correta.
    if (iso) {
      emitir(iso);
      setMes(iso.slice(0, 7));
    } else if (emitido.current) {
      emitir(null);
    } else if (so.length === 0) {
      emitir(null);
    }
  }

  const invalido = texto.replace(/\D/g, "").length === 8 && !paraIso(texto);
  const hoje = hojeIso();

  return (
    <div className={className}>
      {label ? (
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ib-slate">
          {label}
        </span>
      ) : null}
      <div ref={caixa} className={`relative ${label ? "mt-1" : ""}`}>
        <div className={`flex items-center gap-1 ${campoBase} ${invalido ? "ring-2 ring-ib-danger" : ""}`}>
          <input
            value={texto}
            disabled={disabled}
            autoFocus={autoFocus}
            inputMode="numeric"
            aria-label={ariaLabel ?? label ?? "Data"}
            placeholder="dd/mm/aaaa"
            onChange={(e) => digitar(e.target.value)}
            className="w-full bg-transparent font-mono text-sm tabular-nums text-ib-ink placeholder:font-sans placeholder:text-ib-slate focus:outline-none"
          />
          {texto ? (
            <button
              type="button"
              onClick={() => {
                setTexto("");
                emitir(null);
              }}
              aria-label="Limpar a data"
              className="shrink-0 px-1 text-xs text-ib-slate hover:text-ib-danger"
            >
              ✕
            </button>
          ) : null}
          <button
            type="button"
            disabled={disabled}
            onClick={() => setAberto((a) => !a)}
            aria-label="Abrir o calendário"
            aria-expanded={aberto}
            className="shrink-0 rounded px-1 text-sm text-ib-slate hover:text-ib-mar"
          >
            ▦
          </button>
        </div>

        {aberto && pos
          ? createPortal(
          <div
            ref={painel}
            style={estiloFlutuante(pos)}
            className="z-[60] rounded-xl border border-ib-line bg-white p-3 shadow-lg"
          >
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => mudarMes(-1)}
                aria-label="Mês anterior"
                className="rounded px-2 py-1 text-sm text-ib-slate hover:bg-ib-papel"
              >
                ‹
              </button>
              <span className="text-xs font-semibold text-ib-ink">{grade.titulo}</span>
              <button
                type="button"
                onClick={() => mudarMes(1)}
                aria-label="Próximo mês"
                className="rounded px-2 py-1 text-sm text-ib-slate hover:bg-ib-papel"
              >
                ›
              </button>
            </div>

            <div className="mt-2 grid grid-cols-7 gap-0.5 text-center">
              {DIAS.map((d, i) => (
                <span key={i} className="py-1 text-[10px] font-semibold uppercase text-ib-slate">
                  {d}
                </span>
              ))}
              {grade.celulas.map((iso, i) =>
                iso === null ? (
                  <span key={`v${i}`} />
                ) : (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => {
                      emitir(iso);
                      setTexto(paraBr(iso));
                      setAberto(false);
                    }}
                    className={`rounded-md py-1 font-mono text-xs tabular-nums transition ${
                      iso === valor
                        ? "bg-ib-mar font-semibold text-white"
                        : iso === hoje
                          ? "bg-ib-bruma text-ib-carimbo"
                          : "text-ib-ink hover:bg-ib-papel"
                    }`}
                  >
                    {Number(iso.slice(8, 10))}
                  </button>
                ),
              )}
            </div>

            <div className="mt-2 flex justify-between border-t border-ib-line pt-2">
              <button
                type="button"
                onClick={() => {
                  emitir(hoje);
                  setTexto(paraBr(hoje));
                  setAberto(false);
                }}
                className="text-[11px] font-semibold text-ib-mar hover:underline"
              >
                hoje
              </button>
              <button
                type="button"
                onClick={() => setAberto(false)}
                className="text-[11px] font-semibold text-ib-slate hover:underline"
              >
                fechar
              </button>
            </div>
          </div>,
              document.body,
            )
          : null}
      </div>
      {invalido ? (
        <span className="mt-0.5 block text-[11px] font-medium text-ib-danger">
          Esta data não existe. Confira o dia e o mês.
        </span>
      ) : ajuda ? (
        <span className="mt-0.5 block text-[11px] leading-snug text-ib-slate">{ajuda}</span>
      ) : null}
    </div>
  );
}
