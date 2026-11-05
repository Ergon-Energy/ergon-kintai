import Link from "next/link";
import { addTask } from "../actions";
import { AppHeader } from "@/components/AppHeader";
import { ResultFlash } from "@/components/ResultFlash";
import { TaskCard } from "@/components/TaskCard";
import { getMembers } from "@/lib/attendance";
import { memberVars } from "@/lib/colors";
import { DONE_VISIBLE_DAYS, TASK_STATUSES, getTasks, sortTasks, taskStats } from "@/lib/tasks";
import { dayKey, periodRange } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const today = dayKey(now);
  const weekStart = periodRange("week", now).fromDate;

  const [members, allTasks] = await Promise.all([getMembers(), getTasks(now)]);
  const filter = members.some((m) => m.id === sp.member) ? sp.member! : "";
  const tasks = sortTasks(filter ? allTasks.filter((t) => t.assignee_id === filter) : allTasks);

  return (
    <main>
      <AppHeader current="tasks" />

      <section className="now-strip" aria-label="メンバーごとのタスク状況">
        {members.map((m) => {
          const s = taskStats(allTasks.filter((t) => t.assignee_id === m.id), today, weekStart);
          return (
            <div key={m.id} className="now-item" style={memberVars(members, m.id)}>
              <span className="badge" aria-hidden="true">
                {m.name.slice(0, 1).toUpperCase()}
              </span>
              <strong>{m.name}</strong>
              <span className="state">
                未完了 {s.open}件
                {s.overdue > 0 && <span className="overdue">期限切れ {s.overdue}件</span>}
              </span>
              <span className="month-total">今週完了 {s.doneThisWeek}件</span>
            </div>
          );
        })}
      </section>

      <ResultFlash ok={sp.ok} err={sp.err} />

      <section className="card">
        <h2>タスクを追加</h2>
        <form action={addTask} className="task-add">
          <input type="hidden" name="filter" value={filter} />
          <label className="title">
            タスク名
            <input name="title" required />
          </label>
          <label>
            担当
            <select name="assignee" defaultValue={filter}>
              <option value="">未担当</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            期限
            <input type="date" name="due" />
          </label>
          <button>追加</button>
        </form>
      </section>

      {members.length > 0 && (
        <nav className="tabs task-filter" aria-label="担当で絞り込む">
          <Link href="/tasks" className={filter ? "" : "on"}>
            すべて
          </Link>
          {members.map((m) => (
            <Link key={m.id} href={`/tasks?member=${m.id}`} className={m.id === filter ? "on" : ""}>
              {m.name}
            </Link>
          ))}
        </nav>
      )}

      <div className="board">
        {TASK_STATUSES.map((status) => {
          const column = tasks.filter((t) => t.status === status.id);
          return (
            <section key={status.id} className="card board-col" aria-label={status.label}>
              <div className="card-head">
                <h2>
                  {status.label} <span className="count">{column.length}</span>
                </h2>
                {status.id === "done" && <span className="col-note">直近{DONE_VISIBLE_DAYS}日</span>}
              </div>
              {column.length === 0 ? (
                <p className="muted col-empty">ありません</p>
              ) : (
                <ul className="task-list">
                  {column.map((t) => (
                    <TaskCard key={t.id} task={t} members={members} filter={filter} today={today} />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}
