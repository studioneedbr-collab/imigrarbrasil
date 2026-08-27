/* eslint-disable @typescript-eslint/no-explicit-any -- rows come from untyped Supabase query results; mapped explicitly below */
import type { Repository } from "@/lib/data/repository";
import { conversasSemResposta } from "@/lib/operacao/sem-resposta";
import type { Conversation, Message, MessageMedia, DocumentItem, MediaKind, Lead, Followup, FollowupStatus, Cliente, FlowStateId, TransferTicket, User, Classificacao, Reclassificacao, AccessLogEntry, EventoOperacao, TipoEventoOperacao, Lembrete, ZapiInstancia, RascunhoAgente, RascunhoStatus, AmbienteInstancia, ModoDesligado, ChamadaLlm } from "@/lib/domain/types";
import { eFiltrada } from "@/lib/domain/types";
import { semCamposDePrazo, semCamposSoDeHumano } from "@/lib/data/prazo";
import type { DbConversation, DbMessage } from "@/lib/supabase/types";
import { createServerClient } from "@/lib/supabase/client";
import type { ActivityMessage } from "@/lib/notifications/new-messages";
import {
  conversaParaReaproveitar,
  normalizarTelefone,
  variantesDoTelefone,
} from "@/lib/whatsapp/telefone";

const mapConversation = (r: DbConversation): Conversation => ({
  id: r.id, whatsappNumber: r.whatsapp_number, contactName: r.contact_name,
  status: r.status as Conversation["status"], leadScore: r.lead_score,
  createdAt: r.created_at, updatedAt: r.updated_at,
  clienteId: (r as unknown as Record<string, any>).cliente_id ?? undefined,
  estadoAtual: ((r as unknown as Record<string, any>).estado_atual as FlowStateId) ?? "S0",
  handedOffTo: (r as unknown as Record<string, any>).handed_off_to ?? undefined,
  handoffReason: (r as unknown as Record<string, any>).handoff_reason ?? undefined,
  assumedBy: (r as unknown as Record<string, any>).assumed_by ?? null,
  assumedAt: (r as unknown as Record<string, any>).assumed_at ?? null,
  lastMessageAt: (r as unknown as Record<string, any>).last_message_at ?? null,
  followupSentAt: (r as unknown as Record<string, any>).followup_sent_at ?? null,
  reopenedAt: (r as unknown as Record<string, any>).reopened_at ?? null,
  optOutAt: (r as unknown as Record<string, any>).opt_out_at ?? null,
  noFollowupAt: (r as unknown as Record<string, any>).no_followup_at ?? null,
  idioma: (r as unknown as Record<string, any>).idioma ?? null,
  instanciaId: (r as unknown as Record<string, any>).instancia_id ?? null,
  // `producao` como padrão de leitura: linhas anteriores à migration 023 não têm a
  // coluna preenchida, e tratá-las como teste as apagaria das métricas.
  ambiente: ((r as unknown as Record<string, any>).ambiente as AmbienteInstancia) ?? "producao",
  aguardandoHumanoDesde: (r as unknown as Record<string, any>).aguardando_humano_desde ?? null,
});

const mapInstancia = (r: Record<string, any>): ZapiInstancia => ({
  id: r.id, nome: r.nome, ambiente: r.ambiente as AmbienteInstancia,
  instanceId: r.instance_id, token: r.token, clientToken: r.client_token ?? null,
  baseUrl: r.base_url, ativo: Boolean(r.ativo),
  ativadoPor: r.ativado_por ?? null, ativadoEm: r.ativado_em ?? null,
  modoDesligado: r.modo_desligado as ModoDesligado, respostaFixa: r.resposta_fixa ?? null,
  slaMinutos: r.sla_minutos ?? 30, criadoEm: r.criado_em, atualizadoEm: r.atualizado_em,
});

const mapRascunho = (r: Record<string, any>): RascunhoAgente => ({
  id: r.id, conversationId: r.conversation_id, messageId: r.message_id ?? null,
  texto: r.texto, botoes: r.botoes ?? null, status: r.status as RascunhoStatus,
  textoEnviado: r.texto_enviado ?? null, motivo: r.motivo ?? null,
  decididoPor: r.decidido_por ?? null, decididoEm: r.decidido_em ?? null,
  criadoEm: r.criado_em,
});
const mapCliente = (r: Record<string, any>): Cliente => ({
  id: r.id, nome: r.nome, cpf: r.cpf, empresa: r.empresa, email: r.email,
  telefone: r.telefone, cidade: r.cidade, createdAt: r.created_at,
});
const mapTransferTicket = (r: Record<string, any>): TransferTicket => ({
  id: r.id, conversationId: r.conversation_id, clienteId: r.cliente_id ?? undefined,
  reason: r.reason, priority: r.priority, dossie: r.dossie, createdAt: r.created_at,
});
const mapUser = (r: Record<string, any>): User => ({
  id: r.id, email: r.email, passwordHash: r.password_hash, name: r.name ?? undefined,
  role: r.role, setor: r.setor ?? null, active: r.active, createdAt: r.created_at,
});
const mapMessage = (r: DbMessage): Message => ({
  id: r.id, conversationId: r.conversation_id, role: r.role as Message["role"],
  content: r.content, whatsappMessageId: r.whatsapp_message_id, createdAt: r.created_at,
  mediaUrl: (r as unknown as Record<string, any>).media_url ?? null,
  mediaType: ((r as unknown as Record<string, any>).media_type as MediaKind) ?? null,
  mediaName: (r as unknown as Record<string, any>).media_name ?? null,
  mediaText: (r as unknown as Record<string, any>).media_text ?? null,
});

export class SupabaseRepository implements Repository {
  private db = createServerClient();

