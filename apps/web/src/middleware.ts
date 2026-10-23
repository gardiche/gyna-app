import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_PATHS = ["/login", "/login-bg.webp", "/api/bridge/", "/api/telegram", "/api/hooks/"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list: Array<{ name: string; value: string; options?: any }>) => {
        for (const c of list) request.cookies.set(c.name, c.value);
        response = NextResponse.next({ request });
        for (const c of list) response.cookies.set(c.name, c.value, c.options);
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  // Invité « suivi des campagnes » : la page Campagnes seulement, aucune API. La base le limite aussi (RLS).
  const { data: member } = await supabase.from("members").select("role").eq("user_id", data.user.id).limit(1).maybeSingle();
  if (member?.role === "campaign_viewer" && !(pathname === "/campagnes" || pathname.startsWith("/campagnes/"))) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Accès limité au suivi des campagnes" }, { status: 403 });
    const url = request.nextUrl.clone();
    url.pathname = "/campagnes";
    url.search = "";
    return NextResponse.redirect(url);
  }
  // Prospection seulement : le chat, les prospects, les validations (messages de prospection) et ses paramètres.
  if (member?.role === "prospector" && !PROSPECTOR_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Accès limité à la prospection" }, { status: 403 });
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

const PROSPECTOR_PATHS = [
  "/", "/c", "/nouvelle", "/prospects", "/validations", "/settings",
  "/api/conversations", "/api/files", "/api/approvals", "/api/missions", "/api/prospects", "/api/usage",
];

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp)$).*)"],
};
