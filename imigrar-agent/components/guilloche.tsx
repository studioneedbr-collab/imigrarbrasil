/**
 * GUILHOCHÉ — o padrão de linhas gravadas da impressão de segurança.
 *
 * É a roseta que aparece no fundo de passaporte, visto e cédula: linhas finíssimas
 * traçadas por uma máquina de engrenagens, impossíveis de reproduzir à mão. Foi o
 * primeiro recurso antifalsificação da história e continua sendo o que faz um
 * documento *parecer* um documento.
 *
 * Aqui é textura, não enfeite: vem do mesmo mundo da faixa MRZ e reforça a mesma
 * ideia, em vez de competir com ela. Fica sempre em opacidade baixa e atrás de tudo.
 *
 * A curva é um hipotrocoide — a mesma que um espirógrafo desenha:
 *   x = (R−r)·cos t + d·cos((R−r)/r · t)
 *   y = (R−r)·sin t − d·sin((R−r)/r · t)
 * Variar `d` em passos pequenos produz as linhas paralelas do entalhe.
 */

function hipotrocoide(R: number, r: number, d: number, passos = 720): string {
  const razao = (R - r) / r;
  const pontos: string[] = [];
  for (let i = 0; i <= passos; i++) {
    const t = (i / passos) * Math.PI * 2 * r; // fecha a curva depois de r voltas
    const x = (R - r) * Math.cos(t) + d * Math.cos(razao * t);
    const y = (R - r) * Math.sin(t) - d * Math.sin(razao * t);
    pontos.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return `M${pontos.join("L")}Z`;
}

export function Guilloche({
  className = "",
  /** Quantas linhas paralelas formam o entalhe. Mais linhas = gravação mais densa. */
  linhas = 7,
  /** Engrenagem interna. Muda a contagem de pétalas da roseta. */
  dentes = 13,
  cor = "currentColor",
  larguraLinha = 0.35,
}: {
  className?: string;
  linhas?: number;
  dentes?: number;
  cor?: string;
  larguraLinha?: number;
}) {
  const R = 100;
  const traços = Array.from({ length: linhas }, (_, i) => {
    const d = 30 + i * (26 / Math.max(linhas - 1, 1));
    return { d: hipotrocoide(R, dentes, d), opacidade: 0.35 + (i / linhas) * 0.45 };
  });

  return (
    <svg
      viewBox="-200 -200 400 400"
      className={className}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <g stroke={cor} strokeWidth={larguraLinha} vectorEffect="non-scaling-stroke">
        {traços.map((t, i) => (
          <path key={i} d={t.d} opacity={t.opacidade} />
        ))}
        {/* Anéis de contenção — no documento real eles emolduram a roseta. */}
        <circle cx="0" cy="0" r="128" opacity="0.3" />
        <circle cx="0" cy="0" r="132" opacity="0.18" />
      </g>
    </svg>
  );
}
