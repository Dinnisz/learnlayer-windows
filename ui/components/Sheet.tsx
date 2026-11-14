import { useEffect, useRef, type ReactNode } from "react";

/**
 * A modal sheet over the window, as SwiftUI's `.sheet`. Esc closes it unless `onClose` is absent
 * (the consent sheet can't be dismissed: `interactiveDismissDisabled`).
 */
export function Sheet({
  open,
  onClose,
  dark = false,
  width,
  label,
  children,
}: {
  open: boolean;
  onClose?: () => void;
  dark?: boolean;
  width: number;
  label: string;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className={dark ? "sheet dark" : "sheet"}
      style={{ width }}
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault();
        onClose?.();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) onClose?.();
      }}
    >
      {open ? children : null}
    </dialog>
  );
}
