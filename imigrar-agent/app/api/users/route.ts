import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { hashPassword } from "@/lib/auth/password";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";
import { requireAdmin } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

// Gestão de usuários é privilégio de admin. Antes, qualquer sessão válida —
// inclusive de um usuário comum — listava e criava contas, e createUser()
// gravava role 'admin' por default: um usuário comum podia se promover
// criando uma segunda conta administrativa para si.

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const users = await getRepository().listUsers(); // listUsers() já omite passwordHash
  return NextResponse.json({ users });
}

const createUserSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(200),
  name: z.string().max(120).optional(),
  role: z.enum(["admin", "user"]).default("user"),
  setor: z.enum(["comercial", "operacional", "rh", "departamento_pessoal"]).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let input: z.infer<typeof createUserSchema>;
  try {
    input = createUserSchema.parse(await req.json());
  } catch (err) {
    // Antes toda falha de validação virava a mesma frase sobre senha, então um
    // e-mail inválido ou um setor desconhecido mandavam a pessoa trocar a senha
    // à toa. Devolve o motivo do primeiro campo que reprovou.
    const issue = err instanceof z.ZodError ? err.issues[0] : null;
    const field = issue?.path[0];
    const message =
      field === "email"
        ? "Informe um e-mail válido."
        : field === "password"
          ? `A senha precisa ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`
          : field === "setor"
            ? "Escolha um setor válido."
            : field === "role"
              ? "Cargo inválido."
              : "Dados inválidos. Confira e-mail, senha e cargo.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const repo = getRepository();
    if (await repo.getUserByEmail(input.email)) {
      return NextResponse.json({ error: "Já existe um usuário com este e-mail." }, { status: 409 });
    }
    await repo.createUser({
      email: input.email,
      passwordHash: hashPassword(input.password),
      name: input.name,
      role: input.role,
      // Admin vê tudo; usuário comum fica restrito ao setor escolhido.
      setor: input.role === "admin" ? null : input.setor ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Sem o payload nos logs: ele carrega a senha em claro.
    const detail = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? "");
    console.error("[users:POST]", detail || "erro desconhecido");

    // Caso específico e silencioso demais para virar "Falha ao criar usuário":
    // o banco ainda não tem a coluna `setor` (migration 010). O insert inteiro é
    // rejeitado, para admin e para usuário comum — nenhuma conta era criada.
    if (/column .*setor.* does not exist|'setor' column|setor/i.test(detail)) {
      return NextResponse.json(
        {
          error:
            "O banco ainda não tem a coluna 'setor' na tabela users. Rode a migration 010_users_setor.sql no Supabase e tente de novo.",
        },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: "Falha ao criar usuário." }, { status: 400 });
  }
}
