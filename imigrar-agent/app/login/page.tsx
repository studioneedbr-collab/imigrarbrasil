"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Marca, FaixaMrz } from "@/components/marca";
import { Guilloche } from "@/components/guilloche";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginView />
    </Suspense>
  );
}

function LoginView() {
  const router = useRouter();
  const params = useSearchParams();
  // Só aceita caminho interno: "//site.com" e "https://site.com" viram /dashboard,
  // senão bastaria mandar um link ?next=… para redirigir alguém logado para fora.
  const raw = params.get("next") || "";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "idle" → "checking" (validando credencial) → "entering" (navegando p/ o painel).
  // O estado só volta a "idle" em caso de erro: manter "entering" até a página
  // desmontar evita o buraco em que o botão já dizia "Entrar" enquanto o
  // Next ainda buscava o dashboard — era isso que dava a sensação de travamento.
  const [phase, setPhase] = useState<"idle" | "checking" | "entering">("idle");
  const [shakeKey, setShakeKey] = useState(0);
  const emailRef = useRef<HTMLInputElement>(null);

  const busy = phase !== "idle";

  // Puxa o bundle e o RSC do destino enquanto a pessoa digita: quando o POST
  // volta, quase tudo da próxima tela já está em cache.
  useEffect(() => {
    router.prefetch(next);
    emailRef.current?.focus();
  }, [router, next]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setPhase("checking");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Não foi possível entrar. Tente novamente.");
        setShakeKey((k) => k + 1);
        setPhase("idle");
        setPassword("");
        return;
      }
      setPhase("entering");
      router.replace(next); // replace: o botão "voltar" não devolve à tela de login
      router.refresh();
    } catch {
      setError("Falha de conexão. Verifique sua internet e tente de novo.");
      setShakeKey((k) => k + 1);
      setPhase("idle");
    }
  }

  return (
    <main className="relative grid min-h-screen grid-cols-1 bg-white md:grid-cols-2">
      {/* Barra indeterminada no topo — feedback imediato de que algo está acontecendo. */}
      {busy && (
        <div className="absolute inset-x-0 top-0 z-30 h-0.5 overflow-hidden bg-ib-line">
          <div className="h-full w-full origin-left bg-ib-mar animate-progress-slide" />
        </div>
      )}

      {/* ── Formulário ── */}
      {/* Lado do formulário fica limpo: a roseta do outro lado deixava um halo circular
          duro atrás do campo de e-mail. Uma textura só, e no lugar certo. */}
      <div className="flex items-center justify-center px-6 py-12 sm:px-10">
        <form
          onSubmit={submit}
          className={`relative w-full max-w-sm animate-fade-up transition-opacity ${
            phase === "entering" ? "opacity-40" : "opacity-100"
          }`}
        >
          {/* Só aparece quando o painel escuro não cabe: uma marca por viewport. */}
          <div className="mb-11 md:hidden">
            <Marca className="h-11 w-auto" />
          </div>

          <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-[-0.02em] text-ib-ink">
            Entrar no painel
          </h1>
          <p className="mt-1.5 text-sm text-ib-slate">
            Console do agente da Imigrar Brasil.
          </p>

          <div className="mt-8 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ib-ink">E-mail</span>
              <input
                ref={emailRef}
                type="email"
                required
                disabled={busy}
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@empresa.com"
                className="w-full rounded-lg border border-ib-line bg-ib-papel px-3.5 py-2.5 text-sm text-ib-ink outline-none transition focus:border-ib-mar focus:bg-white focus:ring-4 focus:ring-ib-mar/10 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ib-ink">Senha</span>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  disabled={busy}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-ib-line bg-ib-papel py-2.5 pl-3.5 pr-11 text-sm text-ib-ink outline-none transition focus:border-ib-mar focus:bg-white focus:ring-4 focus:ring-ib-mar/10 disabled:cursor-not-allowed disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  disabled={busy}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-ib-slate transition hover:text-ib-ink focus:outline-none focus-visible:ring-4 focus-visible:ring-ib-mar/10 disabled:opacity-40"
                >
                  <EyeIcon off={showPassword} />
                </button>
              </div>
            </label>
          </div>

          {error && (
            <p
              key={shakeKey}
              role="alert"
              className="mt-4 animate-shake rounded-lg border border-ib-danger/20 bg-ib-danger/5 px-3.5 py-2.5 text-sm text-ib-danger motion-reduce:animate-none"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-ib-casa px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ib-carimbo focus:outline-none focus:ring-4 focus:ring-ib-mar/20 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {busy && <Spinner />}
            {phase === "idle" ? "Entrar" : phase === "checking" ? "Verificando…" : "Abrindo painel…"}
          </button>

          <p className="mt-8 text-xs text-ib-slate">
            Acesso restrito à equipe Imigrar Brasil. Problemas para entrar? Fale com o
            administrador do painel.
          </p>
        </form>
      </div>

      {/*
        ── Assinatura visual ──

        Aqui não se explica o sistema. É a tela de entrada de quem já trabalha nele:
        marca, textura gravada e a faixa de leitura. A primeira versão trazia um
        parágrafo e uma grade de campos descrevendo o produto — isso é página de
        venda, não console interno, e foi removido.
      */}
      <div className="relative hidden overflow-hidden bg-ib-casa md:block">
        <div className="absolute inset-0 bg-gradient-to-br from-ib-casa via-ib-carimbo to-ib-ink" />

        {/* Sem texto para proteger, a roseta pode ficar mais presente. */}
        <Guilloche
          className="pointer-events-none absolute left-1/2 top-1/2 h-[150%] w-auto -translate-x-1/2 -translate-y-1/2 text-ib-bruma/[0.17]"
          linhas={11}
          dentes={13}
        />
        <Guilloche
          className="pointer-events-none absolute left-1/2 top-1/2 h-[62%] w-auto -translate-x-1/2 -translate-y-1/2 text-ib-selo/[0.22]"
          linhas={7}
          dentes={7}
        />
        {/* Escurecimento nas bordas: dá centro à composição e assenta a faixa embaixo. */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_25%,rgba(13,27,44,0.72)_100%)]" />

        <div className="absolute inset-0 z-10 flex items-center justify-center p-12">
          <Marca tom="escuro" className="h-14 w-auto" />
        </div>

        <div className="absolute inset-x-0 bottom-0 z-10 p-10">
          <FaixaMrz
            texto="IB BRA CENTRAL DE ATENDIMENTO"
            largura={44}
            lendo
            className="text-white/35"
          />
        </div>
      </div>

      {/* Confirmação visual de que o login passou, cobrindo o intervalo até o
          painel montar. Sem isso a tela ficava parada e parecia travada. */}
      {phase === "entering" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/85 backdrop-blur-sm animate-fade-in md:right-1/2">
          <div className="flex flex-col items-center gap-3 animate-pop-in">
            <span className="relative flex h-12 w-12 items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-ib-mar/15 animate-signal-ping motion-reduce:hidden" />
              <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-ib-casa text-white">
                <CheckIcon />
              </span>
            </span>
            <p className="text-sm font-medium text-ib-ink">Acesso liberado</p>
            <p className="text-xs text-ib-slate">Carregando seu painel…</p>
          </div>
        </div>
      )}
    </main>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="m5 13 4.5 4.5L19 7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="12" r="2.8" stroke="currentColor" strokeWidth="1.6" />
      {off && <path d="M4 20 20 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
    </svg>
  );
}
