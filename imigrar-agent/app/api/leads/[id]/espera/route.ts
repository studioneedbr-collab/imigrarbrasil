import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { requireSession } from "@/lib/auth/guard";
import { registrarAcesso } from "@/lib/auth/auditoria";
import {
  CADENCIA_DIAS,
  MOTIVOS_DE_ESPERA,
  MOTIVO_ESPERA_LABEL,
  proximoToqueSugerido,
  type MotivoEspera,
} from "@/lib/followup/motivos";

export const dynamic = "force-dynamic";

// PAUSAR O CASO — dizendo O QUE se está esperando.
//
// É o dado que faltava para o follow-up deste domínio existir. Em imigração o tempo morto
// é do cliente: a pessoa some três semanas porque está na fila do consulado, esperando
// apostilamento ou agendamento na Polícia Federal. Sem o motivo gravado, a única mensagem
// que o sistema consegue escrever é a genérica de vendas — e mandá-la para quem está
// esperando um consulado comunica, com clareza, que o escritório não sabe em que pé está
// o caso dela.
//
// A DATA VEM PROPOSTA, NÃO IMPOSTA. A cadência por motivo é o ponto de partida (3 dias
// para documento com o cliente, 30 para consulado); quem conhece o caso ajusta. Em
// "cliente pediu para retomar depois" não há sugestão nenhuma: a data é a que ELE
// indicou, e inventar uma por cima disso é desrespeitar exatamente o que ele pediu.
const schema = z.object({
  motivo: z.enum(MOTIVOS_DE_ESPERA as [MotivoEspera, ...MotivoEspera[]]).nullable(),
  /** ISO. Ausente = usa a cadência do motivo. Obrigatória em "retomar_depois". */
  proximoToqueEm: z.string().datetime().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  let input: z.infer<typeof schema>;
  try {
    input = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Motivo de espera inválido." }, { status: 400 });
  }

  const repo = getRepository();
  const atual = await repo.getLead(params.id);
  if (!atual) return NextResponse.json({ error: "Este caso não existe mais." }, { status: 404 });

  // RETOMAR: o caso deixa de estar parado. Some da régua e o contador zera — quem volta a
  // andar não deve carregar os toques da espera anterior.
  if (input.motivo === null) {
    const lead = await repo.updateLead(params.id, {
      esperaMotivo: null,
      esperaDesde: null,
      proximoToqueEm: null,
      toquesNoMotivo: 0,
    });
    await registrarAcesso(auth.session, "retomou_caso", { tipo: "lead", id: params.id }, req);
    return NextResponse.json({ ok: true, lead });
  }

  const motivo = input.motivo;
  let quando: Date | null = input.proximoToqueEm ? new Date(input.proximoToqueEm) : null;
  if (!quando) {
    quando = proximoToqueSugerido(motivo);
    if (!quando) {
      return NextResponse.json(
        {
          error:
            "Este motivo não tem cadência: diga a data que a pessoa indicou para retomar.",
        },
        { status: 400 },
      );
    }
  }
  if (quando.getTime() < Date.now() - 60_000) {
    return NextResponse.json({ error: "A data do próximo toque já passou." }, { status: 400 });
  }

  // O CONTADOR ZERA QUANDO O MOTIVO MUDA. Quem esperou o consulado, respondeu, e agora
  // espera pagamento começa do zero: são duas esperas diferentes, e somar os toques de
  // uma na outra faria a sequência terminar cedo demais, encerrando como "sumiu" alguém
  // que está respondendo.
  const mudouMotivo = atual.esperaMotivo !== motivo;

  const lead = await repo.updateLead(params.id, {
    esperaMotivo: motivo,
    esperaDesde: mudouMotivo ? new Date().toISOString() : atual.esperaDesde ?? new Date().toISOString(),
    proximoToqueEm: quando.toISOString(),
    ...(mudouMotivo ? { toquesNoMotivo: 0 } : {}),
  });

  await registrarAcesso(
    auth.session,
    "pausou_caso",
    {
      tipo: "lead",
      id: params.id,
      detalhe: `${MOTIVO_ESPERA_LABEL[motivo]} · próximo toque ${quando.toISOString().slice(0, 10)}${
        input.proximoToqueEm ? " (data ajustada à mão)" : ` (cadência de ${CADENCIA_DIAS[motivo]} dias)`
      }`,
    },
    req,
  );
  return NextResponse.json({ ok: true, lead });
}
