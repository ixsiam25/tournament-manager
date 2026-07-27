import { NextResponse } from "next/server";
import { MANAGER_COOKIE_NAME } from "@/lib/managerAuth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(MANAGER_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return response;
}
