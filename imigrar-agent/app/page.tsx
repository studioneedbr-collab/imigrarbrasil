import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifySession, SESSION_COOKIE } from "@/lib/auth/session";

// A entrada do site é o login. Sessão válida → painel; caso contrário → /login.
export default async function Home() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;
  redirect(session ? "/dashboard" : "/login");
}
