import { db } from "./supabase";
import { fmtDuration, fmtTime, splitByDay, type Range } from "./time";

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

export async function findOrCreateSlackMember(slackUserId: string, name: string): Promise<Member> {
  const found = check(
    await db().from("members").select("*").eq("slack_user_id", slackUserId).maybeSingle(),
  ) as Member | null;
  if (found) return found;
  return check(
    await db()
      .from("members")
      .insert({ slack_user_id: slackUserId, name: name || slackUserId })
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
export async function getRange(range: Range): Promise<{ sessions: Session[]; logs: Log[] }> {
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
  range: Range,
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
