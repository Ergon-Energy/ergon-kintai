import { getMembers, getRange } from "@/lib/attendance";
import { dayKey, fmtTime, isPeriodId, periodRange } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const csv = (v: string) => `"${v.replace(/"/g, '""')}"`;

/** 勤務とやったことを1つのCSVで出力（Excelで開けるようBOM付き） */
export async function GET(req: Request) {
  const period = new URL(req.url).searchParams.get("period");
  const range = periodRange(isPeriodId(period) ? period : "month");
  const [members, { sessions, logs }] = await Promise.all([getMembers(), getRange(range)]);
  const name = (id: string) => members.find((m) => m.id === id)?.name ?? "";

  const rows: string[][] = [["種別", "日付", "メンバー", "開始", "終了", "分", "内容"]];
  for (const s of sessions) {
    const start = new Date(s.started_at);
    const end = s.ended_at ? new Date(s.ended_at) : null;
    rows.push([
      "勤務",
      dayKey(start),
      name(s.member_id),
      fmtTime(start),
      end ? fmtTime(end) : "勤務中",
      end ? String(Math.round((end.getTime() - start.getTime()) / 60_000)) : "",
      s.note ?? "",
    ]);
  }
  for (const l of logs) {
    const at = new Date(l.logged_at);
    rows.push(["やったこと", dayKey(at), name(l.member_id), fmtTime(at), "", "", l.content]);
  }

  const body = "﻿" + rows.map((r) => r.map(csv).join(",")).join("\r\n");
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="kintai_${range.from}_${range.id}.csv"`,
    },
  });
}
