import {
  AttendanceError,
  addLog,
  clockIn,
  clockOut,
  findOrCreateSlackMember,
  getMembers,
  getOpenSessions,
  getRange,
  summarize,
} from "@/lib/attendance";
import { HELP_TEXT, parseCommand } from "@/lib/command";
import { verifySlackRequest } from "@/lib/slack";
import { fmtDuration, fmtTime, periodRange } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SlackReply = { response_type: "in_channel" | "ephemeral"; text: string };

const quote = (s: string) =>
  s
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n");

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifySlackRequest(raw, req.headers)) {
    return new Response("invalid signature", { status: 401 });
  }

  const p = new URLSearchParams(raw);
  const userId = p.get("user_id") ?? "";
  const userName = p.get("user_name") ?? "";
  const cmd = parseCommand(p.get("text") ?? "");
  const me = `<@${userId}>`;

  try {
    const member = await findOrCreateSlackMember(userId, userName);
    let reply: SlackReply;

    switch (cmd.kind) {
      case "in": {
        await clockIn(member.id, cmd.at, cmd.text, "slack");
        reply = {
          response_type: "in_channel",
          text: `🟢 ${me} 出勤 ${fmtTime(cmd.at)}${cmd.text ? "\n" + quote(cmd.text) : ""}`,
        };
        break;
      }
      case "out": {
        const { durationMs } = await clockOut(member.id, cmd.at, cmd.text, "slack");
        reply = {
          response_type: "in_channel",
          text:
            `🔴 ${me} 退勤 ${fmtTime(cmd.at)}（${fmtDuration(durationMs)}）` +
            (cmd.text ? "\n" + quote(cmd.text) : ""),
        };
        break;
      }
      case "log": {
        await addLog(member.id, cmd.text, "slack");
        reply = { response_type: "ephemeral", text: `📝 記録しました\n${quote(cmd.text)}` };
        break;
      }
      case "status": {
        reply = { response_type: "ephemeral", text: await statusText() };
        break;
      }
      default:
        reply = { response_type: "ephemeral", text: HELP_TEXT };
    }
    return Response.json(reply);
  } catch (e) {
    if (e instanceof AttendanceError) {
      return Response.json({ response_type: "ephemeral", text: `⚠️ ${e.message}` });
    }
    console.error(e);
    return Response.json({ response_type: "ephemeral", text: "⚠️ エラーが発生しました。少し待って再度お試しください。" });
  }
}

async function statusText(): Promise<string> {
  const range = periodRange("week");
  const [members, open, { sessions, logs }] = await Promise.all([
    getMembers(),
    getOpenSessions(),
    getRange(range),
  ]);
  const summary = summarize(members, sessions, logs, range);
  const lines = summary.map(({ member, totalMs }) => {
    const s = open.find((o) => o.member_id === member.id);
    const who = member.slack_user_id ? `<@${member.slack_user_id}>` : member.name;
    const state = s ? `🟢 勤務中（${fmtTime(s.started_at)}〜）` : "⚪️ 勤務外";
    return `${who}　${state}　今週 ${fmtDuration(totalMs)}`;
  });
  return lines.length ? lines.join("\n") : "まだ記録がありません。`/kintai in` で出勤できます。";
}
