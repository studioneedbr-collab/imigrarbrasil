import { z } from "zod";
import { getRepository } from "@/lib/data";
import { calcularPreco, type AdicionaisInput } from "@/lib/agent/pricing";
import { generateProposalPdf } from "@/lib/pdf/generate";
import { savePdfToTmp } from "@/lib/pdf/store";
import type { ProposalInput } from "@/lib/pdf/generate";
import { env } from "@/lib/env";
import { sendMessage } from "@/lib/whatsapp/send";
import { MATERIAL_EQUIPAMENTO } from "@/lib/agent/knowledge";
import { detectTransfer } from "@/lib/agent/transfer";
import { avaliarEncaminhamentoComercial } from "@/lib/agent/transfer-gate";
import { qualificacaoFaltando } from "@/lib/agent/lead-capture";
import { resolveFunctionName } from "@/lib/agent/function-catalog";
import { dimensionar, descreverPosto } from "@/lib/agent/dimensionamento";
import { buscarChunks, filtrarRelevantes, citacaoDe } from "@/lib/agent/rag";
import type { ServiceSchedule, ProposalServiceLine, Urgency, LeadStage, LeadSetor } from "@/lib/domain/types";

export const AGENT_TOOLS = [
  {
    name: "calcular_preco_servico",
    description:
      "NÃO USE NO ATENDIMENTO DA IMIGRAR BRASIL. Motor de precificação de mão de obra terceirizada, herdado da base do sistema e mantido para o painel. A Imigrar Brasil NÃO cota serviço pelo assistente: honorários e valores são sempre do time jurídico. Se perguntarem preço, não chame esta tool — diga que valores quem passa é o time e ofereça o encaminhamento.",
    input_schema: {
      type: "object",
      properties: {
        service_name: { type: "string", description: "Nome do serviço/função" },
        employees_count: {
          type: "number",
          description:
            "Quantidade de POSTOS. Sem cobertura, 1 posto = 1 funcionário. COM cobertura, 1 posto pode ser mais de uma pessoa e quem multiplica é o sistema — mande a quantidade de postos que o cliente pediu, NUNCA o número de funcionários que você calculou.",
        },
        schedule: { type: "string", description: "Escala: 5x2_44h, 12x36, 6x1_44h" },
        cobertura: {
          type: "string",
          enum: ["24h", "12h_diurno", "12h_noturno"],
          description:
            "Quantas horas por dia o POSTO precisa ficar coberto, quando o cliente descreve cobertura em vez de número de pessoas. Só existe na escala 12x36. '24h' = posto ininterrupto, que são 4 funcionários (2 com adicional noturno); '12h_diurno' = 2 funcionários; '12h_noturno' = 2 funcionários, os dois com adicional noturno. Use SEMPRE que o cliente falar posto 24h, ininterrupto, full time, dia e noite, ou der uma faixa de horário (das 19h às 7h). Você NÃO multiplica nada de cabeça e NÃO marca adicionais.noturno junto: passe employees_count = quantidade de postos e a cobertura, e o sistema dimensiona os funcionários e o noturno pela CCT.",
        },
        region: { type: "string", description: "Região/cidade" },
        sem_uniforme: {
          type: "boolean",
          description:
            "true SÓ quando o cliente disser que já fornece o uniforme dos colaboradores. Tira o uniforme do preço. Não use para material, equipamento, EPI nem alimentação/vale-refeição — esses não saem do posto por conta própria.",
        },
        com_material: {
          type: "boolean",
          description:
            "true quando o cliente quiser que a Shine forneça material de limpeza e equipamento. Acrescenta o rateio de material e equipamento ao preço. Sem isso o valor é só mão de obra. Pergunte ao cliente de quem é o material antes de cotar; em contrato pequeno a tool devolve materialSobConsulta e aí o material vai para um consultor.",
        },
        adicionais: {
          type: "object",
          description:
            "Adicionais do POSTO, conforme a convenção coletiva da praça. Nada aqui é automático — preencha só o que o cliente disser. Cada campo vira uma linha do Módulo 1 da composição de custos. Se o cliente não souber, não invente: deixe fora e o preço sai só com o piso.",
          properties: {
            insalubridade: {
              type: "string",
              enum: ["minimo", "medio", "maximo"],
              description:
                "Grau do laudo, quando o local é insalubre. No Rio: 'medio' (20%) em hospital, casa de saúde e ambulatório; 'maximo' (40%) em lixeira de prédio/condomínio, dedetização e banheiro de uso público com grande circulação (80+ pessoas/dia). Precisa de laudo do SESMET — pergunte se o cliente tem.",
            },
            periculosidade: {
              type: "boolean",
              description:
                "true quando a atividade é perigosa: fachada com rapel, alpinismo predial/industrial, limpeza de vidro em andaime acima de 2,5m. 30% sobre o salário base. Não acumula com insalubridade — o motor aplica o maior dos dois.",
            },
            noturno: {
              type: "boolean",
              description:
                "true quando o posto trabalha entre 22h e 5h (portaria noturna, por exemplo). No Rio soma 20% de adicional mais a hora noturna reduzida de 52min30s.",
            },
            intrajornada_indenizada: {
              type: "boolean",
              description:
                "true quando o posto NÃO PODE PARAR e o intervalo é suprimido e indenizado — típico de portaria 12x36 com um posto só. Pergunte se haverá cobertura no intervalo. Entra no Módulo 4.2.",
            },
            lidera_equipe_de: {
              type: "number",
              description:
                "Quantos empregados ficam sob a responsabilidade desta pessoa. Só para líder/encarregado. No Rio a gratificação sobe por faixa: até 15 são 15%, 16 a 30 são 25%, 31 a 60 são 30%, acima de 61 são 40%.",
            },
          },
        },
      },
      required: ["service_name", "employees_count"],
    },
  },
  {
    name: "gerar_proposta_pdf",
    description:
      "NÃO USE NO ATENDIMENTO DA IMIGRAR BRASIL. Gerador de proposta comercial em PDF, " +
      "herdado da base do sistema e mantido para o painel. Quem apresenta proposta e " +
      "honorários aqui é o time jurídico, depois de analisar o caso — nunca o assistente.",
    input_schema: {
      type: "object",
      properties: {
        lead_data: {
          type: "object",
          properties: {
            contact_name: { type: "string" }, company_name: { type: "string" },
            whatsapp_number: { type: "string" }, email: { type: "string" },
            cnpj: { type: "string" }, address: { type: "string" },
          },
        },
        region: {
          type: "string",
          description:
            "Cidade ou região onde o serviço será prestado — a MESMA que você usou em calcular_preco_servico. O piso vem da CCT da praça, então sem isso a proposta sai com o preço do Rio de Janeiro.",
        },
        services: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Nome exato da função (ex.: Auxiliar de Serviços Gerais)" },
              quantity: { type: "number", description: "Quantidade de POSTOS (com cobertura, um posto pode ter mais de um funcionário — não converta)" },
              schedule: { type: "string", description: "Escala, ex.: 5x2_44h ou 12x36" },
              cobertura: {
                type: "string",
                enum: ["24h", "12h_diurno", "12h_noturno"],
                description:
                  "Repita aqui a MESMA cobertura usada em calcular_preco_servico. Se você cotou um posto 24h e não repetir aqui, o PDF sai com uma pessoa no lugar de quatro — menos da metade do valor que você falou para o cliente.",
              },
              sem_uniforme: {
                type: "boolean",
                description:
                  "Repita aqui o mesmo valor usado em calcular_preco_servico. Se você cotou sem uniforme e não marcar aqui, a proposta sai com um valor diferente do que você falou para o cliente.",
              },
              com_material: {
                type: "boolean",
                description:
                  "Repita aqui o mesmo valor usado em calcular_preco_servico. Se você cotou com material e não marcar aqui, a proposta sai mais barata do que o valor que você falou para o cliente.",
              },
              adicionais: {
                type: "object",
                description:
                  "Repita aqui os MESMOS adicionais usados em calcular_preco_servico (insalubridade, periculosidade, noturno, intrajornada, liderança). A proposta é recalculada do zero: adicional que você cotou e não repetir aqui some do PDF, e o cliente recebe por escrito um valor menor do que o que você falou.",
                properties: {
                  insalubridade: { type: "string", enum: ["minimo", "medio", "maximo"] },
                  periculosidade: { type: "boolean" },
                  noturno: { type: "boolean" },
                  intrajornada_indenizada: { type: "boolean" },
                  lidera_equipe_de: { type: "number" },
                },
              },
            },
            required: ["name", "quantity"],
          },
        },
      },
      required: ["lead_data", "services"],
    },
  },
  {
    name: "registrar_dados_lead",
    description:
      "Salva ou atualiza, em silêncio, o que você foi descobrindo na conversa. Neste atendimento: client_type = NACIONALIDADE da pessoa; region = ONDE ELA ESTÁ agora (país/cidade, ou 'Brasil'); services_interested = o que ela procura (visto, regularização, naturalização, refúgio, Mercosul, reunião familiar); contract_duration = a situação atual dela (como entrou, que documento tem); urgency = se há prazo. Nunca comente que está anotando.",
    input_schema: {
      type: "object",
      properties: {
        conversation_id: { type: "string" }, contact_name: { type: "string" },
        company_name: { type: "string" }, client_type: { type: "string" },
        email: { type: "string" },
        services_interested: { type: "array", items: { type: "string" } },
        employees_needed: { type: "number" }, region: { type: "string" },
        // Escala e duração fazem parte do que ela pergunta: sem gravar, a resposta some
        // do bloco "DADOS JÁ CONHECIDOS" e ela acaba perguntando de novo mais adiante.
        schedule: { type: "string", description: "Escala combinada: 5x2_44h, 12x36 ou 6x1_44h. Grave assim que o cliente disser." },
        contract_duration: { type: "string", description: "Duração pretendida do contrato, como o cliente falou (ex.: '12 meses', 'indeterminado', 'só o período da obra')." },
        urgency: { type: "string", enum: ["immediate", "short", "medium", "long"] },
        estimated_value: { type: "number" },
        stage: { type: "string", enum: ["novo", "qualificado", "orcado", "transferido", "ganho", "perdido", "desqualificado"], description: "Estágio no funil. 'novo' quando a conversa começa, 'qualificado' quando você já sabe nacionalidade, onde a pessoa está e o que ela quer, 'transferido' quando o caso foi para o time jurídico. NUNCA use 'desqualificado' para alguém pedindo ajuda com imigração — só para engano, spam ou propaganda." },
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
    name: "agendar_followup",
    description: "Agenda uma mensagem de follow-up automático para o lead.",
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
    name: "registrar_funcionario",
    description: "Cadastra alguém que TRABALHA na Imigrar Brasil (não use para quem está sendo atendido, nem para candidato a vaga). Raríssimo neste atendimento — praticamente só quando uma pessoa da própria equipe escreve pelo WhatsApp público.",
    input_schema: {
      type: "object",
      properties: {
        nome: { type: "string" }, cpf: { type: "string" }, cargo: { type: "string" },
        setor: { type: "string", enum: ["departamento_pessoal", "rh"], description: "Assunto do colaborador: DP (folha/benefícios/férias) ou RH." },
        telefone: { type: "string" }, email: { type: "string" },
      },
      required: ["nome"],
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

// Adicionais do posto (Módulo 1, linhas B a F, e Módulo 4.2 da composição). O que a
// Shayene coleta na conversa entra aqui e é o motor que decide o valor, pela CCT da praça
// — ela nunca informa percentual nem valor de adicional.
const adicionaisSchema = z.object({
  insalubridade: z.enum(["minimo", "medio", "maximo"]).optional(),
  periculosidade: z.coerce.boolean().optional(),
  noturno: z.coerce.boolean().optional(),
  horas_noturnas_mes: z.coerce.number().positive().max(400).optional(),
  intrajornada_indenizada: z.coerce.boolean().optional(),
  lidera_equipe_de: z.coerce.number().int().positive().max(10000).optional(),
});

/** Converte o formato snake_case das tools para o do motor. */
function toAdicionais(a?: z.infer<typeof adicionaisSchema>): AdicionaisInput | undefined {
  if (!a) return undefined;
  return {
    insalubridade: a.insalubridade,
    periculosidade: a.periculosidade,
    noturno: a.noturno,
    horasNoturnasMes: a.horas_noturnas_mes,
    intrajornadaIndenizada: a.intrajornada_indenizada,
    lideraEquipeDe: a.lidera_equipe_de,
  };
}

const coberturaSchema = z.enum(["24h", "12h_diurno", "12h_noturno"]);
const priceSchema = z.object({ service_name: z.string().max(120), employees_count: z.coerce.number().int().positive().max(10000), schedule: z.string().max(40).optional(), region: z.string().max(200).optional(), sem_uniforme: z.coerce.boolean().optional(), com_material: z.coerce.boolean().optional(), cobertura: coberturaSchema.optional(), adicionais: adicionaisSchema.optional() });
const leadSchema = z.object({ conversation_id: z.string() }).passthrough();
const transferSchema = z.object({ conversation_id: z.string(), reason: z.string(), summary: z.string(), priority: z.string().optional(), setor: z.enum(["comercial", "operacional", "rh", "departamento_pessoal", "suprimentos", "diretoria"]).optional() });
const followupSchema = z.object({ conversation_id: z.string(), message: z.string(), delay_hours: z.number() });
const buscaSchema = z.object({ consulta: z.string().min(2).max(500), incluir_legislacao: z.coerce.boolean().optional() });
const funcionarioSchema = z.object({ nome: z.string(), cpf: z.string().optional(), cargo: z.string().optional(), setor: z.string().optional(), telefone: z.string().optional(), email: z.string().optional() });
// unit_price e total_value continuam aceitos porque os dois chamadores internos (o motor
// determinístico e o simulador do painel) já mandam o valor que eles mesmos calcularam —
// mas são IGNORADOS. O preço da proposta é sempre recalculado aqui. Foi por confiar no
// número que vinha de fora que saiu uma proposta de R$ 1.500 num posto de R$ 4.873,52.
const serviceLineSchema = z.object({
  name: z.string().min(1).max(120),
  quantity: z.coerce.number().int().positive().max(10000),
  unit_price: z.number().optional(),
  schedule: z.string().max(40).optional(),
  sem_uniforme: z.coerce.boolean().optional(),
  com_material: z.coerce.boolean().optional(),
  cobertura: coberturaSchema.optional(),
  adicionais: adicionaisSchema.optional(),
});
const proposalSchema = z.object({
  conversation_id: z.string().optional(),
  region: z.string().max(200).optional(),
  lead_data: z.record(z.string(), z.any()),
  services: z.array(serviceLineSchema).min(1),
  total_value: z.number().optional(), // ignorado — ver serviceLineSchema
});

// Categorias que o MENU determinístico usa quando o cliente escolhe "falar com um
// consultor" ou "contrato" digitando o número da opção. O texto dele é só "3", então
// nenhum regex de "pediu humano" reconheceria o pedido — mas ele pediu, e explicitamente.
const PEDIDO_EXPLICITO = /^(consultor_comercial|contratos|supervisor_operacional)$/;

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
    case "calcular_preco_servico": {
      const i = priceSchema.parse(input);
      const nome = resolveFunctionName(i.service_name) ?? i.service_name;
      const fp = await repo.getFunctionPricing(nome);
      const r = calcularPreco({
        serviceName: nome, employeesCount: i.employees_count,
        schedule: i.schedule as ServiceSchedule | undefined, region: i.region,
        params: fp ?? undefined,
        semUniforme: i.sem_uniforme,
        comMaterial: i.com_material,
        cobertura: i.cobertura,
        adicionais: toAdicionais(i.adicionais),
      });
      // NÃO devolver custo interno nem margem (costBreakdown/custoPuro/bdi/unitCost) ao
      // LLM: iria para o contexto e poderia ser extraído por prompt injection. A Shayene
      // só precisa do preço de venda para apresentar.
      // Função sem preço validado: NÃO devolver valor nenhum. Só o ASG tem composição
      // fechada na planilha; para as demais, qualquer número aqui é estimativa e a
      // Shayene acabaria falando um preço inventado para o cliente.
      const base = {
        serviceName: r.serviceName,
        schedule: r.schedule,
        employeesCount: i.employees_count,
        postsPerEmployee: r.postsPerEmployee,
        // Dimensionamento do posto. A Shayene precisa disto para EXPLICAR ao cliente por
        // que um posto 24h tem quatro pessoas — ela informa a cobertura, o motor conta.
        ...(r.cobertura
          ? {
              cobertura: r.cobertura,
              postos: i.employees_count,
              funcionariosPorPosto: r.funcionariosPorPosto,
              funcionariosTotais: r.funcionariosTotais,
              dimensionamento: descreverPosto(dimensionar(r.cobertura), i.employees_count),
              turnos: r.turnos?.map((t) => ({ turno: t.rotulo, funcionarios: t.funcionarios, comAdicionalNoturno: t.noturno })),
            }
          : {}),
        sobConsulta: r.sobConsulta,
        priceConfirmed: r.priceConfirmed,
        regiao: r.regiao,
        // O motor de fluxo usa isto para distinguir "função sob consulta" de "praça sem
        // convenção conferida" e dar a resposta certa ao cliente, em vez de um genérico.
        cctCadastrada: r.cctCadastrada,
      };
      if (!r.priceConfirmed) {
        // Dois motivos diferentes, e a Shayene precisa saber qual é para dar a resposta
        // certa ao cliente: função sem piso conferido, ou serviço numa praça cuja CCT
        // ainda não foi cadastrada (o piso é outro, e não é o do Rio vezes um fator).
        // Três motivos diferentes, e a Shayene precisa saber qual é para dar a resposta
        // certa: praça sem convenção conferida, adicional que a CCT de lá não calcula, ou
        // função sem piso. Um genérico faria ela dizer "conforme o escopo" para quem
        // perguntou o preço de um posto insalubre em São Paulo.
        const naoCobertos = r.adicionaisNaoCobertos;
        return {
          ...base,
          motivo: r.coberturaNaoDimensionavel
            ? `Cobertura de ${i.cobertura} pedida na escala ${r.schedule}. O dimensionamento validado pela Shine é só na 12x36 (posto 24h = 4 funcionários, 2 com adicional noturno) — em outra escala quem monta a escala e conta os funcionários é a Mesa de Operação. NÃO invente quantos funcionários são e NÃO cote: diga que atendemos e que um consultor fecha o dimensionamento, e encaminhe com transferir_para_humano.`
            : !r.cctCadastrada
            ? `Serviço em ${r.regiao}, e a convenção coletiva dessa praça ainda não está cadastrada — o piso de lá é diferente do Rio. Não informe valor nem estime por comparação com o Rio: diga que atendemos a região e que o comercial confirma o valor pela CCT local, e siga levantando escopo, carga horária, escala, quantidade e endereço.`
            : naoCobertos.length > 0
              ? `O posto tem adicional que a convenção de ${r.regiao} não permite calcular aqui: ${naoCobertos.map((a) => `${a.adicional} (${a.motivo})`).join("; ")}. Não informe valor e não cote ignorando o adicional — o preço sairia abaixo do custo. Diga que o posto tem particularidade que um consultor precisa fechar e encaminhe com transferir_para_humano.`
              : "Função sem preço validado. Não informe valor: diga que atendemos essa função e que o comercial confirma o valor exato, e siga levantando escopo, carga horária, escala, quantidade e local.",
        };
      }
      return {
        ...base,
        unitSalePrice: r.unitSalePrice,
        totalSalePrice: r.totalSalePrice,
        // A Shayene precisa saber que o abatimento foi aplicado para poder dizer ao
        // cliente — e para repetir sem_uniforme em gerar_proposta_pdf.
        ...(i.sem_uniforme ? { semUniforme: true } : {}),
        // Material: o valor devolvido JÁ inclui o rateio quando comMaterial é true. Ela
        // repete com_material em gerar_proposta_pdf, senão o PDF sai mais barato que o
        // valor falado. O rateio em si é custo interno e não vai para o modelo.
        ...(r.comMaterial ? { comMaterial: true } : {}),
        ...(r.materialSobConsulta
          ? {
              materialSobConsulta: true,
              avisoMaterial: `O preço acima é SÓ MÃO DE OBRA — o material não entrou. Contrato de ${i.employees_count} posto(s) é pequeno demais para o material sair por rateio: quem dimensiona pelo escopo real é a Mesa de Operação. Apresente o valor da mão de obra normalmente, diga que o orçamento do material vem de um consultor e encaminhe com transferir_para_humano. Não estime valor de material.`,
            }
          : {}),
      };
    }
    case "registrar_dados_lead": {
      const i = leadSchema.parse(input) as Record<string, unknown>;
      const lead = await repo.upsertLead(i.conversation_id as string, {
        contactName: i.contact_name as string | undefined,
        companyName: i.company_name as string | undefined,
        email: i.email as string | undefined,
        clientType: i.client_type as string | undefined,
        servicesInterested: i.services_interested as string[] | undefined,
        employeesNeeded: i.employees_needed as number | undefined,
        region: i.region as string | undefined,
        schedule: i.schedule as string | undefined,
        contractDuration: i.contract_duration as string | undefined,
        urgency: i.urgency as Urgency | undefined,
        estimatedValue: i.estimated_value as number | undefined,
        stage: i.stage as LeadStage | undefined,
        setor: i.setor as LeadSetor | undefined,
      });
      return { ok: true, lead_id: lead.id };
    }
    case "gerar_proposta_pdf": {
      const i = proposalSchema.parse(input);

      // O preço da proposta NUNCA vem de fora — é sempre recalculado aqui pela composição
      // de custos da CCT, a partir do que está cadastrado em function_pricing. Antes a
      // tool gravava no PDF o unit_price que o modelo escrevia, e saiu uma proposta de
      // R$ 1.500 para um posto que custa R$ 4.873,52.
      const services: ProposalServiceLine[] = [];
      const semPreco: string[] = [];
      const naoCotavel: string[] = [];
      let totalValue = 0;

      // A REGIÃO TAMBÉM VALE AQUI. Antes só calcular_preco_servico recebia a praça: ela
      // falava R$ 5.263 para São Paulo (fator 1,08 da CCT local) e o PDF saía com os
      // R$ 4.873,52 do Rio, porque a proposta recalculava sem região nenhuma. O cliente
      // recebia por escrito um valor menor do que o cotado na conversa.
      // Se o modelo esquecer de mandar, cai na região já registrada no lead — só depois
      // disso é que o default do Rio vale.
      const leadAtual = i.conversation_id
        ? await repo.getLeadByConversation(i.conversation_id).catch(() => null)
        : null;
      const region = i.region ?? leadAtual?.region ?? undefined;

      for (const s of i.services) {
        // Material e equipamento não entram em proposta automática: variam com o escopo
        // e quem orça é a Mesa de Operação.
        if (MATERIAL_EQUIPAMENTO.test(s.name)) {
          naoCotavel.push(s.name);
          continue;
        }
        // "ASG", sem acento, caixa trocada — resolve para o nome do cadastro antes de
        // procurar o preço. Nome que não existe no catálogo segue como está e cai em
        // sob_consulta, que é o desfecho seguro.
        const nome = resolveFunctionName(s.name) ?? s.name;
        const fp = await repo.getFunctionPricing(nome);
        const r = calcularPreco({
          serviceName: nome,
          employeesCount: s.quantity,
          schedule: s.schedule as ServiceSchedule | undefined,
          params: fp ?? undefined,
          semUniforme: s.sem_uniforme,
          comMaterial: s.com_material,
          cobertura: s.cobertura,
          adicionais: toAdicionais(s.adicionais),
          region,
        });
        if (!r.priceConfirmed) {
          semPreco.push(s.name);
          continue;
        }
        services.push({
          name: r.serviceName, quantity: s.quantity,
          unitPrice: r.unitSalePrice, schedule: r.schedule,
          // Guarda as premissas junto da linha para a planilha de composição poder ser
          // regerada depois exatamente igual ao que o cliente recebeu.
          ...(region ? { region } : {}),
          ...(s.sem_uniforme ? { semUniforme: true } : {}),
          ...(r.comMaterial ? { comMaterial: true } : {}),
          ...(s.cobertura ? { cobertura: s.cobertura } : {}),
          ...(s.adicionais ? { adicionais: toAdicionais(s.adicionais) } : {}),
        });
        totalValue += r.totalSalePrice;
      }

      if (naoCotavel.length > 0) {
        return {
          ok: false,
          error: "nao_cotavel",
          items: naoCotavel,
          motivo:
            "Material de limpeza e equipamentos não entram em proposta automática — o valor varia conforme o escopo e quem orça é a Mesa de Operação. Monte a proposta só com os postos e encaminhe o orçamento de material para um consultor (transferir_para_humano).",
        };
      }
      if (semPreco.length > 0) {
        return {
          ok: false,
          error: "sob_consulta",
          items: semPreco,
          motivo:
            `Estas funções ainda não têm o piso da CCT cadastrado, então não é possível gerar proposta com valor: ${semPreco.join(", ")}. NÃO invente preço e NÃO gere a proposta. Diga que um consultor confirma o valor exato e encaminhe com transferir_para_humano.`,
        };
      }
      if (services.length === 0) {
        return { ok: false, error: "sem_servicos", motivo: "Nenhuma função válida na proposta." };
      }
      totalValue = Math.round(totalValue * 100) / 100;

      const { buffer, filename } = await generateProposalPdf({
        leadData: i.lead_data as ProposalInput["leadData"], services, totalValue,
      });
      const dataUrl = `data:application/pdf;base64,${buffer.toString("base64")}`;
      const proposal = await repo.createProposal({
        conversationId: i.conversation_id ?? null, leadId: null, pdfUrl: dataUrl,
        services, totalValue, costBreakdown: null,
      });
      const tmpPath = await savePdfToTmp(proposal.id, buffer);
      const viewUrl = `${env.appUrl}/api/proposal/${proposal.id}`;

      // Aviso ao dono/gestor (Eduardo) a cada proposta enviada — controle interno.
      if (env.proposalNotifyWhatsapp) {
        const ld = i.lead_data as ProposalInput["leadData"];
        const para = ld.company_name || ld.contact_name || "Cliente";
        // Com cobertura, "1× Porteiro" esconderia justamente o que o Eduardo quer ver: que
        // ali vão quatro funcionários, dois com adicional noturno.
        const linhaServ = services
          .map((s) => {
            if (!s.cobertura) return `${s.quantity}× ${s.name}`;
            const d = dimensionar(s.cobertura);
            return `${s.quantity}× ${d.rotulo} de ${s.name} (${d.funcionariosPorPosto * s.quantity} func., ${d.turnos.filter((t) => t.noturno).reduce((a, t) => a + t.funcionariosPorPosto * s.quantity, 0)} c/ noturno)`;
          })
          .join(", ");
        const totalFmt = totalValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        await sendMessage(
          env.proposalNotifyWhatsapp,
          `Olá Eduardo, aqui é a Shayene 👋\n\n*Nova proposta enviada.*\n\n*Para:* ${para}\n*Serviço(s):* ${linhaServ}\n*Total/mês:* ${totalFmt}\n` +
            (ld.whatsapp_number ? `*Contato:* ${ld.whatsapp_number}\n` : "") +
            `\nPDF: ${viewUrl}`,
        ).catch((e) => console.error("[proposta] falha ao avisar o gestor:", e instanceof Error ? e.message : e));
      }

      return {
        ok: true,
        proposal_id: proposal.id,
        filename,
        view_url: viewUrl,
        tmp_path: tmpPath,
        pdf_url: dataUrl,
        app_url: env.appUrl,
      };
    }
    case "transferir_para_humano": {
      const i = transferSchema.parse(input);
      const lead = await repo.getLeadByConversation(i.conversation_id);
      // O agente pode indicar o setor (ex.: operacional para colaborador já alocado);
      // senão, cai no setor já registrado no lead.
      const setor = i.setor ?? lead?.setor ?? undefined;

      // ATENDA ANTES DE DESPACHAR. Fica aqui, na tool, e não só no prompt: o modelo ignora
      // pedido, e tanto o motor determinístico quanto a rede anti-repetição chamam esta
      // mesma função. O portão é frouxo de propósito neste domínio (ver transfer-gate.ts):
      // qualquer sinal de caso concreto libera. O que ele barra é o "oi" virando chamado.
      if ((setor ?? "comercial") === "comercial") {
        const [jaTemProposta, msgs] = await Promise.all([
          repo.hasProposalForConversation(i.conversation_id).catch(() => false),
          repo.listMessages(i.conversation_id).catch(() => []),
        ]);
        const textoRecente = msgs
          .filter((m) => m.role === "user")
          .slice(-3)
          .map((m) => m.content)
          .join("  ");
        const falta = qualificacaoFaltando(lead);
        const portao = avaliarEncaminhamentoComercial({
          jaTemProposta,
          dossieCompleto: falta.completo,
          textoRecente,
          assuntoExigePessoa:
            !!detectTransfer(`${textoRecente} ${i.reason}`) || PEDIDO_EXPLICITO.test(i.reason),
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
      // pegou a conversa ainda, então `assumedBy` fica vazio e a Shayene CONTINUA
      // atendendo o cliente até um atendente abrir o chat no painel e responder.
      await repo.updateConversation(i.conversation_id, {
        status: "transferred",
        handedOffTo: setor ? (SETOR_LABELS[setor] ?? setor) : "Equipe",
        handoffReason: i.reason,
      });
      // Só motivo/prioridade/setor no log (o summary é texto do cliente, pode ter CPF — LGPD).
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
          : `🔔 *Lead transferido* (${i.priority ?? "normal"})`;
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
    case "registrar_funcionario": {
      const i = funcionarioSchema.parse(input);
      const f = await repo.createFuncionario({
        nome: i.nome, cpf: i.cpf, cargo: i.cargo, setor: i.setor, telefone: i.telefone, email: i.email,
      });
      return { ok: true, funcionario_id: f.id };
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
