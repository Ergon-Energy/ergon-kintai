// 日付はすべて日本時間（Asia/Tokyo, UTC+9・夏時間なし）で扱う
export const TZ = "Asia/Tokyo";
const DAY = 86_400_000;

const keyFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const timeFmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const pad = (n: number) => String(n).padStart(2, "0");

/** 日本時間の日付キー "YYYY-MM-DD" */
export function dayKey(d: Date): string {
  return keyFmt.format(d);
}

/** 日付キーの 0:00（日本時間） */
export function dayStart(key: string): Date {
  return new Date(`${key}T00:00:00+09:00`);
}

export function addDays(key: string, n: number): string {
  return dayKey(new Date(dayStart(key).getTime() + n * DAY));
}

/** 0=日 … 6=土 */
export function weekday(key: string): number {
  return new Date(`${key}T12:00:00+09:00`).getUTCDay();
}

const WD = "日月火水木金土";

export function fmtDay(key: string): string {
  const [, m, d] = key.split("-");
  return `${Number(m)}/${Number(d)}(${WD[weekday(key)]})`;
}

export function fmtTime(d: Date | string): string {
  return timeFmt.format(typeof d === "string" ? new Date(d) : d);
}

export function fmtDuration(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}分`;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}

export function fmtHours(ms: number): string {
  return (ms / 3_600_000).toFixed(1);
}

/** 区間を日本時間の日ごとに分割して、日ごとのミリ秒を返す（日付をまたぐ勤務用） */
export function splitByDay(start: Date, end: Date): Map<string, number> {
  const out = new Map<string, number>();
  let t = start.getTime();
  const e = end.getTime();
  while (t < e) {
    const key = dayKey(new Date(t));
    const next = Math.min(dayStart(addDays(key, 1)).getTime(), e);
    out.set(key, (out.get(key) ?? 0) + (next - t));
    t = next;
  }
  return out;
}

/**
 * "9:30" や "９：３０" を今日のその時刻として解釈する。
 * 今より未来になる場合は前日とみなす（0:10 に "out 23:50" と打ったケース）。
 */
export function parseClock(s: string, now: Date = new Date()): Date | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.normalize("NFKC"));
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  let d = new Date(`${dayKey(now)}T${pad(h)}:${pad(mi)}:00+09:00`);
  if (d.getTime() > now.getTime() + 60_000) d = new Date(d.getTime() - DAY);
  return d;
}

export type PeriodId = "week" | "last-week" | "month" | "last-month";

export const PERIODS: { id: PeriodId; label: string }[] = [
  { id: "week", label: "今週" },
  { id: "last-week", label: "先週" },
  { id: "month", label: "今月" },
  { id: "last-month", label: "先月" },
];

export function isPeriodId(v: unknown): v is PeriodId {
  return PERIODS.some((p) => p.id === v);
}

export type Span = {
  from: string; // 含む
  to: string; // 含まない
  days: string[];
  fromDate: Date;
  toDate: Date;
};

export type Range = Span & { id: PeriodId };

/** 週は月曜はじまり */
export function periodRange(id: PeriodId, now: Date = new Date()): Range {
  const today = dayKey(now);
  let from: string;
  let to: string;
  if (id === "week" || id === "last-week") {
    const sinceMonday = (weekday(today) + 6) % 7;
    from = addDays(today, -sinceMonday - (id === "last-week" ? 7 : 0));
    to = addDays(from, 7);
  } else {
    let [y, m] = today.split("-").map(Number);
    if (id === "last-month") {
      m -= 1;
      if (m === 0) {
        m = 12;
        y -= 1;
      }
    }
    from = `${y}-${pad(m)}-01`;
    to = m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;
  }
  const days: string[] = [];
  for (let k = from; k < to; k = addDays(k, 1)) days.push(k);
  return { id, from, to, days, fromDate: dayStart(from), toDate: dayStart(to) };
}

function makeSpan(from: string, to: string): Span {
  const days: string[] = [];
  for (let k = from; k < to; k = addDays(k, 1)) days.push(k);
  return { from, to, days, fromDate: dayStart(from), toDate: dayStart(to) };
}

/** 月キー "YYYY-MM"（日本時間） */
export function monthKey(now: Date = new Date()): string {
  return dayKey(now).slice(0, 7);
}

export function isMonthKey(v: unknown): v is string {
  return typeof v === "string" && /^20\d{2}-(0[1-9]|1[0-2])$/.test(v);
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

export function fmtMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${y}年${m}月`;
}

export function monthSpan(month: string): Span {
  return makeSpan(`${month}-01`, `${addMonths(month, 1)}-01`);
}

/** カレンダーに並べる範囲（その月を含む、月曜はじまりの週単位） */
export function calendarSpan(month: string): Span {
  const { from, to } = monthSpan(month);
  const last = addDays(to, -1);
  return makeSpan(addDays(from, -((weekday(from) + 6) % 7)), addDays(last, 7 - ((weekday(last) + 6) % 7)));
}
