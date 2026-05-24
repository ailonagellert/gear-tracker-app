import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { MoreVertical, X } from 'lucide-react';

import { Button } from '@/components/ui/button';

type MobileOverflowMenuProps = {
  onSignOut: () => void;
};

export function MobileOverflowMenu({ onSignOut }: MobileOverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (rootRef.current.contains(event.target as Node)) return;
      setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  return (
    <div ref={rootRef} className="relative inline-flex sm:hidden">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-11 w-11"
        aria-label="Open menu"
        onClick={() => setOpen((prev) => !prev)}
      >
        {open ? <X className="h-5 w-5" /> : <MoreVertical className="h-5 w-5" />}
      </Button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-56 rounded-md border border-border bg-card p-2 shadow-lg dark:bg-slate-800">
          <p className="px-2 pb-2 text-sm text-muted-foreground">Quick actions</p>
          <Button asChild variant="ghost" className="h-11 w-full justify-start" onClick={() => setOpen(false)}>
            <Link href="/help/strava-gear">Strava Gear Help</Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-full justify-start"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
          >
            Sign Out
          </Button>
          <Button type="button" variant="outline" className="mt-1 h-9 w-full" onClick={() => setOpen(false)}>
            Close menu
          </Button>
        </div>
      ) : null}
    </div>
  );
}
