import { moveTask, removeTask, saveTask } from "@/app/actions";
import type { Member } from "@/lib/attendance";
import { memberVars } from "@/lib/colors";
import { dueLabel, isOverdue, type Task, type TaskStatus } from "@/lib/tasks";
import { dayKey, fmtDay } from "@/lib/time";

/** 今の状態から移せる先。ボタンの文言は操作として読めるものにする */
const MOVES: Record<TaskStatus, { to: TaskStatus; label: string; primary?: boolean }[]> = {
  todo: [
    { to: "doing", label: "開始", primary: true },
    { to: "done", label: "完了" },
  ],
  doing: [
    { to: "done", label: "完了", primary: true },
    { to: "todo", label: "未着手に戻す" },
  ],
  done: [{ to: "doing", label: "進行中に戻す" }],
};

/** 操作はすべてフォームと details なので JavaScript なしで動く */
export function TaskCard({
  task,
  members,
  filter,
  today,
}: {
  task: Task;
  members: Member[];
  filter: string;
  today: string;
}) {
  const assignee = members.find((m) => m.id === task.assignee_id);
  const due = dueLabel(task, today);
  const hidden = (
    <>
      <input type="hidden" name="id" value={task.id} />
      <input type="hidden" name="filter" value={filter} />
    </>
  );

  return (
    <li className="task">
      <p className="task-title">{task.title}</p>
      <div className="task-meta">
        {assignee ? (
          <span className="tag" style={memberVars(members, assignee.id)}>
            {assignee.name}
          </span>
        ) : (
          <span className="tag unassigned">未担当</span>
        )}
        {due && <span className={isOverdue(task, today) ? "due overdue" : "due"}>{due}</span>}
        {task.completed_at && <span className="due">{fmtDay(dayKey(new Date(task.completed_at)))} 完了</span>}
      </div>
      {task.note && <p className="task-note">{task.note}</p>}

      <form action={moveTask} className="task-moves">
        {hidden}
        {MOVES[task.status].map((m) => (
          <button key={m.to} name="status" value={m.to} className={m.primary ? "" : "ghost"}>
            {m.label}
          </button>
        ))}
      </form>

      {/* 保存後に閉じて最新の値を出すため、内容が変わったら作り直す */}
      <details className="edit" key={`${task.title}|${task.note}|${task.assignee_id}|${task.due_date}`}>
        <summary aria-label={`${task.title}を編集`}>編集</summary>
        <form action={saveTask} className="edit-form">
          {hidden}
          <label className="full">
            タスク名
            <input name="title" required defaultValue={task.title} />
          </label>
          <label className="full">
            担当
            <select name="assignee" defaultValue={task.assignee_id ?? ""}>
              <option value="">未担当</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="full">
            期限
            <input type="date" name="due" defaultValue={task.due_date ?? ""} />
          </label>
          <label className="full">
            メモ
            <textarea name="note" rows={2} defaultValue={task.note ?? ""} />
          </label>
          <button>保存</button>
        </form>
        <details className="confirm">
          <summary>このタスクを削除</summary>
          <p>「{task.title}」を削除します。元に戻せません。</p>
          <form action={removeTask}>
            {hidden}
            <button className="danger">削除する</button>
          </form>
        </details>
      </details>
    </li>
  );
}
