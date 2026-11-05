import type { Task } from "./tasks";
import { addDays, diffDays, weekday } from "./time";

export type WbsRow = {
  task: Task;
  /** WBS番号 "1.2.3"。兄弟の作成順で決まるので、日付を変えても変わらない */
  no: string;
  depth: number;
  hasChildren: boolean;
  /** 子があれば配下の最小の開始、なければ自分の開始（なければ期限） */
  start: string | null;
  /** 子があれば配下の最大の期限、なければ自分の期限（なければ開始） */
  end: string | null;
  /** 配下の末端タスクの数と、そのうち完了の数（末端なら 1 と 0/1） */
  total: number;
  done: number;
};

/** タスクを親子の順に並べ、番号と配下の集計を付ける */
export function buildWbs(tasks: Task[]): WbsRow[] {
  const ids = new Set(tasks.map((t) => t.id));
  const kids = new Map<string | null, Task[]>();
  for (const t of tasks) {
    const key = t.parent_id && ids.has(t.parent_id) ? t.parent_id : null;
    kids.set(key, [...(kids.get(key) ?? []), t]);
  }
  for (const list of kids.values()) list.sort((a, b) => a.created_at.localeCompare(b.created_at));

  const rows: WbsRow[] = [];
  const walk = (task: Task, no: string, depth: number): WbsRow => {
    const children = kids.get(task.id) ?? [];
    const row: WbsRow = {
      task,
      no,
      depth,
      hasChildren: children.length > 0,
      start: null,
      end: null,
      total: 0,
      done: 0,
    };
    rows.push(row);
    if (children.length === 0) {
      row.start = task.start_date ?? task.due_date;
      row.end = task.due_date ?? task.start_date;
      row.total = 1;
      row.done = task.status === "done" ? 1 : 0;
      return row;
    }
    children.forEach((c, i) => {
      const r = walk(c, `${no}.${i + 1}`, depth + 1);
      row.total += r.total;
      row.done += r.done;
      if (r.start && (!row.start || r.start < row.start)) row.start = r.start;
      if (r.end && (!row.end || r.end > row.end)) row.end = r.end;
    });
    return row;
  };
  (kids.get(null) ?? []).forEach((t, i) => walk(t, String(i + 1), 0));
  return rows;
}

/** 実際に作業する末端のタスク。子を持つタスクは配下のまとめとして扱う */
export function leafTasks(tasks: Task[]): Task[] {
  const parents = new Set(tasks.map((t) => t.parent_id));
  return tasks.filter((t) => !parents.has(t.id));
}

export function descendantsOf(rows: WbsRow[], id: string): WbsRow[] {
  const self = rows.find((r) => r.task.id === id);
  return self ? rows.filter((r) => r.no.startsWith(`${self.no}.`)) : [];
}

/** 親に選べるタスク。自分と自分の配下を親にすると循環するので除く */
export function parentChoices(rows: WbsRow[], id: string | null): WbsRow[] {
  if (!id) return rows;
  const excluded = new Set([id, ...descendantsOf(rows, id).map((r) => r.task.id)]);
  return rows.filter((r) => !excluded.has(r.task.id));
}

export function isRowOverdue(row: WbsRow, today: string): boolean {
  return row.done < row.total && row.end !== null && row.end < today;
}

/** 日付の入力ミスで列が増えすぎないようにする上限 */
const MAX_GANTT_DAYS = 183;
const MIN_GANTT_DAYS = 28;

const mondayOf = (key: string) => addDays(key, -((weekday(key) + 6) % 7));

export type GanttRange = { days: string[]; clipped: boolean };

/** 全タスクと今日が入る範囲を、月曜はじまりの週単位で返す */
export function ganttRange(rows: WbsRow[], today: string): GanttRange {
  const dates = [today, ...rows.flatMap((r) => [r.start, r.end]).filter((d): d is string => d !== null)].sort();
  let from = mondayOf(dates[0]);
  let last = dates[dates.length - 1];
  if (diffDays(from, last) + 1 < MIN_GANTT_DAYS) last = addDays(from, MIN_GANTT_DAYS - 1);

  let clipped = false;
  if (diffDays(from, last) + 1 > MAX_GANTT_DAYS) {
    clipped = true;
    const earliest = addDays(today, -60);
    from = mondayOf(dates[0] > earliest ? dates[0] : earliest);
    const limit = addDays(from, MAX_GANTT_DAYS - 1);
    if (last > limit) last = limit;
  }

  const count = Math.ceil((diffDays(from, last) + 1) / 7) * 7;
  return { days: Array.from({ length: count }, (_, i) => addDays(from, i)), clipped };
}

/** バーの位置（範囲の先頭からの日数と長さ）。範囲外は null、はみ出す分は切り詰める */
export function barSpan(start: string | null, end: string | null, days: string[]) {
  if (!start || !end) return null;
  const first = days[0];
  const last = days[days.length - 1];
  if (end < first || start > last) return null;
  const left = Math.max(0, diffDays(first, start));
  const right = diffDays(first, end > last ? last : end);
  return { left, width: right - left + 1 };
}
