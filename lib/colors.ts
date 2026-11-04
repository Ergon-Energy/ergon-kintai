import type { CSSProperties } from "react";

// 色の値は globals.css の --member-* で、テーマごとに定義している
const COUNT = 2;

function indexOf(members: { id: string }[], id: string): number {
  return (Math.max(0, members.findIndex((m) => m.id === id)) % COUNT) + 1;
}

/** メンバーの登録順で色を固定する（3人目以降は色が繰り返すので、イニシャルや名前でも区別する） */
export function colorOf(members: { id: string }[], id: string): string {
  return `var(--member-${indexOf(members, id)})`;
}

/** バッジやタグ用に、塗りの色（--c）とその上の文字色（--on-c）を渡す */
export function memberVars(members: { id: string }[], id: string): CSSProperties {
  const n = indexOf(members, id);
  return { "--c": `var(--member-${n})`, "--on-c": `var(--on-member-${n})` } as CSSProperties;
}
