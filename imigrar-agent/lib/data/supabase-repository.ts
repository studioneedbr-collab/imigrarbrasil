/* eslint-disable @typescript-eslint/no-explicit-any -- rows come from untyped Supabase query results; mapped explicitly below */
import type { Repository } from "@/lib/data/repository";
import type { Conversation, Message, MessageMedia, DocumentItem, MediaKind, Lead, Proposal, Followup, ServiceCatalogItem, ProposalStatus, ProposalEmailStatus, FollowupStatus, Cliente, FlowStateId, TransferTicket, User, Funcionario } from "@/lib/domain/types";
import type { DbConversation, DbMessage } from "@/lib/supabase/types";
import { createServerClient } from "@/lib/supabase/client";
import type { PricingParams } from "@/lib/agent/pricing-params";
import type { ActivityMessage } from "@/lib/notifications/new-messages";

const mapFunctionPricing = (r: Record<string, any>): PricingParams => ({
  functionName: r.function_name, baseSalary: Number(r.base_salary),
  schedule: r.schedule,
  beneficios: r.beneficios != null ? Number(r.beneficios) : undefined,
  uniformeMes: Number(r.uniforme_mes),
  equipamentosFunc: Number(r.equipamentos_func), materialFunc: Number(r.material_func),
  priceConfirmed: Boolean(r.price_confirmed),
});

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
const mapFuncionario = (r: Record<string, any>): Funcionario => ({
  id: r.id, nome: r.nome, cpf: r.cpf ?? undefined, cargo: r.cargo ?? undefined, setor: r.setor ?? undefined,
  telefone: r.telefone ?? undefined, email: r.email ?? undefined, active: r.active, createdAt: r.created_at,
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

    // upsert e não insert: duas mensagens do mesmo número chegando juntas caíam
    // ambas aqui e a segunda violava o unique de whatsapp_number — o webhook
    // engolia a exceção e a mensagem do cliente era perdida.
    const { data, error } = await this.db.from("conversations")
      .upsert(
        { whatsapp_number: whatsappNumber, contact_name: contactName ?? null },
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
  // setor (tool transferir_para_humano) NÃO assume a conversa — a Shayene segue atendendo.
  async assumeConversation(id: string, who: string) {
    await this.db.from("conversations")
      .update({ assumed_by: who, assumed_at: new Date().toISOString(), status: "transferred", updated_at: new Date().toISOString() })
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
  async upsertLead(conversationId: string, patch: Partial<Lead>) {
    const { data: existing } = await this.db.from("leads").select("*").eq("conversation_id", conversationId).maybeSingle();
    const row: Record<string, any> = {
      conversation_id: conversationId, updated_at: new Date().toISOString(),
      contact_name: patch.contactName, company_name: patch.companyName, email: patch.email,
      client_type: patch.clientType, services_interested: patch.servicesInterested,
      employees_needed: patch.employeesNeeded, region: patch.region, contract_duration: patch.contractDuration,
      estimated_value: patch.estimatedValue, urgency: patch.urgency, notes: patch.notes,
      // As colunas existem no schema, mas não eram mapeadas: mover um card no
      // Kanban respondia 200 e o stage voltava para 'novo' no próximo reload.
      stage: patch.stage, status: patch.status, score: patch.score, cliente_id: patch.clienteId,
      schedule: patch.schedule, setor: patch.setor,
    };
    Object.keys(row).forEach((k) => row[k] === undefined && delete row[k]);
    if (existing) {
      const { data, error } = await this.db.from("leads").update(row).eq("id", (existing as { id: string }).id).select("*").single();
      if (error) throw error; return this.mapLead(data);
    }
    const conv = await this.getConversation(conversationId);
    const { data, error } = await this.db.from("leads")
      .insert({ ...row, whatsapp_number: conv?.whatsappNumber ?? "", status: "new" }).select("*").single();
    if (error) throw error; return this.mapLead(data);
  }
  private mapLead(r: Record<string, any>): Lead {
    return {
      id: r.id, conversationId: r.conversation_id, contactName: r.contact_name, companyName: r.company_name,
      whatsappNumber: r.whatsapp_number, email: r.email, clientType: r.client_type,
      servicesInterested: r.services_interested, employeesNeeded: r.employees_needed, region: r.region,
      contractDuration: r.contract_duration, estimatedValue: r.estimated_value, status: r.status,
      urgency: r.urgency, notes: r.notes, createdAt: r.created_at, updatedAt: r.updated_at,
      // Antes era `stage: "novo", score: 0` fixo — o valor do banco era ignorado
      // na leitura, então mesmo gravando corretamente o Kanban não refletiria.
      clienteId: r.cliente_id ?? undefined, schedule: r.schedule ?? undefined,
      stage: r.stage ?? "novo", score: r.score ?? 0, setor: r.setor ?? null,
    };
  }
  async getLeadByConversation(conversationId: string) {
    const { data } = await this.db.from("leads").select("*").eq("conversation_id", conversationId).maybeSingle();
    return data ? this.mapLead(data) : null;
  }
  async listLeads() {
    const { data } = await this.db.from("leads").select("*").order("created_at", { ascending: false });
    return ((data as Record<string, any>[] | null) ?? []).map((r) => this.mapLead(r));
  }
  async deleteLead(id: string) {
    const { error } = await this.db.from("leads").delete().eq("id", id);
    if (error) throw error;
  }
  async createProposal(d: Omit<Proposal, "id" | "createdAt" | "status"> & { status?: ProposalStatus }) {
    const { data, error } = await this.db.from("proposals").insert({
      lead_id: d.leadId ?? null, conversation_id: d.conversationId ?? null, pdf_url: d.pdfUrl ?? null,
      services: d.services, total_value: d.totalValue, cost_breakdown: d.costBreakdown ?? null, status: d.status ?? "sent",
    }).select("*").single();
    if (error) throw error;
    return { id: data.id, leadId: data.lead_id, conversationId: data.conversation_id, pdfUrl: data.pdf_url,
      services: data.services, totalValue: data.total_value, costBreakdown: data.cost_breakdown,
      status: data.status, emailStatus: data.email_status ?? "nao_enviado", createdAt: data.created_at } as Proposal;
  }
  async updateProposalStatus(id: string, status: ProposalStatus) {
    await this.db.from("proposals").update({ status }).eq("id", id);
  }
  async updateProposalEmailStatus(id: string, emailStatus: ProposalEmailStatus) {
    await this.db.from("proposals").update({ email_status: emailStatus }).eq("id", id);
  }
  async getProposal(id: string): Promise<Proposal | null> {
    // Busca direta pelo id. Antes a rota /api/proposal/[id] carregava a tabela
    // inteira e filtrava em JS — com os PDFs em base64, servir um arquivo
    // significava transferir todos eles do Postgres.
    const { data } = await this.db.from("proposals").select("*").eq("id", id).maybeSingle();
    if (!data) return null;
    const r = data as Record<string, any>;
    return { id: r.id, leadId: r.lead_id, conversationId: r.conversation_id, pdfUrl: r.pdf_url,
      services: r.services, totalValue: r.total_value, costBreakdown: r.cost_breakdown,
      status: r.status, emailStatus: r.email_status ?? "nao_enviado", createdAt: r.created_at } as Proposal;
  }
  async listProposals() {
    // pdf_url fica FORA do select: é um data-URL base64 de 50-200KB por linha, e
    // a listagem do painel não usa o conteúdo do PDF — só o link para /api/proposal/[id].
    const { data } = await this.db.from("proposals")
      .select("id, lead_id, conversation_id, services, total_value, cost_breakdown, status, email_status, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    return ((data as Record<string, any>[] | null) ?? []).map((r) => ({ id: r.id, leadId: r.lead_id, conversationId: r.conversation_id,
      pdfUrl: undefined, services: r.services, totalValue: r.total_value, costBreakdown: r.cost_breakdown,
      status: r.status, emailStatus: r.email_status ?? "nao_enviado", createdAt: r.created_at })) as Proposal[];
  }
  async deleteProposal(id: string) {
    const { error } = await this.db.from("proposals").delete().eq("id", id);
    if (error) throw error;
  }
  async hasProposalForConversation(conversationId: string): Promise<boolean> {
    // Só o id, e no máximo uma linha: isto roda em toda tentativa de encaminhar para o
    // comercial, e listProposals() traria 500 linhas para responder um sim/não.
    const { data } = await this.db.from("proposals")
      .select("id").eq("conversation_id", conversationId).limit(1);
    return ((data as unknown[] | null) ?? []).length > 0;
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
  async listServices() {
    const { data } = await this.db.from("services_catalog").select("*").eq("active", true);
    return ((data as Record<string, any>[] | null) ?? []).map((r) => ({ id: r.id, name: r.name, category: r.category,
      baseSalary: r.base_salary, costPerEmployee: r.cost_per_employee, salePrice: r.sale_price,
      marginPercent: r.margin_percent, schedule: r.schedule, description: r.description, active: r.active })) as ServiceCatalogItem[];
  }
  async getService(name: string) {
    const { data } = await this.db.from("services_catalog").select("*").ilike("name", name).maybeSingle();
    if (!data) return null;
    const r = data as Record<string, any>;
    return { id: r.id, name: r.name, category: r.category, baseSalary: r.base_salary, costPerEmployee: r.cost_per_employee,
      salePrice: r.sale_price, marginPercent: r.margin_percent, schedule: r.schedule, description: r.description, active: r.active } as ServiceCatalogItem;
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

  async listFunctionPricing() {
    const { data } = await this.db.from("function_pricing").select("*").eq("active", true).order("function_name", { ascending: true });
    return ((data as Record<string, any>[] | null) ?? []).map(mapFunctionPricing);
  }
  async getFunctionPricing(name: string) {
    const { data } = await this.db.from("function_pricing").select("*").ilike("function_name", name).maybeSingle();
    return data ? mapFunctionPricing(data) : null;
  }
  async deleteFunctionPricing(functionName: string) {
    const { error } = await this.db.from("function_pricing").delete().eq("function_name", functionName);
    if (error) throw error;
  }
  async upsertFunctionPricing(params: PricingParams) {
    const row: Record<string, unknown> = {
      function_name: params.functionName, base_salary: params.baseSalary, schedule: params.schedule,
      uniforme_mes: params.uniformeMes, equipamentos_func: params.equipamentosFunc,
      material_func: params.materialFunc, price_confirmed: params.priceConfirmed,
      active: true, updated_at: new Date().toISOString(),
    };
    // Só grava a coluna beneficios quando informada — assim quem ainda não rodou o ALTER
    // (add column beneficios) continua salvando funções normalmente.
    if (typeof params.beneficios === "number") row.beneficios = params.beneficios;
    const { data, error } = await this.db.from("function_pricing")
      .upsert(row, { onConflict: "function_name" }).select("*").single();
    if (error) throw error;
    return mapFunctionPricing(data);
  }

  async getUserByEmail(email: string) {
    // eq() e não ilike(): em ilike, '%' e '_' do input são curingas, então um
    // e-mail como "a%@x.com" casaria com contas de terceiros. E-mails são
    // sempre gravados em minúsculas, então a comparação exata basta.
    const { data } = await this.db.from("users").select("*").eq("email", email.toLowerCase().trim()).maybeSingle();
    return data ? mapUser(data) : null;
  }
  async createUser(data: { email: string; passwordHash: string; name?: string; role?: "admin" | "user"; setor?: string | null }) {
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

  async listFuncionarios() {
    const { data } = await this.db.from("funcionarios").select("*").order("created_at", { ascending: false });
    return ((data as Record<string, any>[] | null) ?? []).map(mapFuncionario);
  }
  async createFuncionario(data: { nome: string; cpf?: string; cargo?: string; setor?: string; telefone?: string; email?: string }): Promise<Funcionario> {
    const { data: row, error } = await this.db.from("funcionarios").insert({
      nome: data.nome, cpf: data.cpf ?? null, cargo: data.cargo ?? null, setor: data.setor ?? null,
      telefone: data.telefone ?? null, email: data.email ?? null,
    }).select("*").single();
    if (error) throw error;
    return mapFuncionario(row);
  }
}
