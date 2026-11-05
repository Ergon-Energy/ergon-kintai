import { AttendanceError, check } from "./attendance";
import { db } from "./supabase";
import { addDays, dayKey, dayStart, fmtDay } from "./time";

export const TASK_STATUSES = [
  { id: "todo", label: "未着手" },
  { id: "doing", label: "進行中" },
  { id: "done", label: "完了" },
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number]["id"];

export type Task = {
  id: string;
  title: string;
  note: string | null;
  assignee_id: string | null;
  status: TaskStatus;
  due_date: string | null; // "YYYY-MM-DD"
  completed_at: string | null;
  created_at: string;
};

/** 完了の列に出す期間。古い完了タスクで画面が埋まらないようにする */
export const DONE_VISIBLE_DAYS = 30;

export function isTaskStatus(v: unknown): v is TaskStatus {
  return TASK_STATUSES.some((s) => s.id === v);
}

export function statusLabel(status: TaskStatus): string {
  return TASK_STATUSES.find((s) => s.id === status)!.label;
}

/** 空欄は期限なし（null）。存在しない日付はエラー */
export function parseDueDate(input: string): string | null {
  if (!input) return null;
  const d = dayStart(input);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input) || Number.isNaN(d.getTime()) || dayKey(d) !== input) {
    throw new AttendanceError("期限の日付を正しく入力してください。");
  }
  return input;
}

export function isOverdue(task: Task, today: string): boolean {
  return task.status !== "done" && task.due_date !== null && task.due_date < today;
}

/** カードに出す期限の文言 */
export function dueLabel(task: Task, today: string): string | null {
  if (!task.due_date) return null;
  if (task.status !== "done") {
    if (task.due_date === today) return "今日まで";
    if (task.due_date === addDays(today, 1)) return "明日まで";
    if (task.due_date < today) {
      const days = Math.round((dayStart(today).getTime() - dayStart(task.due_date).getTime()) / 86_400_000);
      return `${fmtDay(task.due_date)}まで（${days}日超過）`;
    }
  }
  return `${fmtDay(task.due_date)}まで`;
}

/** 完了は新しい順、それ以外は期限が近い順（期限なしは最後、同じなら作成順） */
export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.status === "done" && b.status === "done") {
      return (b.completed_at ?? "").localeCompare(a.completed_at ?? "");
    }
    return (
      (a.due_date ?? "9999-12-31").localeCompare(b.due_date ?? "9999-12-31") ||
      a.created_at.localeCompare(b.created_at)
    );
  });
}

export type TaskStats = { open: number; overdue: number; doneThisWeek: number };

export function taskStats(tasks: Task[], today: string, weekStart: Date): TaskStats {
  return {
    open: tasks.filter((t) => t.status !== "done").length,
    overdue: tasks.filter((t) => isOverdue(t, today)).length,
    doneThisWeek: tasks.filter(
      (t) => t.status === "done" && t.completed_at !== null && new Date(t.completed_at) >= weekStart,
    ).length,
  };
}

const GONE = "このタスクはすでに削除されています。";

/** 未完了のすべてと、直近の完了を取得 */
export async function getTasks(now: Date = new Date()): Promise<Task[]> {
  const since = new Date(now.getTime() - DONE_VISIBLE_DAYS * 86_400_000).toISOString();
  return check(
    await db().from("tasks").select("*").or(`status.neq.done,completed_at.gte."${since}"`),
  ) as Task[];
}

type TaskInput = { title: string; note?: string; assigneeId: string; due: string };

function toRow({ title, note, assigneeId, due }: TaskInput) {
  if (!title.trim()) throw new AttendanceError("タスク名を書いてください。");
  return {
    title: title.trim(),
    note: note?.trim() || null,
    assignee_id: assigneeId || null,
    due_date: parseDueDate(due),
  };
}

export async function createTask(input: TaskInput): Promise<void> {
  check(await db().from("tasks").insert(toRow(input)));
}

export async function updateTask(id: string, input: TaskInput): Promise<void> {
  const rows = check(await db().from("tasks").update(toRow(input)).eq("id", id).select()) as Task[];
  if (rows.length === 0) throw new AttendanceError(GONE);
}

export async function setTaskStatus(id: string, status: string, now: Date = new Date()): Promise<void> {
  if (!isTaskStatus(status)) throw new AttendanceError("状態を正しく指定してください。");
  const rows = check(
    await db()
      .from("tasks")
      .update({ status, completed_at: status === "done" ? now.toISOString() : null })
      .eq("id", id)
      .select(),
  ) as Task[];
  if (rows.length === 0) throw new AttendanceError(GONE);
}

export async function deleteTask(id: string): Promise<void> {
  check(await db().from("tasks").delete().eq("id", id));
}
