"use client";

export function Pagination({
  page,
  pageSize,
  totalCount,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-4 py-6">
      <button
        type="button"
        className="min-h-11 min-w-11 px-4 rounded-md border border-neutral-300 disabled:opacity-40 disabled:cursor-not-allowed"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
      >
        Previous
      </button>
      <span className="text-sm text-neutral-600">
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        className="min-h-11 min-w-11 px-4 rounded-md border border-neutral-300 disabled:opacity-40 disabled:cursor-not-allowed"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
      >
        Next
      </button>
    </div>
  );
}
