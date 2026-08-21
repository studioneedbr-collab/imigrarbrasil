/**
 * Fallback de rota do painel. O `page.tsx` é `force-dynamic` e consulta o
 * repositório antes de renderizar — sem este arquivo o navegador ficava parado
 * na tela anterior durante toda a consulta, que era exatamente a sensação de
 * "demora pra entrar" depois do login.
 */
export default function DashboardLoading() {
  return (
    <div className="animate-fade-in" aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando painel…</span>

      {/* Cabeçalho */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Bar className="h-3 w-28" />
          <Bar className="mt-3 h-7 w-64" />
          <Bar className="mt-2.5 h-3.5 w-80 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Bar className="h-9 w-32 rounded-lg" />
          <Bar className="h-9 w-28 rounded-lg" />
        </div>
      </div>

      {/* Faixa de indicadores */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-ib-line bg-white p-4 shadow-sm"
          >
            <Bar className="h-3 w-20" />
            <Bar className="mt-3 h-7 w-24" />
            <Bar className="mt-3 h-2.5 w-16" />
          </div>
        ))}
      </div>

      {/* Corpo */}
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <CardSkeleton rows={5} />
          <CardSkeleton rows={4} />
        </div>
        <div className="space-y-5">
          <CardSkeleton rows={3} />
          <CardSkeleton rows={3} />
        </div>
      </div>
    </div>
  );
}

function CardSkeleton({ rows }: { rows: number }) {
  return (
    <div className="rounded-xl border border-ib-line bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <Bar className="h-4 w-40" />
        <Bar className="h-3 w-16" />
      </div>
      <div className="mt-4 space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Bar className="h-8 w-8 rounded-full" />
            <div className="min-w-0 flex-1">
              <Bar className="h-3.5" style={{ width: `${75 - i * 8}%` }} />
              <Bar className="mt-2 h-2.5" style={{ width: `${50 - i * 5}%` }} />
            </div>
            <Bar className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Bloco cinza com brilho percorrendo — pausa quando o sistema pede menos movimento. */
function Bar({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`rounded bg-ib-line/70 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.85),transparent)] bg-[length:460px_100%] bg-no-repeat animate-skeleton-shimmer motion-reduce:animate-none ${className}`}
      style={style}
    />
  );
}
