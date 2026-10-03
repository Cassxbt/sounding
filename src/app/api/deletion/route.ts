import { NextResponse } from "next/server";
import { deletionTest } from "@/lib/deletion";

/** The deletion test as data, for the desk's summary; the full page renders it at build. */
export async function GET() {
  return NextResponse.json(await deletionTest());
}
