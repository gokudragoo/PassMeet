import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { PASSMEET_NONCE_COOKIE, PASSMEET_SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete(PASSMEET_NONCE_COOKIE);
  cookieStore.delete(PASSMEET_SESSION_COOKIE);
  return NextResponse.json({ success: true });
}

