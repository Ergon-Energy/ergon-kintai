import Link from "next/link";
import { punch } from "./actions";
import { DailyChart } from "@/components/DailyChart";
import {
  describeDuration,
  getMembers,
  getOpenSessions,
  getRange,
  summarize,
  type Member,
} from "@/lib/attendance";
import {
  PERIODS,
  dayKey,
  fmtDay,
  fmtDuration,
  fmtHours,
  fmtTime,
  isPeriodId,
  periodRange,
} from "@/lib/time";

export const dynamic = "force-dynamic";

const COLORS = ["#2F6FDE", "#E0782F", "#2E9E6B", "#9B59B6"];

type Event = {
  at: Date;
  member: Member;
  color: string;
  kind: "in" | "out" | "log";
  text: string;
  extra?: string;
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const period = isPeriodId(sp.period) ? sp.period : "week";
  const range = periodRange(period);
  const now = new Date();

  const [members, open, { sessions, logs }] = await Promise.all([
    getMembers(),
    getOpenSessions(),
    getRange(range),
  ]);
  const summary = summarize(members, sessions, logs, range, now);
  const colorOf = (id: string) => COLORS[Math.max(0, members.findIndex((m) => m.id === id)) % COLORS.length];
  const memberOf = (id: string) => members.find((m) => m.id === id)!;

  // タイムライン（新しい日が上、日の中は時刻順）
  const events: Event[] = [];
  for (const s of sessions) {
    const member = memberOf(s.member_id);
    if (!member) continue;
    const start = new Date(s.started_at);
    if (start >= range.fromDate) {
      events.push({ at: start, member, color: colorOf(member.id), kind: "in", text: s.note ?? "" });
    }
    if (s.ended_at) {
      const end = new Date(s.ended_at);
      if (end < range.toDate) {
        events.push({
          at: end,
          member,
          color: colorOf(member.id),
          kind: "out",
          text: "",
          extra: describeDuration(s),
        });
      }
    }
  }
  for (const l of logs) {
    const member = memberOf(l.member_id);
    if (!member) continue;
    events.push({ at: new Date(l.logged_at), member, color: colorOf(member.id), kind: "log", text: l.content });
  }
  const byDay = new Map<string, Event[]>();
  for (const e of events.sort((a, b) => a.at.getTime() - b.at.getTime())) {
    const k = dayKey(e.at);
    byDay.set(k, [...(byDay.get(k) ?? []), e]);
  }
  const dayList = [...byDay.keys()].sort().reverse();

  return (
    <main>
      <header className="top">
        <h1>
          Ergon <span>勤怠</span>
        </h1>
        <nav className="tabs">
          {PERIODS.map((p) => (
            <Link key={p.id} href={`/?period=${p.id}`} className={p.id === period ? "on" : ""}>
              {p.label}
            </Link>
          ))}
        </nav>
      </header>
      <p className="range">
        {fmtDay(range.from)} 〜 {fmtDay(range.days[range.days.length - 1])}
        <a href={`/api/export?period=${period}`} className="csv">
          CSVで書き出す
        </a>
      </p>

      {sp.ok && <p className="flash ok">{sp.ok}</p>}
      {sp.err && <p className="flash err">{sp.err}</p>}

      {members.length === 0 ? (
        <section className="card empty">
          <p>まだメンバーがいません。</p>
          <p>
            Slackで <code>/kintai in</code> を打つと自動で登録されます。
          </p>
        </section>
      ) : (
        <>
          <section className="members">
            {summary.map((s) => {
              const o = open.find((x) => x.member_id === s.member.id);
              return (
                <article key={s.member.id} className="card member" style={{ "--c": colorOf(s.member.id) } as React.CSSProperties}>
                  <div className="who">
                    <span className={`dot${o ? " live" : ""}`} />
                    <strong>{s.member.name}</strong>
                    <span className="state">
                      {o ? `勤務中 ${fmtTime(o.started_at)}〜（${describeDuration(o, now)}）` : "勤務外"}
                    </span>
                  </div>
                  <div className="big">
                    {fmtHours(s.totalMs)}
                    <small>時間</small>
                  </div>
                  <dl>
                    <div>
                      <dt>稼働日</dt>
                      <dd>{s.workedDays}日</dd>
                    </div>
                    <div>
                      <dt>1日平均</dt>
                      <dd>{s.workedDays ? fmtDuration(s.totalMs / s.workedDays) : "—"}</dd>
                    </div>
                    <div>
                      <dt>やったこと</dt>
                      <dd>{s.logCount}件</dd>
                    </div>
                  </dl>
                </article>
              );
            })}
          </section>

          <section className="card">
            <div className="card-head">
              <h2>日ごとの勤務時間</h2>
              <ul className="legend">
                {members.map((m) => (
                  <li key={m.id}>
                    <i style={{ background: colorOf(m.id) }} />
                    {m.name}
                  </li>
                ))}
              </ul>
            </div>
            <DailyChart days={range.days} summary={summary} colors={members.map((m) => colorOf(m.id))} />
          </section>

          <section className="card">
            <h2>画面から記録する</h2>
            <form action={punch} className="punch">
              <input type="hidden" name="period" value={period} />
              <select name="member" required defaultValue="">
                <option value="" disabled>
                  メンバー
                </option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <input name="time" placeholder="時刻（空欄で今）" inputMode="numeric" className="time" />
              <input name="text" placeholder="メモ・やったこと" className="text" />
              <div className="buttons">
                <button name="action" value="in">出勤</button>
                <button name="action" value="out">退勤</button>
                <button name="action" value="log" className="ghost">
                  やったこと
                </button>
              </div>
            </form>
          </section>

          <section className="card">
            <h2>記録</h2>
            {dayList.length === 0 && <p className="muted">この期間の記録はありません。</p>}
            {dayList.map((d) => (
              <div key={d} className="day">
                <h3>{fmtDay(d)}</h3>
                <ol>
                  {byDay.get(d)!.map((e, i) => (
                    <li key={i} className={e.kind}>
                      <time>{fmtTime(e.at)}</time>
                      <span className="tag" style={{ background: e.color }}>
                        {e.member.name}
                      </span>
                      <span className="what">
                        {e.kind === "in" && <b>出勤</b>}
                        {e.kind === "out" && (
                          <b>
                            退勤<em>{e.extra}</em>
                          </b>
                        )}
                        {e.text && <span className="body">{e.text}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
