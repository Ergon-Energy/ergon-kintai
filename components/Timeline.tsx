import { describeDuration, type Log, type Member, type Session } from "@/lib/attendance";
import { memberVars } from "@/lib/colors";
import { dayKey, fmtDay, fmtTime, type Span } from "@/lib/time";

type Event = {
  at: Date;
  member: Member;
  kind: "in" | "out" | "log";
  text: string;
  extra?: string;
};

/** 出勤・退勤・やったことを、範囲内のものだけ日ごとに並べる（新しい日が上、日の中は時刻順） */
export function Timeline({
  members,
  sessions,
  logs,
  span,
  emptyText,
}: {
  members: Member[];
  sessions: Session[];
  logs: Log[];
  span: Pick<Span, "fromDate" | "toDate">;
  emptyText: string;
}) {
  const inSpan = (d: Date) => d >= span.fromDate && d < span.toDate;
  const events: Event[] = [];
  for (const s of sessions) {
    const member = members.find((m) => m.id === s.member_id);
    if (!member) continue;
    const start = new Date(s.started_at);
    if (inSpan(start)) events.push({ at: start, member, kind: "in", text: s.note ?? "" });
    if (s.ended_at) {
      const end = new Date(s.ended_at);
      if (inSpan(end)) events.push({ at: end, member, kind: "out", text: "", extra: describeDuration(s) });
    }
  }
  for (const l of logs) {
    const member = members.find((m) => m.id === l.member_id);
    const at = new Date(l.logged_at);
    if (!member || !inSpan(at)) continue;
    events.push({ at, member, kind: "log", text: l.content });
  }

  const byDay = new Map<string, Event[]>();
  for (const e of events.sort((a, b) => a.at.getTime() - b.at.getTime())) {
    const k = dayKey(e.at);
    byDay.set(k, [...(byDay.get(k) ?? []), e]);
  }
  const dayList = [...byDay.keys()].sort().reverse();

  if (dayList.length === 0) return <p className="muted">{emptyText}</p>;
  return (
    <>
      {dayList.map((d) => (
        <div key={d} className="day">
          <h3>{fmtDay(d)}</h3>
          <ol>
            {byDay.get(d)!.map((e, i) => (
              <li key={i} className={e.kind}>
                <time>{fmtTime(e.at)}</time>
                <span className="tag" style={memberVars(members, e.member.id)}>
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
    </>
  );
}