  async getOrCreateConversation(whatsappNumber: string, contactName?: string): Promise<Conversation> {
    const { data: found } = await this.db.from("conversations").select("*").eq("whatsapp_number", whatsappNumber).maybeSingle();
    if (found) return mapConversation(found as DbConversation);

    // MESMO TELEFONE, OUTRA GRAFIA. O unique de `whatsapp_number` nunca deixou passar
    // duas linhas com o mesmo texto — o que passava eram "+55 95 99123-4567" e
    // "559591234567", que são a mesma pessoa. Cada grafia abria uma conversa, e o
    // contato aparecia duas vezes na fila com metade da ficha em cada uma.
    // A janela e o "está aberta?" são regra de domínio: lib/whatsapp/telefone.ts.
    const variantes = variantesDoTelefone(whatsappNumber);
    if (variantes.length) {
      const { data: parecidas } = await this.db
        .from("conversations")
        .select("id,status,last_message_at,updated_at")
        .in("telefone_normalizado", variantes)
        .order("updated_at", { ascending: false })
        .limit(20);
      const escolhida = conversaParaReaproveitar(
        (parecidas ?? []).map((c: any) => ({
          id: c.id,
          status: c.status,
          atividadeEm: c.last_message_at ?? c.updated_at,
        })),
      );
      if (escolhida) {
        const achada = await this.getConversation(escolhida.id);
        if (achada) return achada;
      }
    }

    // upsert e não insert: duas mensagens do mesmo número chegando juntas caíam
    // ambas aqui e a segunda violava o unique de whatsapp_number — o webhook
    // engolia a exceção e a mensagem do cliente era perdida.
    const { data, error } = await this.db.from("conversations")
      .upsert(
        {
          whatsapp_number: whatsappNumber,
          contact_name: contactName ?? null,
          telefone_normalizado: normalizarTelefone(whatsappNumber) || null,
        },
        { onConflict: "whatsapp_number" },
      ).select("*").single();
    if (error) throw error;
    return mapConversation(data as DbConversation);
  }
  async getConversation(id: string) {
    const { data } = await this.db.from("conversations").select("*").eq("id", id).maybeSingle();
    return data ? mapConversation(data as DbConversation) : null;
  }
  async updateConversation(id: string, patch: Partial<Conversation>) {
    const dbPatch: Record<string, any> = { updated_at: new Date().toISOString() };
    if (patch.status !== undefined) dbPatch.status = patch.status;
    if (patch.leadScore !== undefined) dbPatch.lead_score = patch.leadScore;
    if (patch.contactName !== undefined) dbPatch.contact_name = patch.contactName;
    // Estes três eram descartados silenciosamente. O engine grava clienteId ao
    // identificar o cliente; sem persistir, o dossiê de transferência chegava ao
    // consultor humano sem CPF, empresa nem contato.
    if (patch.clienteId !== undefined) dbPatch.cliente_id = patch.clienteId;
    if (patch.estadoAtual !== undefined) dbPatch.estado_atual = patch.estadoAtual;
    if (patch.handedOffTo !== undefined) dbPatch.handed_off_to = patch.handedOffTo;
    if (patch.handoffReason !== undefined) dbPatch.handoff_reason = patch.handoffReason;
    if (patch.assumedBy !== undefined) dbPatch.assumed_by = patch.assumedBy;
    if (patch.assumedAt !== undefined) dbPatch.assumed_at = patch.assumedAt;
    if (patch.lastMessageAt !== undefined) dbPatch.last_message_at = patch.lastMessageAt;
    if (patch.followupSentAt !== undefined) dbPatch.followup_sent_at = patch.followupSentAt;
    if (patch.reopenedAt !== undefined) dbPatch.reopened_at = patch.reopenedAt;
    if (patch.optOutAt !== undefined) dbPatch.opt_out_at = patch.optOutAt;
    if (patch.noFollowupAt !== undefined) dbPatch.no_followup_at = patch.noFollowupAt;
    if (patch.idioma !== undefined) dbPatch.idioma = patch.idioma;
    if (patch.instanciaId !== undefined) dbPatch.instancia_id = patch.instanciaId;
    if (patch.ambiente !== undefined) dbPatch.ambiente = patch.ambiente;
    if (patch.aguardandoHumanoDesde !== undefined) dbPatch.aguardando_humano_desde = patch.aguardandoHumanoDesde;
    const { data, error } = await this.db.from("conversations").update(dbPatch).eq("id", id).select("*").single();
    if (error) throw error;
    return mapConversation(data as DbConversation);
  }
  async listConversations() {
    const { data } = await this.db.from("conversations").select("*").order("created_at", { ascending: false });
    return ((data as DbConversation[] | null) ?? []).map(mapConversation);
  }

  // Ciclo de status/follow-up automático.
  async updateConversationStatus(id: string, status: Conversation["status"]) {
    await this.db.from("conversations")
      .update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  }
  async updateLastMessageAt(id: string) {
    await this.db.from("conversations")
      .update({ last_message_at: new Date().toISOString() }).eq("id", id);
  }

