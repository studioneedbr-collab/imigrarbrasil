"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { btnGhost, btnPrimary } from "@/components/dashboard/ui";
import { Selecao } from "@/components/dashboard/campos";
import { IDIOMAS_DO_ESCOPO, nomeDoIdioma } from "@/lib/domain/idiomas";
import {
  MOTIVOS_DE_ESPERA,
  MOTIVO_ESPERA_LABEL,
  CADENCIA_DIAS,
  type MotivoEspera,
} from "@/lib/followup/motivos";
import type { ModeloFollowup } from "@/lib/followup/modelos";

/**
 * OS MODELOS, VISTOS COMO COBERTURA.
 *
 * A tela não é uma lista de textos: é um mapa de buracos. Para cada motivo de espera, quais
 * idiomas já têm frase escrita e quais não têm. É essa leitura que importa, porque a
 * consequência de um buraco não é um erro na tela — é uma pessoa que fala crioulo entrando
 * na fila de tarefa manual todo mês, em silêncio, enquanto os casos em português seguem
 * sozinhos.
 *
 * O ENVIO AUTOMÁTICO é escolha por modelo e nasce desligado. Ligá-lo é dizer que aquela
 * frase específica pode sair sem ninguém ler — o que só vale para texto simples, revisado,
 * e nunca para caso com prazo processual (que a regra bloqueia de qualquer jeito).
 */
export default function ModelosDeFollowup({
  modelos: iniciais,
  podeEditar,
}: {
  modelos: ModeloFollowup[];
  podeEditar: boolean;
}) {
  const router = useRouter();
  const [modelos, setModelos] = useState(iniciais);
  const [editando, setEditando] = useState<{ motivo: MotivoEspera; idioma: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const achar = (motivo: MotivoEspera, idioma: string) =>
    modelos.find((m) => m.motivo === motivo && m.idioma === idioma) ?? null;

  async function salvar(dados: Omit<ModeloFollowup, "id">) {
    setErro(null);
    const r = await fetch("/api/followup/modelos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados),
    }).catch(() => null);
    const corpo = await r?.json().catch(() => null);
    if (!r?.ok) {
      setErro(corpo?.error ?? "Não foi possível salvar o modelo.");
      return;
    }
    setModelos((atual) => [
      ...atual.filter((m) => !(m.motivo === dados.motivo && m.idioma === dados.idioma)),
      corpo.modelo,
    ]);
    setEditando(null);
    router.refresh();
  }

  async function apagar(id: string) {
    const r = await fetch(`/api/followup/modelos?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    }).catch(() => null);
    if (!r?.ok) {
      setErro("Não foi possível apagar o modelo.");
      return;
    }
    setModelos((atual) => atual.filter((m) => m.id !== id));
    setEditando(null);
    router.refresh();
  }

  const emEdicao = editando ? achar(editando.motivo, editando.idioma) : null;

  return (
    <div className="space-y-4">
      {erro ? (
        <p role="alert" className="rounded-xl border border-ib-danger/30 bg-ib-danger/[0.06] px-4 py-3 text-sm text-ib-danger">
          {erro}
        </p>
      ) : null}

      {MOTIVOS_DE_ESPERA.map((motivo) => {
        const doMotivo = IDIOMAS_DO_ESCOPO.map((i) => ({ idioma: i, modelo: achar(motivo, i) }));
        const faltam = doMotivo.filter((c) => !c.modelo).length;
        return (
          <section key={motivo} className="rounded-xl border border-ib-line bg-white">
            <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ib-line px-4 py-2.5">
              <h2 className="text-sm font-semibold text-ib-ink">{MOTIVO_ESPERA_LABEL[motivo]}</h2>
              <p className="text-[11px] text-ib-slate">
                {CADENCIA_DIAS[motivo] === null
                  ? "cadência: a data que a pessoa indicar"
                  : `cadência sugerida: ${CADENCIA_DIAS[motivo]} dias`}
                {faltam ? ` · faltam ${faltam} idioma${faltam > 1 ? "s" : ""}` : " · todos os idiomas cobertos"}
              </p>
            </header>
            <div className="flex flex-wrap gap-1.5 p-3">
              {doMotivo.map(({ idioma, modelo }) => (
                <button
                  key={idioma}
                  type="button"
                  disabled={!podeEditar}
                  onClick={() => setEditando({ motivo, idioma })}
                  title={modelo ? modelo.texto : "Sem modelo neste idioma — o disparo vira tarefa manual"}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                    !modelo
                      ? "bg-white text-ib-slate ring-1 ring-inset ring-dashed ring-ib-line"
                      : modelo.envio === "automatico"
                        ? "bg-ib-carimbo text-white"
                        : "bg-ib-bruma text-ib-carimbo ring-1 ring-inset ring-ib-mar/30"
                  } ${podeEditar ? "hover:opacity-80" : "cursor-default"}`}
                >
                  {nomeDoIdioma(idioma)}
                  {modelo?.envio === "automatico" ? <span className="ml-1 opacity-70">auto</span> : null}
                  {!modelo ? <span className="ml-1">+</span> : null}
                </button>
              ))}
            </div>
          </section>
        );
      })}

      <p className="px-1 text-[11px] leading-relaxed text-ib-slate">
        Chip preenchido = envio automático · chip claro = rascunho para aprovação · chip
        tracejado = sem modelo, e aí o follow-up nunca sai: vira tarefa para alguém escrever
        à mão. Não existe idioma de reserva — mandar em português para quem fala crioulo é
        pior do que não mandar.
      </p>

      {editando ? (
        <EditorDeModelo
          motivo={editando.motivo}
          idioma={editando.idioma}
          modelo={emEdicao}
          aoSalvar={salvar}
          aoApagar={emEdicao ? () => apagar(emEdicao.id) : undefined}
          aoFechar={() => setEditando(null)}
        />
      ) : null}
    </div>
  );
}

