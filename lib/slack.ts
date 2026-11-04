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
