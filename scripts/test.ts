// npm test で実行。DB不要の部分（時刻計算・コマンド解釈・集計・署名検証）を確認する
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { parseCommand } from "../lib/command";
import { findOverlap, segmentsOnDay, summarize, type Member, type Session } from "../lib/attendance";
import { fetchSlackRealName, verifySlackRequest } from "../lib/slack";
import { boardTasks, dueLabel, isOverdue, parseTaskDate, sortTasks, taskStats, type Task } from "../lib/tasks";
import { barSpan, buildWbs, descendantsOf, ganttRange, isRowOverdue, leafTasks, parentChoices } from "../lib/wbs";
import { addMonths, calendarSpan, dayKey, fmtDuration, isMonthKey, monthSpan, parseClock, parseLocalInput, periodRange, splitByDay, toLocalInput } from "../lib/time";

const jst = (s: string) => new Date(`${s}+09:00`);
let n = 0;
const pending: Promise<void>[] = [];
const t = (name: string, fn: () => void | Promise<void>) => {
  pending.push(
    Promise.resolve(fn()).then(() => {
      n++;
      console.log("✓", name);
    }),
  );
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

t("カレンダーの範囲（月曜はじまり・週単位）", () => {
  const nov = calendarSpan("2026-11"); // 11/1 は日曜、11/30 は月曜
  assert.equal(nov.from, "2026-10-26");
  assert.equal(nov.to, "2026-12-07");
  assert.equal(nov.days.length, 42);
  assert.equal(calendarSpan("2027-02").days.length, 28); // 2027/2/1 は月曜、2/28 は日曜
  assert.equal(monthSpan("2026-12").to, "2027-01-01");
  assert.equal(addMonths("2026-12", 1), "2027-01");
  assert.equal(addMonths("2027-01", -1), "2026-12");
  assert.equal(isMonthKey("2026-11"), true);
  assert.equal(isMonthKey("2026-13"), false);
  assert.equal(isMonthKey(undefined), false);
});

t("カレンダーの表示：日またぎと勤務中", () => {
  const now = jst("2026-11-04T12:00:00");
  const base = { member_id: "a", note: null, source: "web" };
  const sessions: Session[] = [
    { ...base, id: "1", started_at: jst("2026-11-02T22:00:00").toISOString(), ended_at: jst("2026-11-03T02:30:00").toISOString() },
    { ...base, id: "2", started_at: jst("2026-11-04T09:00:00").toISOString(), ended_at: null },
  ];
  const labels = (k: string) => segmentsOnDay(sessions, k, now).map((x) => x.label);
  assert.deepEqual(labels("2026-11-02"), ["22:00–24:00"]);
  assert.deepEqual(labels("2026-11-03"), ["00:00–02:30"]);
  assert.deepEqual(labels("2026-11-04"), ["09:00〜"]);
  assert.deepEqual(labels("2026-11-05"), []);
  // 退勤し忘れは、過去の日では 24:00 まで、今日は勤務中として表示
  const forgot: Session[] = [{ ...base, id: "3", started_at: jst("2026-11-03T20:00:00").toISOString(), ended_at: null }];
  assert.equal(segmentsOnDay(forgot, "2026-11-03", now)[0].label, "20:00–24:00");
  assert.equal(segmentsOnDay(forgot, "2026-11-04", now)[0].label, "00:00〜");
});

t("編集の日時入力は日本時間", () => {
  assert.equal(toLocalInput(jst("2026-11-04T00:05:30")), "2026-11-04T00:05");
  assert.equal(parseLocalInput("2026-11-04T09:30")!.toISOString(), jst("2026-11-04T09:30:00").toISOString());
  assert.equal(parseLocalInput("2026-02-31T09:30"), null);
  assert.equal(parseLocalInput("2026-11-04T25:00"), null);
  assert.equal(parseLocalInput(""), null);
  assert.equal(parseLocalInput("きのう"), null);
});

t("編集時の勤務の重なり", () => {
  const base = { member_id: "a", note: null, source: "web" };
  const others: Session[] = [
    { ...base, id: "1", started_at: jst("2026-11-04T09:00:00").toISOString(), ended_at: jst("2026-11-04T12:00:00").toISOString() },
    { ...base, id: "2", started_at: jst("2026-11-04T18:00:00").toISOString(), ended_at: null },
  ];
  const at = (h: string) => jst(`2026-11-04T${h}:00`);
  assert.equal(findOverlap(others, at("11:00"), at("13:00"))?.id, "1");
  assert.equal(findOverlap(others, at("12:00"), at("18:00")), undefined); // 境目が接するだけならOK
  assert.equal(findOverlap(others, at("17:00"), at("18:30"))?.id, "2"); // 勤務中と重なる
  assert.equal(findOverlap(others, at("13:00"), null)?.id, "2"); // 勤務中に戻すと重なる
  assert.equal(findOverlap(others.slice(0, 1), at("13:00"), null), undefined);
});

t("Slackの氏名取得", async () => {
  const json = (body: unknown) => (async () => new Response(JSON.stringify(body))) as unknown as typeof fetch;
  const profile = { ok: true, user: { profile: { real_name: " 渡辺 テスト " } } };
  delete process.env.SLACK_BOT_TOKEN;
  assert.equal(await fetchSlackRealName("U1", json(profile)), null); // トークン未設定
  process.env.SLACK_BOT_TOKEN = "xoxb-test";
  const quiet = console.warn;
  console.warn = () => {};
  try {
    assert.equal(await fetchSlackRealName("U1", json(profile)), "渡辺 テスト");
    assert.equal(await fetchSlackRealName("U1", json({ ok: false, error: "missing_scope" })), null);
    assert.equal(await fetchSlackRealName("U1", json({ ok: true, user: { profile: { real_name: "" } } })), null);
    const fail = (async () => {
      throw new Error("timeout");
    }) as unknown as typeof fetch;
    assert.equal(await fetchSlackRealName("U1", fail), null);
  } finally {
    console.warn = quiet;
    delete process.env.SLACK_BOT_TOKEN;
  }
});

const task = (over: Partial<Task>): Task => ({
  id: "t",
  title: "t",
  note: null,
  parent_id: null,
  assignee_id: null,
  status: "todo",
  start_date: null,
  due_date: null,
  completed_at: null,
  created_at: "2026-11-01T00:00:00Z",
  ...over,
});

t("タスクの期限の解釈", () => {
  assert.equal(parseTaskDate("", "期限"), null);
  assert.equal(parseTaskDate("2026-11-30", "期限"), "2026-11-30");
  assert.throws(() => parseTaskDate("2026-02-30", "期限"));
  assert.throws(() => parseTaskDate("来週", "期限"));
});

// 1 設計（1.1 要件 完了 / 1.2 図面 2.1 は孫）、2 単独
const tree = () => [
  task({ id: "b", title: "単独", created_at: "2026-11-02T00:00:00Z" }),
  task({ id: "a", title: "設計", start_date: "2020-01-01", created_at: "2026-11-01T00:00:00Z" }),
  task({ id: "a2", parent_id: "a", created_at: "2026-11-04T00:00:00Z" }),
  task({
    id: "a1",
    parent_id: "a",
    status: "done",
    start_date: "2026-11-02",
    due_date: "2026-11-06",
    created_at: "2026-11-03T00:00:00Z",
  }),
  task({ id: "a21", parent_id: "a2", start_date: "2026-11-05", due_date: "2026-11-20", created_at: "2026-11-05T00:00:00Z" }),
];

t("WBSの番号と順序", () => {
  assert.deepEqual(
    buildWbs(tree()).map((r) => `${r.no}:${r.task.id}:${r.depth}`),
    ["1:a:0", "1.1:a1:1", "1.2:a2:1", "1.2.1:a21:2", "2:b:0"],
  );
});

t("WBSの親は配下から期間と進捗を集計する", () => {
  const a = buildWbs(tree())[0];
  assert.equal(a.hasChildren, true);
  assert.equal(a.start, "2026-11-02"); // 自分の開始は使わない
  assert.equal(a.end, "2026-11-20");
  assert.deepEqual([a.total, a.done], [2, 1]);
  assert.equal(isRowOverdue(a, "2026-11-21"), true);
  assert.equal(isRowOverdue(a, "2026-11-20"), false);
});

t("WBSの片方だけの日付は1日のバーになる", () => {
  const [only] = buildWbs([task({ due_date: "2026-11-10" })]);
  assert.deepEqual([only.start, only.end], ["2026-11-10", "2026-11-10"]);
});

t("親に選べるタスクは自分と配下を除く", () => {
  const rows = buildWbs(tree());
  assert.deepEqual(descendantsOf(rows, "a2").map((r) => r.task.id), ["a21"]);
  assert.deepEqual(parentChoices(rows, "a2").map((r) => r.task.id), ["a", "a1", "b"]);
  assert.equal(parentChoices(rows, null).length, 5);
});

t("ボードは末端のタスクと直近の完了だけ", () => {
  const now = jst("2026-11-05T12:00:00");
  assert.deepEqual(leafTasks(tree()).map((x) => x.id).sort(), ["a1", "a21", "b"]);
  const ids = boardTasks(
    [
      task({ id: "親" }),
      task({ id: "子", parent_id: "親" }),
      task({ id: "最近", status: "done", completed_at: "2026-10-10T00:00:00Z" }),
      task({ id: "古い", status: "done", completed_at: "2026-09-01T00:00:00Z" }),
    ],
    now,
  ).map((x) => x.id);
  assert.deepEqual(ids, ["子", "最近"]);
});

t("ガントの範囲は月曜はじまりの週単位で、今日を含む", () => {
  const today = "2026-11-05"; // 木曜
  const empty = ganttRange([], today);
  assert.equal(empty.days[0], "2026-11-02");
  assert.equal(empty.days.length, 28);
  assert.equal(empty.clipped, false);

  const past = ganttRange(buildWbs([task({ start_date: "2026-10-01", due_date: "2026-12-20" })]), today);
  assert.equal(past.days[0], "2026-09-28");
  assert.equal(past.days[past.days.length - 1], "2026-12-20");
  assert.equal(past.days.length % 7, 0);

  const typo = ganttRange(buildWbs([task({ start_date: "2026-11-01", due_date: "2062-11-01" })]), today);
  assert.equal(typo.clipped, true);
  assert.ok(typo.days.length <= 189);
  assert.ok(typo.days.includes(today));

  const old = ganttRange(buildWbs([task({ due_date: "2020-01-01" })]), today);
  assert.equal(old.clipped, true);
  assert.ok(old.days.includes(today));
});

t("ガントのバーは範囲に切り詰める", () => {
  const days = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"];
  assert.deepEqual(barSpan("2026-11-03", "2026-11-04", days), { left: 1, width: 2 });
  assert.deepEqual(barSpan("2026-11-03", "2026-11-03", days), { left: 1, width: 1 });
  assert.deepEqual(barSpan("2026-10-01", "2026-12-01", days), { left: 0, width: 4 });
  assert.equal(barSpan("2026-12-01", "2026-12-02", days), null);
  assert.equal(barSpan(null, null, days), null);
});

t("タスクの期限の表示と期限切れ", () => {
  const today = "2026-11-05";
  assert.equal(dueLabel(task({}), today), null);
  assert.equal(dueLabel(task({ due_date: "2026-11-05" }), today), "今日まで");
  assert.equal(dueLabel(task({ due_date: "2026-11-06" }), today), "明日まで");
  assert.equal(dueLabel(task({ due_date: "2026-11-03" }), today), "11/3(火)まで（2日超過）");
  assert.equal(dueLabel(task({ due_date: "2026-11-03", status: "done" }), today), "11/3(火)まで");
  assert.equal(isOverdue(task({ due_date: "2026-11-04" }), today), true);
  assert.equal(isOverdue(task({ due_date: "2026-11-05" }), today), false);
  assert.equal(isOverdue(task({ due_date: "2026-11-04", status: "done" }), today), false);
});

t("タスクの並び順", () => {
  const ids = (ts: Task[]) => sortTasks(ts).map((x) => x.id);
  assert.deepEqual(
    ids([
      task({ id: "期限なし" }),
      task({ id: "遅い", due_date: "2026-12-01" }),
      task({ id: "早い", due_date: "2026-11-10" }),
    ]),
    ["早い", "遅い", "期限なし"],
  );
  assert.deepEqual(
    ids([
      task({ id: "古い", status: "done", completed_at: "2026-11-01T00:00:00Z" }),
      task({ id: "新しい", status: "done", completed_at: "2026-11-04T00:00:00Z" }),
    ]),
    ["新しい", "古い"],
  );
});

t("タスクの集計", () => {
  const s = taskStats(
    [
      task({ status: "todo", due_date: "2026-11-01" }),
      task({ status: "doing" }),
      task({ status: "done", completed_at: "2026-11-04T00:00:00Z" }),
      task({ status: "done", completed_at: "2026-10-20T00:00:00Z" }),
    ],
    "2026-11-05",
    jst("2026-11-02T00:00:00"),
  );
  assert.deepEqual(s, { open: 2, overdue: 1, doneThisWeek: 1 });
});

Promise.all(pending)
  .then(() => console.log(`\n${n} tests passed`))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
