import { AlertCircle } from "lucide-react";
import Button from "../Button";

export function WorkspaceHeader({ eyebrow, title, description, action }) {
  return <header className="flex flex-col justify-between gap-5 border-b border-ink/10 pb-6 sm:flex-row sm:items-end sm:pb-8">
    <div className="min-w-0">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-coral">{eyebrow}</p>
      <h1 className="mt-3 font-editorial text-[2.15rem] font-normal leading-[1.08] tracking-[-0.025em] sm:text-5xl">{title}</h1>
      {description && <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/65">{description}</p>}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </header>;
}

export function WorkspaceError({ message, onRetry }) {
  if (!message) return null;
  return <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
    <div className="min-w-0 flex-1">
      <p className="break-words leading-6">{message}</p>
      {onRetry && <Button variant="ghost" className="mt-2 !px-0 text-red-800" onClick={onRetry}>Try again</Button>}
    </div>
  </div>;
}

export function WorkspaceSectionTitle({ icon: Icon, title, description, aside }) {
  return <div className="flex flex-wrap items-start justify-between gap-3">
    <div className="flex min-w-0 items-start gap-3">
      {Icon && <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sand text-coral"><Icon className="h-[18px] w-[18px]" aria-hidden="true" /></span>}
      <div className="min-w-0">
        <h2 className="text-base font-extrabold tracking-tight sm:text-lg">{title}</h2>
        {description && <p className="mt-1 text-sm leading-6 text-ink/65">{description}</p>}
      </div>
    </div>
    {aside}
  </div>;
}
