import type { ReactNode } from "react";
import { IconClose } from "@/components/icons";

export function Modal({
  open,
  title,
  description,
  children,
  onClose,
  size = "default",
  chrome = true,
}: {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  size?: "default" | "wide";
  chrome?: boolean;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-stone-950/40 p-3 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close dialog" onClick={onClose} />
      <div className={`relative flex max-h-[94vh] w-full flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-[0_30px_90px_rgba(28,20,18,0.2)] ${size === "wide" ? "max-w-6xl" : "max-w-2xl"}`}>
        {chrome ? (
          <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-white/95 px-5 py-4 backdrop-blur sm:px-6">
            <div>
              <h2 id="modal-title" className="text-lg font-bold tracking-tight">{title}</h2>
              {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
            </div>
            <button type="button" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-primary-soft hover:text-primary" aria-label="Close dialog">
              <IconClose className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <button type="button" onClick={onClose} className="absolute right-3 top-3 z-20 grid h-9 w-9 place-items-center rounded-lg bg-white/90 text-muted shadow-sm hover:bg-primary-soft hover:text-primary" aria-label="Close dialog">
            <IconClose className="h-5 w-5" />
          </button>
        )}
        <div className={`min-h-0 flex-1 overflow-y-auto ${chrome ? "p-5 sm:p-6" : ""}`}>{children}</div>
      </div>
    </div>
  );
}