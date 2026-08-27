"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/dashboard/ui";

type NavLink = { href: string; label: string; icon: IconName; adminOnly?: boolean };
type NavGroup = { section: string | null; links: NavLink[] };

/**
 * O MENU SEGUE A FILA DE PRAZOS.
 *
 * A tela inicial não é uma visão geral: é a fila de trabalho, e ela responde a uma
 * pergunta — o que vence primeiro. Por isso "Fila" é o primeiro item e leva a /dashboard.
 *
 * Saíram daqui, com as telas: Propostas, Preços, Orçamento, Funcionários, Clientes,
 * Leads (o Kanban do funil de vendas) e Relatórios de receita. Eram a operação da base
 * comercial que originou este código — precificação de mão de obra terceirizada — e não
 * têm equivalente em imigração. Relatórios virou Métricas, que mede outra coisa: tempo do
 * time economizado, e não faturamento.
 */
const navGroups: NavGroup[] = [
  {
    section: null,
    links: [
      { href: "/dashboard", label: "Fila", icon: "bolt" },
      { href: "/dashboard/meus", label: "Meus atendimentos", icon: "check" },
  { href: "/dashboard/atendimentos", label: "Quadro", icon: "activity" },
    ],
  },
  {
    section: "Atendimento",
    links: [
      { href: "/dashboard/conversations", label: "Conversas", icon: "chat" },
      // Auditoria do que o agente descartou. Fica no menu, e não escondida numa aba,
      // porque um agente que filtra demais só é descoberto por quem revisa isto.
      { href: "/dashboard/filtradas", label: "Filtradas", icon: "search" },
      { href: "/dashboard/documentos", label: "Documentos", icon: "doc" },
      // Um áudio não transcrito é um lead perdido. Fica no menu, e não escondido numa
      // aba, porque essa perda não avisa que aconteceu.
      { href: "/dashboard/audios", label: "Falhas de transcrição", icon: "pulse" },
    ],
  },
  {
    section: "Agente",
    links: [
      { href: "/dashboard/treinar", label: "Treinar o agente", icon: "gear" },
      // A fila de sombra. Fica no menu, e não escondida dentro das conversas, porque na
      // fase de testes ela é o trabalho: cada rascunho ali é uma resposta esperando um
      // "podia ter saído?" — e uma pessoa do outro lado esperando alguém decidir.
      { href: "/dashboard/sombra", label: "Modo sombra", icon: "agent" },
      { href: "/dashboard/integracoes", label: "Integrações", icon: "plug" },
      // Falha de LLM tem tela própria, e não uma aba dentro dos áudios: são dois
      // problemas com duas causas. Ver o comentário em app/dashboard/falhas-llm/page.tsx.
      { href: "/dashboard/falhas-llm", label: "Falhas de LLM", icon: "bolt" },
      { href: "/simulate", label: "Simulador", icon: "external" },
      // Onde o que foi ensaiado vai parar. A fila, o quadro e as métricas excluem ensaio
      // de propósito — sem esta tela, ele não teria onde ser lido.
      { href: "/dashboard/ensaios", label: "Ensaios", icon: "chat" },
    ],
  },
  {
    section: "Gestão",
    links: [
      { href: "/dashboard/metricas", label: "Métricas", icon: "activity" },
      { href: "/dashboard/acesso", label: "Acesso e retenção", icon: "shield", adminOnly: true },
      { href: "/dashboard/users", label: "Usuários", icon: "users", adminOnly: true },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function DashboardNav() {
  const pathname = usePathname() ?? "";
  const router = useRouter();

  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // null = ainda carregando. Enquanto não sabemos o papel, o item admin fica
  // fora — melhor aparecer um instante depois do que piscar e sumir.
  const [role, setRole] = useState<"admin" | "user" | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { role?: string } | null) => {
        if (alive) setRole(d?.role === "admin" ? "admin" : "user");
      })
      .catch(() => alive && setRole("user"));
    return () => {
      alive = false;
    };
  }, []);

  async function logout() {
    setLeaving(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  const visibleGroups = navGroups
    .map((g) => ({
      ...g,
      links: g.links.filter((l) => !l.adminOnly || role === "admin"),
    }))
    .filter((g) => g.links.length > 0);

  return (
    <nav className="px-3 py-3 md:py-4">
      {visibleGroups.map((group, gi) => (
        <div key={group.section ?? "root"} className={gi > 0 ? "mt-5" : ""}>
          {group.section ? (
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">
              {group.section}
            </p>
          ) : null}
          <div className="flex flex-row flex-wrap gap-1 md:flex-col">
            {group.links.map((link) => {
              const active = isActive(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    active
                      ? "bg-ib-selo/15 text-white ring-1 ring-inset ring-ib-selo/25"
                      : "text-white/70 hover:bg-white/[0.07] hover:text-white"
                  }`}
                >
                  {active ? (
                    <span className="absolute inset-y-1.5 left-0 w-1 rounded-full bg-ib-selo" />
                  ) : null}
                  <Icon
                    name={link.icon}
                    className={`h-[18px] w-[18px] shrink-0 ${active ? "text-ib-selo" : ""}`}
                  />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      <div className="my-4 hidden h-px bg-white/10 md:block" />

      <button
        type="button"
        onClick={() => setConfirmingLogout(true)}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-white/70 transition hover:bg-white/[0.07] hover:text-white"
      >
        <Icon name="logout" className="h-[18px] w-[18px] shrink-0" />
        <span>Sair</span>
      </button>

      {confirmingLogout && (
        <LogoutConfirm
          leaving={leaving}
          onCancel={() => setConfirmingLogout(false)}
          onConfirm={logout}
        />
      )}
    </nav>
  );
}

function LogoutConfirm({
  leaving,
  onCancel,
  onConfirm,
}: {
  leaving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !leaving) onCancel();
    };
    document.addEventListener("keydown", onKey);
    // Trava o scroll do fundo enquanto a decisão está aberta.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onCancel, leaving]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="logout-title"
    >
      <div
        className="absolute inset-0 bg-ib-ink/60 backdrop-blur-sm"
        onClick={() => !leaving && onCancel()}
      />
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 text-ib-ink shadow-2xl shadow-black/30 animate-pop-in">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-ib-danger/10 text-ib-danger">
          <Icon name="logout" className="h-5 w-5" />
        </div>
        <h2 id="logout-title" className="mt-4 text-base font-semibold tracking-tight">
          Sair da conta?
        </h2>
        <p className="mt-1.5 text-sm text-ib-slate">
          Você será desconectado do painel e precisará entrar de novo com e-mail e
          senha.
        </p>
        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={leaving}
            className="flex-1 rounded-lg border border-ib-line bg-white px-4 py-2.5 text-sm font-semibold text-ib-ink transition hover:bg-ib-papel focus:outline-none focus-visible:ring-4 focus-visible:ring-ib-mar/15 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={leaving}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-ib-danger px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-95 focus:outline-none focus-visible:ring-4 focus-visible:ring-ib-danger/25 disabled:opacity-70"
          >
            {leaving && (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            )}
            {leaving ? "Saindo…" : "Sair"}
          </button>
        </div>
      </div>
    </div>
  );
}