function EditorDeModelo({
  motivo,
  idioma,
  modelo,
  aoSalvar,
  aoApagar,
  aoFechar,
}: {
  motivo: MotivoEspera;
  idioma: string;
  modelo: ModeloFollowup | null;
  aoSalvar: (m: Omit<ModeloFollowup, "id">) => void;
  aoApagar?: () => void;
  aoFechar: () => void;
}) {
  const [texto, setTexto] = useState(modelo?.texto ?? "");
  const [variantes, setVariantes] = useState((modelo?.variantes ?? []).join("\n"));
  const [envio, setEnvio] = useState<ModeloFollowup["envio"]>(modelo?.envio ?? "rascunho");
  const [ativo, setAtivo] = useState(modelo?.ativo ?? true);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ib-ink/40 p-4">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-5 shadow-lg">
        <h2 className="text-sm font-semibold text-ib-ink">
          {MOTIVO_ESPERA_LABEL[motivo]} · {nomeDoIdioma(idioma)}
        </h2>
        <p className="mt-1 text-[11px] leading-relaxed text-ib-slate">
          Escreva na língua da pessoa, não em português traduzido na cabeça. Use{" "}
          <code className="rounded bg-ib-papel px-1">{"{nome}"}</code> e{" "}
          <code className="rounded bg-ib-papel px-1">{"{servico}"}</code> quando fizerem
          sentido — campo vazio some junto com o espaço à frente.
        </p>

        <label className="mt-3 block">
          <span className="text-xs font-semibold text-ib-ink">Texto</span>
          <textarea
            autoFocus
            rows={4}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            className="mt-1 w-full resize-y rounded-lg border border-ib-line px-3 py-2 text-sm text-ib-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ib-mar"
          />
        </label>

        <label className="mt-3 block">
          <span className="text-xs font-semibold text-ib-ink">Variantes (uma por linha)</span>
          <textarea
            rows={3}
            value={variantes}
            onChange={(e) => setVariantes(e.target.value)}
            className="mt-1 w-full resize-y rounded-lg border border-ib-line px-3 py-2 text-sm text-ib-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ib-mar"
          />
          <span className="mt-1 block text-[11px] leading-relaxed text-ib-slate">
            Outras redações do MESMO recado. Existem para que dez pessoas esperando o
            consulado não recebam a frase idêntica no mesmo dia, do mesmo número — que é a
            assinatura de disparo em massa que os classificadores procuram.
          </span>
        </label>

        <div className="mt-3">
          <Selecao
            label="Como sai"
            valor={envio}
            onChange={(v) => setEnvio(v as ModeloFollowup["envio"])}
            opcoes={[
              {
                valor: "rascunho",
                rotulo: "Rascunho para aprovação",
                ajuda: "cai na fila do responsável com enviar, editar ou pular",
              },
              {
                valor: "automatico",
                rotulo: "Envio automático",
                ajuda: "sai sozinho — só para texto simples e revisado",
              },
            ]}
          />
        </div>

        <label className="mt-3 flex items-center gap-2 text-xs text-ib-slate">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
          Modelo ativo (desligado, o follow-up neste idioma vira tarefa manual)
        </label>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {aoApagar ? (
            <button type="button" onClick={aoApagar} className="text-xs font-semibold text-ib-danger underline">
              Apagar
            </button>
          ) : null}
          <button type="button" className={btnGhost} onClick={aoFechar}>
            Cancelar
          </button>
          <button
            type="button"
            className={btnPrimary}
            disabled={texto.trim().length < 10}
            onClick={() =>
              aoSalvar({
                motivo,
                idioma,
                texto: texto.trim(),
                variantes: variantes.split("\n").map((v) => v.trim()).filter(Boolean),
                envio,
                ativo,
              })
            }
          >
            Salvar modelo
          </button>
        </div>
      </div>
    </div>
  );
}
