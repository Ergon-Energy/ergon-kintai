import { NextResponse, type NextRequest } from "next/server";

/**
 * 画面とCSVを Basic 認証で保護する（2人で使う前提の簡易版）。
 * Slack のエンドポイントは署名検証で守るので対象外。
 */
export function middleware(req: NextRequest) {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASSWORD;

  if (!user || !pass) {
    // 本番で設定し忘れたら開けない
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("BASIC_AUTH_USER / BASIC_AUTH_PASSWORD が未設定です", { status: 500 });
    }
    return NextResponse.next();
  }

  const header = req.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    const decoded = atob(header.slice(6));
    const i = decoded.indexOf(":");
    if (decoded.slice(0, i) === user && decoded.slice(i + 1) === pass) {
      return NextResponse.next();
    }
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="kintai", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!api/slack|_next/static|_next/image|favicon.ico|icon.png|ergon-logo-).*)"],
};
