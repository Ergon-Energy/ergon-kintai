import Link from "next/link";
import { addTask } from "../actions";
import { AppHeader } from "@/components/AppHeader";
import { ResultFlash } from "@/components/ResultFlash";
import { MemberOptions, ParentOptions, ReturnFields, TaskEditor, TaskMoves } from "@/components/TaskControls";
import { WbsGantt } from "@/components/WbsGantt";
import { getMembers } from "@/lib/attendance";
import { getTasks } from "@/lib/tasks";
import { dayKey } from "@/lib/time";
import { buildWbs, ganttRange } from "@/lib/wbs";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const today = dayKey(new Date());
  const [members, tasks] = await Promise.all([getMembers(), getTasks()]);
  const rows = buildWbs(tasks);
  const { days, clipped } = ganttRange(rows, today);
  const editing = rows.find((r) => r.task.id === sp.edit) ?? null;
  const addParent = rows.some((r) => r.task.id === sp.parent) ? sp.parent! : "";
  const to = { back: "wbs", edit: editing?.task.id } as const;

  return (
    <main className="wide">
      <AppHeader current="wbs" />
      <div className="wbs-gap" />
      <ResultFlash ok={sp.ok} err={sp.err} />

      <section className="card">
        <div className="card-head">
          <h2>WBS・ガントチャート</h2>
          <ul className="legend bar-legend" aria-label="バーの見方">
            <li><span className="bar todo" />未着手</li>
            <li><span className="bar doing" />進行中</li>
            <li><span className="bar done" />完了</li>
            <li><span className="bar todo late" />期限切れ</li>
            <li><span className="bar summary"><i style={{ width: "50%" }} /></span>親タスク</li>
          </ul>
        </div>
        {rows.length === 0 ? (
          <p className="muted">まだタスクがありません。下のフォームから追加してください。</p>
        ) : (
          <>
            <WbsGantt rows={rows} days={days} members={members} today={today} selected={editing?.task.id ?? null} />
            <p className="wbs-note">
              タスク名を押すと編集できます。
              {clipped && " 期間が長いため、表示は6か月分までです。"}
            </p>
          </>
        )}
      </section>

      {editing && (
        <section className="card" id="detail">
          <div className="card-head">
            <h2>
              {editing.no} {editing.task.title}
            </h2>
            <span className="detail-links">
              <Link href={`/wbs?parent=${editing.task.id}#add`}>この下にタスクを追加</Link>
              <Link href="/wbs">閉じる</Link>
            </span>
          </div>
          {!editing.hasChildren && <TaskMoves task={editing.task} to={to} />}
          {/* 保存後に最新の値を出すため、内容が変わったら作り直す */}
          <div
            className="detail-form"
            key={`${editing.task.id}|${editing.task.title}|${editing.task.note}|${editing.task.parent_id}|${editing.task.assignee_id}|${editing.task.start_date}|${editing.task.due_date}`}
          >
            <TaskEditor task={editing.task} rows={rows} members={members} to={to} />
          </div>
        </section>
      )}

      <section className="card" id="add">
        <h2>タスクを追加</h2>
        <form action={addTask} className="task-add long" key={addParent}>
          <ReturnFields to={to} />
          <label className="title">
            タスク名
            <input name="title" required />
          </label>
          <label>
            親タスク
            <select name="parent" defaultValue={addParent}>
              <ParentOptions choices={rows} />
            </select>
          </label>
          <label>
            担当
            <select name="assignee" defaultValue="">
              <MemberOptions members={members} />
            </select>
          </label>
          <label>
            開始
            <input type="date" name="start" />
          </label>
          <label>
            期限
            <input type="date" name="due" />
          </label>
          <button>追加</button>
        </form>
      </section>
    </main>
  );
}
