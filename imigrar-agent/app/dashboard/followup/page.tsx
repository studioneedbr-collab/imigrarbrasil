import { PageHeader } from "@/components/dashboard/ui";
import ModelosDeFollowup from "@/components/followup/modelos";
import { getRepository } from "@/lib/data";
import { getSession } from "@/lib/auth/guard";
import { normalizarPapel } from "@/lib/auth/papeis";

export const dynamic = "force-dynamic";

/**
 * OS MODELOS DE FOLLOW-UP.
 *
 * Uma tela só, e ela responde uma pergunta: para cada coisa que a gente espera, o que a
 * gente diz — e em que línguas já sabe dizer.
 *
 * Ela existe separada do quadro porque o buraco que importa aqui é invisível na operação
 * do dia: um motivo sem modelo em crioulo não gera erro nenhum, gera silêncio. Os casos em
 * português seguem sozinhos, os em crioulo entram na fila de tarefa manual, e a diferença
 * só aparece meses depois numa taxa de resposta por idioma que ninguém sabe explicar.
 */
export default async function ModelosPage() {
  const [modelos, sessao] = await Promise.all([
    getRepository().listModelosFollowup().catch(() => []),
    getSession(),
  ]);
  const papel = normalizarPapel(sessao?.role);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Follow-up"
        title="O que dizemos a quem está esperando"
        description="Um modelo por motivo de espera, traduzido. Sem modelo no idioma da pessoa, o sistema não dispara: gera tarefa para alguém escrever à mão."
      />
      <ModelosDeFollowup
        modelos={modelos}
        podeEditar={papel === "admin" || papel === "advogado"}
      />
    </div>
  );
}
