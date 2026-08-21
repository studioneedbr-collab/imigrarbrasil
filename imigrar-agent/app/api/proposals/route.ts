import { NextResponse } from "next/server";
import { getRepository } from "@/lib/data";

export async function GET() {
  const repo = getRepository();
  const proposals = await repo.listProposals();
  proposals.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return NextResponse.json({ proposals });
}

// Lê o Supabase a cada request — sem isto o Next prerenderiza a resposta no build.
export const dynamic = "force-dynamic";
