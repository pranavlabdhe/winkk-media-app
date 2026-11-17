"use client";

export function DeleteButton({
  confirmMessage = "Are you sure you want to delete this?",
  label = "Delete",
  className = "text-[11px] text-slate-400 hover:text-rose-600 transition-colors cursor-pointer",
}: {
  confirmMessage?: string;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
    >
      {label}
    </button>
  );
}
