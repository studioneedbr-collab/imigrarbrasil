import { NextResponse } from "next/server";
import { getRepository } from "@/lib/data";

// Catálogo de serviços — alimenta o seletor do simulador de orçamento.
export async function GET() {
  const services = await getRepository().listServices();
  return NextResponse.json({ services });
}

// Lê o Supabase a cada request — sem isto o Next prerenderiza a resposta no build.
export const dynamic = "force-dynamic";
