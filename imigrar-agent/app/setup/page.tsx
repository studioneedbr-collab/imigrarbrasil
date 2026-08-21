"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Marca } from "@/components/marca";

/**
 * Cadastro do primeiro administrador. Substitui as variáveis ADMIN_EMAIL /
 * ADMIN_PASSWORD: a senha é escolhida aqui e só existe como hash no banco.
 * A rota fecha sozinha depois do primeiro usuário criado.
 */
export default function SetupPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/setup")
      .then((r) => r.json())
      .then((d) => setNeedsSetup(Boolean(d.needsSetup)))
      .catch(() => setNeedsSetup(false))
      .finally(() => setChecking(false));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("As senhas não conferem.");
      return;
    }
    if (password.length < 12) {
      setError("A senha precisa ter ao menos 12 caracteres.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name: nome || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Não foi possível concluir o cadastro.");
        return;
      }
      router.push("/login");
      router.refresh();
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white">
        <p className="text-sm text-ib-slate">Verificando…</p>
      </main>
    );
  }

  if (!needsSetup) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-6">
        <div className="w-full max-w-sm text-center">
          <Marca className="mx-auto h-11 w-auto" />
          <h1 className="mt-8 text-2xl font-semibold tracking-tight text-ib-ink">
            Configuração já concluída
          </h1>
          <p className="mt-2 text-sm text-ib-slate">
            O administrador do painel já existe. Novos acessos são criados por um
            administrador, dentro do painel.
          </p>
          <a
            href="/login"
            className="mt-6 inline-flex rounded-lg bg-ib-casa px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ib-carimbo"
          >
            Ir para o login
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 py-12">
      <form onSubmit={submit} className="w-full max-w-sm">
        <div className="mb-10">
          <Marca className="h-11 w-auto" />
          <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-ib-slate">
            Configuração inicial
          </p>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-ib-ink">
          Criar administrador
        </h1>
        <p className="mt-1 text-sm text-ib-slate">
          Esta tela só funciona uma vez. Depois de criada a primeira conta, ela é
          desativada permanentemente.
        </p>

        <div className="mt-8 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ib-ink">Nome</span>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Seu nome"
              className="w-full rounded-lg border border-ib-line bg-ib-papel px-3.5 py-2.5 text-sm text-ib-ink outline-none transition focus:border-ib-mar focus:bg-white focus:ring-4 focus:ring-ib-mar/10"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ib-ink">E-mail</span>
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@empresa.com"
              className="w-full rounded-lg border border-ib-line bg-ib-papel px-3.5 py-2.5 text-sm text-ib-ink outline-none transition focus:border-ib-mar focus:bg-white focus:ring-4 focus:ring-ib-mar/10"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ib-ink">Senha</span>
            <input
              type="password"
              required
              minLength={12}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo de 12 caracteres"
              className="w-full rounded-lg border border-ib-line bg-ib-papel px-3.5 py-2.5 text-sm text-ib-ink outline-none transition focus:border-ib-mar focus:bg-white focus:ring-4 focus:ring-ib-mar/10"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ib-ink">
              Confirmar senha
            </span>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repita a senha"
              className="w-full rounded-lg border border-ib-line bg-ib-papel px-3.5 py-2.5 text-sm text-ib-ink outline-none transition focus:border-ib-mar focus:bg-white focus:ring-4 focus:ring-ib-mar/10"
            />
          </label>
        </div>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-ib-danger/20 bg-ib-danger/5 px-3.5 py-2.5 text-sm text-ib-danger"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-6 flex w-full items-center justify-center rounded-lg bg-ib-casa px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ib-carimbo focus:outline-none focus:ring-4 focus:ring-ib-mar/20 disabled:opacity-60"
        >
          {loading ? "Criando…" : "Criar administrador"}
        </button>

        <p className="mt-8 text-xs text-ib-slate">
          Use um gerenciador de senhas. Esta credencial dá acesso a todos os dados
          de clientes do painel.
        </p>
      </form>
    </main>
  );
}
