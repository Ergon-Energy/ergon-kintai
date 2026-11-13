import { after } from "next/server";
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
import { HELP_TEXT, parseCommand, type Command } from "@/lib/command";
import { verifySlackRequest } from "@/lib/slack";
import { fmtDuration, fmtTime, periodRange } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type SlackReply = { response_type: "in_channel" | "ephemeral"; text: string };

const quote = (s: string) =>
  s
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n");

/**
 * Slack は3秒以内に応答しないとタイムアウト扱いにする。
 * そこで、署名を確認したらすぐ空の 200 を返し、DB処理は after() で応答後に行い、
 * 結果は response_url に送る（30分以内・5回まで送れる）。
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifySlackRequest(raw, req.headers)) {
    return new Response("invalid signature", { status: 401 });
  }

  const p = new URLSearchParams(raw);
  const userId = p.get("user_id") ?? "";
  const userName = p.get("user_name") ?? "";
  const responseUrl = p.get("response_url") ?? "";
  // 打刻時刻は「コマンドを打った瞬間」で確定させる
  const cmd = parseCommand(p.get("text") ?? "");

  // DB不要なヘルプはその場で返す
  if (cmd.kind === "help") {
    return Response.json({ response_type: "ephemeral", text: HELP_TEXT } satisfies SlackReply);
  }

  after(async () => {
    const reply = await handle(cmd, userId, userName);
    await sendToSlack(responseUrl, reply);
  });

  return new Response(null, { status: 200 });
}

async function handle(cmd: Command, userId: string, userName: string): Promise<SlackReply> {
  const me = `<@${userId}>`;
  try {
    const member = await findOrCreateSlackMember(userId, userName);
    switch (cmd.kind) {
      case "in": {
        await clockIn(member.id, cmd.at, cmd.text, "slack");
        return {
          response_type: "in_channel",
          text: `🟢 ${me} 出勤 ${fmtTime(cmd.at)}${cmd.text ? "\n" + quote(cmd.text) : ""}`,
        };
      }
      case "out": {
        const { durationMs } = await clockOut(member.id, cmd.at, cmd.text, "slack");
        return {
          response_type: "in_channel",
          text:
            `🔴 ${me} 退勤 ${fmtTime(cmd.at)}（${fmtDuration(durationMs)}）` +
            (cmd.text ? "\n" + quote(cmd.text) : ""),
        };
      }
      case "log": {
        await addLog(member.id, cmd.text, "slack");
        return { response_type: "ephemeral", text: `📝 記録しました\n${quote(cmd.text)}` };
      }
      case "status":
        return { response_type: "ephemeral", text: await statusText() };
      default:
        return { response_type: "ephemeral", text: HELP_TEXT };
    }
  } catch (e) {
    if (e instanceof AttendanceError) {
      return { response_type: "ephemeral", text: `⚠️ ${e.message}` };
    }
    console.error(e);
    return { response_type: "ephemeral", text: "⚠️ エラーが発生しました。画面で記録されたか確認してください。" };
  }
}

async function sendToSlack(responseUrl: string, reply: SlackReply) {
  if (!responseUrl.startsWith("https://hooks.slack.com/")) {
    console.error("unexpected response_url", responseUrl);
    return;
  }
  const res = await fetch(responseUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(reply),
  });
  if (!res.ok) console.error("response_url failed", res.status, await res.text());
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
