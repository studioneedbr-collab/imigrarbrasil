import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { requireAdmin } from "@/lib/auth/guard";
import { ambienteDaConversa } from "@/lib/domain/ambiente";
import { vereditoBloqueante } from "@/lib/agent/lead-score";

/**
 * A lista de conversas do painel.
 *
 * `?ambiente=teste` devolve os ENSAIOS — o simulador e as instâncias de teste —, e é o
 * que a tela de Ensaios usa. Sem o parâmetro vêm só as conversas de operação real, que é
 * a separação que o resto do painel já fazia na fila, no quadro e nas métricas, e que
 * faltava justamente aqui: `sim:v2-5`, `sim:v2-12` e companhia apareciam no meio de
 * conversa de gente.
 */
export async function GET(req: Request) {
  const repo = getRepository();
  const querEnsaios = new URL(req.url).searchParams.get("ambiente") === "teste";
  const todas = await repo.listConversations();
  const conversations = todas.filter(
    (c) => (ambienteDaConversa(c) === "teste") === querEnsaios,
  );
  conversations.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  /*
   * O VEREDITO AO LADO DA NOTA.
   *
   * Nota 0 é ambígua na tabela: pode ser quem mandou só "oi" e pode ser um fornecedor
   * esperando suprimentos. São coisas opostas e o operador precisa distinguir sem abrir
   * a conversa. Só o bloqueio é calculado aqui — ele sai do lead e da própria conversa,
   * e `listLeads` é UMA consulta; a nota inteira exigiria as mensagens de cada linha.
   * Um banco sem leads (ou uma falha) devolve a lista como sempre foi, sem veredito.
   */
  const [leads, usuarios] = await Promise.all([
    repo.listLeads().catch(() => []),
    repo.listUsers().catch(() => []),
  ]);
  const porConversa = new Map(leads.map((l) => [l.conversationId, l]));
  const nomeDe = new Map(usuarios.map((u) => [u.id, u.name?.trim() || u.email]));
  const comVeredito = conversations.map((c) => {
    const lead = porConversa.get(c.id);
    const v = vereditoBloqueante(lead, c);
    /*
     * COM QUEM ESTÁ. "Transferida" sozinho não diz para quem, e a pergunta de quem olha a
     * lista é essa. A resposta é o RESPONSÁVEL do caso — é ele que muda quando alguém
     * troca o dono pela ficha ou pelo quadro, sem passar por esta tela. `handedOffTo` é
     * só o que ficou escrito na última transferência (às vezes um setor, quando foi a
     * agente que encaminhou), e vale quando o caso ainda não tem dono.
     */
    const responsavelNome = (lead?.responsavelId ? nomeDe.get(lead.responsavelId) : null) ?? null;
    const comQuem = responsavelNome ?? (c.status === "transferred" ? c.handedOffTo?.trim() || null : null);
    return {
      ...c,
      ...(comQuem ? { comQuem } : {}),
      // Separado de `comQuem`: a coluna Responsável distingue "tem uma pessoa atendendo"
      // de "foi encaminhada a um setor e ninguém pegou ainda".
      ...(responsavelNome ? { responsavelNome } : {}),
      ...(v ? { verdict: v.verdict, verdictLabel: v.label, verdictReason: v.signals[0]?.text } : {}),
    };
  });

  return NextResponse.json({ conversations: comVeredito });
}

/**
 * EXCLUSÃO EM LOTE.
 *
 * Limpar uma fila de ensaios uma conversa por vez — abrir o diálogo, confirmar, esperar,
 * repetir — é trabalho que ninguém faz até o fim: o painel fica com um lastro de conversa
 * de teste no meio de conversa de gente. Recebe `{ ids: [...] }`.
 *
 * Apaga uma a uma e responde o que caiu e o que não caiu: uma conversa problemática (uma
 * FK que sobrou, uma linha que já não existe) não pode abortar a limpeza inteira e deixar
 * o operador sem saber onde parou.
 */
const bulkSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(200) });

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  let ids: string[];
  try {
    ({ ids } = bulkSchema.parse(await req.json()));
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }
  const repo = getRepository();
  const deleted: string[] = [];
  const failed: string[] = [];
  for (const id of Array.from(new Set(ids))) {
    try {
      await repo.deleteConversation(id);
      deleted.push(id);
    } catch (err) {
      console.error("[conversations:DELETE lote]", id, err instanceof Error ? err.message : err);
      failed.push(id);
    }
  }
  if (!deleted.length) {
    return NextResponse.json({ error: "Falha ao excluir as conversas.", failed }, { status: 400 });
  }
  return NextResponse.json({ ok: true, deleted, failed });
}

// Lê o Supabase a cada request — sem isto o Next prerenderiza a resposta no build.
export const dynamic = "force-dynamic";
