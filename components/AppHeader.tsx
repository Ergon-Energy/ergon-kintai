import Link from "next/link";

const PAGES = [
  { id: "calendar", href: "/", label: "カレンダー" },
  { id: "status", href: "/status", label: "勤怠状況" },
  { id: "tasks", href: "/tasks", label: "タスク" },
] as const;

export function AppHeader({ current }: { current: (typeof PAGES)[number]["id"] }) {
  return (
    <header className="top">
      <h1 className="brand">
        {/* OS の設定に合わせてロゴも切り替える。ワードマークは文字で打たず、公式ファイルを使う */}
        <picture>
          <source srcSet="/ergon-logo-reverse.png" media="(prefers-color-scheme: dark)" />
          <img src="/ergon-logo-carbon.png" alt="Ergon" height={24} />
        </picture>
        <span>勤怠</span>
      </h1>
      <nav className="tabs" aria-label="画面の切り替え">
        {PAGES.map((p) => (
          <Link
            key={p.id}
            href={p.href}
            className={p.id === current ? "on" : ""}
            aria-current={p.id === current ? "page" : undefined}
          >
            {p.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