  // Atendimento humano: só estes dois métodos mexem em assumed_by. Encaminhar para um
  // setor (tool transferir_para_humano) NÃO assume a conversa — a Ana segue atendendo.
  async assumeConversation(id: string, who: string) {
    // Assumir FECHA o relógio da primeira resposta humana: a partir daqui tem gente na
    // conversa, e deixar o SLA correndo faria o caso subir na fila para sempre.
    await this.db.from("conversations")
      .update({ assumed_by: who, assumed_at: new Date().toISOString(), status: "transferred", aguardando_humano_desde: null, updated_at: new Date().toISOString() })
      .eq("id", id);
  }
  async releaseConversation(id: string) {
    await this.db.from("conversations")
      .update({ assumed_by: null, assumed_at: null, status: "active", updated_at: new Date().toISOString() })
      .eq("id", id);
  }
  async markFollowupSent(id: string) {
    await this.db.from("conversations")
      .update({ followup_sent_at: new Date().toISOString() }).eq("id", id);
  }
  async getConversationsForFollowup() {
    // waiting há mais de 24h e sem follow-up enviado ainda.
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data } = await this.db.from("conversations").select("*")
      .eq("status", "waiting").is("followup_sent_at", null).lt("last_message_at", cutoff);
    // Quem pediu para parar sai fora. O corte é em JS, não no SQL, porque o conjunto já
    // é pequeno (waiting, sem follow-up) e assim a rota não quebra num banco que ainda
    // não rodou a migration 016 — sem a coluna os campos vêm null e nada é filtrado.
    return ((data as DbConversation[] | null) ?? []).map(mapConversation)
      .filter((c) => !c.optOutAt && !c.noFollowupAt);
  }
  async marcarOptOut(id: string, tipo: "bloquear" | "sem_followup") {
    const campo = tipo === "bloquear" ? "opt_out_at" : "no_followup_at";
    const { error } = await this.db.from("conversations")
      .update({ [campo]: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", id);
    // Falhar aqui em silêncio seria o pior caso: o cliente pediu para parar e o sistema
    // acharia que registrou. Sobe o erro — quem chama loga e decide.
    if (error) throw error;
  }
  async getInactiveConversations() {
    // waiting cujo follow-up já foi enviado há mais de 24h e ainda sem resposta.
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data } = await this.db.from("conversations").select("*")
      .eq("status", "waiting").not("followup_sent_at", "is", null).lt("followup_sent_at", cutoff);
    return ((data as DbConversation[] | null) ?? []).map(mapConversation);
  }
  async deleteConversation(id: string) {
    // proposals referenciam a conversa SEM cascade — desvincula antes p/ não violar a FK.
    // messages, leads e transfer_tickets caem por ON DELETE CASCADE.
    await this.db.from("proposals").update({ conversation_id: null }).eq("conversation_id", id);
    const { error } = await this.db.from("conversations").delete().eq("id", id);
    if (error) throw error;
  }
  async addMessage(conversationId: string, role: "user" | "assistant", content: string, whatsappMessageId?: string, media?: MessageMedia) {
    const base = { conversation_id: conversationId, role, content, whatsapp_message_id: whatsappMessageId ?? null };
    const comMidia = media
      ? { ...base, media_url: media.url, media_type: media.kind, media_name: media.name, media_text: media.text ?? null }
      : base;

    const { data, error } = await this.db.from("messages").insert(comMidia).select("*").single();
    if (!error) return mapMessage(data as DbMessage);

    // Sem a migration 009 as colunas de mídia não existem e o insert inteiro falharia —
    // a mensagem do cliente seria PERDIDA e ele ficaria sem resposta. Regrava só o texto
    // (que já traz o conteúdo lido do arquivo) e segue o atendimento.
    if (media) {
      console.error("[supabase] insert com mídia falhou, regravando só o texto:", error.message);
      const retry = await this.db.from("messages").insert(base).select("*").single();
      if (!retry.error) return mapMessage(retry.data as DbMessage);
      throw retry.error;
    }
    throw error;
  }
  async setMessageMediaText(messageId: string, text: string) {
    await this.db.from("messages").update({ media_text: text }).eq("id", messageId);
  }
  async listDocuments(opts?: { conversationId?: string; limit?: number }): Promise<DocumentItem[]> {
    let q = this.db.from("messages")
      .select("id, conversation_id, media_url, media_type, media_name, media_text, created_at")
      .not("media_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(opts?.limit ?? 200);
    if (opts?.conversationId) q = q.eq("conversation_id", opts.conversationId);
    const { data } = await q;
    const rows = (data as Array<Record<string, any>> | null) ?? [];
    if (rows.length === 0) return [];

    // Uma segunda query pelos contatos (mesmo padrão de listRecentUserMessages: o
    // formato do embed do PostgREST varia conforme a FK, e clareza vale mais aqui).
    const convIds = Array.from(new Set(rows.map((r) => r.conversation_id)));
    const { data: convs } = await this.db.from("conversations")
      .select("id, contact_name, whatsapp_number").in("id", convIds);
    const byId = new Map(((convs as Array<Record<string, any>> | null) ?? []).map((c) => [c.id, c]));

    return rows.map((r) => ({
      messageId: r.id,
      conversationId: r.conversation_id,
      contactName: byId.get(r.conversation_id)?.contact_name ?? null,
      whatsappNumber: byId.get(r.conversation_id)?.whatsapp_number ?? "",
      url: r.media_url,
      kind: (r.media_type ?? "document") as MediaKind,
      name: r.media_name ?? "documento",
      text: r.media_text ?? null,
      createdAt: r.created_at,
    }));
  }
  async listMessages(conversationId: string) {
    const { data } = await this.db.from("messages").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: true });
    return ((data as DbMessage[] | null) ?? []).map(mapMessage);
  }
  async listMessagesForConversations(conversationIds: string[]): Promise<Map<string, Message[]>> {
    const out = new Map<string, Message[]>();
    if (conversationIds.length === 0) return out;
    const { data } = await this.db
      .from("messages").select("*")
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: true });
    for (const id of conversationIds) out.set(id, []);
    for (const row of (data as DbMessage[] | null) ?? []) {
      const msg = mapMessage(row);
      // A conversa sempre existe no map (pré-populada acima), mas o ?? protege
      // caso o banco devolva uma linha de conversa que não foi pedida.
      (out.get(msg.conversationId) ?? out.set(msg.conversationId, []).get(msg.conversationId)!).push(msg);
    }
    return out;
  }
  async hasWhatsappMessage(whatsappMessageId: string): Promise<boolean> {
    const { data } = await this.db.from("messages").select("id")
      .eq("whatsapp_message_id", whatsappMessageId).maybeSingle();
    return Boolean(data);
  }
  async listRecentUserMessages(limit: number): Promise<ActivityMessage[]> {
    // Duas queries em vez de um join embutido do PostgREST: o formato do embed varia
    // (objeto ou array) conforme a FK, e aqui clareza vale mais que uma ida a menos.
    const { data: rows } = await this.db
      .from("messages")
      .select("id, conversation_id, created_at")
      .eq("role", "user")
      .order("created_at", { ascending: false })
      .limit(limit);

    const msgs = (rows as Array<Pick<DbMessage, "id" | "conversation_id" | "created_at">> | null) ?? [];
    if (msgs.length === 0) return [];

    const convIds = Array.from(new Set(msgs.map((m) => m.conversation_id)));
    const { data: convs } = await this.db
      .from("conversations")
      .select("id, contact_name")
      .in("id", convIds);

    const nameById = new Map<string, string | null>(
      ((convs as Array<Pick<DbConversation, "id" | "contact_name">> | null) ?? []).map((c) => [c.id, c.contact_name]),
    );

    return msgs.map((m) => ({
      id: m.id,
      conversationId: m.conversation_id,
      contactName: nameById.get(m.conversation_id) ?? null,
      createdAt: m.created_at,
    }));
  }
  /** Colunas do lead a partir do patch. Datas de prazo nunca aparecem aqui. */
  private leadRow(patch: Partial<Lead>): Record<string, any> {
    const row: Record<string, any> = {
      updated_at: new Date().toISOString(),
      contact_name: patch.contactName, company_name: patch.companyName, email: patch.email,
      client_type: patch.clientType, services_interested: patch.servicesInterested,
      region: patch.region, contract_duration: patch.contractDuration,
      urgency: patch.urgency, notes: patch.notes,
      // As colunas existem no schema, mas não eram mapeadas: mover um card no
      // Kanban respondia 200 e o stage voltava para 'novo' no próximo reload.
      stage: patch.stage, status: patch.status, score: patch.score, cliente_id: patch.clienteId,
      setor: patch.setor,
      // Imigração — o que a IA lê da conversa. As datas de prazo NÃO estão aqui.
      idioma: patch.idioma, nacionalidade: patch.nacionalidade, localizacao: patch.localizacao,
      pais_exterior: patch.paisExterior,
      entrada_controle_migratorio: patch.entradaControleMigratorio,
      documentos_possui: patch.documentosPossui, documentos_faltantes: patch.documentosFaltantes,
      vinculo_familiar_brasil: patch.vinculoFamiliarBrasil,
      situacao_documental: patch.situacaoDocumental, objetivo: patch.objetivo,
      modalidade_provavel: patch.modalidadeProvavel, resumo: patch.resumo,
      relogio_do_caso: patch.relogioDoCaso, relogio_data: patch.relogioData,
      intencao: patch.intencao,
      tem_prazo_correndo: patch.temPrazoCorrendo, prazo_tipo: patch.prazoTipo,
      classificacao: patch.classificacao,
      atendimento_status: patch.atendimentoStatus, motivo_perda: patch.motivoPerda,
      responsavel_id: patch.responsavelId, assumido_em: patch.assumidoEm,
    };
    Object.keys(row).forEach((k) => row[k] === undefined && delete row[k]);
    return row;
  }

  async upsertLead(conversationId: string, patch: Partial<Lead>) {
    const { data: existing } = await this.db.from("leads").select("*").eq("conversation_id", conversationId).maybeSingle();
    // Caminho do agente: as datas caem fora antes de virar coluna — as de prazo
    // processual e a do relógio do caso, que também é de humano. Ver lib/data/prazo.ts.
    const row = this.leadRow(semCamposSoDeHumano(semCamposDePrazo(patch)));
    row.conversation_id = conversationId;
    // A PRIMEIRA classificação da IA fica guardada à parte, e só na primeira vez: é o
    // denominador da taxa de reclassificação.
    if (row.classificacao && !(existing as any)?.classificacao_ia) row.classificacao_ia = row.classificacao;
    if (existing) {
      const { data, error } = await this.db.from("leads").update(row).eq("id", (existing as { id: string }).id).select("*").single();
      if (error) throw error; return this.mapLead(data);
    }
    const conv = await this.getConversation(conversationId);
    const { data, error } = await this.db.from("leads")
      .insert({ ...row, whatsapp_number: conv?.whatsappNumber ?? "", status: "new" }).select("*").single();
    if (error) throw error; return this.mapLead(data);
  }

  async getLead(id: string) {
    const { data } = await this.db.from("leads").select("*").eq("id", id).maybeSingle();
    return data ? this.mapLead(data) : null;
  }

  async updateLead(id: string, patch: Partial<Lead>) {
    // `classificacao` não passa por aqui: mudá-la é reclassificar, e reclassificar
    // registra o par (de → para) que calibra o agente.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- descartada de propósito
    const { classificacao, ...resto } = semCamposDePrazo(patch);
    const { data, error } = await this.db.from("leads")
      .update(this.leadRow(resto)).eq("id", id).select("*").single();
    if (error) throw error; return this.mapLead(data);
  }

  async confirmarPrazo(
    id: string,
    dados: { tipo: Lead["prazoTipo"]; notificacao?: string | null; limite?: string | null },
    autor: string,
  ) {
    // O único write de data de prazo do sistema — e ele carrega o nome de quem
    // confirmou. O CHECK `leads_prazo_confirmado_ck` (migration 019) garante o mesmo
    // no banco: data sem autor não existe.
    const { data, error } = await this.db.from("leads").update({
      tem_prazo_correndo: true,
      prazo_tipo: dados.tipo ?? null,
      prazo_data_notificacao: dados.notificacao ?? null,
      prazo_data_limite: dados.limite ?? null,
      prazo_confirmado_por: autor,
      prazo_confirmado_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", id).select("*").single();
    if (error) throw error; return this.mapLead(data);
  }

  async assumirLead(id: string, usuarioId: string | null, autor: string) {
    const atual = await this.getLead(id);
    if (!atual) throw new Error("Lead não encontrado.");
    const { data, error } = await this.db.from("leads").update({
      responsavel_id: usuarioId,
      // Só o primeiro a assumir marca o relógio: uma troca de responsável amanhã não
      // pode reiniciar o "tempo até o primeiro contato humano".
      assumido_em: atual.assumidoEm ?? new Date().toISOString(),
      atendimento_status: atual.atendimentoStatus === "novo" ? "em_atendimento" : atual.atendimentoStatus,
      updated_at: new Date().toISOString(),
    }).eq("id", id).select("*").single();
    if (error) throw error;
    await this.registrarAcesso({ autor, acao: "assumiu_lead", alvoTipo: "lead", alvoId: id });
    return this.mapLead(data);
  }

  async reclassificarLead(id: string, para: Classificacao, autor: string, motivo?: string) {
    const atual = await this.getLead(id);
    if (!atual) throw new Error("Lead não encontrado.");
    const de = atual.classificacao ?? null;
    await this.db.from("lead_reclassificacoes").insert({
      lead_id: id, de, para, motivo: motivo ?? null, autor,
    });
    // Resgate = sair do descarte por mão humana. Marcado aqui, e não no clique do
    // botão, para que qualquer caminho de reclassificação alimente a taxa de resgate.
    const resgate = eFiltrada(de) && !eFiltrada(para);
    const patch: Record<string, any> = { classificacao: para, updated_at: new Date().toISOString() };
    if (resgate) { patch.resgatado_em = new Date().toISOString(); patch.resgatado_por = autor; }
    const { data, error } = await this.db.from("leads").update(patch).eq("id", id).select("*").single();
    if (error) throw error; return this.mapLead(data);
  }

  async listReclassificacoes() {
    const { data } = await this.db.from("lead_reclassificacoes").select("*").order("criado_em", { ascending: false });
    return ((data as Record<string, any>[] | null) ?? []).map((r) => ({
      id: r.id, leadId: r.lead_id, de: r.de, para: r.para, motivo: r.motivo,
      autor: r.autor, criadoEm: r.criado_em,
    })) as Reclassificacao[];
  }

  async registrarEventoOperacao(e: Omit<EventoOperacao, "id" | "criadoEm" | "contato">) {
    // NUNCA lança. Isto é chamado de dentro do atendimento, depois de algo já ter dado
    // errado — um erro no registro do erro derrubaria a conversa por causa do log.
    const { error } = await this.db.from("eventos_operacao").insert({
      tipo: e.tipo, conversation_id: e.conversationId ?? null, message_id: e.messageId ?? null,
      media_url: e.mediaUrl ?? null, detalhe: e.detalhe ?? null,
    });
    if (error) console.error("[eventos_operacao]", error.message);
  }

  async listEventosOperacao(opts: { tipo?: TipoEventoOperacao; desde?: string; apenasPendentes?: boolean; limit?: number } = {}) {
    let q = this.db.from("eventos_operacao").select("*").order("criado_em", { ascending: false });
    if (opts.tipo) q = q.eq("tipo", opts.tipo);
    if (opts.desde) q = q.gte("criado_em", opts.desde);
    if (opts.apenasPendentes) q = q.is("resolvido_em", null);
    const { data } = await q.limit(opts.limit ?? 200);
    const linhas = (data as Record<string, any>[] | null) ?? [];

    // O contato vem numa consulta só, e não uma por evento: esta tela é aberta quando
    // algo já está quebrado, e é justamente aí que ela não pode demorar.
    const ids = Array.from(new Set(linhas.map((r) => r.conversation_id).filter(Boolean)));
    const contatos = new Map<string, { nome?: string | null; whatsappNumber?: string | null }>();
    if (ids.length) {
      const { data: convs } = await this.db.from("conversations")
        .select("id, contact_name, whatsapp_number").in("id", ids);
      for (const c of ((convs as Record<string, any>[] | null) ?? [])) {
        contatos.set(c.id, { nome: c.contact_name, whatsappNumber: c.whatsapp_number });
      }
    }

    return linhas.map((r) => ({
      id: r.id, tipo: r.tipo, conversationId: r.conversation_id, messageId: r.message_id,
      mediaUrl: r.media_url, detalhe: r.detalhe, resolvidoEm: r.resolvido_em,
      resolvidoPor: r.resolvido_por, criadoEm: r.criado_em,
      contato: r.conversation_id ? contatos.get(r.conversation_id) ?? null : null,
    })) as EventoOperacao[];
  }

  async resolverEventoOperacao(id: string, quem: string) {
    const { error } = await this.db.from("eventos_operacao")
      .update({ resolvido_em: new Date().toISOString(), resolvido_por: quem }).eq("id", id);
    if (error) throw error;
  }

  async ultimaMensagemPorInstancia() {
    // Duas consultas curtas em vez de um join: as mensagens recentes, e a instância de
    // cada conversa que apareceu nelas. Uma instância sem mensagem recente simplesmente
    // não aparece no mapa — e a tela mostra "nenhuma nas últimas 500", que é a verdade.
    const { data } = await this.db
      .from("messages")
      .select("conversation_id, created_at")
      .eq("role", "user")
      .order("created_at", { ascending: false })
      .limit(500);
    const linhas = (data as Record<string, any>[] | null) ?? [];
    if (!linhas.length) return {};

    const ids = Array.from(new Set(linhas.map((m) => m.conversation_id)));
    const { data: convs } = await this.db
      .from("conversations")
      .select("id, instancia_id")
      .in("id", ids);
    const instanciaDe = new Map(
      ((convs as Record<string, any>[] | null) ?? []).map((c) => [c.id as string, c.instancia_id as string | null]),
    );

    const saida: Record<string, string> = {};
    for (const m of linhas) {
      const inst = instanciaDe.get(m.conversation_id);
      if (!inst) continue;
      const atual = saida[inst];
      if (!atual || m.created_at > atual) saida[inst] = m.created_at;
    }
    return saida;
  }

  async registrarChamadaLlm(c: Omit<ChamadaLlm, "id" | "criadoEm">) {
    // NUNCA lança: contabilizar o custo de uma chamada não pode derrubar o atendimento
    // que a fez. Um custo perdido é um número; uma conversa perdida é uma pessoa.
    const { error } = await this.db.from("chamadas_llm").insert({
      provedor: c.provedor, modelo: c.modelo, tipo: c.tipo,
      conversation_id: c.conversationId ?? null,
      tokens_entrada: c.tokensEntrada, tokens_saida: c.tokensSaida,
      segundos: c.segundos ?? null, custo_usd: c.custoUsd,
      preco_conhecido: c.precoConhecido, duracao_ms: c.duracaoMs ?? null,
      ok: c.ok, erro: c.erro ?? null,
    });
    if (error) console.error("[chamadas_llm]", error.message);
  }

  async listChamadasLlm(opts: { desde?: string; provedor?: string; limit?: number } = {}) {
    let q = this.db.from("chamadas_llm").select("*").order("criado_em", { ascending: false });
    if (opts.desde) q = q.gte("criado_em", opts.desde);
    if (opts.provedor) q = q.eq("provedor", opts.provedor);
    const { data } = await q.limit(opts.limit ?? 5000);
    return ((data as Record<string, any>[] | null) ?? []).map((r) => ({
      id: r.id, provedor: r.provedor, modelo: r.modelo, tipo: r.tipo,
      conversationId: r.conversation_id,
      tokensEntrada: r.tokens_entrada ?? 0, tokensSaida: r.tokens_saida ?? 0,
      segundos: r.segundos === null ? null : Number(r.segundos),
      custoUsd: Number(r.custo_usd ?? 0), precoConhecido: r.preco_conhecido !== false,
      duracaoMs: r.duracao_ms, ok: r.ok !== false, erro: r.erro, criadoEm: r.criado_em,
    })) as ChamadaLlm[];
  }

  async contarConversasSemResposta(minutos: number, agora: Date = new Date()) {
    // A REGRA NÃO É REESCRITA EM SQL. Ela mora em lib/operacao/sem-resposta.ts, testada,
    // e os dois repositórios a chamam — senão a versão do Postgres e a da memória
    // divergem no primeiro ajuste, e só uma delas está sob teste.
    //
    // A janela é o que segura o custo: uma mensagem parada há mais de um dia não é mais
    // "entrou e travou agora", é trabalho atrasado, e esse já aparece na fila.
    const desde = new Date(agora.getTime() - 24 * 3600_000).toISOString();
    const { data } = await this.db
      .from("messages")
      .select("conversation_id, role, created_at")
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(2000);

    const mensagens = ((data as Record<string, any>[] | null) ?? []).map((m) => ({
      conversationId: m.conversation_id as string,
      role: m.role as "user" | "assistant",
      createdAt: m.created_at as string,
    }));
    if (!mensagens.length) return 0;

    const ids = Array.from(new Set(mensagens.map((m) => m.conversationId)));
    const { data: convs } = await this.db
      .from("conversations")
      .select("id, assumed_by, opt_out_at")
      .in("id", ids);
    const ignorar = new Set(
      ((convs as Record<string, any>[] | null) ?? [])
        .filter((c) => c.assumed_by || c.opt_out_at)
        .map((c) => c.id as string),
    );

    return conversasSemResposta(mensagens, { minutos, agora, ignorar }).length;
  }

  async criarLembrete(l: { leadId: string; quando: string; nota: string; autor: string }) {
    const { data, error } = await this.db.from("lembretes")
      .insert({ lead_id: l.leadId, quando: l.quando, nota: l.nota, autor: l.autor })
      .select("*").single();
    if (error) throw error;
    return { id: data.id, leadId: data.lead_id, quando: data.quando, nota: data.nota,
      autor: data.autor, feitoEm: data.feito_em, feitoPor: data.feito_por, criadoEm: data.criado_em } as Lembrete;
  }

  async listLembretes(opts: { leadId?: string; apenasPendentes?: boolean } = {}) {
    let q = this.db.from("lembretes").select("*").order("quando", { ascending: true });
    if (opts.leadId) q = q.eq("lead_id", opts.leadId);
    if (opts.apenasPendentes) q = q.is("feito_em", null);
    const { data } = await q;
    return ((data as Record<string, any>[] | null) ?? []).map((r) => ({
      id: r.id, leadId: r.lead_id, quando: r.quando, nota: r.nota, autor: r.autor,
      feitoEm: r.feito_em, feitoPor: r.feito_por, criadoEm: r.criado_em,
    })) as Lembrete[];
  }

  async concluirLembrete(id: string, quem: string) {
    const { error } = await this.db.from("lembretes")
      .update({ feito_em: new Date().toISOString(), feito_por: quem }).eq("id", id);
    if (error) throw error;
  }

  async registrarAcesso(entry: Omit<AccessLogEntry, "id" | "criadoEm">) {
    // Falha de log não pode derrubar o atendimento: se a tabela ainda não existe (banco
    // sem a migration 019), o painel continua funcionando e o erro aparece no console.
    const { error } = await this.db.from("access_log").insert({
      autor: entry.autor, papel: entry.papel ?? null, acao: entry.acao,
      alvo_tipo: entry.alvoTipo ?? null, alvo_id: entry.alvoId ?? null,
      detalhe: entry.detalhe ?? null, ip: entry.ip ?? null,
    });
    if (error) console.error("[access_log]", error.message);
  }

  async listAcessos(limit = 200) {
    const { data } = await this.db.from("access_log").select("*").order("criado_em", { ascending: false }).limit(limit);
    return ((data as Record<string, any>[] | null) ?? []).map((r) => ({
      id: r.id, autor: r.autor, papel: r.papel, acao: r.acao, alvoTipo: r.alvo_tipo,
      alvoId: r.alvo_id, detalhe: r.detalhe, ip: r.ip, criadoEm: r.criado_em,
    })) as AccessLogEntry[];
  }

  async purgarDescartados(dias: number) {
    const corte = new Date(Date.now() - dias * 86_400_000).toISOString();
    const { data, error } = await this.db.from("leads").delete()
      .in("classificacao", ["DPU", "CURIOSO", "FORA_ESCOPO"])
      .is("resgatado_em", null)
      .lte("updated_at", corte)
      .select("id");
    if (error) throw error;
    return ((data as unknown[] | null) ?? []).length;
  }
  private mapLead(r: Record<string, any>): Lead {
    return {
      id: r.id, conversationId: r.conversation_id, contactName: r.contact_name, companyName: r.company_name,
      whatsappNumber: r.whatsapp_number, email: r.email, clientType: r.client_type,
      servicesInterested: r.services_interested, region: r.region,
      contractDuration: r.contract_duration, status: r.status,
      urgency: r.urgency, notes: r.notes, createdAt: r.created_at, updatedAt: r.updated_at,
      // Antes era `stage: "novo", score: 0` fixo — o valor do banco era ignorado
      // na leitura, então mesmo gravando corretamente o Kanban não refletiria.
      clienteId: r.cliente_id ?? undefined,
      stage: r.stage ?? "novo", score: r.score ?? 0, setor: r.setor ?? null,
      idioma: r.idioma ?? null, nacionalidade: r.nacionalidade ?? null,
      localizacao: r.localizacao ?? null, paisExterior: r.pais_exterior ?? null,
      entradaControleMigratorio: r.entrada_controle_migratorio ?? null,
      documentosPossui: r.documentos_possui ?? null,
      documentosFaltantes: r.documentos_faltantes ?? null,
      vinculoFamiliarBrasil: r.vinculo_familiar_brasil ?? null,
      situacaoDocumental: r.situacao_documental ?? null,
      objetivo: r.objetivo ?? null, modalidadeProvavel: r.modalidade_provavel ?? null,
      resumo: r.resumo ?? null,
      relogioDoCaso: r.relogio_do_caso ?? null, relogioData: r.relogio_data ?? null,
      intencao: r.intencao ?? null,
      temPrazoCorrendo: r.tem_prazo_correndo ?? false, prazoTipo: r.prazo_tipo ?? null,
      prazoDataNotificacao: r.prazo_data_notificacao ?? null,
      prazoDataLimite: r.prazo_data_limite ?? null,
      prazoConfirmadoPor: r.prazo_confirmado_por ?? null,
      prazoConfirmadoEm: r.prazo_confirmado_em ?? null,
      classificacao: r.classificacao ?? null, classificacaoIa: r.classificacao_ia ?? null,
      atendimentoStatus: r.atendimento_status ?? "novo", motivoPerda: r.motivo_perda ?? null,
      responsavelId: r.responsavel_id ?? null, assumidoEm: r.assumido_em ?? null,
      resgatadoEm: r.resgatado_em ?? null, resgatadoPor: r.resgatado_por ?? null,
    };
  }
  async getLeadByConversation(conversationId: string) {
    const { data } = await this.db.from("leads").select("*").eq("conversation_id", conversationId).maybeSingle();
    return data ? this.mapLead(data) : null;
  }
  async listLeads(opcoes: { limite?: number } = {}) {
    let q = this.db.from("leads").select("*").order("created_at", { ascending: false });
    if (opcoes.limite && opcoes.limite > 0) q = q.limit(opcoes.limite);
    const { data } = await q;
    return ((data as Record<string, any>[] | null) ?? []).map((r) => this.mapLead(r));
  }
  async contarLeads() {
    const { count } = await this.db.from("leads").select("id", { count: "exact", head: true });
    return count ?? 0;
  }

  async listConversationsByIds(ids: string[]): Promise<Conversation[]> {
    if (!ids.length) return [];
    const { data } = await this.db.from("conversations").select("*").in("id", ids);
    return ((data as DbConversation[] | null) ?? []).map(mapConversation);
  }

  /**
   * A fila, montada no banco. Ver a documentação do método na interface — em especial a
   * regra que manda em tudo aqui: os leads COM PRAZO vêm todos, sempre, sem teto.
   *
   * A conversa entra por `!inner` porque a fila de trabalho exclui ENSAIO, e o ambiente
   * mora na conversa. Fazer esse corte depois de contar era o que produzia o "42 de 43":
   * o denominador vinha da tabela inteira e o numerador já estava filtrado.
   *
   * O BLOCO 3 É DEFINIDO POR EXCLUSÃO DOS IDS COM PRAZO, e não por um filtro invertido.
   * Escrever "não tem prazo" em PostgREST parece trivial e não é: `neq('classificacao',
   * 'QUENTE_PRAZO')` descarta as linhas em que a coluna é NULL — que são a maioria —, e
   * `is(false)` não pega os NULL de `tem_prazo_correndo`. As duas armadilhas somem quando
   * o complemento é feito por id, e a lista de ids é pequena por definição: são os casos
   * com prazo, que já foram carregados inteiros na consulta ao lado.
   */
  async listLeadsDaFila(opcoes: { pagina: number; porPagina: number }) {
    const FILTRADAS = ["CURIOSO", "DPU", "FORA_ESCOPO"];
    const ENCERRADOS = ["fechado", "perdido"];
    // Um lead entra no bloco de prazo por qualquer um dos três caminhos — o booleano da
    // IA, a classificação, ou a data já confirmada por uma pessoa. Aceitar os três evita
    // o caso em que um deles sozinho faria o caso sumir dos dois blocos.
    const COM_PRAZO =
      "tem_prazo_correndo.is.true,classificacao.eq.QUENTE_PRAZO,prazo_data_limite.not.is.null";

    /** O recorte comum: operação real, não filtrada, não encerrada. */
    const daFila = (colunas = "*, conversations!inner(ambiente,whatsapp_number)", contar = false) =>
      this.db
        .from("leads")
        .select(colunas, contar ? { count: "exact", head: true } : undefined)
        .not("conversations.ambiente", "eq", "teste")
        .not("conversations.whatsapp_number", "like", "sim:%")
        .not("classificacao", "in", `(${FILTRADAS.join(",")})`)
        .not("atendimento_status", "in", `(${ENCERRADOS.join(",")})`);

    const { data: brutosComPrazo } = await daFila().or(COM_PRAZO);
    const comPrazo = ((brutosComPrazo as Record<string, any>[] | null) ?? []).map((r) =>
      this.mapLead(r),
    );
    const idsComPrazo = comPrazo.map((l) => l.id);
    const foraDoPrazo = <T>(q: T): T =>
      idsComPrazo.length
        ? ((q as any).not("id", "in", `(${idsComPrazo.join(",")})`) as T)
        : q;

    const inicio = Math.max(0, (opcoes.pagina - 1) * opcoes.porPagina);

    const [normal, contagemNormal, contagemFiltradas] = await Promise.all([
      // A ordem é a da fila: mais parado primeiro. `updated_at` é o carimbo que se move a
      // cada turno da conversa, então é ele que responde "há quanto tempo isto parou" sem
      // precisar de uma segunda tabela na consulta.
      foraDoPrazo(daFila())
        .order("updated_at", { ascending: true })
        .range(inicio, inicio + opcoes.porPagina - 1),
      foraDoPrazo(daFila("id, conversations!inner(ambiente,whatsapp_number)", true)),
      this.db
        .from("leads")
        .select("id", { count: "exact", head: true })
        .in("classificacao", FILTRADAS),
    ]);

    return {
      comPrazo,
      normal: ((normal.data as Record<string, any>[] | null) ?? []).map((r) => this.mapLead(r)),
      totalNormal: contagemNormal.count ?? 0,
      totalFiltradas: contagemFiltradas.count ?? 0,
    };
  }

  async deleteLead(id: string) {
    const { error } = await this.db.from("leads").delete().eq("id", id);
    if (error) throw error;
  }
  async scheduleFollowup(conversationId: string, message: string, scheduledAt: string) {
    const { data, error } = await this.db.from("followup_queue")
      .insert({ conversation_id: conversationId, message, scheduled_at: scheduledAt }).select("*").single();
    if (error) throw error;
    return { id: data.id, conversationId: data.conversation_id, scheduledAt: data.scheduled_at,
      message: data.message, status: data.status, attempt: data.attempt, createdAt: data.created_at } as Followup;
  }
  async listPendingFollowups() {
    const { data } = await this.db.from("followup_queue").select("*").eq("status", "pending");
    return ((data as Record<string, any>[] | null) ?? []).map((r) => ({ id: r.id, conversationId: r.conversation_id, scheduledAt: r.scheduled_at,
      message: r.message, status: r.status, attempt: r.attempt, createdAt: r.created_at })) as Followup[];
  }
  async updateFollowupStatus(id: string, status: FollowupStatus) {
    await this.db.from("followup_queue").update({ status }).eq("id", id);
  }
  async cancelPendingFollowups(conversationId: string) {
    await this.db.from("followup_queue").update({ status: "cancelled" }).eq("conversation_id", conversationId).eq("status", "pending");
  }
  async getConfig<T = unknown>(key: string) {
    const { data } = await this.db.from("agent_config").select("value").eq("key", key).maybeSingle();
    return ((data?.value as T) ?? null);
  }
  async setConfig(key: string, value: unknown) {
    await this.db.from("agent_config").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  }

  /* ---------------------------------------------------------------- */
  /* ATIVAÇÃO — instâncias                                             */
  /* ---------------------------------------------------------------- */

  async listInstancias() {
    const { data } = await this.db.from("zapi_instancias").select("*").order("criado_em", { ascending: true });
    return ((data as Record<string, any>[] | null) ?? []).map(mapInstancia);
  }
  async getInstancia(id: string) {
    const { data } = await this.db.from("zapi_instancias").select("*").eq("id", id).maybeSingle();
    return data ? mapInstancia(data as Record<string, any>) : null;
  }
  async getInstanciaPorInstanceId(instanceId: string) {
    const { data } = await this.db.from("zapi_instancias").select("*").eq("instance_id", instanceId).maybeSingle();
    return data ? mapInstancia(data as Record<string, any>) : null;
  }
  async criarInstancia(dados: { nome: string; instanceId: string; token: string; clientToken?: string | null; baseUrl?: string }) {
    // Note que `ambiente` e `ativo` NÃO são enviados. Mesmo que fossem, o trigger
    // zapi_instancia_nasce_desligada os reescreveria — a trava é do banco, não daqui.
    const { data, error } = await this.db.from("zapi_instancias").insert({
      nome: dados.nome, instance_id: dados.instanceId, token: dados.token,
      client_token: dados.clientToken ?? null,
      base_url: dados.baseUrl || "https://api.z-api.io",
    }).select("*").single();
    if (error) throw error;
    return mapInstancia(data as Record<string, any>);
  }
  async atualizarInstancia(id: string, patch: Record<string, any>) {
    const db: Record<string, any> = { atualizado_em: new Date().toISOString() };
    if (patch.nome !== undefined) db.nome = patch.nome;
    if (patch.instanceId !== undefined) db.instance_id = patch.instanceId;
    if (patch.token !== undefined) db.token = patch.token;
    if (patch.clientToken !== undefined) db.client_token = patch.clientToken;
    if (patch.baseUrl !== undefined) db.base_url = patch.baseUrl;
    if (patch.ambiente !== undefined) db.ambiente = patch.ambiente;
    if (patch.modoDesligado !== undefined) db.modo_desligado = patch.modoDesligado;
    if (patch.respostaFixa !== undefined) db.resposta_fixa = patch.respostaFixa;
    if (patch.slaMinutos !== undefined) db.sla_minutos = patch.slaMinutos;
    // `ativo` não aparece nesta lista de propósito: quem liga é definirAtivacaoInstancia,
    // que exige o autor. Um "salvar configurações" não pode ligar produção de raspão.
    const { data, error } = await this.db.from("zapi_instancias").update(db).eq("id", id).select("*").single();
    if (error) throw error;
    return mapInstancia(data as Record<string, any>);
  }
  async definirAtivacaoInstancia(id: string, ativo: boolean, autor: string) {
    const { data, error } = await this.db.from("zapi_instancias").update({
      ativo,
      ativado_por: ativo ? autor : null,
      ativado_em: ativo ? new Date().toISOString() : null,
      atualizado_em: new Date().toISOString(),
    }).eq("id", id).select("*").single();
    if (error) throw error;
    return mapInstancia(data as Record<string, any>);
  }
  async excluirInstancia(id: string) {
    const { error } = await this.db.from("zapi_instancias").delete().eq("id", id);
    if (error) throw error;
  }

  /* ---------------------------------------------------------------- */
  /* MODO SOMBRA — rascunhos                                           */
  /* ---------------------------------------------------------------- */

  async criarRascunho(r: { conversationId: string; messageId?: string | null; texto: string; botoes?: Array<{ id: string; label: string }> | null }) {
    // NUNCA lança: isto roda dentro do atendimento. Se a gravação do rascunho falhar, o
    // que não pode acontecer é a mensagem do cliente se perder junto — ela já está salva.
    const { data, error } = await this.db.from("rascunhos_agente").insert({
      conversation_id: r.conversationId, message_id: r.messageId ?? null,
      texto: r.texto, botoes: r.botoes ?? null,
    }).select("*").single();
    if (error) { console.error("[rascunhos_agente]", error.message); return null; }
    return mapRascunho(data as Record<string, any>);
  }

  async listRascunhos(opts: { conversationId?: string; status?: RascunhoStatus; limit?: number } = {}) {
    let q = this.db.from("rascunhos_agente").select("*").order("criado_em", { ascending: false });
    if (opts.conversationId) q = q.eq("conversation_id", opts.conversationId);
    if (opts.status) q = q.eq("status", opts.status);
    const { data } = await q.limit(opts.limit ?? 200);
    const linhas = ((data as Record<string, any>[] | null) ?? []).map(mapRascunho);

    // O contato numa consulta só, não uma por rascunho — a fila de sombra é uma lista.
    const ids = Array.from(new Set(linhas.map((l) => l.conversationId)));
    if (!ids.length) return linhas;
    const { data: convs } = await this.db.from("conversations")
      .select("id, contact_name, whatsapp_number").in("id", ids);
    const contatos = new Map<string, { nome?: string | null; whatsappNumber?: string | null }>();
    for (const c of ((convs as Record<string, any>[] | null) ?? [])) {
      contatos.set(c.id, { nome: c.contact_name, whatsappNumber: c.whatsapp_number });
    }
    return linhas.map((l) => ({ ...l, contato: contatos.get(l.conversationId) ?? null }));
  }

  async getRascunho(id: string) {
    const { data } = await this.db.from("rascunhos_agente").select("*").eq("id", id).maybeSingle();
    return data ? mapRascunho(data as Record<string, any>) : null;
  }

  async decidirRascunho(
    id: string,
    decisao: { status: "enviado" | "descartado"; textoEnviado?: string | null; motivo?: string | null },
    autor: string,
  ) {
    // O `.eq("status","pendente")` é a trava contra o clique duplo: se outro atendente
    // já decidiu, o UPDATE não casa com nenhuma linha e a rota não envia nada.
    const { data, error } = await this.db.from("rascunhos_agente").update({
      status: decisao.status,
      texto_enviado: decisao.textoEnviado ?? null,
      motivo: decisao.motivo ?? null,
      decidido_por: autor,
      decidido_em: new Date().toISOString(),
    }).eq("id", id).eq("status", "pendente").select("*").maybeSingle();
    if (error) throw error;
    return data ? mapRascunho(data as Record<string, any>) : null;
  }
  async upsertCliente(patch: Partial<Cliente> & { id?: string }): Promise<Cliente> {
    let existing: Record<string, any> | null = null;
    if (patch.id) {
      const { data } = await this.db.from("clientes").select("*").eq("id", patch.id).maybeSingle();
      existing = data;
    } else if (patch.cpf) {
      const { data } = await this.db.from("clientes").select("*").eq("cpf", patch.cpf).maybeSingle();
      existing = data;
    }
    const row: Record<string, any> = {
      nome: patch.nome, cpf: patch.cpf, empresa: patch.empresa, email: patch.email,
      telefone: patch.telefone, cidade: patch.cidade,
    };
    Object.keys(row).forEach((k) => row[k] === undefined && delete row[k]);
    if (existing) {
      const { data, error } = await this.db.from("clientes").update(row).eq("id", existing.id).select("*").single();
      if (error) throw error;
      return mapCliente(data);
    }
    const { data, error } = await this.db.from("clientes").insert(row).select("*").single();
    if (error) throw error;
    return mapCliente(data);
  }
  async getCliente(id: string) {
    const { data } = await this.db.from("clientes").select("*").eq("id", id).maybeSingle();
    return data ? mapCliente(data) : null;
  }
  async listClientes() {
    const { data } = await this.db.from("clientes").select("*").order("created_at", { ascending: false });
    return ((data as Record<string, any>[] | null) ?? []).map(mapCliente);
  }
  async updateCliente(id: string, patch: Partial<Cliente>): Promise<Cliente> {
    const row: Record<string, any> = {
      nome: patch.nome, cpf: patch.cpf, empresa: patch.empresa, email: patch.email,
      telefone: patch.telefone, cidade: patch.cidade,
    };
    Object.keys(row).forEach((k) => row[k] === undefined && delete row[k]);
    const { data, error } = await this.db.from("clientes").update(row).eq("id", id).select("*").single();
    if (error) throw error;
    return mapCliente(data);
  }
  async deleteCliente(id: string): Promise<void> {
    const { error } = await this.db.from("clientes").delete().eq("id", id);
    if (error) throw error;
  }

  async setEstado(conversationId: string, estado: FlowStateId) {
    await this.db.from("conversations").update({ estado_atual: estado }).eq("id", conversationId);
  }
  async setHandoff(conversationId: string, to: string, reason: string) {
    await this.db.from("conversations")
      .update({ handed_off_to: to, handoff_reason: reason, status: "transferred" })
      .eq("id", conversationId);
  }

  async createTransferTicket(data: Omit<TransferTicket, "id" | "createdAt">) {
    const { data: row, error } = await this.db.from("transfer_tickets").insert({
      conversation_id: data.conversationId, cliente_id: data.clienteId ?? null,
      reason: data.reason, priority: data.priority, dossie: data.dossie,
    }).select("*").single();
    if (error) throw error;
    return mapTransferTicket(row);
  }
  async listTransferTickets() {
    const { data } = await this.db.from("transfer_tickets").select("*").order("created_at", { ascending: false }).limit(500);
    return ((data as Record<string, any>[] | null) ?? []).map(mapTransferTicket);
  }
  async listTransferTicketsByConversation(conversationId: string) {
    const { data } = await this.db.from("transfer_tickets").select("*")
      .eq("conversation_id", conversationId).order("created_at", { ascending: false });
    return ((data as Record<string, any>[] | null) ?? []).map(mapTransferTicket);
  }

  async getUserByEmail(email: string) {
    // eq() e não ilike(): em ilike, '%' e '_' do input são curingas, então um
    // e-mail como "a%@x.com" casaria com contas de terceiros. E-mails são
    // sempre gravados em minúsculas, então a comparação exata basta.
    const { data } = await this.db.from("users").select("*").eq("email", email.toLowerCase().trim()).maybeSingle();
    return data ? mapUser(data) : null;
  }
  async createUser(data: { email: string; passwordHash: string; name?: string; role?: User["role"]; setor?: string | null }) {
    const row: Record<string, any> = {
      email: data.email.toLowerCase().trim(), password_hash: data.passwordHash,
      // Default 'user', não 'admin': quem precisa de admin pede explicitamente.
      name: data.name ?? null, role: data.role ?? "user",
    };
    // `setor` só entra no insert quando há um valor. Enquanto a migration 010 não
    // roda, mandar a chave com null já derrubava o insert inteiro ("column
    // 'setor' does not exist") — e nenhum usuário era criado, nem admin.
    if (data.setor) row.setor = data.setor;

    const { data: created, error } = await this.db.from("users").insert(row).select("*").single();
    if (error) throw error;
    return mapUser(created);
  }
  async updateUserPassword(id: string, passwordHash: string): Promise<void> {
    const { error } = await this.db.from("users").update({ password_hash: passwordHash }).eq("id", id);
    if (error) throw error;
  }
  async listUsers(): Promise<Array<Omit<User, "passwordHash">>> {
    // select("*") em vez da lista explícita de colunas: assim a consulta não
    // quebra em bancos que ainda não rodaram a migration 010 (sem `setor`). O
    // password_hash nunca sai daqui — o map abaixo simplesmente não o copia.
    const { data, error } = await this.db.from("users").select("*").order("created_at", { ascending: false });
    // Propaga o erro em vez de devolver lista vazia: `hasAnyUser()` usa este
    // método para decidir se /setup ainda está aberto, e uma falha lida como
    // "nenhum usuário existe" reabriria o cadastro do primeiro admin.
    if (error) throw error;
    return ((data as Record<string, any>[] | null) ?? []).map((r) => ({
      id: r.id, email: r.email, name: r.name ?? undefined, role: r.role,
      setor: r.setor ?? null, active: r.active, createdAt: r.created_at,
    }));
  }
}
