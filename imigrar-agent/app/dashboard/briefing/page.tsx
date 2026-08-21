import { redirect } from "next/navigation";

// O briefing virou um bloco da aba "Empresa e serviços" em /dashboard/treinar. O redirect
// fica no lugar da página antiga por causa dos links e favoritos que a equipe já tem.
export default function BriefingPage() {
  redirect("/dashboard/treinar");
}
