import React, { useEffect } from "react";

export default function Modal({ title, children, footer, onClose, className = "" }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && onClose) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="qx-modal-backdrop show" onClick={(e) => e.target.id === "modalBackdrop" && onClose && onClose()}>
      <div className={`qx-modal ${className}`}>
        {title && <h3 style={{ margin: "0 0 14px" }}>{title}</h3>}
        <div className={className === "" ? "" : "qx-modal-body"}>{children}</div>
        {footer && <div className="qx-modal-actions">{footer}</div>}
      </div>
    </div>
  );
}