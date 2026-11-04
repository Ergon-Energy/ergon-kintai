import { removeLog, removeSession, saveLog, saveSession } from "@/app/actions";
import { describeDuration, segmentsOnDay, type Log, type Member, type Session } from "@/lib/attendance";
import { colorOf } from "@/lib/colors";
import { dayKey, fmtTime, toLocalInput } from "@/lib/time";

function Hidden({ id, month, day }: { id: string; month: string; day: string }) {
  return (
    <>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="month" value={month} />
      <input type="hidden" name="day" value={day} />
    </>
  );
}

/** 選択した日の勤務とやったこと。編集・削除は details で開くので JavaScript なしで動く */
export function DayRecords({
  members,
  sessions,
  logs,
  day,
  month,
  now,
}: {
  members: Member[];
  sessions: Session[];
  logs: Log[];
  day: string;
  month: string;
  now: Date;
}) {
  const segments = segmentsOnDay(sessions, day, now);
  const dayLogs = logs.filter((l) => dayKey(new Date(l.logged_at)) === day);
  const tag = (memberId: string) => {
    const m = members.find((x) => x.id === memberId);
    return (
      <span className="tag" style={{ background: colorOf(members, memberId) }}>
        {m?.name ?? "不明"}
      </span>
    );
  };

  if (segments.length === 0 && dayLogs.length === 0) {
    return <p className="muted">この日の記録はありません。</p>;
  }

  return (
    <div className="records">
      {segments.length > 0 && (
        <>
          <h3>勤務</h3>
          {segments.map((seg) => {
            const s = sessions.find((x) => x.id === seg.sessionId)!;
            return (
              <div key={s.id} className="record">
                <div className="record-main">
                  {tag(s.member_id)}
                  <span className="span">{seg.label}</span>
                  <span className="sub">{s.ended_at ? describeDuration(s) : `勤務中（${describeDuration(s, now)}）`}</span>
                  {s.note && <span className="body">{s.note}</span>}
                </div>
                {/* 保存後に閉じて最新の値を出すため、内容が変わったら作り直す */}
                <details className="edit" key={`${s.started_at}|${s.ended_at}|${s.note}`}>
                  <summary aria-label={`${seg.label}の勤務を編集`}>編集</summary>
                  <form action={saveSession} className="edit-form">
                    <Hidden id={s.id} month={month} day={day} />
                    <label>
                      出勤
                      <input type="datetime-local" name="start" required defaultValue={toLocalInput(s.started_at)} />
                    </label>
                    <label>
                      退勤（空欄で勤務中）
                      <input type="datetime-local" name="end" defaultValue={s.ended_at ? toLocalInput(s.ended_at) : ""} />
                    </label>
                    <label className="full">
                      メモ
                      <input name="note" defaultValue={s.note ?? ""} />
                    </label>
                    <button>保存</button>
                  </form>
                  <details className="confirm">
                    <summary>この勤務を削除</summary>
                    <p>
                      {fmtTime(s.started_at)} からの勤務を削除します。元に戻せません。やったことの記録は残ります。
                    </p>
                    <form action={removeSession}>
                      <Hidden id={s.id} month={month} day={day} />
                      <button className="danger">削除する</button>
                    </form>
                  </details>
                </details>
              </div>
            );
          })}
        </>
      )}

      {dayLogs.length > 0 && (
        <div style={{ marginTop: segments.length > 0 ? 14 : 0 }}>
          <h3>やったこと</h3>
          {dayLogs.map((l) => (
            <div key={l.id} className="record">
              <div className="record-main">
                <time>{fmtTime(l.logged_at)}</time>
                {tag(l.member_id)}
                <span className="body">{l.content}</span>
              </div>
              <details className="edit" key={`${l.logged_at}|${l.content}`}>
                <summary aria-label={`${fmtTime(l.logged_at)}のやったことを編集`}>編集</summary>
                <form action={saveLog} className="edit-form">
                  <Hidden id={l.id} month={month} day={day} />
                  <label>
                    日時
                    <input type="datetime-local" name="at" required defaultValue={toLocalInput(l.logged_at)} />
                  </label>
                  <label className="full">
                    内容
                    <textarea name="content" required rows={2} defaultValue={l.content} />
                  </label>
                  <button>保存</button>
                </form>
                <details className="confirm">
                  <summary>このやったことを削除</summary>
                  <p>この記録を削除します。元に戻せません。</p>
                  <form action={removeLog}>
                    <Hidden id={l.id} month={month} day={day} />
                    <button className="danger">削除する</button>
                  </form>
                </details>
              </details>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
