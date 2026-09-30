import { createContext, useCallback, useContext, useState } from "react";

const ToastContext = createContext({
  showToast: () => {},
  showConfirm: () => Promise.resolve(false),
  toast: {
    success: () => {},
    error: () => {},
    info: () => {},
    warning: () => {},
  },
});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmDialog, setConfirmDialog] = useState(null);

  const removeToast = useCallback((id) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message, type = "info", duration = 4000) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newToast = { id, message, type };

    setToasts((current) => [...current, newToast]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, [removeToast]);

  const showConfirm = useCallback((title, message, confirmText = "Confirmar", cancelText = "Cancelar", isDanger = false) => {
    return new Promise((resolve) => {
      setConfirmDialog({
        title,
        message,
        confirmText,
        cancelText,
        isDanger,
        onConfirm: () => {
          setConfirmDialog(null);
          resolve(true);
        },
        onCancel: () => {
          setConfirmDialog(null);
          resolve(false);
        },
      });
    });
  }, []);

  const toast = {
    success: (msg, dur) => showToast(msg, "success", dur),
    error: (msg, dur) => showToast(msg, "error", dur || 5000),
    info: (msg, dur) => showToast(msg, "info", dur),
    warning: (msg, dur) => showToast(msg, "warning", dur || 4500),
  };

  return (
    <ToastContext.Provider value={{ showToast, showConfirm, toast }}>
      {children}

      {/* Toast notifications container */}
      <div className="toast-container" aria-live="polite" aria-atomic="true">
        {toasts.map((t) => (
          <div key={t.id} className={`toast-item toast-${t.type}`} role="status">
            <div className="toast-icon">
              {t.type === "success" && "✓"}
              {t.type === "error" && "✕"}
              {t.type === "warning" && "!"}
              {t.type === "info" && "i"}
            </div>
            <div className="toast-message">{t.message}</div>
            <button
              className="toast-close"
              type="button"
              onClick={() => removeToast(t.id)}
              aria-label="Fechar notificação"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Custom Confirmation Modal */}
      {confirmDialog && (
        <div className="confirm-modal-backdrop" role="presentation" onClick={confirmDialog.onCancel}>
          <div
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="confirm-title">{confirmDialog.title}</h3>
            {confirmDialog.message && <p>{confirmDialog.message}</p>}
            <div className="confirm-modal-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={confirmDialog.onCancel}
              >
                {confirmDialog.cancelText}
              </button>
              <button
                type="button"
                className={confirmDialog.isDanger ? "danger-button" : "primary-button"}
                onClick={confirmDialog.onConfirm}
              >
                {confirmDialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
