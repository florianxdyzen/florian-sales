import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseClientOptions, getSupabaseEnv } from "@/lib/env";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  let url: string;
  let anonKey: string;
  try {
    ({ url, anonKey } = getSupabaseEnv());
  } catch {
    if (
      request.nextUrl.pathname.startsWith("/login") ||
      request.nextUrl.pathname.startsWith("/r/") ||
      request.nextUrl.pathname.startsWith("/portal") ||
      request.nextUrl.pathname.startsWith("/api/ingest/") ||
      request.nextUrl.pathname.startsWith("/api/cron/") ||
      request.nextUrl.pathname === "/manifest.webmanifest" ||
      request.nextUrl.pathname === "/sw.js" ||
      request.nextUrl.pathname.startsWith("/brand/")
    ) {
      return supabaseResponse;
    }
    return new NextResponse(
      "Server misconfiguration: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      { status: 503 }
    );
  }

  const supabase = createServerClient(url, anonKey, {
    ...getSupabaseClientOptions(),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthPage = request.nextUrl.pathname.startsWith("/login");
  const isAuthCallback = request.nextUrl.pathname.startsWith("/auth/");
  const isPublicReferral = request.nextUrl.pathname.startsWith("/r/");
  const isPublicPortal = request.nextUrl.pathname.startsWith("/portal");
  const isIngestApi = request.nextUrl.pathname.startsWith("/api/ingest/");
  const isCronApi = request.nextUrl.pathname.startsWith("/api/cron/");
  const path = request.nextUrl.pathname;
  const isPwaAsset =
    path === "/manifest.webmanifest" ||
    path === "/sw.js" ||
    path.startsWith("/brand/");
  const isPublic =
    isAuthPage ||
    isAuthCallback ||
    isPublicReferral ||
    isPublicPortal ||
    isIngestApi ||
    isCronApi ||
    isPwaAsset;

  if (!user && !isPublic) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}
