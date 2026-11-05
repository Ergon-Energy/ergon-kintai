import { moveTask, removeTask, saveTask } from "@/app/actions";
import type { Member } from "@/lib/attendance";
import type { Task, TaskStatus } from "@/lib/tasks";
import { descendantsOf, parentChoices, type WbsRow } from "@/lib/wbs";

/** 操作後の戻り先（app/actions.ts の taskAndReturn が読む） */
export type ReturnTo = { filter?: string; back?: "wbs"; edit?: string };

export function ReturnFields({ to }: { to: ReturnTo }) {
  return (
    <>
      {Object.entries(to).map(([name, value]) =>
        value ? <input key={name} type="hidden" name={name} value={value} /> : null,
      )}
    </>
  );
}

export function ParentOptions({ choices }: { choices: WbsRow[] }) {
  return (
    <>
      <option value="">なし（最上位）</option>
      {choices.map((r) => (
        <option key={r.task.id} value={r.task.id}>
          {r.no} {r.task.title}
        </option>
      ))}
    </>
  );
}

export function MemberOptions({ members }: { members: Member[] }) {
  return (
    <>
      <option value="">未担当</option>
      {members.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </>
  );
}

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

/**
 * 移動先はボタンの name/value で送らず、ボタンごとのフォームに持たせる。
 * name="id" の入力があると form.id が上書きされ、React が押したボタンの値を落とすため。
 */
export function TaskMoves({ task, to }: { task: Task; to: ReturnTo }) {
  return (
    <div className="task-moves">
      {MOVES[task.status].map((m) => (
        <form key={m.to} action={moveTask}>
          <input type="hidden" name="id" value={task.id} />
          <input type="hidden" name="status" value={m.to} />
          <ReturnFields to={to} />
          <button className={m.primary ? "" : "ghost"}>{m.label}</button>
        </form>
      ))}
    </div>
  );
}

/** タスクの編集フォームと削除の確認 */
export function TaskEditor({
  task,
  rows,
  members,
  to,
}: {
  task: Task;
  rows: WbsRow[];
  members: Member[];
  to: ReturnTo;
}) {
  const descendants = descendantsOf(rows, task.id);
  const isParent = descendants.length > 0;
  return (
    <>
      <form action={saveTask} className="edit-form">
        <input type="hidden" name="id" value={task.id} />
        <ReturnFields to={to} />
        <label className="full">
          タスク名
          <input name="title" required defaultValue={task.title} />
        </label>
        <label>
          親タスク
          <select name="parent" defaultValue={task.parent_id ?? ""}>
            <ParentOptions choices={parentChoices(rows, task.id)} />
          </select>
        </label>
        <label>
          担当
          <select name="assignee" defaultValue={task.assignee_id ?? ""}>
            <MemberOptions members={members} />
          </select>
        </label>
        {isParent ? (
          <>
            {/* 子があるあいだは使わないが、子がなくなったときのために値は保つ */}
            <input type="hidden" name="start" value={task.start_date ?? ""} />
            <input type="hidden" name="due" value={task.due_date ?? ""} />
            <p className="full muted form-note">期間と進捗は配下のタスクから自動で決まります。</p>
          </>
        ) : (
          <>
            <label>
              開始
              <input type="date" name="start" defaultValue={task.start_date ?? ""} />
            </label>
            <label>
              期限
              <input type="date" name="due" defaultValue={task.due_date ?? ""} />
            </label>
          </>
        )}
        <label className="full">
          メモ
          <textarea name="note" rows={2} defaultValue={task.note ?? ""} />
        </label>
        <button>保存</button>
      </form>
      <details className="confirm">
        <summary>このタスクを削除</summary>
        <p>
          「{task.title}」{isParent && `と配下の${descendants.length}件`}を削除します。元に戻せません。
        </p>
        <form action={removeTask}>
          <input type="hidden" name="id" value={task.id} />
          <ReturnFields to={{ ...to, edit: undefined }} />
          <button className="danger">削除する</button>
        </form>
      </details>
    </>
  );
}
