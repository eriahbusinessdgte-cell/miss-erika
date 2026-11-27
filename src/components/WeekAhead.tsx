"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAppData } from "@/components/AppData";
import { Icon } from "@/components/Icon";
import { prettyDate } from "@/lib/core";
import { weekAhead } from "@/lib/week";

/** Dashboard preview of next week's working days: the routine jobs plus any tasks already due. */
export function WeekAhead() {
  const { tasks, today } = useAppData();
  const days = useMemo(() => weekAhead(today, tasks), [today, tasks]);
  return (
    <section className="card week-ahead">
      <div className="card-head"><h2><Icon name="calendar" /> Next week at a glance</h2></div>
      <div className="week-grid">
        {days.map((d) => (
          <div key={d.date} className="week-day">
            <div className="week-name">{d.weekday}</div>
            <div className="week-date">{prettyDate(d.date)}</div>
            <ul>
              {d.items.map((i, k) => (
                <li key={k} className={i.kind}>
                  {i.href ? <Link href={i.href}>{i.text}</Link> : i.text}
                  {i.priority === "High" && <span className="chip" style={{ marginLeft: 6 }}>High</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
