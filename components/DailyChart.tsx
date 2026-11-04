import type { MemberSummary } from "@/lib/attendance";
import { dayKey, fmtDuration, fmtHours, weekday } from "@/lib/time";

const W = 720;
const H = 220;
const PAD = { top: 12, right: 8, bottom: 28, left: 32 };

/** 日ごとの勤務時間（メンバーごとに並べた棒グラフ） */
export function DailyChart({
  days,
  summary,
  colors,
}: {
  days: string[];
  summary: MemberSummary[];
  colors: string[];
}) {
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const maxH = Math.max(4, ...summary.flatMap((s) => [...s.daily.values()].map((v) => v / 3_600_000)));
  const step = maxH > 10 ? 4 : 2;
  const top = Math.ceil(maxH / step) * step;
  const y = (h: number) => PAD.top + plotH - (h / top) * plotH;

  const groupW = plotW / days.length;
  const n = Math.max(1, summary.length);
  const barW = Math.min(16, (groupW * 0.72) / n);
  const labelEvery = days.length > 14 ? 3 : 1;
  const today = dayKey(new Date());

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="日ごとの勤務時間">
      {Array.from({ length: top / step + 1 }, (_, i) => i * step).map((h) => (
        <g key={h}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(h)} y2={y(h)} className="grid" />
          <text x={PAD.left - 6} y={y(h) + 4} className="axis" textAnchor="end">
            {h}h
          </text>
        </g>
      ))}
      {days.map((d, i) => {
        const x0 = PAD.left + i * groupW + (groupW - barW * n) / 2;
        const wd = weekday(d);
        return (
          <g key={d}>
            {summary.map((s, j) => {
              const ms = s.daily.get(d) ?? 0;
              if (ms <= 0) return null;
              const h = ms / 3_600_000;
              return (
                <rect
                  key={s.member.id}
                  x={x0 + j * barW}
                  y={y(h)}
                  width={Math.max(1, barW - 2)}
                  height={y(0) - y(h)}
                  rx={2}
                  fill={colors[j % colors.length]}
                >
                  <title>{`${d} ${s.member.name}: ${fmtDuration(ms)}（${fmtHours(ms)}h）`}</title>
                </rect>
              );
            })}
            {i % labelEvery === 0 && (
              <text
                x={PAD.left + i * groupW + groupW / 2}
                y={H - 10}
                textAnchor="middle"
                className={`axis${wd === 0 || wd === 6 ? " weekend" : ""}${d === today ? " today" : ""}`}
              >
                {Number(d.slice(8))}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
