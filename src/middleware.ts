import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/order", "/cart", "/checkout", "/orders", "/admin", "/payment"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const protectedRoute = PROTECTED.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  if (protectedRoute && !request.cookies.has("kt_session")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/order/:path*",
    "/cart/:path*",
    "/checkout/:path*",
    "/orders/:path*",
    "/admin/:path*",
    "/payment/:path*",
  ],
};
