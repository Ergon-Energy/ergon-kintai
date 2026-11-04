const COLORS = ["#2F6FDE", "#E0782F", "#2E9E6B", "#9B59B6"];

/** メンバーの登録順で色を固定する */
export function colorOf(members: { id: string }[], id: string): string {
  return COLORS[Math.max(0, members.findIndex((m) => m.id === id)) % COLORS.length];
}
