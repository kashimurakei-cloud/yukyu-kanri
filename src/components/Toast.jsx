import React from "react";

/* 操作トースト(取消付き)。callerが {msg, onUndo} を管理する */
export default function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div style={{
      position: "fixed", left: "50%", bottom: 24, transform: "translateX(-50%)",
      background: "#1f2933", color: "#fff", borderRadius: 999,
      padding: "10px 12px 10px 18px", fontSize: 13.5, fontWeight: 700,
      display: "flex", alignItems: "center", gap: 12,
      boxShadow: "0 6px 20px rgba(0,0,0,0.25)", zIndex: 300,
      maxWidth: "92vw",
    }}>
      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{toast.msg}</span>
      {toast.onUndo && (
        <button
          onClick={() => { toast.onUndo(); onClose(); }}
          style={{
            background: "#0E9F8E", color: "#fff", border: "none", borderRadius: 999,
            padding: "6px 14px", fontSize: 12.5, fontWeight: 800, cursor: "pointer",
          }}
        >
          取消
        </button>
      )}
    </div>
  );
}
