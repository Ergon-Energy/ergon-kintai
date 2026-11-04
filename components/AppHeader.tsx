import Link from "next/link";

const PAGES = [
  { id: "calendar", href: "/", label: "カレンダー" },
  { id: "status", href: "/status", label: "勤怠状況" },
] as const;

export function AppHeader({ current }: { current: (typeof PAGES)[number]["id"] }) {
  return (
    <header className="top">
      <h1 className="brand">
        <img src="/logo.png" alt="" width={30} height={29} />
        Ergon <span>勤怠</span>
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
