import Link from "next/link";
import { nomeDoIdioma } from "@/lib/domain/idiomas";
import {
  AINDA_NAO,
  AINDA_NAO_AJUDA,
  CLASSIFICACAO_LABEL,
  PRAZO_TIPO_LABEL,
  desde,
  rotuloContato,
  rotuloNacionalidade,
} from "@/lib/domain/rotulos";
import {
  diasDoRelogio,
  relogioApertado,
  rotuloPrazo,
  rotuloRelogio,
  type FaixaPrazo,
  type LeadDaFila,
} from "@/lib/fila/ordenacao";
import { slaHorasDe } from "@/lib/operacao/limites";

/**
 * A LINHA DA FILA.
 *
 * Densidade acima de espaço em branco: é uma ferramenta de uso diário e repetitivo, e
 * quem a abre às 8h precisa varrer trinta linhas sem rolar. Sem card decorativo, sem
 * ilustração, sem gradiente — a hierarquia é carregada pela urgência.
 *
 * O IDIOMA vem primeiro, e em mono: o time precisa saber se consegue atender aquela
 * pessoa ANTES de abrir a conversa. Descobrir que a conversa é em árabe depois de abrir
 * e ler três parágrafos é o desperdício que este canto da linha evita.
 */

/** A cor mais forte da interface pertence ao prazo. Só a ele. */
const FAIXA_ESTILO: Record<FaixaPrazo, { pill: string; barra: string }> = {
  vencido: { pill: "bg-ib-danger text-white", barra: "bg-ib-danger" },
  critico: { pill: "bg-ib-danger/12 text-ib-danger ring-1 ring-inset ring-ib-danger/30", barra: "bg-ib-danger" },
  atencao: { pill: "bg-ib-warn/12 text-[#9A6212] ring-1 ring-inset ring-ib-warn/25", barra: "bg-ib-warn" },
  acompanhamento: { pill: "bg-slate-100 text-ib-slate", barra: "bg-slate-300" },
};

/**
 * O CHIP DE IDIOMA.
 *
 * O vazio aqui era "??", e "??" parece erro de sistema: quem lê acha que o dado se
 * perdeu, não que a conversa tem duas mensagens e ainda não deu tempo de saber. A
 * diferença muda o que a pessoa faz em seguida — com "erro" ela vai conferir o sistema,
 * com um traço ela abre a conversa. O traço leva o motivo no title e no leitor de tela,
 * que é onde a explicação cabe sem ocupar a coluna.
 */
export function ChipIdioma({ idioma }: { idioma?: string | null }) {
  const nome = nomeDoIdioma(idioma);
  return (
    <span
      title={nome ? `Conversa em ${nome}` : AINDA_NAO_AJUDA}
      className={`inline-flex h-6 min-w-[2.25rem] items-center justify-center rounded px-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider ${
        idioma && idioma !== "pt"
          ? "bg-ib-bruma text-ib-carimbo ring-1 ring-inset ring-ib-mar/20"
          : "bg-slate-100 text-ib-slate"
      }`}
    >
      {idioma ?? AINDA_NAO}
      {idioma ? null : <span className="sr-only">Idioma ainda não identificado</span>}
    </span>
  );
}

/**
 * A NACIONALIDADE, ou o traço.
 *
 * Antes o vazio era a palavra "Nacionalidade —", que não cabia na coluna e saía cortada
 * como "Nacionalidade...". Um rótulo truncado é pior do que rótulo nenhum: ele parece um
 * valor pela metade, e alguém vai abrir o caso só para descobrir que não havia nada ali.
 */
export function Nacionalidade({
  lead,
  className = "",
}: {
  lead: { nacionalidade?: string | null; clientType?: string | null };
  className?: string;
}) {
  const { texto, conhecida } = rotuloNacionalidade(lead);
  return (
    <span
      title={conhecida ? texto : AINDA_NAO_AJUDA}
      className={`${className} ${conhecida ? "text-ib-ink" : "text-ib-slate"}`}
    >
      {texto}
      {conhecida ? null : <span className="sr-only">Nacionalidade ainda não identificada</span>}
    </span>
  );
}

