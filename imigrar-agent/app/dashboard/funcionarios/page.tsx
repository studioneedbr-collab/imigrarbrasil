"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Card,
  EmptyState,
  Icon,
  PageHeader,
  Pagination,
  Skeleton,
  btnPrimary,
  fmtDate,
} from "@/components/dashboard/ui";
import { maskCpfCnpj, maskPhone } from "@/lib/format/masks";

interface FuncionarioRow {
  id: string;
  nome: string;
  cpf?: string;
  cargo?: string;
  setor?: string;
  telefone?: string;
  email?: string;
  active: boolean;
  createdAt: string;
}

export default function FuncionariosPage() {
  const [funcionarios, setFuncionarios] = useState<FuncionarioRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const FUNC_PAGE_SIZE = 15;
  const funcPageCount = Math.max(1, Math.ceil((funcionarios?.length ?? 0) / FUNC_PAGE_SIZE));
  const funcClampedPage = Math.min(page, funcPageCount);
  const funcPageItems = useMemo(
    () => (funcionarios ?? []).slice((funcClampedPage - 1) * FUNC_PAGE_SIZE, funcClampedPage * FUNC_PAGE_SIZE),
    [funcionarios, funcClampedPage],
  );

  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [cargo, setCargo] = useState("");
  const [setor, setSetor] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/funcionarios", { cache: "no-store" });
      if (res.ok) {
        setFuncionarios((await res.json()).funcionarios ?? []);
        setLoadError(null);
      } else {
        setFuncionarios([]);
        setLoadError("Não foi possível carregar a lista de funcionários.");
      }
    } catch {
      setFuncionarios([]);
      setLoadError("Não foi possível carregar a lista de funcionários.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function addFuncionario(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);
    if (!nome.trim()) {
      setError("Informe o nome do funcionário.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/funcionarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome,
          cpf: cpf || undefined,
          cargo: cargo || undefined,
          setor: setor || undefined,
          telefone: telefone || undefined,
          email: email || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Não foi possível cadastrar o funcionário.");
        return;
      }
      setOk(`Funcionário ${nome} cadastrado com sucesso.`);
      setNome("");
      setCpf("");
      setCargo("");
      setSetor("");
      setTelefone("");
      setEmail("");
      await load();
    } catch {
      setError("Não foi possível cadastrar o funcionário. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Equipe interna"
        title="Funcionários"
        description="Cadastro dos colaboradores da Imigrar Brasil, usado como referência interna para gestão de equipe."
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* Lista de funcionários */}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-ib-line px-5 py-4">
            <div className="flex items-center gap-2">
              <Icon name="users" className="h-[18px] w-[18px] text-ib-mar" />
              <p className="text-sm font-semibold text-ib-ink">
                Colaboradores{funcionarios ? ` (${funcionarios.length})` : ""}
              </p>
            </div>
          </div>

          {funcionarios === null ? (
            <div className="divide-y divide-ib-line/70">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3.5">
                  <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-1/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              ))}
            </div>
          ) : funcionarios.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title={loadError ?? "Nenhum funcionário cadastrado ainda"}
                text="Adicione o primeiro colaborador pelo painel ao lado."
              />
            </div>
          ) : (
            <ul className="divide-y divide-ib-line">
              {funcPageItems.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-ib-papel/60"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ib-bruma text-sm font-semibold text-ib-casa">
                    {f.nome.slice(0, 1).toUpperCase()}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-ib-ink">{f.nome}</p>
                      <span
                        className="flex items-center gap-1 shrink-0"
                        title={f.active ? "Ativo" : "Inativo"}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            f.active ? "bg-ib-success" : "bg-ib-slate/40"
                          }`}
                        />
                        <span
                          className={`text-[11px] font-medium ${
                            f.active ? "text-ib-success" : "text-ib-slate"
                          }`}
                        >
                          {f.active ? "Ativo" : "Inativo"}
                        </span>
                      </span>
                    </div>
                    <p className="truncate text-xs text-ib-slate">
                      {[f.cargo, f.setor].filter(Boolean).join(" · ") ||
                        f.cpf ||
                        `Desde ${fmtDate(f.createdAt)}`}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {f.telefone || f.email ? (
                      <span className="text-xs text-ib-slate">{f.telefone || f.email}</span>
                    ) : null}
                    <span className="font-mono text-[11px] tabular-nums text-ib-slate">
                      {fmtDate(f.createdAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {funcionarios && funcionarios.length > 0 ? (
            <div className="border-t border-ib-line">
              <Pagination
                page={funcClampedPage}
                pageCount={funcPageCount}
                onPage={setPage}
                total={funcionarios.length}
              />
            </div>
          ) : null}
        </Card>

        {/* Novo funcionário */}
        <Card className="h-fit p-5">
          <div className="flex items-center gap-2">
            <Icon name="users" className="h-[18px] w-[18px] text-ib-mar" />
            <p className="text-sm font-semibold text-ib-ink">Adicionar funcionário</p>
          </div>
          <form onSubmit={addFuncionario} className="mt-4 space-y-3" noValidate>
            <Field label="Nome" htmlFor="func-nome">
              <input
                id="func-nome"
                required
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: Maria Souza"
                className={inputCls}
              />
            </Field>
            <Field label="CPF (opcional)" htmlFor="func-cpf">
              <input
                id="func-cpf"
                value={cpf}
                onChange={(e) => setCpf(maskCpfCnpj(e.target.value))}
                placeholder="000.000.000-00"
                className={inputCls}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cargo (opcional)" htmlFor="func-cargo">
                <input
                  id="func-cargo"
                  value={cargo}
                  onChange={(e) => setCargo(e.target.value)}
                  placeholder="Ex.: Supervisora"
                  className={inputCls}
                />
              </Field>
              <Field label="Setor (opcional)" htmlFor="func-setor">
                <input
                  id="func-setor"
                  value={setor}
                  onChange={(e) => setSetor(e.target.value)}
                  placeholder="Ex.: Operações"
                  className={inputCls}
                />
              </Field>
            </div>
            <Field label="Telefone (opcional)" htmlFor="func-telefone">
              <input
                id="func-telefone"
                value={telefone}
                onChange={(e) => setTelefone(maskPhone(e.target.value))}
                placeholder="(21) 90000-0000"
                className={inputCls}
              />
            </Field>
            <Field label="E-mail (opcional)" htmlFor="func-email">
              <input
                id="func-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="pessoa@shinerio.com"
                className={inputCls}
              />
            </Field>

            {error ? (
              <p
                role="alert"
                className="flex items-start gap-1.5 rounded-lg bg-ib-danger/10 px-3 py-2 text-xs text-ib-danger"
              >
                {error}
              </p>
            ) : null}
            {ok ? (
              <p
                role="status"
                className="flex items-start gap-1.5 rounded-lg bg-ib-success/10 px-3 py-2 text-xs text-ib-success"
              >
                {ok}
              </p>
            ) : null}

            <button type="submit" disabled={saving} className={`${btnPrimary} w-full`}>
              <Icon name="plus" className="h-4 w-4" />
              {saving ? "Cadastrando…" : "Cadastrar funcionário"}
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-ib-line bg-ib-papel px-3 py-2 text-sm text-ib-ink outline-none transition focus:border-ib-mar focus:bg-white focus:ring-4 focus:ring-ib-mar/10";

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="mb-1 block text-xs font-medium text-ib-slate">{label}</span>
      {children}
    </label>
  );
}
