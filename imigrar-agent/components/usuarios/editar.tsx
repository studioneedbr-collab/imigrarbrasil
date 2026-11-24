"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { btnPrimary } from "@/components/dashboard/ui";
import { PAPEIS, PAPEL_DESCRICAO, PAPEL_LABEL, normalizarPapel, type Papel } from "@/lib/auth/papeis";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";

type Setor = "comercial" | "operacional" | "rh" | "departamento_pessoal";

export interface ContaEditavel {
  id: string;
  email: string;
  name?: string;
  role: Papel | "user";
  setor?: Setor | null;
  active: boolean;
  dono?: boolean;
}

const campo =
  "w-full rounded-lg border border-ib-line bg-white px-3 py-2 text-sm text-ib-ink outline-none transition focus:border-ib-mar focus:ring-4 focus:ring-ib-mar/10";
const rotulo = "mb-1 block text-xs font-medium text-ib-slate";

/** Editar uma conta, na própria linha. As travas estão na rota; aqui só se explica. */
export function EditarUsuario({
  conta,
  setores,
  onSalvo,
}: {
  conta: ContaEditavel;
  setores: Record<Setor, string>;
  onSalvo: (mensagem: string) => void;
}) {
  const [name, setName] = useState(conta.name ?? "");
  const [role, setRole] = useState<Papel>(normalizarPapel(conta.role));
  const [setor, setSetor] = useState<Setor>(conta.setor ?? "comercial");
  const [password, setPassword] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [desativando, setDesativando] = useState(false);

  async function enviar(corpo: Record<string, unknown>, mensagem: string) {
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/users/${conta.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(d.error ?? "Não foi possível salvar.");
      onSalvo(mensagem);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
      setDesativando(false);
    }
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (password && password.length < MIN_PASSWORD_LENGTH) {
      setErro(`A senha precisa ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    const mudou = {
      ...(name.trim() !== (conta.name ?? "") ? { name: name.trim() } : {}),
      ...(role !== normalizarPapel(conta.role) ? { role } : {}),
      ...(role !== "admin" && setor !== (conta.setor ?? "comercial") ? { setor } : {}),
      ...(password ? { password } : {}),
    };
    if (!Object.keys(mudou).length) {
      setErro("Nada foi alterado.");
      return;
    }
    void enviar(mudou, `Conta de ${conta.name || conta.email} atualizada.`);
  }

  return (
    <form onSubmit={salvar} className="space-y-3 border-t border-ib-line bg-ib-papel/50 px-5 py-4" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className={rotulo}>Nome</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={campo} />
        </label>
        <label>
          <span className={rotulo}>Cargo / acesso</span>
          <select value={role} onChange={(e) => setRole(e.target.value as Papel)} className={campo}>
            {PAPEIS.map((p) => (
              <option key={p} value={p}>
                {PAPEL_LABEL[p]}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[11px] text-ib-slate">{PAPEL_DESCRICAO[role]}</span>
        </label>
        {role !== "admin" ? (
          <label>
            <span className={rotulo}>Setor</span>
            <select value={setor} onChange={(e) => setSetor(e.target.value as Setor)} className={campo}>
              {(Object.keys(setores) as Setor[]).map((s) => (
                <option key={s} value={s}>
                  {setores[s]}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          <span className={rotulo}>Nova senha</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="deixe vazio para não mudar"
            className={campo}
          />
          <span className="mt-1 block text-[11px] text-ib-slate">Mínimo de {MIN_PASSWORD_LENGTH} caracteres.</span>
        </label>
      </div>

      {erro ? (
        <p role="alert" className="rounded-lg bg-ib-danger/10 px-3 py-2 text-xs text-ib-danger">
          {erro}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {conta.dono ? (
          <span className="text-[11px] text-ib-slate">A conta dona não pode ser desativada nem rebaixada.</span>
        ) : (
          <button
            type="button"
            disabled={salvando}
            onClick={() =>
              conta.active
                ? setDesativando(true)
                : void enviar({ active: true }, `${conta.name || conta.email} pode entrar de novo.`)
            }
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
              conta.active ? "border-ib-danger/30 text-ib-danger hover:bg-ib-danger/5" : "border-ib-line text-ib-ink hover:bg-white"
            }`}
          >
            {conta.active ? "Desativar conta" : "Reativar conta"}
          </button>
        )}
        <button type="submit" disabled={salvando} className={btnPrimary}>
          {salvando ? "Salvando…" : "Salvar"}
        </button>
      </div>

      <ConfirmDialog
        open={desativando}
        loading={salvando}
        title="Desativar conta"
        loadingLabel="Desativando…"
        confirmLabel="Desativar"
        message={
          <>
            <span className="font-semibold text-ib-ink">{conta.name || conta.email}</span> perde o acesso em até um
            minuto e some das listas de transferir e de responsável. Os casos e o histórico continuam, e a conta pode ser
            reativada.
          </>
        }
        onConfirm={() => void enviar({ active: false }, `${conta.name || conta.email} foi desativada.`)}
        onCancel={() => setDesativando(false)}
      />
    </form>
  );
}