export function ContadorPrazo({ dias, faixa }: { dias: number; faixa: FaixaPrazo }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-1 font-mono text-xs font-semibold tabular-nums ${FAIXA_ESTILO[faixa].pill}`}
    >
      {rotuloPrazo(dias)}
    </span>
  );
}

/**
 * SLA DE PRIMEIRO CONTATO — o relógio que corre do agente até a gente.
 *
 * Só aparece quando está estourado, e só enquanto ninguém assumiu. Um contador visível
 * em todas as linhas viraria paisagem; aparecendo só no atraso, ele é uma exceção — que
 * é o que ele deveria ser.
 */
function SlaEstourado({ lead, agora }: { lead: LeadDaFila; agora: Date }) {
  if (lead.assumidoEm) return null;
  const horas = (agora.getTime() - Date.parse(lead.createdAt)) / 3_600_000;
  const limite = slaHorasDe(lead.classificacao);
  if (!Number.isFinite(horas) || horas <= limite) return null;
  return (
    <span
      title={`Limite de ${limite}h para o primeiro contato humano neste tipo de caso`}
      className="inline-flex shrink-0 items-center rounded-md bg-ib-warn/12 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#9A6212] ring-1 ring-inset ring-ib-warn/25"
    >
      sem contato há {Math.floor(horas)}h
    </span>
  );
}

/**
 * O RELÓGIO DO CASO — o que corre contra o caso sem ser prazo processual: o início das
 * aulas, o contrato, o passaporte que vence.
 *
 * Aparece só quando a data já está dentro da janela, e NUNCA com a cor do prazo. Essa
 * cor pertence a multa, indeferimento e notificação de saída, e emprestá-la aqui faria
 * a fila inteira parecer urgente — que é o mesmo que nada parecer.
 */
function ChipRelogio({ lead, agora }: { lead: LeadDaFila; agora: Date }) {
  if (!relogioApertado(lead, agora)) return null;
  const dias = diasDoRelogio(lead, agora);
  if (dias === null) return null;
  return (
    <span
      title={lead.relogioDoCaso ?? "Relógio do caso — não é prazo processual"}
      className="inline-flex shrink-0 items-center gap-1 rounded-md bg-ib-bruma px-1.5 py-0.5 font-mono text-[10px] font-semibold text-ib-carimbo ring-1 ring-inset ring-ib-mar/20"
    >
      <span aria-hidden="true">◷</span>
      {rotuloRelogio(dias)}
    </span>
  );
}

/**
 * O QUE AINDA FALTA NA FICHA.
 *
 * Quem preenche a ficha é a Ana, durante a conversa — a tela existe para consultar e
 * corrigir. Então o que interessa aqui não é o que já está preenchido: é o buraco. Duas
 * lacunas cabem na coluna; o resto vira "+N", e o title lista tudo.
 */
function FichaFaltando({ faltando }: { faltando?: string[] }) {
  if (!faltando?.length) {
    return (
      <span className="font-mono text-[11px] text-ib-success" title="Ficha mínima completa">
        ficha ok
      </span>
    );
  }
  const [a, b] = faltando;
  const resto = faltando.length - (b ? 2 : 1);
  return (
    <span
      title={`Falta: ${faltando.join(", ")}`}
      className="flex flex-wrap items-center gap-1"
    >
      {[a, b].filter(Boolean).map((item) => (
        <span
          key={item}
          className="max-w-[8.5rem] truncate rounded bg-ib-warn/10 px-1.5 py-0.5 text-[11px] leading-tight text-[#8A5A0B]"
        >
          {item}
        </span>
      ))}
      {resto > 0 ? (
        <span className="font-mono text-[11px] text-ib-slate">+{resto}</span>
      ) : null}
    </span>
  );
}

/**
 * A CÉLULA DE PRESSÃO — a primeira coluna, e a razão de a tela existir.
 *
 * O olho desce por esta coluna e só por ela até achar o que trabalhar. Por isso o número
 * é grande, é mono e é tabular: numerais de mesma largura alinham verticalmente, e uma
 * coluna de números alinhados se compara sem ler. Quando não há prazo processual, a
 * célula mostra há quanto tempo o caso está parado — que é a pressão que sobra.
 */
function Pressao({
  lead,
  prazo,
  agora,
}: {
  lead: LeadDaFila;
  prazo?: { dias: number; faixa: FaixaPrazo };
  agora: Date;
}) {
  if (prazo) {
    const vencido = prazo.faixa === "vencido";
    return (
      <span className="flex flex-col items-start leading-none">
        <span
          className={`font-mono text-[22px] font-semibold tabular-nums ${
            vencido || prazo.faixa === "critico"
              ? "text-ib-danger"
              : prazo.faixa === "atencao"
                ? "text-[#9A6212]"
                : "text-ib-ink"
          }`}
        >
          {vencido ? "!" : Math.abs(prazo.dias)}
        </span>
        <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ib-slate">
          {vencido ? "vencido" : Math.abs(prazo.dias) === 1 ? "dia" : "dias"}
        </span>
      </span>
    );
  }
  return (
    <span className="flex flex-col items-start leading-none">
      <span className="font-mono text-[15px] tabular-nums text-ib-slate">
        {desde(lead.ultimoContatoEm, agora)}
      </span>
      <span className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ib-slate/70">
        parado
      </span>
    </span>
  );
}

/**
 * A TERCEIRA LINHA SÓ EXISTE SE DISSER ALGO NOVO.
 *
 * O resumo automático vem em duas linhas: a primeira é "quem · onde", a segunda é o que
 * pressiona o caso. A linha da fila mostrava a PRIMEIRA — que é exatamente a identidade
 * que a própria linha já imprime na coluna ao lado. O resultado, num caso sem nome, era
 * "Ainda não identificado" seguido de "Contato sem nome": a mesma ausência dita duas
 * vezes, ocupando a linha que deveria dizer o que está em jogo.
 *
 * Fica a segunda linha, e mesmo ela sai quando é só o objetivo repetido — que já está
 * logo acima, em azul. Linha vazia é melhor do que linha redundante: o olho pula uma, e
 * relê a outra procurando a diferença.
 */
function detalheDoCaso(lead: LeadDaFila): string | null {
  const [, linha2] = (lead.resumo ?? "").split("\n");
  const texto = (linha2 ?? "").trim();
  if (!texto || texto === "Ainda sem caso descrito.") return null;

  const modalidade = (lead.modalidadeProvavel ?? lead.objetivo ?? "").trim().toLowerCase();
  const semPrefixo = texto.replace(/^procura:\s*/i, "").trim().toLowerCase();
  if (modalidade && semPrefixo === modalidade) return null;

  return texto;
}

export function LinhaDaFila({
  lead,
  prazo,
  agora,
}: {
  lead: LeadDaFila;
  prazo?: { dias: number; faixa: FaixaPrazo };
  agora: Date;
}) {
  const detalhe = detalheDoCaso(lead);
  const contato = rotuloContato(lead);
  const nacionalidadeConhecida = rotuloNacionalidade(lead).conhecida;
  const semResponsavel = !lead.responsavelNome;

  return (
    <li className="relative">
      {/* A barra de pressão. É a única coisa colorida na linha inteira quando há prazo —
          e é ela que faz a coluna da esquerda ser lida como uma régua. */}
      <span
        className={`absolute inset-y-0 left-0 w-[3px] ${
          prazo ? FAIXA_ESTILO[prazo.faixa].barra : "bg-transparent"
        }`}
        aria-hidden="true"
      />
      <Link
        href={`/dashboard/leads/${lead.id}`}
        className="group grid grid-cols-1 gap-x-4 gap-y-2 py-3 pl-4 pr-4 transition hover:bg-ib-bruma/40 focus:outline-none focus-visible:bg-ib-bruma focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ib-mar md:grid-cols-[5.5rem_minmax(0,1fr)_11rem_8.5rem] md:items-center md:gap-y-0"
      >
        {/* 1 — pressão */}
        <div className="flex items-center gap-3 md:block">
          <Pressao lead={lead} prazo={prazo} agora={agora} />
          <span className="md:hidden">
            <ChipIdioma idioma={lead.idioma} />
          </span>
        </div>

        {/* 2 — quem é, e o que quer */}
        <div className="min-w-0">
          {/*
           * QUEM É A PESSOA — e o que fazer quando ainda não se sabe.
           *
           * Nome e nacionalidade tinham cada um o seu próprio traço para o vazio, então
           * um caso recém-chegado abria a linha com "— —": dois traços colados, que se
           * leem como defeito de renderização e não como "ainda não perguntamos". Quando
           * falta o nome mas há nacionalidade, ela assume o posto — é o que resta para
           * reconhecer o caso de relance. Faltando os dois, uma frase só, no lugar de
           * dois símbolos.
           */}
          <p className="flex min-w-0 items-center gap-2">
            <span className="hidden md:inline-flex">
              <ChipIdioma idioma={lead.idioma} />
            </span>
            {contato.conhecido ? (
              <>
                <span className="truncate text-sm font-semibold text-ib-ink">{contato.texto}</span>
                <Nacionalidade lead={lead} className="shrink-0 truncate text-xs" />
              </>
            ) : nacionalidadeConhecida ? (
              <>
                <Nacionalidade lead={lead} className="truncate text-sm font-semibold" />
                <span className="shrink-0 text-xs text-ib-slate">nome ainda não dito</span>
              </>
            ) : (
              <span className="truncate text-sm font-medium text-ib-slate">
                Ainda não identificado
              </span>
            )}
          </p>
          <p className="mt-1 truncate text-[13px] text-ib-carimbo">
            {lead.modalidadeProvavel ?? lead.objetivo ?? "Modalidade a definir"}
            {lead.prazoTipo ? (
              <span className="text-ib-slate"> · {PRAZO_TIPO_LABEL[lead.prazoTipo]}</span>
            ) : null}
          </p>
          {detalhe ? (
            <p className="mt-0.5 truncate text-[13px] leading-snug text-ib-slate">{detalhe}</p>
          ) : null}
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5 md:hidden">
            <ChipRelogio lead={lead} agora={agora} />
            <SlaEstourado lead={lead} agora={agora} />
          </span>
        </div>

        {/* 3 — o que o agente ainda não levantou */}
        <div className="hidden min-w-0 md:block">
          <FichaFaltando faltando={lead.fichaFaltando} />
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <ChipRelogio lead={lead} agora={agora} />
            <SlaEstourado lead={lead} agora={agora} />
          </span>
        </div>

        {/* 4 — de quem é */}
        <div className="flex items-center justify-between gap-2 md:block md:text-right">
          <span
            className={`truncate text-xs ${
              semResponsavel ? "font-medium text-ib-mar" : "text-ib-ink"
            }`}
          >
            {lead.responsavelNome ?? "assumir"}
          </span>
          {prazo ? (
            <span className="block font-mono text-[11px] tabular-nums text-ib-slate md:mt-1">
              {desde(lead.ultimoContatoEm, agora)}
            </span>
          ) : null}
        </div>
      </Link>
    </li>
  );
}

export function EtiquetaClassificacao({ lead }: { lead: LeadDaFila }) {
  if (!lead.classificacao) {
    return (
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-ib-slate">
        sem classificação
      </span>
    );
  }
  return (
    <span className="rounded-full bg-ib-bruma px-2 py-0.5 text-[11px] font-medium text-ib-carimbo">
      {CLASSIFICACAO_LABEL[lead.classificacao]}
    </span>
  );
}
