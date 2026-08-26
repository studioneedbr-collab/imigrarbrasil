import { z } from "zod";
import { getRepository } from "@/lib/data";
import { env } from "@/lib/env";
import { sendMessage } from "@/lib/whatsapp/send";
import { detectTransfer } from "@/lib/agent/transfer";
import { avaliarEncaminhamentoComercial } from "@/lib/agent/transfer-gate";
import { qualificacaoFaltando } from "@/lib/agent/lead-capture";
import { buscarChunks, filtrarRelevantes, citacaoDe } from "@/lib/agent/rag";
import type { Urgency, LeadStage, LeadSetor } from "@/lib/domain/types";

// AS TOOLS DA ANA. Todas servem a um atendimento de imigração: anotar o que a pessoa
// contou, procurar no material oficial, levar o caso ao time jurídico, agendar retomada e
// perguntar com botões.
//
// O que saiu daqui: precificação de mão de obra, proposta comercial em PDF e cadastro de
// funcionário — a maquinaria da base que originou este código. Ela não é mais oferecida
// ao modelo, nem com a descrição mandando não usar: uma tool no contexto é uma tool que
// um dia é chamada, e a Imigrar Brasil não cota serviço pelo assistente. Valores e
// contratação são sempre do time jurídico.
export const AGENT_TOOLS = [
  {
    name: "registrar_dados_lead",
    description:
      "Salva ou atualiza, em silêncio, o que você foi descobrindo na conversa. client_type = NACIONALIDADE da pessoa; region = ONDE ELA ESTÁ agora (país/cidade, ou 'Brasil'); services_interested = o que ela procura (visto, regularização, naturalização, refúgio, Mercosul, reunião familiar); contract_duration = a situação atual dela (como entrou, que documento tem); urgency = se há prazo. Nunca comente que está anotando.",
    input_schema: {
      type: "object",
      properties: {
        conversation_id: { type: "string" }, contact_name: { type: "string" },
        company_name: { type: "string", description: "Empresa ou instituição, quando quem escreve fala em nome de uma (um empregador, uma universidade, uma ONG)." },
        client_type: { type: "string", description: "Nacionalidade da pessoa, como ela mesma disse. NUNCA deduza pelo idioma que ela usa." },
        email: { type: "string" },
        services_interested: { type: "array", items: { type: "string" }, description: "Os caminhos migratórios que ela procura: visto, regularização, naturalização, refúgio, Mercosul, reunião familiar." },
        region: { type: "string", description: "Onde a pessoa está AGORA: 'Brasil' (com a cidade, se ela disser) ou o país em que ela ainda está." },
        // Situação e prazo são o que o advogado lê primeiro. Sem gravar, somem do bloco
        // "DADOS JÁ CONHECIDOS" e a Ana acaba perguntando de novo mais adiante — que é
        // exatamente o que faz quem já está aflito desistir do atendimento.
        contract_duration: { type: "string", description: "A situação atual dela, como ela contou: como entrou no Brasil, que documento tem hoje, se há protocolo em andamento." },
        urgency: { type: "string", enum: ["immediate", "short", "medium", "long"] },
        stage: { type: "string", enum: ["novo", "qualificado", "transferido", "ganho", "perdido", "desqualificado"], description: "Estágio no funil. 'novo' quando a conversa começa, 'qualificado' quando você já sabe nacionalidade, onde a pessoa está e o que ela quer, 'transferido' quando o caso foi para o time jurídico. NUNCA use 'desqualificado' para alguém pedindo ajuda com imigração — só para engano, spam ou propaganda." },
        setor: { type: "string", enum: ["comercial", "operacional", "rh", "departamento_pessoal", "suprimentos", "diretoria"], description: "Destino do contato. Use SEMPRE 'comercial' — é o funil do time jurídico, onde ficam os atendimentos de imigração. 'rh' só para quem procura vaga de emprego na assessoria; 'diretoria' para imprensa e instituições." },
      },
      required: ["conversation_id"],
    },
  },
  {
    name: "transferir_para_humano",
    description:
      "Encaminha o atendimento para o TIME JURÍDICO (advogados) e avisa a equipe. Use sempre que a conversa virar caso concreto: processo em andamento, indeferimento, prazo correndo, situação irregular, refúgio, risco à pessoa, pedido de valores ou de falar com um advogado, aflição significativa, ou quando você não souber responder com segurança. AVISE E CONFIRME ANTES de chamar — a única exceção é risco imediato. Depois de chamar, CONTINUE na conversa.",
    input_schema: {
      type: "object",
      properties: {
        conversation_id: { type: "string" }, reason: { type: "string" },
        summary: { type: "string" }, priority: { type: "string", enum: ["normal", "urgent"] },
        setor: { type: "string", enum: ["comercial", "operacional", "rh", "departamento_pessoal", "suprimentos", "diretoria"], description: "Destino do atendimento. Use SEMPRE 'comercial' — é o funil do TIME JURÍDICO da Imigrar Brasil, para onde vai todo atendimento de imigração. Os outros valores são estruturais e quase nunca se aplicam: 'rh' só para quem procura vaga de emprego na assessoria; 'diretoria' para imprensa e instituições." },
      },
      required: ["conversation_id", "reason", "summary"],
    },
  },
  {
    name: "buscar_material_oficial",
    description:
      "Procura um assunto nas cartilhas oficiais e na legislação migratória brasileira. Você JÁ RECEBE automaticamente os trechos relevantes para a última mensagem da pessoa — use esta tool só quando precisar de algo que não veio: um termo específico, um tipo de visto que apareceu no meio da conversa, ou o texto da lei quando a pessoa pedir o dispositivo. Se a busca não trouxer nada, NÃO responda pelo que você sabe: diga que não tem essa informação e ofereça o encaminhamento ao time jurídico.",
    input_schema: {
      type: "object",
      properties: {
        consulta: {
          type: "string",
          description:
            "O que procurar, em português, escrito como uma pergunta ou um assunto (ex.: 'prazo para pedir refúgio', 'documentos para reunião familiar'). Traduza para português mesmo que a conversa esteja em outro idioma — o material é em português e a busca acerta mais assim.",
        },
        incluir_legislacao: {
          type: "boolean",
          description:
            "true quando a pessoa pediu a lei, o artigo ou o dispositivo. Padrão false, que busca só nas cartilhas (linguagem acessível).",
        },
      },
      required: ["consulta"],
    },
  },
  {
    name: "agendar_followup",
    description: "Agenda uma mensagem de retomada automática, para quando a pessoa parar de responder no meio do atendimento.",
    input_schema: {
      type: "object",
      properties: {
        conversation_id: { type: "string" }, message: { type: "string" },
        delay_hours: { type: "number" },
      },
      required: ["conversation_id", "message", "delay_hours"],
    },
  },
  {
    name: "enviar_opcoes",
    description: "Envia a pergunta com BOTÕES de resposta rápida (2 a 3 opções curtas), em vez de texto. Use com muita parcimônia neste atendimento: menu é o que mais faz a conversa parecer robô, e quem chega aflito precisa contar a história com as próprias palavras. Serve para uma escolha objetiva (ex.: 'está no Brasil ou no exterior?', ou confirmar o encaminhamento). Os rótulos vão no IDIOMA DA CONVERSA. Quando chamar esta tool, NÃO escreva a mesma pergunta em texto.",
    input_schema: {
      type: "object",
      properties: {
        message: { type: "string", description: "A mensagem/pergunta que aparece acima dos botões." },
        opcoes: { type: "array", items: { type: "string" }, description: "2 a 3 rótulos curtos (máx ~20 caracteres cada)." },
      },
      required: ["message", "opcoes"],
    },
  },
] as const;

