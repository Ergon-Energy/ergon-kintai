import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { DayRecords } from "@/components/DayRecords";
import { ResultFlash } from "@/components/ResultFlash";
import {
  describeDuration,
  getMembers,
  getOpenSessions,
  getRange,
  segmentsOnDay,
  summarize,
} from "@/lib/attendance";
import { colorOf } from "@/lib/colors";
import {
  addMonths,
  calendarSpan,
  dayKey,
  fmtDay,
  fmtDuration,
  fmtHours,
  fmtMonth,
  fmtTime,
  isMonthKey,
  monthKey,
  monthSpan,
  weekday,
} from "@/lib/time";

export const dynamic = "force-dynamic";

const WEEK_LABELS = ["月", "火", "水", "木", "金", "土", "日"];

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const today = dayKey(now);
  const month = isMonthKey(sp.month) ? sp.month : monthKey(now);
  const grid = calendarSpan(month);
  const selected =
    typeof sp.day === "string" && grid.days.includes(sp.day) ? sp.day : today.startsWith(month) ? today : null;

  const [members, open, { sessions, logs }] = await Promise.all([
    getMembers(),
    getOpenSessions(),
    getRange(grid),
  ]);
  const dailyByMember = summarize(members, sessions, logs, grid, now);
  const monthly = summarize(members, sessions, logs, monthSpan(month), now);
  const dailyOf = (memberId: string, day: string) =>
    dailyByMember.find((s) => s.member.id === memberId)?.daily.get(day) ?? 0;

  return (
    <main>
      <AppHeader current="calendar" />

      {members.length === 0 && (
        <section className="card empty">
          <p>まだメンバーがいません。</p>
          <p>
            Slackで <code>/kintai in</code> を打つと自動で登録されます。
          </p>
        </section>
      )}

      <section className="now-strip" aria-label="現在の状況と月の合計">
        {monthly.map((s) => {
          const o = open.find((x) => x.member_id === s.member.id);
          return (
            <div key={s.member.id} className="now-item" style={{ "--c": colorOf(members, s.member.id) } as React.CSSProperties}>
              <span className="badge" aria-hidden="true">
                {s.member.name.slice(0, 1).toUpperCase()}
              </span>
              <strong>{s.member.name}</strong>
              <span className="state">
                <span className={`dot${o ? " live" : ""}`} />
                {o ? `勤務中 ${fmtTime(o.started_at)}〜（${describeDuration(o, now)}）` : "勤務外"}
              </span>
              <span className="month-total">
                {fmtMonth(month).replace(/^\d+年/, "")} {fmtHours(s.totalMs)}時間
              </span>
            </div>
          );
        })}
      </section>

      <section className="card calendar">
        <div className="cal-head">
          <Link href={`/?month=${addMonths(month, -1)}`} className="cal-nav" aria-label="前の月">
            ‹
          </Link>
          <h2>{fmtMonth(month)}</h2>
          <Link href={`/?month=${addMonths(month, 1)}`} className="cal-nav" aria-label="次の月">
            ›
          </Link>
          {month !== monthKey(now) && (
            <Link href="/" className="cal-today">
              今月に戻る
            </Link>
          )}
        </div>

        <div className="cal-grid cal-week" aria-hidden="true">
          {WEEK_LABELS.map((w, i) => (
            <div key={w} className={i === 5 ? "sat" : i === 6 ? "sun" : ""}>
              {w}
            </div>
          ))}
        </div>
        <div className="cal-grid">
          {grid.days.map((d) => {
            const wd = weekday(d);
            const segments = segmentsOnDay(sessions, d, now);
            const classes = [
              "cal-day",
              d.startsWith(month) ? "" : "other",
              d === today ? "today" : "",
              d === selected ? "selected" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <Link
                key={d}
                href={`/?month=${month}&day=${d}#detail`}
                className={classes}
                aria-current={d === today ? "date" : undefined}
                aria-label={`${fmtDay(d)}の記録を見る`}
              >
                <span className={`num${wd === 6 ? " sat" : wd === 0 ? " sun" : ""}`}>{Number(d.slice(8))}</span>
                {members.map((m) => {
                  const own = segments.filter((x) => x.memberId === m.id);
                  if (own.length === 0) return null;
                  return (
                    <span
                      key={m.id}
                      className="cal-entry"
                      style={{ "--c": colorOf(members, m.id) } as React.CSSProperties}
                      title={`${m.name}: ${fmtDuration(dailyOf(m.id, d))}`}
                    >
                      <span className="badge" aria-hidden="true">
                        {m.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="ranges">
                        {own.map((x) => (
                          <span key={x.sessionId}>{x.label}</span>
                        ))}
                      </span>
                      <span className="hours">{fmtHours(dailyOf(m.id, d))}</span>
                    </span>
                  );
                })}
              </Link>
            );
          })}
        </div>
      </section>

      <section className="card" id="detail">
        <ResultFlash ok={sp.ok} err={sp.err} />
        {selected ? (
          <>
            <h2>{fmtDay(selected)}の記録</h2>
            <ul className="day-totals">
              {members.map((m) => {
                const ms = dailyOf(m.id, selected);
                return (
                  <li key={m.id}>
                    <i style={{ background: colorOf(members, m.id) }} />
                    {m.name}
                    <b>{ms > 0 ? fmtDuration(ms) : "—"}</b>
                  </li>
                );
              })}
            </ul>
            <DayRecords members={members} sessions={sessions} logs={logs} day={selected} month={month} now={now} />
          </>
        ) : (
          <p className="muted">日付を押すと、その日の記録が表示されます。</p>
        )}
      </section>
    </main>
  );
}
