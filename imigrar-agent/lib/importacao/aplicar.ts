// REIMPORTAR NÃO PODE DUPLICAR.
//
// É a regra que decide se esta funcionalidade presta. Uma planilha de escritório é viva:
// ela vai ser corrigida, ganhar linhas novas e ser reenviada. Se cada envio abrir cards
// novos, na terceira vez o quadro tem três Karinas e ninguém confia em número nenhum.
//
// A IDENTIDADE DE UM CASO, EM ORDEM:
//
//  1. O PAR (planilha, id da linha). É o mais forte, porque não muda quando o telefone
//     muda — e o telefone muda: a pessoa troca de número, alguém corrige um DDD errado na
//     ficha. Só existe para planilhas que têm coluna de id.
//  2. O TELEFONE, com as variantes de grafia (o nono dígito brasileiro). É a mesma chave
//     que o webhook do WhatsApp usa, e é o que faz o caso importado e a conversa da mesma
//     pessoa serem um card só.
//
// Achou por qualquer uma das duas: ATUALIZA. Não achou: cria.
//
// ── ATUALIZAR É PREENCHER BURACO, NÃO REESCREVER ────────────────────────────────────
//
// O que uma pessoa escreveu na ficha vale mais do que uma célula de planilha. Quem
// corrigiu um telefone, escreveu um resumo ou moveu o card de coluna fez isso olhando a
// conversa; a planilha não sabe disso. Então a reimportação preenche o que está vazio e
// deixa o resto em paz.
//
// A EXCEÇÃO É A ETAPA, e só quando a planilha discorda: aí a tela avisa e quem decide é
// quem está importando. Mover cinquenta casos de coluna sem perguntar é reorganizar o
// trabalho do time por conta própria.

import type { Lead } from "@/lib/domain/types";
import type { Repository } from "@/lib/data/repository";
import { variantesDoTelefone } from "@/lib/whatsapp/telefone";
import type { LinhaLida } from "@/lib/importacao/planilha";

export type Desfecho = "criado" | "atualizado" | "sem_mudanca" | "ignorado";

export interface ResultadoDaLinha {
  numero: number;
  nome: string | null;
  telefone: string;
  desfecho: Desfecho;
  /** Por que foi ignorado, ou como foi encontrado ("pelo id da planilha", "pelo telefone"). */
  detalhe: string;
  /** Campos que seriam (ou foram) preenchidos. Vazio em `sem_mudanca`. */
  preenchidos: string[];
  avisos: string[];
}

export interface Relatorio {
  linhas: ResultadoDaLinha[];
  criados: number;
  atualizados: number;
  semMudanca: number;
  ignorados: number;
  /** Etapas que a planilha quer mudar em casos que já existem. Só com autorização. */
  conflitosDeEtapa: Array<{ numero: number; nome: string | null; de: string; para: string }>;
}

/** Os campos que a importação NUNCA reescreve por cima. */
const NUNCA_REESCREVE: Array<keyof Lead> = [
  "atendimentoStatus",
  "createdAt",
  "whatsappNumber",
];

export interface OpcoesDeAplicacao {
  /** `false` é ensaio: calcula tudo e não grava nada. */
  aplicar: boolean;
  /** Deixar a planilha mover o card de coluna em casos que já existem. */
  moverEtapa?: boolean;
}

