import Link from "next/link";

const STAGES = ["understand", "plan", "approve", "execute", "verify", "report"] as const;

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-nemo-border bg-nemo-surface px-6 py-4">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3 text-lg font-semibold text-nemo-text">
          <span className="text-2xl">🐠</span>
          NEMO Workspace
        </Link>
        <nav className="flex gap-2 text-sm">
          <Link
            href="/"
            className="rounded-md px-3 py-2 text-nemo-muted transition hover:bg-[#21262d] hover:text-nemo-text"
          >
            Dashboard
          </Link>
          <Link
            href="/workflows/new"
            className="rounded-md px-3 py-2 text-nemo-muted transition hover:bg-[#21262d] hover:text-nemo-text"
          >
            New workflow
          </Link>
          <Link
            href="/memory"
            className="rounded-md px-3 py-2 text-nemo-muted transition hover:bg-[#21262d] hover:text-nemo-text"
          >
            Memory
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function StagePills({ active }: { active?: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {STAGES.map((stage) => (
        <span
          key={stage}
          className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${
            active === stage
              ? "border border-nemo-accent bg-[#21262d] text-nemo-accent"
              : "border border-nemo-border text-nemo-muted"
          }`}
        >
          {stage}
        </span>
      ))}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "text-nemo-muted border-nemo-border",
    running: "text-nemo-accent border-nemo-accent",
    awaiting_approval: "text-nemo-warning border-nemo-warning",
    completed: "text-nemo-success border-nemo-success",
    failed: "text-nemo-danger border-nemo-danger",
    rejected: "text-nemo-danger border-nemo-danger",
  };

  return (
    <span
      className={`rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${colors[status] ?? colors.pending}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
