"use client";

import { useEffect, useRef } from "react";

/** 編集・削除の結果。保存後はページの先頭に戻るので、結果の位置までスクロールする */
export function ResultFlash({ ok, err }: { ok?: string; err?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "start" });
  });
  if (!ok && !err) return null;
  return (
    <p ref={ref} className={`flash ${err ? "err" : "ok"}`} role={err ? "alert" : "status"}>
      {err ?? ok}
    </p>
  );
}
