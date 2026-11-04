import { fetchSlackRealName } from "./slack";
import { db } from "./supabase";
import { addDays, dayKey, dayStart, fmtDay, fmtDuration, fmtTime, parseLocalInput, splitByDay, toLocalInput, type Span } from "./time";

export type Member = { id: string; name: string; slack_user_id: string | null };
export type Session = {
  id: string;
  member_id: string;
  started_at: string;
  ended_at: string | null;
  note: string | null;
  source: string;
};
export type Log = {
  id: string;
  member_id: string;
  session_id: string | null;
  content: string;
  logged_at: string;
  source: string;
};
export type Source = "slack" | "web";

/** 利用者に見せてよいエラー（打刻の重複など） */
export class AttendanceError extends Error {}

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export async function getMembers(): Promise<Member[]> {
  return check(await db().from("members").select("*").order("created_at")) as Member[];
}

/**
 * Slack ユーザーのメンバーを返す。氏名が取れればそれを名前にする。
 * 名前が Slack のユーザー名のままの人だけ更新するので、手で変えた名前は上書きしない。
 */
export async function findOrCreateSlackMember(slackUserId: string, userName: string): Promise<Member> {
  const found = check(
    await db().from("members").select("*").eq("slack_user_id", slackUserId).maybeSingle(),
  ) as Member | null;
  if (found && found.name !== userName) return found;

  const realName = await fetchSlackRealName(slackUserId);
  if (found) {
    if (!realName || realName === found.name) return found;
    const { error } = await db().from("members").update({ name: realName }).eq("id", found.id);
    if (error) {
      console.warn("members.name の更新に失敗:", error.message); // 打刻は止めない
      return found;
    }
    return { ...found, name: realName };
  }
  return check(
    await db()
      .from("members")
      .insert({ slack_user_id: slackUserId, name: realName || userName || slackUserId })
      .select()
      .single(),
  ) as Member;
}

export async function getOpenSession(memberId: string): Promise<Session | null> {
  return check(
    await db()
      .from("work_sessions")
      .select("*")
      .eq("member_id", memberId)
      .is("ended_at", null)
      .maybeSingle(),
  ) as Session | null;
}

export async function getOpenSessions(): Promise<Session[]> {
  return check(await db().from("work_sessions").select("*").is("ended_at", null)) as Session[];
}

export async function clockIn(memberId: string, at: Date, note: string | null, source: Source) {
  const open = await getOpenSession(memberId);
  if (open) {
    throw new AttendanceError(`すでに ${fmtTime(open.started_at)} から勤務中です。先に退勤してください。`);
  }
  if (at.getTime() > Date.now() + 60_000) throw new AttendanceError("未来の時刻では出勤できません。");
  return check(
    await db()
      .from("work_sessions")
      .insert({ member_id: memberId, started_at: at.toISOString(), note: note || null, source })
      .select()
      .single(),
  ) as Session;
}

export async function clockOut(memberId: string, at: Date, summary: string | null, source: Source) {
  const open = await getOpenSession(memberId);
  if (!open) throw new AttendanceError("勤務中ではありません。先に出勤してください。");
  if (at.getTime() <= new Date(open.started_at).getTime()) {
    throw new AttendanceError(`退勤時刻が出勤時刻（${fmtTime(open.started_at)}）より前です。`);
  }
  const session = check(
    await db()
      .from("work_sessions")
      .update({ ended_at: at.toISOString() })
      .eq("id", open.id)
      .select()
      .single(),
  ) as Session;
  if (summary) {
    check(
      await db().from("activity_logs").insert({
        member_id: memberId,
        session_id: open.id,
        content: summary,
        logged_at: at.toISOString(),
        source,
      }),
    );
  }
  return { session, durationMs: at.getTime() - new Date(open.started_at).getTime() };
}

export async function addLog(memberId: string, content: string, source: Source) {
  if (!content.trim()) throw new AttendanceError("やったことを書いてください。");
  const open = await getOpenSession(memberId);
  return check(
    await db()
      .from("activity_logs")
      .insert({ member_id: memberId, session_id: open?.id ?? null, content: content.trim(), source })
      .select()
      .single(),
  ) as Log;
}

/** 期間と重なる勤務と、期間内のやったことを取得 */
export async function getRange(range: Span): Promise<{ sessions: Session[]; logs: Log[] }> {
  const from = range.fromDate.toISOString();
  const to = range.toDate.toISOString();
  const [sessions, logs] = await Promise.all([
    db()
      .from("work_sessions")
      .select("*")
      .lt("started_at", to)
      .or(`ended_at.is.null,ended_at.gt."${from}"`)
      .order("started_at"),
    db()
      .from("activity_logs")
      .select("*")
      .gte("logged_at", from)
      .lt("logged_at", to)
      .order("logged_at"),
  ]);
  return { sessions: check(sessions) as Session[], logs: check(logs) as Log[] };
}

export type MemberSummary = {
  member: Member;
  daily: Map<string, number>;
  totalMs: number;
  workedDays: number;
  logCount: number;
};

