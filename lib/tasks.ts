import { AttendanceError, check } from "./attendance";
import { db } from "./supabase";
import { addDays, dayKey, dayStart, diffDays, fmtDay } from "./time";
import { buildWbs, leafTasks, parentChoices } from "./wbs";

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
  parent_id: string | null;
  assignee_id: string | null;
  status: TaskStatus;
  start_date: string | null; // "YYYY-MM-DD"
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

/** 空欄は日付なし（null）。存在しない日付はエラー */
export function parseTaskDate(input: string, label: string): string | null {
  if (!input) return null;
  const d = dayStart(input);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input) || Number.isNaN(d.getTime()) || dayKey(d) !== input) {
    throw new AttendanceError(`${label}の日付を正しく入力してください。`);
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
      return `${fmtDay(task.due_date)}まで（${diffDays(task.due_date, today)}日超過）`;
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

/** ボードに出すタスク。子を持つタスクと、古い完了タスクは出さない */
export function boardTasks(tasks: Task[], now: Date = new Date()): Task[] {
  const since = now.getTime() - DONE_VISIBLE_DAYS * 86_400_000;
  return leafTasks(tasks).filter(
    (t) => t.status !== "done" || (t.completed_at !== null && new Date(t.completed_at).getTime() >= since),
  );
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

export async function getTasks(): Promise<Task[]> {
  return check(await db().from("tasks").select("*")) as Task[];
}

export type TaskInput = {
  title: string;
  note: string;
  parentId: string;
  assigneeId: string;
  start: string;
  due: string;
};

function toRow({ title, note, parentId, assigneeId, start, due }: TaskInput) {
  if (!title.trim()) throw new AttendanceError("タスク名を書いてください。");
  const start_date = parseTaskDate(start, "開始");
  const due_date = parseTaskDate(due, "期限");
  if (start_date && due_date && start_date > due_date) {
    throw new AttendanceError("期限は開始より後の日付にしてください。");
  }
  return {
    title: title.trim(),
    note: note.trim() || null,
    parent_id: parentId || null,
    assignee_id: assigneeId || null,
    start_date,
    due_date,
  };
}

/** 親が消えていないか、自分や配下を親にしていないかを確かめる */
async function assertParent(parentId: string, id: string | null) {
  if (!parentId) return;
  const choices = parentChoices(buildWbs(await getTasks()), id);
  if (!choices.some((r) => r.task.id === parentId)) {
    throw new AttendanceError("このタスクは親にできません。選び直してください。");
  }
}

export async function createTask(input: TaskInput): Promise<void> {
  const row = toRow(input);
  await assertParent(input.parentId, null);
  check(await db().from("tasks").insert(row));
}

export async function updateTask(id: string, input: TaskInput): Promise<void> {
  const row = toRow(input);
  await assertParent(input.parentId, id);
  const rows = check(await db().from("tasks").update(row).eq("id", id).select()) as Task[];
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

  // 開始日が未入力なら、開始した日を記録する（期限を過ぎていれば開始が期限より後になるので入れない）
  const { start_date, due_date } = rows[0];
  const today = dayKey(now);
  if (status === "doing" && !start_date && (!due_date || due_date >= today)) {
    check(await db().from("tasks").update({ start_date: today }).eq("id", id));
  }
}

/** 配下のタスクも一緒に消える（DBの on delete cascade） */
export async function deleteTask(id: string): Promise<void> {
  check(await db().from("tasks").delete().eq("id", id));
}
