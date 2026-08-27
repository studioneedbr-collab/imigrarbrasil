import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { requireAdmin } from "@/lib/auth/guard";
import { registrarAcesso } from "@/lib/auth/auditoria";
import {
  ACAO_INSTANCIA_AMBIENTE,
  ACAO_INSTANCIA_MODO,
  detalheDaMudanca,
} from "@/lib/agent/estado";
import { normalizeBaseUrl } from "@/lib/whatsapp/config";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  nome: z.string().min(1).max(80).optional(),
  instanceId: z.string().min(1).optional(),
  token: z.string().min(1).optional(),
  clientToken: z.string().optional(),
  baseUrl: z.string().optional(),
  ambiente: z.enum(["teste", "producao"]).optional(),
  modoDesligado: z.enum(["silencio", "resposta_fixa", "sombra"]).optional(),
  respostaFixa: z.string().max(1000).nullable().optional(),
  slaMinutos: z.number().int().min(1).max(24 * 60).optional(),
  // A promoção a produção é uma decisão, não um campo de formulário. Ver abaixo.
  confirmarProducao: z.boolean().optional(),
});

/**
 * Configuração da instância. `ativo` NÃO passa por aqui — quem liga e desliga é
 * /ativacao, que exige uma confirmação separada. Um "salvar" não pode ligar produção
 * de raspão.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let input: z.infer<typeof patchSchema>;
  try {
    input = patchSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const repo = getRepository();
  const atual = await repo.getInstancia(params.id);
  if (!atual) return NextResponse.json({ error: "Instância não encontrada." }, { status: 404 });

  // PROMOVER A PRODUÇÃO É UMA DECISÃO À PARTE.
  //
  // Trocar um select de "teste" para "produção" e clicar em salvar é barato demais para
  // o que significa: a partir dali as conversas contam nas métricas, entram na fila do
  // time e a instância pode responder gente de verdade. Exige confirmação explícita.
  const promovendo = input.ambiente === "producao" && atual.ambiente !== "producao";
  if (promovendo && !input.confirmarProducao) {
    return NextResponse.json(
      {
        error:
          "Promover esta instância a PRODUÇÃO faz as conversas dela contarem nas métricas e entrarem na fila do time. Confirme explicitamente.",
        precisaConfirmar: "producao",
      },
      { status: 409 },
    );
  }

  // Silêncio total é privilégio de teste — a mesma regra do check do banco, com uma
  // mensagem que explica o motivo em vez de devolver erro de constraint.
  const ambienteFinal = input.ambiente ?? atual.ambiente;
  const modoFinal = input.modoDesligado ?? atual.modoDesligado;
  if (modoFinal === "silencio" && ambienteFinal === "producao") {
    return NextResponse.json(
      {
        error:
          "Silêncio total só existe em instância de teste. Em produção, do outro lado tem alguém que escreveu pedindo ajuda — escolha resposta automática ou modo sombra.",
      },
      { status: 400 },
    );
  }

  try {
    const nova = await repo.atualizarInstancia(params.id, {
      ...(input.nome !== undefined ? { nome: input.nome.trim() } : {}),
      ...(input.instanceId !== undefined ? { instanceId: input.instanceId.trim() } : {}),
      ...(input.token !== undefined ? { token: input.token.trim() } : {}),
      ...(input.clientToken !== undefined ? { clientToken: input.clientToken.trim() || null } : {}),
      ...(input.baseUrl !== undefined ? { baseUrl: normalizeBaseUrl(input.baseUrl) } : {}),
      ...(input.ambiente !== undefined ? { ambiente: input.ambiente } : {}),
      ...(input.modoDesligado !== undefined ? { modoDesligado: input.modoDesligado } : {}),
      ...(input.respostaFixa !== undefined ? { respostaFixa: input.respostaFixa } : {}),
      ...(input.slaMinutos !== undefined ? { slaMinutos: input.slaMinutos } : {}),
    });

    // Auditoria só do que MUDOU DE ESTADO. Corrigir o nome da instância não é uma
    // mudança de ativação, e encher o log de linhas irrelevantes é como se perde de
    // vista a linha que importa.
    if (input.ambiente && input.ambiente !== atual.ambiente) {
      await registrarAcesso(
        auth.session,
        ACAO_INSTANCIA_AMBIENTE,
        { tipo: "instancia", id: nova.id, detalhe: detalheDaMudanca(atual.ambiente, nova.ambiente, nova.nome) },
        req,
      );
    }
    if (input.modoDesligado && input.modoDesligado !== atual.modoDesligado) {
      await registrarAcesso(
        auth.session,
        ACAO_INSTANCIA_MODO,
        { tipo: "instancia", id: nova.id, detalhe: detalheDaMudanca(atual.modoDesligado, nova.modoDesligado, nova.nome) },
        req,
      );
    }

    return NextResponse.json({ ok: true, instancia: { ...nova, token: undefined, clientToken: undefined } });
  } catch (err) {
    console.error("[agente/instancias:PATCH]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Falha ao salvar a instância." }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const repo = getRepository();
  const atual = await repo.getInstancia(params.id);
  if (!atual) return NextResponse.json({ error: "Instância não encontrada." }, { status: 404 });

  // Excluir uma instância LIGADA derrubaria o atendimento sem que ninguém tivesse pedido
  // isso. Desligue primeiro — aí a decisão fica registrada em duas linhas de auditoria.
  if (atual.ativo) {
    return NextResponse.json(
      { error: "Desligue a instância antes de excluí-la." },
      { status: 409 },
    );
  }

  try {
    await repo.excluirInstancia(params.id);
    await registrarAcesso(
      auth.session,
      "agente.instancia.excluida",
      { tipo: "instancia", id: params.id, detalhe: atual.nome },
      req,
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[agente/instancias:DELETE]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Falha ao excluir a instância." }, { status: 400 });
  }
}