/** 勤務時間を期間内に切り詰め、日本時間の日ごとに集計（勤務中の分は現在時刻まで） */
export function summarize(
  members: Member[],
  sessions: Session[],
  logs: Log[],
  range: Span,
  now: Date = new Date(),
): MemberSummary[] {
  return members.map((member) => {
    const daily = new Map<string, number>();
    for (const s of sessions) {
      if (s.member_id !== member.id) continue;
      const start = Math.max(new Date(s.started_at).getTime(), range.fromDate.getTime());
      const end = Math.min(
        s.ended_at ? new Date(s.ended_at).getTime() : now.getTime(),
        range.toDate.getTime(),
      );
      if (end <= start) continue;
      for (const [k, v] of splitByDay(new Date(start), new Date(end))) {
        daily.set(k, (daily.get(k) ?? 0) + v);
      }
    }
    const values = [...daily.values()];
    return {
      member,
      daily,
      totalMs: values.reduce((a, b) => a + b, 0),
      workedDays: values.filter((v) => v > 0).length,
      logCount: logs.filter((l) => l.member_id === member.id).length,
    };
  });
}

export function describeDuration(s: Session, now: Date = new Date()): string {
  const end = s.ended_at ? new Date(s.ended_at) : now;
  return fmtDuration(end.getTime() - new Date(s.started_at).getTime());
}

export type DaySegment = {
  sessionId: string;
  memberId: string;
  /** "09:30–18:10" / 日をまたぐ場合 "22:00–24:00" / 勤務中 "09:30〜" */
  label: string;
};

/** その日（日本時間）に重なる勤務を、日の範囲に切り詰めて返す */
export function segmentsOnDay(sessions: Session[], key: string, now: Date = new Date()): DaySegment[] {
  const dayFrom = dayStart(key).getTime();
  const dayTo = dayStart(addDays(key, 1)).getTime();
  const out: DaySegment[] = [];
  for (const s of sessions) {
    const start = Math.max(new Date(s.started_at).getTime(), dayFrom);
    const end = Math.min(s.ended_at ? new Date(s.ended_at).getTime() : now.getTime(), dayTo);
    if (end <= start) continue;
    const from = fmtTime(new Date(start));
    const running = !s.ended_at && now.getTime() < dayTo;
    const label = running ? `${from}〜` : `${from}–${end === dayTo ? "24:00" : fmtTime(new Date(end))}`;
    out.push({ sessionId: s.id, memberId: s.member_id, label });
  }
  return out;
}

/** 他の勤務と時間が重なっていれば、その勤務を返す（end が null は勤務中＝終わりなし） */
export function findOverlap(others: Session[], start: Date, end: Date | null): Session | undefined {
  return others.find((o) => {
    const oEnd = o.ended_at ? new Date(o.ended_at).getTime() : Infinity;
    return new Date(o.started_at).getTime() < (end ? end.getTime() : Infinity) && start.getTime() < oEnd;
  });
}

/** 分まで同じ入力なら元の値（秒を含む）を保ち、変更したときだけ置き換える */
function resolveTime(input: string, original: string | null, label: string): string {
  if (original && toLocalInput(original) === input) return original;
  const d = parseLocalInput(input);
  if (!d) throw new AttendanceError(`${label}の日時を正しく入力してください。`);
  if (d.getTime() > Date.now() + 60_000) throw new AttendanceError(`${label}に未来の日時は指定できません。`);
  return d.toISOString();
}

/** 勤務を編集する。endInput が空なら「勤務中」に戻す */
export async function updateSession(id: string, startInput: string, endInput: string, note: string): Promise<Session> {
  const current = check(
    await db().from("work_sessions").select("*").eq("id", id).maybeSingle(),
  ) as Session | null;
  if (!current) throw new AttendanceError("この勤務はすでに削除されています。");

  const startedAt = resolveTime(startInput, current.started_at, "出勤");
  const endedAt = endInput ? resolveTime(endInput, current.ended_at, "退勤") : null;
  const start = new Date(startedAt);
  const end = endedAt ? new Date(endedAt) : null;
  if (end && end <= start) throw new AttendanceError("退勤は出勤より後の日時にしてください。");

  const others = check(
    await db()
      .from("work_sessions")
      .select("*")
      .eq("member_id", current.member_id)
      .neq("id", id)
      .or(`ended_at.is.null,ended_at.gt."${startedAt}"`),
  ) as Session[];
  const clash = findOverlap(others.filter((o) => o.id !== id && o.member_id === current.member_id), start, end);
  if (clash) {
    throw new AttendanceError(
      `${fmtDay(dayKey(new Date(clash.started_at)))} ${fmtTime(clash.started_at)} からの勤務と重なっています。`,
    );
  }

  const rows = check(
    await db()
      .from("work_sessions")
      .update({ started_at: startedAt, ended_at: endedAt, note: note.trim() || null })
      .eq("id", id)
      .select(),
  ) as Session[];
  if (rows.length === 0) throw new AttendanceError("この勤務はすでに削除されています。");
  return rows[0];
}

export async function deleteSession(id: string): Promise<void> {
  check(await db().from("work_sessions").delete().eq("id", id));
}

export async function updateLog(id: string, atInput: string, content: string): Promise<Log> {
  if (!content.trim()) throw new AttendanceError("やったことを書いてください。");
  const current = check(
    await db().from("activity_logs").select("*").eq("id", id).maybeSingle(),
  ) as Log | null;
  if (!current) throw new AttendanceError("この記録はすでに削除されています。");
  const loggedAt = resolveTime(atInput, current.logged_at, "記録");
  const rows = check(
    await db()
      .from("activity_logs")
      .update({ logged_at: loggedAt, content: content.trim() })
      .eq("id", id)
      .select(),
  ) as Log[];
  if (rows.length === 0) throw new AttendanceError("この記録はすでに削除されています。");
  return rows[0];
}

export async function deleteLog(id: string): Promise<void> {
  check(await db().from("activity_logs").delete().eq("id", id));
}
