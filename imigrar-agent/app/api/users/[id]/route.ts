import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { esquecerConta, requireAdmin } from "@/lib/auth/guard";
import { registrarAcesso } from "@/lib/auth/auditoria";
import { hashPassword } from "@/lib/auth/password";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";
import { normalizarPapel, porqueNaoPodeMexer } from "@/lib/auth/papeis";

export const dynamic = "force-dynamic";

/**
 * EDITAR UMA CONTA: nome, papel, setor, ativar/desativar e redefinir a senha.
 *
 * Até aqui a tela só criava e listava, e desativar alguém era um UPDATE à mão no banco.
 * Três travas, todas antes de gravar: a conta dona não se desativa nem se rebaixa (o banco
 * também recusa, migration 030); ninguém tira o próprio acesso de administrador; e sempre
 * sobra um administrador ativo.
 */
const schema = z
  .object({
    name: z.string().trim().max(120).optional(),
    role: z.enum(["admin", "advogado", "atendente"]).optional(),
    setor: z.enum(["comercial", "operacional", "rh", "departamento_pessoal"]).nullable().optional(),
    active: z.boolean().optional(),
    password: z.string().min(MIN_PASSWORD_LENGTH, `A senha precisa ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`).max(200).optional(),
  })
  .strict();

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const lido = schema.safeParse(await req.json().catch(() => null));
  if (!lido.success) {
    return NextResponse.json({ error: lido.error.issues[0]?.path[0] === "password" ? lido.error.issues[0].message : "Dados inválidos." }, { status: 400 });
  }
  const { password, ...patch } = lido.data;

  try {
    const repo = getRepository();
    const usuarios = await repo.listUsers();
    const alvo = usuarios.find((u) => u.id === id);
    if (!alvo) return NextResponse.json({ error: "Esta conta não existe mais." }, { status: 404 });

    const trava = porqueNaoPodeMexer(alvo, { papel: patch.role, ativo: patch.active });
    if (trava) return NextResponse.json({ error: trava }, { status: 409 });

    const perdeAdmin = normalizarPapel(alvo.role) === "admin" && alvo.active !== false &&
      (patch.active === false || (patch.role !== undefined && patch.role !== "admin"));
    if (perdeAdmin && alvo.id === auth.session.sub) {
      return NextResponse.json({ error: "Você não pode tirar o seu próprio acesso de administrador. Peça a outro administrador." }, { status: 409 });
    }
    if (perdeAdmin && !usuarios.some((u) => u.id !== id && u.active !== false && normalizarPapel(u.role) === "admin")) {
      return NextResponse.json({ error: "Este é o último administrador ativo. Promova outra conta antes." }, { status: 409 });
    }

    // Administrador vê tudo: promover limpa o setor, como na criação.
    if (patch.role === "admin") patch.setor = null;
    // O registro é gravado sem a senha — só o fato de ela ter mudado.
    if (Object.keys(patch).length) await repo.updateUser(id, patch);
    if (password) await repo.updateUserPassword(id, hashPassword(password));
    esquecerConta(alvo.email);

    const feito = [
      patch.active === false ? "desativou" : patch.active === true ? "reativou" : null,
      patch.role && patch.role !== normalizarPapel(alvo.role) ? `papel: ${normalizarPapel(alvo.role)} → ${patch.role}` : null,
      patch.name !== undefined ? "nome" : null,
      patch.setor !== undefined ? "setor" : null,
      password ? "redefiniu a senha" : null,
    ].filter(Boolean).join(" · ");
    await registrarAcesso(auth.session, "editou_usuario", { tipo: "usuario", id, detalhe: feito || "sem mudança" }, req);
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Sem o corpo no log: ele pode carregar a senha em claro.
    console.error("[users:PATCH]", err instanceof Error ? err.message : "erro desconhecido");
    return NextResponse.json({ error: "Não foi possível salvar. Nada foi alterado." }, { status: 500 });
  }
}
