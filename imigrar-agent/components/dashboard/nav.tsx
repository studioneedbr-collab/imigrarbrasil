"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/dashboard/ui";
import { PAPEL_LABEL, normalizarPapel, type Papel } from "@/lib/auth/papeis";
import { rotaAtiva } from "@/lib/dashboard/abas";

type NavLink = {
  href: string;
  label: string;
  icon: IconName;
  adminOnly?: boolean;
  /**
   * As outras rotas que acendem este item — as abas que moram dentro dele.
   *
   * Sem isto, abrir "Meus" apagava o item do menu inteiro: nada ficava aceso, e a tela
   * parecia estar fora do painel. Ver lib/dashboard/abas.ts.
   */
  ativoEm?: string[];
};
type NavGroup = { section: string | null; links: NavLink[] };

/**
 * O MENU SEGUE A FILA DE PRAZOS.
 *
 * A tela inicial não é uma visão geral: é a fila de trabalho, e ela responde a uma
 * pergunta — o que vence primeiro. Por isso "Atendimento" é o primeiro item, leva a
 * /dashboard e abre na aba Fila.
 *
 * Saíram daqui, com as telas: Propostas, Preços, Orçamento, Funcionários, Clientes,
 * Leads (o Kanban do funil de vendas) e Relatórios de receita. Eram a operação da base
 * comercial que originou este código — precificação de mão de obra terceirizada — e não
 * têm equivalente em imigração. Relatórios virou Métricas, que mede outra coisa: tempo do
 * time economizado, e não faturamento.
 */
const navGroups: NavGroup[] = [
  /*
   * DUAS ENTRADAS, E AS ABAS DENTRO DELAS.
   *
   * Aqui havia oito itens para responder duas perguntas. "Fila", "Meus atendimentos",
   * "CRM" e "Conversas" são quatro recortes do MESMO dado, e a pergunta que aparecia era
   * literal: "Fila, Meus atendimentos, Conversas: não sei o que é o quê".
   *
   * A tentativa anterior foi explicar, com uma linha embaixo de cada nome. Ajudou e não
   * resolveu, porque o problema não era falta de legenda: item de menu irmão de outro
   * item de menu parece tela DIFERENTE. Recorte do mesmo assunto se mostra com aba — lado
   * a lado, onde dá para comparar o que cada um responde.
   *
   *   Atendimento   Fila (o que vence primeiro) · Meus (o que é seu) · Funil (onde está)
   *   Conversas     tudo que entrou · filtradas · documentos · áudios não lidos
   *
   * As rotas continuam as mesmas, uma por aba: `ativoEm` é o que faz o item do menu
   * continuar aceso quando a pessoa está numa das abas de dentro.
   *
   * O MENU NÃO EXPLICA MAIS CADA ITEM. Havia uma linha de descrição embaixo de cada nome
   * ("a fila, os seus casos e o funil"). Ela existia para desfazer a confusão entre as
   * quatro telas irmãs — e as abas, que mostram os recortes lado a lado, resolvem isso
   * melhor. Mantidas as duas, o rail virava um parágrafo por item: texto que ninguém relê
   * depois da primeira semana ocupando a coluna inteira.
   */
  {
    section: "Trabalho de hoje",
    links: [
      {
        href: "/dashboard",
        label: "Atendimento",
        icon: "bolt",
        ativoEm: ["/dashboard/meus", "/dashboard/crm", "/dashboard/atendimentos"],
      },
      {
        href: "/dashboard/conversations",
        label: "Conversas",
        icon: "chat",
        ativoEm: ["/dashboard/filtradas", "/dashboard/documentos", "/dashboard/audios"],
      },
      // Fica no trabalho de hoje, e não em configuração, porque um motivo sem modelo no
      // idioma de alguém não dá erro: dá silêncio. Só quem passa por aqui descobre.
      {
        href: "/dashboard/followup",
        label: "Modelos de follow-up",
        icon: "chat",
      },
    ],
  },
  {
    section: "Agente",
    links: [
      // O mapa vem ANTES de treinar de propósito: quem chega para ajustar o
      // comportamento da Ana precisa primeiro ver o comportamento que existe — metade
      // dos pedidos de "muda o prompt" some quando se descobre que a decisão não é do
      // prompt, é de um portão em código.
      {
        href: "/dashboard/mapa",
        label: "Mapa do atendimento",
        icon: "activity",
      },
      { href: "/dashboard/treinar", label: "Treinar o agente", icon: "gear" },
      // A fila de sombra. Fica no menu, e não escondida dentro das conversas, porque na
      // fase de testes ela é o trabalho: cada rascunho ali é uma resposta esperando um
      // "podia ter saído?" — e uma pessoa do outro lado esperando alguém decidir.
      { href: "/dashboard/sombra", label: "Modo sombra", icon: "agent" },
      { href: "/dashboard/integracoes", label: "Integrações", icon: "plug" },
      // Falha de LLM tem tela própria, e não uma aba dentro dos áudios: são dois
      // problemas com duas causas. Ver o comentário em app/dashboard/falhas-llm/page.tsx.
      { href: "/dashboard/falhas-llm", label: "Falhas de LLM", icon: "bolt" },
    ],
  },
  {
    section: "Gestão",
    links: [
      {
        href: "/dashboard/metricas",
        label: "Métricas",
        icon: "activity",
      },
      {
        href: "/dashboard/acesso",
        label: "Acesso e retenção",
        icon: "shield",
        adminOnly: true,
      },
      {
        href: "/dashboard/users",
        label: "Usuários",
        icon: "users",
        adminOnly: true,
      },
    ],
  },
];

