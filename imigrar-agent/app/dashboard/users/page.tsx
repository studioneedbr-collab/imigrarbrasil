"use client";

import { useEffect, useMemo, useState } from "react";
import {
  PAPEIS,
  PAPEL_DESCRICAO,
  PAPEL_LABEL,
  normalizarPapel,
  type Papel,
} from "@/lib/auth/papeis";
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
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";

type Setor = "comercial" | "operacional" | "rh" | "departamento_pessoal";

const SETOR_LABEL: Record<Setor, string> = {
  comercial: "Comercial",
  operacional: "Operacional",
  rh: "RH",
  departamento_pessoal: "Departamento Pessoal",
};

interface UserRow {
  id: string;
  email: string;
  name?: string;
  role: Papel | "user";
  setor?: Setor | null;
  active: boolean;
  createdAt: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const USERS_PAGE_SIZE = 15;
  const usersPageCount = Math.max(1, Math.ceil((users?.length ?? 0) / USERS_PAGE_SIZE));
  const usersClampedPage = Math.min(page, usersPageCount);
  const usersPageItems = useMemo(
    () => (users ?? []).slice((usersClampedPage - 1) * USERS_PAGE_SIZE, usersClampedPage * USERS_PAGE_SIZE),
    [users, usersClampedPage],
  );
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Papel>("atendente");
  const [setor, setSetor] = useState<Setor>("comercial");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/users", { cache: "no-store" });
      if (res.ok) {
        setUsers((await res.json()).users ?? []);
        setLoadError(null);
      } else {
        setUsers([]);
        setLoadError("Não foi possível carregar a lista de usuários.");
      }
    } catch {
      setUsers([]);
      setLoadError("Não foi possível carregar a lista de usuários.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);
    if (!email.trim()) {
      setError("Informe o e-mail da pessoa.");
      return;
    }
    // Mesmo limite do servidor (lib/auth/password-policy). Divergir daqui era o
    // que fazia o botão parecer quebrado: a tela aceitava 6, a API recusava.
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`A senha precisa ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          name: name || undefined,
          role,
          setor: role === "admin" ? undefined : setor,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Não foi possível criar o usuário.");
        return;
      }
      setOk(`Usuário ${email} criado com sucesso.`);
      setEmail("");
      setName("");
      setPassword("");
      await load();
    } catch {
      setError("Não foi possível criar o usuário. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Acesso ao painel"
        title="Usuários"
        description="Quem pode entrar no console da Imigrar Brasil. Cada pessoa recebe o próprio e-mail e senha de acesso."
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* Lista de membros */}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-ib-line px-5 py-4">
            <div className="flex items-center gap-2">
              <Icon name="users" className="h-[18px] w-[18px] text-ib-mar" />
              <p className="text-sm font-semibold text-ib-ink">
                Equipe com acesso{users ? ` (${users.length})` : ""}
              </p>
            </div>
          </div>

          {users === null ? (
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
          ) : users.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title={loadError ?? "Nenhum usuário cadastrado ainda"}
                text="Adicione a primeira pessoa da equipe pelo painel ao lado. Ela poderá entrar com o próprio e-mail e senha."
              />
            </div>
          ) : (
            <ul className="divide-y divide-ib-line">
              {usersPageItems.map((u) => (
                <li
                  key={u.id}
                  className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-ib-papel/60"
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                      u.role === "admin"
                        ? "bg-ib-casa text-white"
                        : "bg-ib-bruma text-ib-casa"
                    }`}
                  >
                    {(u.name || u.email).slice(0, 1).toUpperCase()}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-ib-ink">
                        {u.name || u.email}
                      </p>
                      <span
                        className="flex items-center gap-1 shrink-0"
                        title={u.active ? "Ativo" : "Inativo"}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            u.active ? "bg-ib-success" : "bg-ib-slate/40"
                          }`}
                        />
                        <span
                          className={`text-[11px] font-medium ${
                            u.active ? "text-ib-success" : "text-ib-slate"
                          }`}
                        >
                          {u.active ? "Ativo" : "Inativo"}
                        </span>
                      </span>
                    </div>
                    <p className="truncate text-xs text-ib-slate">
                      {u.name ? u.email : `Desde ${fmtDate(u.createdAt)}`}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        u.role === "admin"
                          ? "bg-ib-casa/10 text-ib-casa"
                          : "bg-ib-papel text-ib-slate"
                      }`}
                    >
                      {PAPEL_LABEL[normalizarPapel(u.role)]}
                      {u.role !== "admin" && u.setor ? ` · ${SETOR_LABEL[u.setor]}` : ""}
                    </span>
                    {u.name ? (
                      <span className="font-mono text-[11px] tabular-nums text-ib-slate">
                        {fmtDate(u.createdAt)}
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {users && users.length > 0 ? (
            <div className="border-t border-ib-line">
              <Pagination
                page={usersClampedPage}
                pageCount={usersPageCount}
                onPage={setPage}
                total={users.length}
              />
            </div>
          ) : null}
        </Card>

        {/* Novo usuário */}
        <Card className="h-fit p-5">
          <div className="flex items-center gap-2">
            <Icon name="shield" className="h-[18px] w-[18px] text-ib-mar" />
            <p className="text-sm font-semibold text-ib-ink">Adicionar usuário</p>
          </div>
          <form onSubmit={addUser} className="mt-4 space-y-3" noValidate>
            <Field label="Nome (opcional)" htmlFor="user-name">
              <input
                id="user-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Pedro Lucas"
                className={inputCls}
              />
            </Field>
            <Field label="E-mail" htmlFor="user-email">
              <input
                id="user-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="pessoa@imigrarbrasil.com.br"
                className={inputCls}
              />
            </Field>
            <Field label="Senha inicial" htmlFor="user-password">
              <input
                id="user-password"
                type={showPassword ? "text" : "password"}
                required
                minLength={MIN_PASSWORD_LENGTH}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres`}
                className={inputCls}
                aria-describedby="user-password-hint"
              />
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <p
                  id="user-password-hint"
                  className={`text-[11px] ${
                    password.length === 0
                      ? "text-ib-slate"
                      : password.length < MIN_PASSWORD_LENGTH
                        ? "text-ib-warn"
                        : "text-ib-success"
                  }`}
                >
                  {password.length === 0
                    ? `${MIN_PASSWORD_LENGTH} caracteres no mínimo`
                    : password.length < MIN_PASSWORD_LENGTH
                      ? `Faltam ${MIN_PASSWORD_LENGTH - password.length} caractere${
                          MIN_PASSWORD_LENGTH - password.length === 1 ? "" : "s"
                        }`
                      : "Senha válida"}
                </p>
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="shrink-0 text-[11px] font-medium text-ib-mar transition hover:underline"
                >
                  {showPassword ? "Ocultar" : "Mostrar"}
                </button>
              </div>
            </Field>
            <Field label="Cargo / acesso" htmlFor="user-role">
              <select
                id="user-role"
                value={role}
                onChange={(e) => setRole(e.target.value as Papel)}
                className={inputCls}
              >
                {PAPEIS.map((p) => (
                  <option key={p} value={p}>
                    {PAPEL_LABEL[p]}
                  </option>
                ))}
              </select>
              {/* O que cada papel pode é decisão de segurança, não preferência de
                  interface: quem cria a conta precisa ler isto antes de escolher. */}
              <p className="mt-1 text-[11px] leading-relaxed text-ib-slate">
                {PAPEL_DESCRICAO[role]}
              </p>
            </Field>
            {role !== "admin" ? (
              <Field label="Setor" htmlFor="user-setor">
                <select
                  id="user-setor"
                  value={setor}
                  onChange={(e) => setSetor(e.target.value as Setor)}
                  className={inputCls}
                >
                  <option value="comercial">Comercial</option>
                  <option value="operacional">Operacional</option>
                  <option value="rh">RH</option>
                  <option value="departamento_pessoal">Departamento Pessoal</option>
                </select>
              </Field>
            ) : null}

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
              {saving ? "Criando…" : "Criar usuário"}
            </button>
          </form>

          <div className="mt-4 flex items-start gap-2 rounded-lg border border-ib-line bg-ib-papel/60 px-3 py-2.5">
            <Icon name="shield" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ib-slate" />
            <p className="text-[11px] leading-relaxed text-ib-slate">
              Senhas ficam salvas com hash — ninguém, nem a equipe da Imigrar Brasil, consegue vê-las.
              Cada pessoa entra com o próprio e-mail e senha.
            </p>
          </div>
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
