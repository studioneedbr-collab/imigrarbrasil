import DashboardNav from "@/components/dashboard/nav";
import { AgentStatus } from "@/components/dashboard/ui";
import Topbar from "@/components/dashboard/topbar";
import FloatingChat from "@/components/dashboard/floating-chat";
import NewMessageAlerts from "@/components/dashboard/new-message-alerts";
import { Marca, FaixaMrz } from "@/components/marca";
import FaixaAlerta from "@/components/operacao/faixa-alerta";
import SaudeRail from "@/components/operacao/saude-rail";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ib-papel text-ib-ink md:flex">
      <aside className="w-full shrink-0 bg-gradient-to-b from-ib-casa to-ib-ink text-white md:sticky md:top-0 md:flex md:h-screen md:w-64 md:flex-col">
        {/* Marca: versão negativa direto sobre o rail, sem chip branco atrás. */}
        <div className="border-b border-white/10 px-6 pb-4 pt-5">
          <Marca tom="escuro" className="h-7 w-auto" />
          {/* A faixa MRZ diz o que este console é, no idioma do documento de viagem. */}
          <FaixaMrz
            texto="IB BRA ATENDIMENTO"
            largura={25}
            className="mt-3.5 text-ib-selo/70"
          />
        </div>

        {/* Nav (grows) — scroll próprio com barra fina e fade sutil no topo/base (ver .rail-scroll) */}
        <div className="rail-scroll min-h-0 md:flex-1 md:overflow-y-auto">
          <DashboardNav />
        </div>

        {/* Rodapé do rail: saúde da operação + status do agente. É onde se confere, de
            relance, que o que deveria estar rodando está rodando. */}
        <div className="hidden border-t border-white/10 md:block">
          <div className="border-b border-white/10 py-2">
            <SaudeRail />
          </div>
          <div className="p-3">
            <AgentStatus variant="rail" />
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-5 sm:p-6 md:p-8">
        <div className="mx-auto max-w-[1680px]">
          <Topbar />
          {/* Antes de qualquer conteúdo: se a captação parou, nada mais importa. */}
          <FaixaAlerta />
          {children}
        </div>
      </main>

      <FloatingChat />
      <NewMessageAlerts />
    </div>
  );
}
