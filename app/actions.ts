"use server";

import { redirect } from "next/navigation";
import {
  AttendanceError,
  addLog,
  clockIn,
  clockOut,
  deleteLog,
  deleteSession,
  updateLog,
  updateSession,
} from "@/lib/attendance";
import { createTask, deleteTask, isTaskStatus, setTaskStatus, statusLabel, updateTask, type TaskInput } from "@/lib/tasks";
import { dayKey, parseClock } from "@/lib/time";

/** 画面からの打刻。結果はクエリ文字列で画面に戻す */
export async function punch(formData: FormData) {
  const memberId = String(formData.get("member") ?? "");
  const action = String(formData.get("action") ?? "");
  const text = String(formData.get("text") ?? "").trim();
  const timeStr = String(formData.get("time") ?? "").trim();
  const period = String(formData.get("period") ?? "week");

  let msg: string;
  let ok = true;
  try {
    if (!memberId) throw new AttendanceError("メンバーを選んでください。");
    const at = timeStr ? parseClock(timeStr) : new Date();
    if (!at) throw new AttendanceError("時刻は 9:30 のように入力してください。");

    if (action === "in") {
      await clockIn(memberId, at, text, "web");
      msg = "出勤を記録しました";
    } else if (action === "out") {
      await clockOut(memberId, at, text, "web");
      msg = "退勤を記録しました";
    } else {
      await addLog(memberId, text, "web");
      msg = "やったことを記録しました";
    }
  } catch (e) {
    if (!(e instanceof AttendanceError)) throw e;
    ok = false;
    msg = e.message;
  }
  const q = new URLSearchParams({ period, [ok ? "ok" : "err"]: msg });
  redirect(`/status?${q}`);
}

const field = (f: FormData, name: string) => String(f.get(name) ?? "");

/**
 * カレンダーからの編集・削除を実行し、結果を付けてカレンダーに戻す。
 * work が日付を返したら（日時を変えた場合）その日を開く。
 */
async function editAndReturn(f: FormData, okMsg: string, work: () => Promise<string | void>) {
  let month = field(f, "month");
  let day = field(f, "day");
  let result: Record<string, string>;
  try {
    const at = await work();
    if (at) {
      day = dayKey(new Date(at));
      month = day.slice(0, 7);
    }
    result = { ok: okMsg };
  } catch (e) {
    if (!(e instanceof AttendanceError)) throw e;
    result = { err: e.message };
  }
  redirect(`/?${new URLSearchParams({ month, day, ...result })}#detail`);
}

export async function saveSession(f: FormData) {
  await editAndReturn(f, "勤務を更新しました", async () => {
    const s = await updateSession(field(f, "id"), field(f, "start"), field(f, "end"), field(f, "note"));
    return s.started_at;
  });
}

export async function removeSession(f: FormData) {
  await editAndReturn(f, "勤務を削除しました", () => deleteSession(field(f, "id")));
}

export async function saveLog(f: FormData) {
  await editAndReturn(f, "やったことを更新しました", async () => {
    const l = await updateLog(field(f, "id"), field(f, "at"), field(f, "content"));
    return l.logged_at;
  });
}

export async function removeLog(f: FormData) {
  await editAndReturn(f, "やったことを削除しました", () => deleteLog(field(f, "id")));
}

/** タスクの操作を実行し、絞り込みや開いている行を保ったまま結果を付けて元の画面に戻す */
async function taskAndReturn(f: FormData, okMsg: string, work: () => Promise<void>) {
  const q = new URLSearchParams();
  if (field(f, "filter")) q.set("member", field(f, "filter"));
  if (field(f, "edit")) q.set("edit", field(f, "edit"));
  const path = field(f, "back") === "wbs" ? "/wbs" : "/tasks";
  try {
    await work();
    q.set("ok", okMsg);
  } catch (e) {
    if (!(e instanceof AttendanceError)) throw e;
    q.set("err", e.message);
  }
  redirect(`${path}?${q}`);
}

const taskInput = (f: FormData): TaskInput => ({
  title: field(f, "title"),
  note: field(f, "note"),
  parentId: field(f, "parent"),
  assigneeId: field(f, "assignee"),
  start: field(f, "start"),
  due: field(f, "due"),
});

export async function addTask(f: FormData) {
  await taskAndReturn(f, "タスクを追加しました", () => createTask(taskInput(f)));
}

export async function saveTask(f: FormData) {
  await taskAndReturn(f, "タスクを更新しました", () => updateTask(field(f, "id"), taskInput(f)));
}

export async function moveTask(f: FormData) {
  const status = field(f, "status");
  const msg = isTaskStatus(status) ? `「${statusLabel(status)}」に移しました` : "";
  await taskAndReturn(f, msg, () => setTaskStatus(field(f, "id"), status));
}

export async function removeTask(f: FormData) {
  await taskAndReturn(f, "タスクを削除しました", () => deleteTask(field(f, "id")));
}
