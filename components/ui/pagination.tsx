import { IconArrowRight } from "@/components/icons";

type PaginationProps = {
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
};

function visiblePages(page: number, totalPages: number): (number | "left-gap" | "right-gap")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, "right-gap", totalPages];
  if (page >= totalPages - 3) return [1, "left-gap", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  return [1, "left-gap", page - 1, page, page + 1, "right-gap", totalPages];
}

export function Pagination({ page, totalPages, totalCount, pageSize, loading = false, onPageChange }: PaginationProps) {
  const firstItem = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, totalCount);
  const pages = visiblePages(page, Math.max(1, totalPages));

  return (
    <nav aria-label="Notification history pages" className="flex flex-col gap-3 border-t border-border bg-slate-50/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <p className="text-xs font-medium text-muted" aria-live="polite">
        Showing <span className="font-semibold text-foreground">{firstItem}-{lastItem}</span> of <span className="font-semibold text-foreground">{totalCount}</span>
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1 || loading}
          aria-label="Previous page"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-xs font-semibold text-foreground transition hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          <IconArrowRight className="h-3.5 w-3.5 rotate-180" />
          <span>Previous</span>
        </button>
        {pages.map((item, index) => typeof item === "number" ? (
          <button
            key={item}
            type="button"
            onClick={() => onPageChange(item)}
            disabled={loading}
            aria-label={`Page ${item}`}
            aria-current={page === item ? "page" : undefined}
            className={`grid h-9 min-w-9 place-items-center rounded-lg border px-2 text-xs font-semibold transition disabled:opacity-50 ${page === item ? "border-primary bg-primary text-white shadow-sm" : "border-border bg-white text-foreground hover:border-primary/40 hover:text-primary"}`}
          >
            {item}
          </button>
        ) : (
          <span key={`${item}-${index}`} aria-hidden className="grid h-9 min-w-5 place-items-center text-sm text-muted">...</span>
        ))}
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages || loading || totalCount === 0}
          aria-label="Next page"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-xs font-semibold text-foreground transition hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span>Next</span>
          <IconArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </nav>
  );
}