import { getRepository } from "@/lib/data";
import { hashPassword } from "@/lib/auth/password";
import type { User } from "@/lib/domain/types";

/**
 * Bootstrap do primeiro administrador.
 *
 * A versão anterior lia ADMIN_EMAIL/ADMIN_PASSWORD do ambiente. Isso é ruim por
 * três motivos: a senha em claro fica legível para todo mundo com acesso ao
 * painel da Vercel e ao `.env.local`; ela nunca expira nem rotaciona; e o hash
 * era regravado a cada login. Aqui a senha nunca transita pelo ambiente — o
 * primeiro admin se cadastra uma única vez, e o portão fecha para sempre.
 */

export async function hasAnyUser(): Promise<boolean> {
  const users = await getRepository().listUsers();
  return users.length > 0;
}

export class SetupAlreadyDoneError extends Error {
  constructor() {
    super("O administrador inicial já foi criado.");
    this.name = "SetupAlreadyDoneError";
  }
}

/**
 * Cria o admin inicial. Só funciona enquanto a tabela de usuários estiver vazia;
 * a partir do primeiro usuário, lança SetupAlreadyDoneError. Novos usuários
 * passam a ser criados por um admin autenticado em POST /api/users.
 */
export async function createFirstAdmin(input: {
  email: string;
  password: string;
  name?: string;
}): Promise<User> {
  if (await hasAnyUser()) throw new SetupAlreadyDoneError();

  return getRepository().createUser({
    email: input.email.toLowerCase().trim(),
    passwordHash: hashPassword(input.password),
    name: input.name ?? "Admin",
    role: "admin",
  });
}