export async function aplicarImportacao(
  linhas: LinhaLida[],
  repo: Repository,
  opcoes: OpcoesDeAplicacao,
): Promise<Relatorio> {
  const rel: Relatorio = {
    linhas: [],
    criados: 0,
    atualizados: 0,
    semMudanca: 0,
    ignorados: 0,
    conflitosDeEtapa: [],
  };

  // A CARTEIRA INTEIRA, UMA VEZ. A procura por id externo e por telefone acontece em
  // memória, como a busca global do painel — para as escalas deste escritório (centenas
  // de casos) é imediato, e evita uma ida ao banco por linha da planilha. Quando isso
  // ficar grande, o caminho é um índice no Postgres; não vale adivinhar agora.
  const todos = await repo.listLeads();
  const porIdExterno = new Map<string, Lead>();
  const porTelefone = new Map<string, Lead>();
  for (const l of todos) {
    if (l.origemExternaFonte && l.origemExternaId) {
      porIdExterno.set(`${l.origemExternaFonte}|${l.origemExternaId}`, l);
    }
    for (const v of variantesDoTelefone(l.whatsappNumber)) porTelefone.set(v, l);
  }
  // O que esta rodada já criou conta como existente: uma planilha com a mesma pessoa em
  // duas linhas (acontece, e aconteceu na carga do Sérgio) não pode virar dois cards.
  const criadosAgora = new Map<string, Lead>();

  for (const linha of linhas) {
    if (linha.problema) {
      rel.ignorados++;
      rel.linhas.push({
        numero: linha.numero,
        nome: linha.nome,
        telefone: linha.telefone,
        desfecho: "ignorado",
        detalhe: linha.problema,
        preenchidos: [],
        avisos: linha.avisos,
      });
      continue;
    }

    const chaveId =
      linha.patch.origemExternaFonte && linha.idExterno
        ? `${linha.patch.origemExternaFonte}|${linha.idExterno}`
        : null;
    const variantes = variantesDoTelefone(linha.telefone);

    let existente: Lead | undefined;
    let comoAchou = "";
    if (chaveId && porIdExterno.has(chaveId)) {
      existente = porIdExterno.get(chaveId);
      comoAchou = "pelo id da planilha";
    }
    if (!existente) {
      for (const v of variantes) {
        existente = criadosAgora.get(v) ?? porTelefone.get(v);
        if (existente) {
          comoAchou = criadosAgora.has(v)
            ? "linha repetida dentro da própria planilha"
            : "pelo telefone";
          break;
        }
      }
    }

    // ── NOVO ──
    if (!existente) {
      const preenchidos = Object.keys(linha.patch).filter((k) => k !== "whatsappNumber");
      rel.criados++;
      rel.linhas.push({
        numero: linha.numero,
        nome: linha.nome,
        telefone: linha.telefone,
        desfecho: "criado",
        detalhe: "não existe no painel",
        preenchidos,
        avisos: linha.avisos,
      });
      if (opcoes.aplicar) {
        const conv = await repo.getOrCreateConversation(linha.telefone, linha.nome ?? undefined);
        const lead = await repo.upsertLead(conv.id, linha.patch);
        for (const v of variantes) criadosAgora.set(v, lead);
        if (chaveId) porIdExterno.set(chaveId, lead);
      } else {
        // No ensaio o lead não existe, mas a deduplicação precisa continuar valendo para
        // a linha repetida mais adiante — senão o ensaio conta dois e a gravação faz um.
        const fantasma = { ...linha.patch, id: `ensaio:${linha.numero}` } as Lead;
        for (const v of variantes) criadosAgora.set(v, fantasma);
        if (chaveId) porIdExterno.set(chaveId, fantasma);
      }
      continue;
    }

    // ── JÁ EXISTE: preenche buraco ──
    const patch: Partial<Lead> = {};
    const preenchidos: string[] = [];
    for (const [chave, valor] of Object.entries(linha.patch) as Array<[keyof Lead, unknown]>) {
      if (NUNCA_REESCREVE.includes(chave)) continue;
      const atual = existente[chave];
      const vazio = atual === null || atual === undefined || atual === "";
      if (!vazio || valor === null || valor === undefined || valor === "") continue;
      (patch as Record<string, unknown>)[chave] = valor;
      preenchidos.push(chave);
    }

    const daPlanilha = linha.patch.atendimentoStatus;
    const atualStatus = existente.atendimentoStatus ?? "novo";
    if (daPlanilha && daPlanilha !== atualStatus) {
      rel.conflitosDeEtapa.push({
        numero: linha.numero,
        nome: linha.nome ?? existente.contactName ?? null,
        de: atualStatus,
        para: daPlanilha,
      });
      if (opcoes.moverEtapa) {
        patch.atendimentoStatus = daPlanilha;
        preenchidos.push("atendimentoStatus");
      }
    }

    if (preenchidos.length === 0) {
      rel.semMudanca++;
      rel.linhas.push({
        numero: linha.numero,
        nome: linha.nome,
        telefone: linha.telefone,
        desfecho: "sem_mudanca",
        detalhe: `já está no painel (${comoAchou}), nada a preencher`,
        preenchidos: [],
        avisos: linha.avisos,
      });
      continue;
    }

    rel.atualizados++;
    rel.linhas.push({
      numero: linha.numero,
      nome: linha.nome,
      telefone: linha.telefone,
      desfecho: "atualizado",
      detalhe: `já está no painel (${comoAchou})`,
      preenchidos,
      avisos: linha.avisos,
    });
    if (opcoes.aplicar) await repo.upsertLead(existente.conversationId, patch);
  }

  return rel;
}
