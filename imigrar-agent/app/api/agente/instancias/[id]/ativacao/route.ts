import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { requireAdmin } from "@/lib/auth/guard";
import { registrarAcesso } from "@/lib/auth/auditoria";
import { ACAO_INSTANCIA_ATIVACAO, detalheDaMudanca } from "@/lib/agent/estado";

export const dynamic = "force-dynamic";

// NÍVEL 2 — LIGAR E DESLIGAR UMA INSTÂNCIA.
//
// Uma rota só para isto, e não um campo dentro do PATCH de configuração. O motivo é o
// mesmo pelo qual `atualizarInstancia` não aceita `ativo`: ligar o WhatsApp que fala com
// gente de verdade não pode acontecer como efeito colateral de salvar um formulário.
//
// E o mais importante: esta rota mexe em UMA linha, por id. Ligar a instância de teste
// não tem como ligar a de produção — não existe caminho no código que leia o estado de
// uma para decidir o da outra.

const schema = z.object({
  ativo: z.boolean(),
  motivo: z.string().max(280).optional(),
  /**
   * ATIVAR PRODUÇÃO EXIGE CONFIRMAÇÃO EXPLÍCITA, SEPARADA DA CHAVE GERAL.
   *
   * A chave geral é a decisão "o agente pode responder"; esta é "este número, que fala
   * com clientes de verdade, pode responder". São perguntas diferentes e o time precisa
   * responder as duas conscientemente — senão a primeira vira um sim automático para a
   * segunda, que é exatamente o acidente que este nível existe para evitar.
   */
  confirmarProducao: z.boolean().optional(),
});

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let input: z.infer<typeof schema>;
  try {
    input = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const repo = getRepository();
  const atual = await repo.getInstancia(params.id);
  if (!atual) return NextResponse.json({ error: "Instância não encontrada." }, { status: 404 });

  if (input.ativo && atual.ambiente === "producao" && !input.confirmarProducao) {
    return NextResponse.json(
      {
        error:
          `Ativar "${atual.nome}" faz o agente responder no WhatsApp de PRODUÇÃO, para clientes reais. Confirme explicitamente.`,
        precisaConfirmar: "producao",
      },
      { status: 409 },
    );
  }

  // Desligar uma instância de produção também pede motivo: é a mesma pergunta que a
  // chave geral responde, um nível abaixo, e a resposta some se ninguém escrever.
  if (!input.ativo && atual.ambiente === "producao" && !(input.motivo ?? "").trim()) {
    return NextResponse.json(
      { error: "Diga por que está desligando a instância de produção." },
      { status: 400 },
    );
  }

  try {
    const nova = await repo.definirAtivacaoInstancia(params.id, input.ativo, auth.session.email);

    await registrarAcesso(
      auth.session,
      ACAO_INSTANCIA_ATIVACAO,
      {
        tipo: "instancia",
        id: nova.id,
        detalhe: detalheDaMudanca(
          atual.ativo ? "ligada" : "desligada",
          nova.ativo ? "ligada" : "desligada",
          [`${nova.nome} (${nova.ambiente})`, (input.motivo ?? "").trim()].filter(Boolean).join(" · "),
        ),
      },
      req,
    );

    return NextResponse.json({ ok: true, instancia: { ...nova, token: undefined, clientToken: undefined } });
  } catch (err) {
    console.error("[agente/instancias:ativacao]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Falha ao mudar a ativação." }, { status: 400 });
  }
}
