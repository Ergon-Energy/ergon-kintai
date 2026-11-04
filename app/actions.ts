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
