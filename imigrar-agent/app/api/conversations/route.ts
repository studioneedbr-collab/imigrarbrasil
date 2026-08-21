import { NextResponse } from "next/server";
import { getRepository } from "@/lib/data";

export async function GET() {
  const repo = getRepository();
  const conversations = await repo.listConversations();
  conversations.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return NextResponse.json({ conversations });
}

// Lê o Supabase a cada request — sem isto o Next prerenderiza a resposta no build.
export const dynamic = "force-dynamic";
