import { redirect } from "next/navigation";

// A configuração do agente virou uma aba de /dashboard/treinar (Identidade, Empresa e
// serviços, Objeções, Regras, Conhecimento técnico, Testar). O redirect fica no lugar da
// página antiga por causa dos links e favoritos que a equipe já tem.
export default function AgentConfigPage() {
  redirect("/dashboard/treinar");
}