const leadSchema = z.object({ conversation_id: z.string() }).passthrough();
const transferSchema = z.object({ conversation_id: z.string(), reason: z.string(), summary: z.string(), priority: z.string().optional(), setor: z.enum(["comercial", "operacional", "rh", "departamento_pessoal", "suprimentos", "diretoria"]).optional() });
const followupSchema = z.object({ conversation_id: z.string(), message: z.string(), delay_hours: z.number() });
const buscaSchema = z.object({ consulta: z.string().min(2).max(500), incluir_legislacao: z.coerce.boolean().optional() });

// O funil "comercial" é onde caem os atendimentos de imigração — quem os recebe é o time
// jurídico. O rótulo aqui é o que aparece no aviso de WhatsApp e no painel.
const SETOR_LABELS: Record<string, string> = {
  comercial: "Time jurídico",
  operacional: "Operacional",
  rh: "Recursos Humanos",
  departamento_pessoal: "Departamento Pessoal",
  suprimentos: "Suprimentos",
  diretoria: "Diretoria",
};

// Números (só dígitos) que recebem o aviso de transferência por setor. Editável no
// banco (agent_config "setor_notify"); sem número, cai no TEAM_WHATSAPP geral.
async function getSetorNotify(): Promise<Record<string, string>> {
  try {
    return (await getRepository().getConfig<Record<string, string>>("setor_notify")) ?? {};
  } catch {
    return {};
  }
}

