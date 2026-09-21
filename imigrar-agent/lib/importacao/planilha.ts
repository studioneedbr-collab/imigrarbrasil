// DA LINHA DA PLANILHA PARA A FICHA DO PAINEL.
//
// Módulo puro: entra texto, sai o que se pretende gravar e o que há de errado com a
// linha. Nenhuma escrita acontece aqui, e é por isso que o ensaio da tela pode mostrar o
// resultado exato antes de qualquer coisa ir para o banco.

import type { AtendimentoStatus, Lead, Urgency } from "@/lib/domain/types";
import { comDdiProvavel } from "@/lib/whatsapp/telefone";
import { statusDaFase, type CampoImportavel } from "@/lib/importacao/campos";

export type Mapeamento = Partial<Record<CampoImportavel, number | null>>;

export interface LinhaLida {
  /** A posição na planilha, como a pessoa vê (1 é o cabeçalho). */
  numero: number;
  idExterno: string | null;
  /** O que se pretende gravar. Vazio quando a linha não presta. */
  patch: Partial<Lead>;
  /** O telefone já com DDI — a chave da deduplicação. */
  telefone: string;
  nome: string | null;
  /** Por que esta linha não pode entrar. Vazio = pode. */
  problema: string | null;
  /** Coisas que entraram, mas alguém precisa olhar. */
  avisos: string[];
}

function texto(v: unknown): string {
  return String(v ?? "").trim();
}

/** "Não forneceu", "Não informou", "-", "n/a" — planilha de gente é cheia disso. */
function limpo(v: unknown): string | null {
  const t = texto(v);
  if (!t) return null;
  if (/^(n[ãa]o (forneceu|informou|informado|possui|tem)|n\/a|na|-|--|desconhecido|sem informa)/i.test(t)) {
    return null;
  }
  return t;
}

function emailDeVerdade(v: unknown): string | null {
  const t = texto(v);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? t.toLowerCase() : null;
}

/** "R$ 2.500,00" → 2500. Vazio → null, que é diferente de zero. */
export function valorEmReais(v: unknown): number | null {
  const t = texto(v);
  if (!t) return null;
  const n = Number(t.replace(/[R$\s ]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Datas de planilha vêm em dd/mm/aaaa, em aaaa-mm-dd, e às vezes já como Date (quando o
 * arquivo é .xlsx e a célula está formatada como data).
 */
export function dataDaPlanilha(v: unknown): Date | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  const t = texto(v);
  const br = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (br) {
    const ano = br[3].length === 2 ? 2000 + Number(br[3]) : Number(br[3]);
    const d = new Date(Date.UTC(ano, Number(br[2]) - 1, Number(br[1])));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const iso = t.match(/^\d{4}-\d{2}-\d{2}/);
  if (iso) {
    const d = new Date(`${iso[0]}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

const URGENCIA: Record<string, Urgency> = {
  alta: "immediate",
  urgente: "immediate",
  media: "short",
  média: "short",
  normal: "short",
  baixa: "long",
};

/**
 * O TELEFONE TEM CARA DE TELEFONE?
 *
 * Não conserta nada — inventar um DDD é inventar o telefone de outra pessoa. Só diz o que
 * está estranho, para a tela mostrar antes de gravar.
 */
function avisoDoTelefone(telefone: string, tinhaMais: boolean): string | null {
  if (telefone.startsWith("55") && telefone.length !== 12 && telefone.length !== 13) {
    return `número brasileiro com ${telefone.length} dígitos (deveria ter 12 ou 13) — falta o DDD?`;
  }
  if (telefone.length < 10) return `só ${telefone.length} dígitos — número incompleto`;
  if (telefone.length > 15) return `${telefone.length} dígitos — passa do maior telefone possível`;
  if (!tinhaMais && !telefone.startsWith("55")) return "sem DDI escrito e fora do formato brasileiro";
  return null;
}

/**
 * Lê uma linha com o mapeamento escolhido.
 *
 * `fonte` identifica a planilha (o nome do arquivo, por exemplo). Junto com o id da
 * linha, é o par que faz a reimportação encontrar o caso que ela mesma criou.
 */
export function lerLinha(
  celulas: unknown[],
  mapa: Mapeamento,
  numero: number,
  fonte: string,
): LinhaLida {
  const em = (campo: CampoImportavel): unknown => {
    const i = mapa[campo];
    return i === null || i === undefined ? undefined : celulas[i];
  };

  const idExterno = limpo(em("idExterno"));
  const nome = limpo(em("nome"));
  const cru = texto(em("telefone")).replace(/^["']+/, "");
  const telefone = comDdiProvavel(cru);

  const vazio: LinhaLida = {
    numero,
    idExterno,
    patch: {},
    telefone,
    nome,
    problema: null,
    avisos: [],
  };

  // LINHA DE TOTAIS, LINHA EM BRANCO, CABEÇALHO REPETIDO. Planilha de escritório tem
  // todos os três, e nenhum é uma pessoa.
  if (!telefone && !nome && !idExterno) return { ...vazio, problema: "linha vazia" };
  if (/^(totais?|total|soma|subtotal)$/i.test(idExterno ?? "") || /^(totais?|total)$/i.test(nome ?? "")) {
    return { ...vazio, problema: "linha de totais, não é uma pessoa" };
  }
  if (!telefone) {
    return {
      ...vazio,
      problema: "sem telefone — sem ele o caso é um card que ninguém consegue retomar",
    };
  }

  const avisos: string[] = [];
  const aviso = avisoDoTelefone(telefone, cru.startsWith("+"));
  if (aviso) avisos.push(aviso);

  const status: AtendimentoStatus = statusDaFase(texto(em("fase"))) ?? "novo";
  const faseEscrita = limpo(em("fase"));
  if (faseEscrita && !statusDaFase(faseEscrita)) {
    avisos.push(`etapa "${faseEscrita}" não foi reconhecida — entra em Novo`);
  }

  const descricao = limpo(em("descricao"));
  const servico = limpo(em("servico"));
  const entrada = dataDaPlanilha(em("primeiroContato"));
  const propostaValor = valorEmReais(em("propostaValor"));
  const propostaEm = dataDaPlanilha(em("propostaEnviadaEm"));

  const patch: Partial<Lead> = {
    contactName: nome ?? undefined,
    whatsappNumber: telefone,
    email: emailDeVerdade(em("email")) ?? undefined,
    clientType: limpo(em("nacionalidade")) ?? undefined,
    nacionalidade: limpo(em("nacionalidade")) ?? undefined,
    region: limpo(em("regiao")) ?? undefined,
    objetivo: servico ?? undefined,
    situacaoDocumental: descricao ?? undefined,
    urgency: URGENCIA[texto(em("urgencia")).toLowerCase()] ?? undefined,
    atendimentoStatus: status,
    setor: "comercial",
    origem: "importacao",
    origemExternaFonte: fonte,
    origemExternaId: idExterno ?? undefined,
    propostaValor: propostaValor ?? undefined,
    propostaEnviadaEm: propostaEm ? propostaEm.toISOString() : undefined,
    createdAt: entrada ? entrada.toISOString() : undefined,
  };

  // `undefined` some do patch: quem escreve no banco não pode confundir "a planilha não
  // trouxe" com "a planilha trouxe vazio, apague o que está lá".
  for (const k of Object.keys(patch) as Array<keyof Lead>) {
    if (patch[k] === undefined) delete patch[k];
  }

  return { numero, idExterno, patch, telefone, nome, problema: null, avisos };
}
