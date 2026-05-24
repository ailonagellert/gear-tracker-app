import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';

type RecommendationSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  reason: string;
  windowLabel: string;
  checks: string[];
  severity: string;
  score: number;
  status: string;
  canAct: boolean;
  isPending: boolean;
  doneDate: string;
  onDoneDateChange: (value: string) => void;
  onDone: () => void;
  onSnooze: () => void;
  onUnsnooze: () => void;
};

export function RecommendationSheet({
  isOpen,
  onClose,
  title,
  reason,
  windowLabel,
  checks,
  severity,
  score,
  status,
  canAct,
  isPending,
  doneDate,
  onDoneDateChange,
  onDone,
  onSnooze,
  onUnsnooze,
}: RecommendationSheetProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/75 sm:items-center sm:justify-center" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full overflow-hidden rounded-t-xl border border-border bg-background p-4 shadow-2xl sm:max-h-[80vh] sm:max-w-lg sm:rounded-xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="text-sm text-muted-foreground">
              {severity} ({score}) • {status}
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" className="h-11 w-11" onClick={onClose} aria-label="Close details">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
          <p className="text-sm text-foreground">{reason}</p>
          <p className="text-sm font-medium text-foreground">Window: {windowLabel}</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
            {checks.map((check) => (
              <li key={check}>{check}</li>
            ))}
          </ul>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {status === 'snoozed' ? (
            <Button type="button" variant="outline" className="h-11 w-full" disabled={!canAct || isPending} onClick={onUnsnooze}>
              Unsnooze
            </Button>
          ) : (
            <>
              <input
                type="date"
                value={doneDate}
                onChange={(event) => onDoneDateChange(event.target.value)}
                className="h-11 w-full rounded border border-input bg-background px-3 text-sm text-foreground sm:col-span-2"
              />
              <Button type="button" variant="secondary" className="h-11 w-full" disabled={!canAct || isPending} onClick={onDone}>
                Done
              </Button>
              <Button type="button" variant="outline" className="h-11 w-full" disabled={!canAct || isPending} onClick={onSnooze}>
                Snooze 7d
              </Button>
            </>
          )}
          <Button type="button" variant="ghost" className="h-11 w-full" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
