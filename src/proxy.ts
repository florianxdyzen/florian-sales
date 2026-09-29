import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { isFrsDeadRoute } from "@/lib/product-surface";

export async function proxy(request: NextRequest) {
  if (isFrsDeadRoute(request.nextUrl.pathname)) {
    return NextResponse.redirect(new URL("/pipeline", request.url));
  }
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest\\.webmanifest|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)",
  ],
};
