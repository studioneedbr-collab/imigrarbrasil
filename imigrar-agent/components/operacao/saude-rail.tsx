import Link from "next/link";
import { saudeEmCache } from "@/lib/operacao/saude";
import { desde } from "@/lib/domain/rotulos";

/**
 * O indicador permanente na barra lateral.
 *
 * A faixa vermelha só aparece quando algo parou. Este bloco fica sempre — é onde se
 * confere, de relance, que o que deveria estar rodando está rodando. Cada linha só
 * aparece quando tem o que dizer: uma lista de zeros vira mobília e some da vista.
 */
function Linha({
  rotulo,
  valor,
  tom = "normal",
  href,
}: {
  rotulo: string;
  valor: string;
  tom?: "normal" | "alerta" | "ok";
  href?: string;
}) {
  const cor =
    tom === "alerta" ? "text-ib-danger" : tom === "ok" ? "text-ib-selo" : "text-white/70";
  const conteudo = (
    <div className="flex items-baseline justify-between gap-2 py-[3px]">
      <span className="text-[11px] text-white/45">{rotulo}</span>
      <span className={`font-mono text-[11px] tabular-nums ${cor}`}>{valor}</span>
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded px-1 transition hover:bg-white/[0.06]">
      {conteudo}
    </Link>
  ) : (
    <div className="px-1">{conteudo}</div>
  );
}

export default async function SaudeRail() {
  const s = await saudeEmCache().catch(() => null);
  if (!s) return null;

  const conectado = s.whatsapp.conectado;

  return (
    <div className="px-2 pb-1">
      <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30">
        Operação
      </p>

      <Linha
        rotulo="WhatsApp"
        valor={conectado ? "conectado" : "fora do ar"}
        tom={conectado ? "ok" : "alerta"}
        href="/dashboard/integracoes"
      />
      <Linha
        rotulo="agente"
        valor={s.ia.funcionando ? (s.ia.saldo ?? "no ar") : s.ia.configurado ? "sem saldo" : "desligado"}
        tom={s.ia.funcionando ? "ok" : "alerta"}
        href="/dashboard/integracoes"
      />
      <Linha
        rotulo="última mensagem"
        valor={s.ultimaMensagem.em ? desde(s.ultimaMensagem.em) : "nenhuma"}
        tom={s.captacaoParada ? "alerta" : "normal"}
      />

      {/* Daqui para baixo, só o que está errado. */}
      {s.falhas24h.transcricao > 0 ? (
        <Linha
          rotulo="áudios não ouvidos"
          valor={String(s.falhas24h.transcricao)}
          tom="alerta"
          href="/dashboard/audios"
        />
      ) : null}
      {s.falhas24h.deepseek > 0 ? (
        <Linha
          rotulo="quedas do agente 24h"
          valor={String(s.falhas24h.deepseek)}
          tom="alerta"
          href="/dashboard/audios?tipo=deepseek_falhou"
        />
      ) : null}
      {s.lembretesVencidos > 0 ? (
        <Linha
          rotulo="lembretes vencidos"
          valor={String(s.lembretesVencidos)}
          tom="alerta"
          href="/dashboard/meus"
        />
      ) : null}
    </div>
  );
}
