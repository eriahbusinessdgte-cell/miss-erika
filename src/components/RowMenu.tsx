"use client";

import { useEffect } from "react";

/** Small right-click menu for a list row: mark the chat read or unread. */
export function RowMenu({ x, y, unread, onToggle, onNoResponse, onClose }: { x: number; y: number; unread: boolean; onToggle: () => void; onNoResponse?: () => void; onClose: () => void }) {
  useEffect(() => {
    const close = () => onClose();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", key);
    };
  }, [onClose]);
  const left = Math.min(x, (typeof window === "undefined" ? x : window.innerWidth) - 190);
  return (
    <div className="row-menu" role="menu" style={{ left, top: y }} onClick={(e) => e.stopPropagation()}>
      <button role="menuitem" onClick={onToggle}>{unread ? "Mark as read" : "Mark as unread"}</button>
      {onNoResponse && <button role="menuitem" onClick={onNoResponse}>No response needed</button>}
    </div>
  );
}