export async function executeTool(name: string, input: unknown): Promise<unknown> {
  const repo = getRepository();
  switch (name) {
    case "registrar_dados_lead": {
      const i = leadSchema.parse(input) as Record<string, unknown>;
      const lead = await repo.upsertLead(i.conversation_id as string, {
        contactName: i.contact_name as string | undefined,
        companyName: i.company_name as string | undefined,
        email: i.email as string | undefined,
        clientType: i.client_type as string | undefined,
        servicesInterested: i.services_interested as string[] | undefined,
        region: i.region as string | undefined,
        contractDuration: i.contract_duration as string | undefined,
        urgency: i.urgency as Urgency | undefined,
        stage: i.stage as LeadStage | undefined,
        setor: i.setor as LeadSetor | undefined,
      });
      return { ok: true, lead_id: lead.id };
    }
    case "transferir_para_humano": {
      const i = transferSchema.parse(input);
      const lead = await repo.getLeadByConversation(i.conversation_id);
      // O agente pode indicar o setor (ex.: "rh" para quem procura vaga na assessoria);
      // senão, cai no setor já registrado no lead.
      const setor = i.setor ?? lead?.setor ?? undefined;

      // ATENDA ANTES DE DESPACHAR. Fica aqui, na tool, e não só no prompt: o modelo ignora
      // pedido, e tanto o caminho determinístico quanto a rede anti-repetição chamam esta
      // mesma função. O portão é frouxo de propósito neste domínio (ver transfer-gate.ts):
      // qualquer sinal de caso concreto libera. O que ele barra é o "oi" virando chamado.
      if ((setor ?? "comercial") === "comercial") {
        const msgs = await repo.listMessages(i.conversation_id).catch(() => []);
        const textoRecente = msgs
          .filter((m) => m.role === "user")
          .slice(-3)
          .map((m) => m.content)
          .join("  ");
        const falta = qualificacaoFaltando(lead);
        const portao = avaliarEncaminhamentoComercial({
          dossieCompleto: falta.completo,
          textoRecente,
          assuntoExigePessoa: !!detectTransfer(`${textoRecente} ${i.reason}`),
        });
        if (!portao.liberado) {
          return {
            ok: false,
            error: "atenda_antes_de_encaminhar",
            faltam: falta.faltam,
            motivo:
              `Ainda não há caso nenhum para levar ao time jurídico — ${portao.motivo}. ` +
              `Acolha, se apresente em uma linha e pergunte o que a pessoa precisa. Ao longo da conversa, descubra: ` +
              `${falta.faltam.join(", ")} — uma pergunta por vez. ` +
              `NÃO diga que encaminhou: ninguém foi chamado. Assim que aparecer caso concreto, prazo, situação irregular, ` +
              `refúgio, risco ou pedido de valores, chame esta tool de novo que ela passa.`,
          };
        }
      }
      // ENCAMINHAR ≠ ASSUMIR. Aqui só se abre o chamado e se avisa o setor; ninguém
      // pegou a conversa ainda, então `assumedBy` fica vazio e a Ana CONTINUA
      // atendendo a pessoa até um atendente abrir o chat no painel e responder.
      await repo.updateConversation(i.conversation_id, {
        status: "transferred",
        handedOffTo: setor ? (SETOR_LABELS[setor] ?? setor) : "Equipe",
        handoffReason: i.reason,
      });
      // O CASO TEM QUE APARECER NO FUNIL. Até aqui o lead só nascia quando a heurística
      // conseguia ler alguma coisa da conversa — então quem escrevia "estou com medo, saí
      // do meu país porque estavam me ameaçando" era encaminhado com urgência e NÃO
      // aparecia no Kanban: o advogado abria o painel e não via o caso em lugar nenhum.
      // Encaminhamento sem card é caso perdido, e este é justamente o que menos pode.
      await repo
        .upsertLead(i.conversation_id, { stage: "transferido", ...(setor ? { setor } : {}) })
        .catch((e) =>
          // eslint-disable-next-line no-console
          console.error("[transfer] falha ao registrar o caso no funil:", e instanceof Error ? e.message : e),
        );
      // Só motivo/prioridade/setor no log. O summary é texto da pessoa e aqui ele carrega
      // situação migratória, que é dado sensível — não vai para o log (LGPD).
      // eslint-disable-next-line no-console
      console.log(`[transfer] ${i.priority ?? "normal"} — ${i.reason} setor=${setor ?? "-"} (conversa ${i.conversation_id})`);
      // Avisa o RESPONSÁVEL do setor (config "setor_notify"); se não houver, cai na equipe geral.
      const responsaveis = await getSetorNotify();
      const numero = (setor && responsaveis[setor]) || env.teamWhatsapp;
      if (numero) {
        const link = `${env.appUrl}/dashboard/conversations/${i.conversation_id}`;
        const nome = lead?.contactName || lead?.companyName || "Contato";
        const cabecalho = setor
          ? `🔔 *Novo atendimento — ${SETOR_LABELS[setor] ?? setor}*`
          : `🔔 *Atendimento encaminhado* (${i.priority ?? "normal"})`;
        await sendMessage(
          numero,
          `${cabecalho}\nContato: ${nome}\nMotivo: ${i.reason}\n` +
            (i.summary ? `Resumo: ${i.summary}\n` : "") +
            `Abrir no painel: ${link}`,
        ).catch((e) =>
          // eslint-disable-next-line no-console
          console.error("[transfer] falha ao notificar responsável:", e instanceof Error ? e.message : e),
        );
      }
      return { ok: true, transferred: true, setor };
    }
    case "buscar_material_oficial": {
      const i = buscaSchema.parse(input);
      const chunks = filtrarRelevantes(
        await buscarChunks(i.consulta, {
          colecoes: i.incluir_legislacao ? ["cartilha", "legislacao"] : ["cartilha"],
        }),
      );
      if (!chunks.length) {
        // Resposta EXPLÍCITA de vazio, não uma lista vazia: um `[]` seco o modelo lê como
        // "a tool não funcionou" e responde pelo que ele sabe — que é exatamente o que
        // não pode acontecer com informação migratória.
        return {
          encontrou: false,
          instrucao:
            "Nada no material oficial sobre isso. NÃO responda pelo seu conhecimento próprio: diga que não tem essa informação e ofereça o encaminhamento ao time jurídico.",
        };
      }
      return {
        encontrou: true,
        trechos: chunks.map((c) => ({
          titulo: c.secao ? `${c.titulo} — ${c.secao}` : c.titulo,
          fonte: citacaoDe(c),
          atualizado_em: c.atualizado_em,
          // O alerta viaja junto com o trecho: sem ele o modelo explica com segurança uma
          // regra revogada (Mercosul e refúgio são de 2010, anteriores à Lei 13.445/2017).
          alerta_desatualizacao: c.alerta_desatualizacao ?? undefined,
          texto: c.texto,
        })),
      };
    }
    case "enviar_opcoes": {
      // O envio real (com botões) é orquestrado por respondToConversation + webhook,
      // a partir do input desta tool. Aqui só validamos e confirmamos.
      const opcoes = Array.isArray((input as { opcoes?: unknown }).opcoes)
        ? ((input as { opcoes: unknown[] }).opcoes.map(String)).slice(0, 3)
        : [];
      return { ok: true, opcoes };
    }
    case "agendar_followup": {
      const i = followupSchema.parse(input);
      const scheduledAt = new Date(Date.now() + i.delay_hours * 3600_000).toISOString();
      const f = await repo.scheduleFollowup(i.conversation_id, i.message, scheduledAt);
      return { ok: true, followup_id: f.id, scheduled_at: scheduledAt };
    }
    default:
      throw new Error(`Tool desconhecida: ${name}`);
  }
}
