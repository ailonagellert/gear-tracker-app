import { ReactNode, useEffect, useState } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';

type BikeCardSectionsProps = {
  title: string;
  icon?: LucideIcon;
  subtitle?: ReactNode;
  children: ReactNode;
  defaultOpenMobile?: boolean;
  defaultOpenDesktop?: boolean;
  className?: string;
  contentClassName?: string;
};

export function BikeCardSections({
  title,
  icon: Icon,
  subtitle,
  children,
  defaultOpenMobile = false,
  defaultOpenDesktop = true,
  className = '',
  contentClassName = '',
}: BikeCardSectionsProps) {
  const [isDesktop, setIsDesktop] = useState(false);
  const [isOpen, setIsOpen] = useState(defaultOpenMobile);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 768px)');

    const handleMediaChange = (event: MediaQueryListEvent | MediaQueryList) => {
      const nextDesktop = event.matches;
      setIsDesktop(nextDesktop);
      setIsOpen(nextDesktop ? defaultOpenDesktop : defaultOpenMobile);
    };

    handleMediaChange(mediaQuery);

    const onChange = (event: MediaQueryListEvent) => handleMediaChange(event);
    mediaQuery.addEventListener('change', onChange);

    return () => {
      mediaQuery.removeEventListener('change', onChange);
    };
  }, [defaultOpenDesktop, defaultOpenMobile]);

  const resolvedOpen = isDesktop ? true : isOpen;

  return (
    <details
      open={resolvedOpen}
      onToggle={(event) => {
        if (isDesktop) return;
        setIsOpen(event.currentTarget.open);
      }}
      className={`rounded-md border border-border bg-muted/20 ${className}`}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-base font-semibold text-foreground">
        <span className="min-w-0">
          <span className="inline-flex items-center gap-2">
            {Icon ? <Icon className="h-4 w-4 opacity-80" /> : null}
            {title}
          </span>
          {subtitle ? <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{subtitle}</span> : null}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${resolvedOpen ? 'rotate-180' : ''}`} />
      </summary>
      <div className={`space-y-3 border-t border-border p-3 ${contentClassName}`}>{children}</div>
    </details>
  );
}
