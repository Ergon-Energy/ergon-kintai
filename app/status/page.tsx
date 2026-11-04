import Link from "next/link";
import { punch } from "../actions";
import { AppHeader } from "@/components/AppHeader";
import { DailyChart } from "@/components/DailyChart";
import { Timeline } from "@/components/Timeline";
import {
  describeDuration,
  getMembers,
  getOpenSessions,
  getRange,
  summarize,
} from "@/lib/attendance";
import { colorOf as memberColor, memberVars } from "@/lib/colors";
import {
  PERIODS,
  fmtDay,
  fmtDuration,
  fmtHours,
  fmtTime,
  isPeriodId,
  periodRange,
} from "@/lib/time";

export const dynamic = "force-dynamic";

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
  const colorOf = (id: string) => memberColor(members, id);

  return (
    <main>
      <AppHeader current="status" />
      <div className="subbar">
        <nav className="tabs" aria-label="期間">
          {PERIODS.map((p) => (
            <Link key={p.id} href={`/status?period=${p.id}`} className={p.id === period ? "on" : ""}>
              {p.label}
            </Link>
          ))}
        </nav>
        <p className="range">
          {fmtDay(range.from)} 〜 {fmtDay(range.days[range.days.length - 1])}
          <a href={`/api/export?period=${period}`} className="csv">
            CSVで書き出す
          </a>
        </p>
      </div>

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
                <article key={s.member.id} className="card member" style={memberVars(members, s.member.id)}>
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
            <Timeline
              members={members}
              sessions={sessions}
              logs={logs}
              span={range}
              emptyText="この期間の記録はありません。"
            />
          </section>
        </>
      )}
    </main>
  );
}
