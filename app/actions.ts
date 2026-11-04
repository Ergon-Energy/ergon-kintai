"use server";

import { redirect } from "next/navigation";
import { AttendanceError, addLog, clockIn, clockOut } from "@/lib/attendance";
import { parseClock } from "@/lib/time";

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
