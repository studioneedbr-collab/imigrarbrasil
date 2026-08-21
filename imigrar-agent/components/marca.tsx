/**
 * Marca da Imigrar Brasil — definida uma vez, usada no rail, no login e no setup.
 *
 * Os arquivos em /public/marca vieram do Drive do cliente ([116] Imigrar Brasil →
 * [01] Logotipo). `simbolo*.png` é o recorte do símbolo feito a partir do logotipo
 * original, não um redesenho.
 */

type Tom = "claro" | "escuro";

/** Símbolo isolado. Use quando o espaço não comporta o logotipo inteiro. */
export function Simbolo({
  tom = "claro",
  className = "h-8 w-8",
}: {
  tom?: Tom;
  className?: string;
}) {
  const arquivo = tom === "escuro" ? "/marca/simbolo-branco-256.png" : "/marca/simbolo-256.png";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={arquivo} alt="" aria-hidden="true" className={`${className} rounded-[22%]`} />
  );
}

/**
 * Logotipo completo. `tom="escuro"` = fundo escuro, usa a versão branca da marca.
 * Nada de "chip branco" atrás do logo: o cliente entregou a versão negativa, e é
 * ela que deve ir no rail.
 */
export function Marca({
  tom = "claro",
  className = "h-7 w-auto",
}: {
  tom?: Tom;
  className?: string;
}) {
  const arquivo =
    tom === "escuro" ? "/marca/logotipo-branco.png" : "/marca/logotipo-original.png";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={arquivo} alt="Imigrar Brasil" className={className} />
  );
}

/**
 * FAIXA MRZ — o elemento de assinatura do painel.
 *
 * MRZ é a zona de leitura mecânica no rodapé de todo passaporte: caixa alta,
 * largura fixa, vazios preenchidos com "<". É o artefato mais reconhecível do mundo
 * de quem atravessa fronteira — e é literalmente o que a pessoa do outro lado da
 * conversa carrega no bolso. Aqui identifica o console sem virar enfeite.
 */
export function FaixaMrz({
  texto,
  largura = 44,
  className = "",
  lendo = false,
}: {
  /** Palavras do campo. Espaço vira "<", como no documento real. */
  texto: string;
  /** Comprimento total da linha; o resto é preenchido com "<". 44 é o do passaporte. */
  largura?: number;
  className?: string;
  /** Liga a luz de leitura atravessando a faixa. Reservado para o login. */
  lendo?: boolean;
}) {
  const campo = texto.toUpperCase().replace(/[^A-Z0-9]+/g, "<");
  const linha = (campo + "<".repeat(largura)).slice(0, largura);
  return (
    <div className={`${lendo ? "mrz-rail" : ""} ${className}`}>
      <p className="mrz text-[10px] leading-none" aria-hidden="true">
        {linha}
      </p>
    </div>
  );
}
