import Link from "next/link";
import type { CSSProperties } from "react";
import type { Member } from "@/lib/attendance";
import { memberVars } from "@/lib/colors";
import { statusLabel } from "@/lib/tasks";
import { fmtDay, weekday } from "@/lib/time";
import { barSpan, isRowOverdue, type WbsRow } from "@/lib/wbs";

/** 同じ月が続く日をまとめて、月の見出しにする */
function monthGroups(days: string[]) {
  const groups: { key: string; label: string; count: number }[] = [];
  for (const d of days) {
    const key = d.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.count++;
    else groups.push({ key, label: `${Number(d.slice(5, 7))}月`, count: 1 });
  }
  return groups;
}

const percent = (n: number, days: string[]) => `${(n / days.length) * 100}%`;

/**
 * 左がWBSの表、右がガントチャート。1つの table にして行を揃える。
 * 表示範囲は月曜はじまりなので、土日の網掛けは7日周期の背景で描ける（globals.css の .tl）。
 */
export function WbsGantt({
  rows,
  days,
  members,
  today,
  selected,
}: {
  rows: WbsRow[];
  days: string[];
  members: Member[];
  today: string;
  selected: string | null;
}) {
  const todayIndex = days.indexOf(today);
  const todayMark = todayIndex >= 0 && (
    <span className="tl-today" style={{ left: percent(todayIndex + 0.5, days) }} aria-hidden="true" />
  );

  return (
    <div className="wbs-scroll" tabIndex={0} role="region" aria-label="WBSとガントチャート">
      <table className="wbs" style={{ "--days": days.length } as CSSProperties}>
        <thead>
          <tr>
            <th className="c-no">WBS</th>
            <th className="c-name">タスク</th>
            <th className="c-who">担当</th>
            <th className="c-start">開始</th>
            <th className="c-end">期限</th>
            <th className="c-pct">進捗</th>
            <th className="tl-head">
              <div className="tl-months" aria-hidden="true">
                {monthGroups(days).map((g) => (
                  <span key={g.key} style={{ width: percent(g.count, days) }}>
                    {g.count >= 3 ? g.label : ""}
                  </span>
                ))}
              </div>
              <div className="tl-days" aria-hidden="true">
                {days.map((d) => {
                  const wd = weekday(d);
                  const cls = d === today ? "today" : wd === 0 || wd === 6 ? "weekend" : "";
                  return (
                    <span key={d} className={cls}>
                      {Number(d.slice(8))}
                    </span>
                  );
                })}
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const assignee = members.find((m) => m.id === r.task.assignee_id);
            const span = barSpan(r.start, r.end, days);
            const overdue = isRowOverdue(r, today);
            const pct = Math.round((r.done / r.total) * 100);
            const progress = r.hasChildren ? `${pct}%` : statusLabel(r.task.status);
            const period = r.start ? `${fmtDay(r.start)} 〜 ${r.end ? fmtDay(r.end) : ""}` : "";
            return (
              <tr key={r.task.id} className={`${r.hasChildren ? "parent" : ""}${selected === r.task.id ? " selected" : ""}`}>
                <td className="c-no">{r.no}</td>
                <td className="c-name">
                  <Link
                    href={`/wbs?edit=${r.task.id}#detail`}
                    style={{ paddingLeft: r.depth * 14 }}
                    aria-label={`${r.no} ${r.task.title}を編集`}
                  >
                    {r.task.title}
                  </Link>
                </td>
                <td className="c-who">
                  {assignee && (
                    <span className="tag" style={memberVars(members, assignee.id)} title={assignee.name}>
                      {assignee.name}
                    </span>
                  )}
                </td>
                <td className="c-start">{r.start ? fmtDay(r.start) : "—"}</td>
                <td className={`c-end${overdue ? " overdue" : ""}`}>{r.end ? fmtDay(r.end) : "—"}</td>
                <td className="c-pct">{progress}</td>
                <td className="tl">
                  {todayMark}
                  {span && (
                    <span
                      className={`bar ${r.hasChildren ? "summary" : r.task.status}${overdue ? " late" : ""}`}
                      style={{
                        ...(assignee && !r.hasChildren ? memberVars(members, assignee.id) : {}),
                        left: percent(span.left, days),
                        width: percent(span.width, days),
                      }}
                      title={`${r.task.title}：${period}（${progress}）`}
                      aria-hidden="true"
                    >
                      {r.hasChildren && <i style={{ width: `${pct}%` }} />}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
