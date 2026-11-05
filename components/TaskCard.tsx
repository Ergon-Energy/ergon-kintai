import { TaskEditor, TaskMoves } from "@/components/TaskControls";
import type { Member } from "@/lib/attendance";
import { memberVars } from "@/lib/colors";
import { dueLabel, isOverdue, type Task } from "@/lib/tasks";
import { dayKey, fmtDay } from "@/lib/time";
import type { WbsRow } from "@/lib/wbs";

/** 操作はすべてフォームと details なので JavaScript なしで動く */
export function TaskCard({
  task,
  rows,
  members,
  filter,
  today,
}: {
  task: Task;
  rows: WbsRow[];
  members: Member[];
  filter: string;
  today: string;
}) {
  const assignee = members.find((m) => m.id === task.assignee_id);
  const parent = rows.find((r) => r.task.id === task.parent_id);
  const due = dueLabel(task, today);
  const to = { filter };

  return (
    <li className="task">
      {parent && (
        <p className="task-parent">
          {parent.no} {parent.task.title}
        </p>
      )}
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

      <TaskMoves task={task} to={to} />

      {/* 保存後に閉じて最新の値を出すため、内容が変わったら作り直す */}
      <details
        className="edit"
        key={`${task.title}|${task.note}|${task.parent_id}|${task.assignee_id}|${task.start_date}|${task.due_date}`}
      >
        <summary aria-label={`${task.title}を編集`}>編集</summary>
        <TaskEditor task={task} rows={rows} members={members} to={to} />
      </details>
    </li>
  );
}