function isActive(pathname: string, link: NavLink) {
  if (rotaAtiva(pathname, link.href)) return true;
  return (link.ativoEm ?? []).some((href) => rotaAtiva(pathname, href));
}

export default function DashboardNav() {
  const pathname = usePathname() ?? "";
  const router = useRouter();

  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // null = ainda carregando. Enquanto não sabemos o papel, o item admin fica
  // fora — melhor aparecer um instante depois do que piscar e sumir.
  const [role, setRole] = useState<"admin" | "user" | null>(null);
  /**
   * QUEM ESTÁ LOGADO. O painel nunca disse.
   *
   * Não é conforto: este sistema tem contas com poderes diferentes (quem exporta dado
   * sensível, quem mexe em usuário, quem desliga o agente para a empresa inteira) e a
   * faixa vermelha do topo chega a NOMEAR uma conta — "agente desligado por fulano@" —
   * para alguém que não tinha como saber se aquele fulano era ele mesmo. Sem isto, a
   * pergunta "posso fazer isto?" e a pergunta "fui eu que fiz isto?" ficavam as duas sem
   * resposta na tela.
   */
  const [conta, setConta] = useState<
    { nome: string | null; email: string; papel: Papel; dono: boolean } | null
  >(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { role?: string; email?: string; name?: string | null; dono?: boolean } | null) => {
        if (!alive) return;
        setRole(d?.role === "admin" ? "admin" : "user");
        if (d?.email) {
          setConta({
            nome: d.name ?? null,
            email: d.email,
            papel: normalizarPapel(d.role),
            dono: !!d.dono,
          });
        }
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
        <div key={group.section ?? "root"} className={gi > 0 ? "mt-4" : ""}>
          {/* O TRAÇO ENTRE AS SEÇÕES.
              Elas se distinguiam só pelo espaço em branco e por um título de 10px em
              branco a 35% — que some sobre o gradiente escuro do rail. Sem a linha,
              "Métricas" parecia mais um item do Agente, e "Trabalho de hoje" não tinha
              fim visível. Três blocos com fronteira desenhada é o que faz o menu ser lido
              como três assuntos em vez de uma pilha de treze links. */}
          {gi > 0 ? <div className="mx-3 mb-4 h-px bg-white/10" /> : null}
          {group.section ? (
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
              {group.section}
            </p>
          ) : null}
          <div className="flex flex-row flex-wrap gap-1 md:flex-col">
            {group.links.map((link) => {
              const active = isActive(pathname, link);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
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
                  <span className="min-w-0 truncate">{link.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      <div className="my-4 hidden h-px bg-white/10 md:block" />

      {/* A CONTA ATIVA, logo acima de "Sair" — que é onde a pessoa olha quando a pergunta
          surge. Papel junto do nome porque as duas dúvidas aparecem no mesmo momento:
          "quem sou eu aqui" e "por que este item não aparece para mim". */}
      {conta ? (
        <div className="mb-1 rounded-lg bg-white/[0.06] px-3 py-2">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold leading-tight text-white">
            <Icon name="check" className="h-3.5 w-3.5 shrink-0 text-ib-selo" />
            <span className="min-w-0 truncate">{conta.nome || conta.email}</span>
          </p>
          {/* O e-mail nunca é truncado no title: duas contas do mesmo escritório costumam
              diferir só no fim, e é justamente o fim que some no corte. */}
          <p className="mt-0.5 truncate text-[11px] leading-tight text-white/45" title={conta.email}>
            {conta.nome ? conta.email : PAPEL_LABEL[conta.papel]}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] leading-tight text-white/45">
            {conta.nome ? <span>{PAPEL_LABEL[conta.papel]}</span> : null}
            {/* A CONTA DONA se identifica aqui porque é a informação que responde "posso
                perder o acesso a este painel?". Ela é a única que não se apaga, não se
                desativa e não se rebaixa — nem por UPDATE à mão no banco. */}
            {conta.dono ? (
              <span
                title="Conta dona do painel: não pode ser apagada, desativada nem rebaixada."
                className="rounded bg-ib-selo/20 px-1.5 py-px font-semibold text-ib-selo"
              >
                dona do painel
              </span>
            ) : null}
          </p>
        </div>
      ) : null}

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
