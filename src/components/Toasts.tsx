import type { ToastItem } from "../lib/types";
import { IconClose } from "./Icons";

interface ToastsProps {
  items: ToastItem[];
  onDismiss: (id: number) => void;
}

export function Toasts({ items, onDismiss }: ToastsProps) {
  if (!items.length) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((toast) => (
        <div key={toast.id} className={`toast kind-${toast.kind}`}>
          <span className="toast-kind">{toast.kind}</span>
          <span className="toast-message">{toast.message}</span>
          <button
            type="button"
            className="icon-btn"
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss"
          >
            <IconClose size={11} />
          </button>
        </div>
      ))}
    </div>
  );
}
