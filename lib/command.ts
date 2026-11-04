import { parseClock } from "./time";

export type Command =
  | { kind: "in"; at: Date; text: string }
  | { kind: "out"; at: Date; text: string }
  | { kind: "log"; text: string }
  | { kind: "status" }
  | { kind: "help" };

const ALIASES: Record<string, "in" | "out" | "log" | "status" | "help"> = {
  in: "in",
  start: "in",
  出勤: "in",
  開始: "in",
  out: "out",
  end: "out",
  退勤: "out",
  終了: "out",
  log: "log",
  did: "log",
  作業: "log",
  メモ: "log",
  status: "status",
  st: "status",
  状況: "status",
  help: "help",
  ヘルプ: "help",
};

/**
 * /kintai のテキストを解釈する。
 *   in [9:30] [メモ]
 *   out [18:10] [やったこと]
 *   log <やったこと>
 *   status / help
 */
export function parseCommand(raw: string, now: Date = new Date()): Command {
  const text = raw.replace(/　/g, " ").trim();
  if (!text) return { kind: "status" };
  const [head, ...rest] = text.split(/\s+/);
  const kind = ALIASES[head.toLowerCase()];
  if (!kind) return { kind: "help" };

  if (kind === "status" || kind === "help") return { kind };

  let body = text.slice(head.length).trim();
  if (kind === "log") return { kind, text: body };

  let at = now;
  const first = rest[0];
  const clock = first ? parseClock(first, now) : null;
  if (clock) {
    at = clock;
    body = body.slice(first.length).trim();
  }
  return { kind, at, text: body };
}

export const HELP_TEXT = [
  "*使い方*",
  "`/kintai in` 出勤（`/kintai in 9:30 資料作り` のように時刻とメモも付けられます）",
  "`/kintai out やったこと` 退勤（`/kintai out 18:10 …` で時刻指定）",
  "`/kintai log やったこと` 勤務中のやったことを記録",
  "`/kintai status` 2人の状況と今週の勤務時間",
].join("\n");
