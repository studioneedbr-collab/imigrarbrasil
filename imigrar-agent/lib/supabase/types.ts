// Espelha as colunas snake_case das tabelas do 001_initial_schema.sql.
export interface DbConversation {
  id: string;
  whatsapp_number: string;
  contact_name: string | null;
  status: string;
  lead_score: number;
  created_at: string;
  updated_at: string;
}
export interface DbMessage {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  whatsapp_message_id: string | null;
  created_at: string;
  // Anexo recebido no WhatsApp (migration 009). Opcionais: bancos ainda sem a
  // migration aplicada devolvem a linha sem estas colunas.
  media_url?: string | null;
  media_type?: string | null;
  media_name?: string | null;
  media_text?: string | null;
}
