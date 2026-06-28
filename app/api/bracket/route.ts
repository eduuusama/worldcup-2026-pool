import { NextResponse } from "next/server";
import { fetchBracket } from "@/lib/bracket";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  try {
    const bracket = await fetchBracket();
    return NextResponse.json(bracket, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (err) {
    console.error("[bracket]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
