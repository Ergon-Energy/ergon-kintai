// npm test で実行。DB不要の部分（時刻計算・コマンド解釈・集計・署名検証）を確認する
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { parseCommand } from "../lib/command";
import { summarize, type Member, type Session } from "../lib/attendance";
import { verifySlackRequest } from "../lib/slack";
import { dayKey, fmtDuration, parseClock, periodRange, splitByDay } from "../lib/time";

const jst = (s: string) => new Date(`${s}+09:00`);
let n = 0;
const t = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log("✓", name);
};

t("日付キーは日本時間", () => {
  assert.equal(dayKey(new Date("2026-11-03T15:30:00Z")), "2026-11-04");
});

t("日付をまたぐ勤務を分割", () => {
  const m = splitByDay(jst("2026-11-03T22:00:00"), jst("2026-11-04T02:30:00"));
  assert.equal(m.get("2026-11-03"), 2 * 3_600_000);
  assert.equal(m.get("2026-11-04"), 2.5 * 3_600_000);
});

t("今週は月曜はじまり・先月は年をまたぐ", () => {
  const w = periodRange("week", jst("2026-11-04T10:00:00")); // 水曜
  assert.equal(w.from, "2026-11-02");
  assert.equal(w.to, "2026-11-09");
  assert.equal(w.days.length, 7);
  const sun = periodRange("week", jst("2026-11-08T23:00:00")); // 日曜
  assert.equal(sun.from, "2026-11-02");
  const lm = periodRange("last-month", jst("2027-01-15T10:00:00"));
  assert.equal(lm.from, "2026-12-01");
  assert.equal(lm.to, "2027-01-01");
  assert.equal(lm.days.length, 31);
});

t("時刻指定（全角・未来なら前日）", () => {
  const now = jst("2026-11-04T00:10:00");
  assert.equal(parseClock("９：３０", jst("2026-11-04T12:00:00"))!.toISOString(), jst("2026-11-04T09:30:00").toISOString());
  assert.equal(parseClock("23:50", now)!.toISOString(), jst("2026-11-03T23:50:00").toISOString());
  assert.equal(parseClock("25:00", now), null);
  assert.equal(parseClock("資料", now), null);
});

t("コマンド解釈", () => {
  const now = jst("2026-11-04T18:00:00");
  const a = parseCommand("in 9:30 PoC資料", now);
  assert.equal(a.kind, "in");
  if (a.kind === "in") {
    assert.equal(a.text, "PoC資料");
    assert.equal(a.at.toISOString(), jst("2026-11-04T09:30:00").toISOString());
  }
  const b = parseCommand("退勤　提案書を直した", now);
  assert.equal(b.kind, "out");
  if (b.kind === "out") {
    assert.equal(b.text, "提案書を直した");
    assert.equal(b.at, now);
  }
  const c = parseCommand("log MILP のウォームスタート実装", now);
  assert.deepEqual(c, { kind: "log", text: "MILP のウォームスタート実装" });
  assert.equal(parseCommand("", now).kind, "status");
  assert.equal(parseCommand("hello", now).kind, "help");
});

t("集計：期間外の部分と勤務中の分", () => {
  const members: Member[] = [{ id: "a", name: "A", slack_user_id: null }];
  const range = periodRange("week", jst("2026-11-04T12:00:00"));
  const sessions: Session[] = [
    // 日曜22時〜月曜2時 → 今週分は2時間
    { id: "1", member_id: "a", started_at: jst("2026-11-01T22:00:00").toISOString(), ended_at: jst("2026-11-02T02:00:00").toISOString(), note: null, source: "web" },
    // 勤務中（9時〜現在12時）→ 3時間
    { id: "2", member_id: "a", started_at: jst("2026-11-04T09:00:00").toISOString(), ended_at: null, note: null, source: "web" },
  ];
  const [s] = summarize(members, sessions, [], range, jst("2026-11-04T12:00:00"));
  assert.equal(s.totalMs, 5 * 3_600_000);
  assert.equal(s.workedDays, 2);
  assert.equal(fmtDuration(s.totalMs), "5時間");
});

t("Slack署名検証", () => {
  process.env.SLACK_SIGNING_SECRET = "secret";
  const body = "text=in&user_id=U1";
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = "v0=" + createHmac("sha256", "secret").update(`v0:${ts}:${body}`).digest("hex");
  const h = (s: string, time = ts) => new Headers({ "x-slack-request-timestamp": time, "x-slack-signature": s });
  assert.equal(verifySlackRequest(body, h(sig)), true);
  assert.equal(verifySlackRequest(body + "x", h(sig)), false);
  assert.equal(verifySlackRequest(body, h(sig, String(Number(ts) - 600))), false);
});

console.log(`\n${n} tests passed`);
