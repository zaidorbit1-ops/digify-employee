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
  icon,
}: {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  size?: "sm" | "default" | "wide" | "xl";
  chrome?: boolean;
  icon?: ReactNode;
}) {
  if (!open) return null;

  const sizeClasses = {
    sm: "max-w-md",
    default: "max-w-2xl",
    wide: "max-w-4xl",
    xl: "max-w-6xl",
  }[size] || "max-w-2xl";

  return (
    <div
      className="modal-backdrop-animate fixed inset-0 z-50 grid place-items-center bg-stone-950/45 p-3 backdrop-blur-md transition-all sm:p-5 md:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-transparent"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        className={`modal-content-animate relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-3xl border border-white/60 bg-white/95 shadow-[0_25px_70px_-12px_rgba(30,10,10,0.28),0_0_0_1px_rgba(255,255,255,0.8)_inset,0_0_40px_rgba(228,90,90,0.08)] backdrop-blur-xl transition-all duration-300 ${sizeClasses}`}
      >
        {/* Aesthetic top accent glowing gradient */}
        <div className="h-1.5 w-full bg-gradient-to-r from-primary via-rose-400 to-amber-300" />

        {chrome ? (
          <div className="sticky top-0 z-20 flex items-start justify-between gap-4 border-b border-stone-200/70 bg-white/90 px-6 py-4.5 backdrop-blur-md sm:px-7">
            <div className="flex items-start gap-3.5">
              {icon ? (
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-soft to-rose-100/60 text-primary shadow-inner">
                  {icon}
                </div>
              ) : null}
              <div>
                <h2
                  id="modal-title"
                  className="text-lg font-bold tracking-tight text-stone-900 sm:text-xl"
                >
                  {title}
                </h2>
                {description ? (
                  <p className="mt-0.5 text-xs text-muted sm:text-sm font-normal">
                    {description}
                  </p>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="group -mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-stone-100/70 text-stone-400 transition duration-150 hover:rotate-90 hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus:ring-2 focus:ring-primary/20"
              aria-label="Close dialog"
            >
              <IconClose className="h-4 w-4 transition-transform duration-200" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="group absolute right-3.5 top-4.5 z-30 grid h-8 w-8 place-items-center rounded-xl bg-white/90 text-stone-400 shadow-md backdrop-blur-md transition duration-150 hover:rotate-90 hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus:ring-2 focus:ring-primary/20"
            aria-label="Close dialog"
          >
            <IconClose className="h-4 w-4" />
          </button>
        )}
        <div
          className={`min-h-0 flex-1 overflow-y-auto ${
            chrome ? "p-6 sm:p-7" : ""
          }`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}