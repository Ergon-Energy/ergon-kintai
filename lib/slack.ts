import { createHmac, timingSafeEqual } from "node:crypto";

/** Slack の署名検証（https://api.slack.com/authentication/verifying-requests-from-slack） */
export function verifySlackRequest(rawBody: string, headers: Headers): boolean {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret) return false;
  const ts = headers.get("x-slack-request-timestamp");
  const sig = headers.get("x-slack-signature");
  if (!ts || !sig) return false;
  // リプレイ攻撃対策：5分以上前のリクエストは拒否
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 60 * 5) return false;
  const expected = "v0=" + createHmac("sha256", secret).update(`v0:${ts}:${rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Slack のプロフィールから氏名を取得する。SLACK_BOT_TOKEN が未設定、または失敗したら null。
 * スラッシュコマンドは3秒以内に応答が必要なので、短い時間で打ち切って打刻を優先する。
 */
export async function fetchSlackRealName(userId: string, fetchFn: typeof fetch = fetch): Promise<string | null> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return null;
  try {
    const res = await fetchFn(`https://slack.com/api/users.info?user=${encodeURIComponent(userId)}`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(1500),
    });
    const data = await res.json();
    if (!data.ok) {
      console.warn("Slack users.info:", data.error);
      return null;
    }
    return data.user?.profile?.real_name?.trim() || data.user?.real_name?.trim() || null;
  } catch (e) {
    console.warn("Slack users.info:", e);
    return null;
  }
}
