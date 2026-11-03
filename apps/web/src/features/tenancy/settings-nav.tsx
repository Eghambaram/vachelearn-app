import Link from 'next/link';
import { cn } from '@/lib/utils';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

const SECTIONS = [
  { href: '/admin/settings', label: t.settings.general },
  { href: '/admin/settings/people', label: t.settings.jobRoles },
] as const;

/** The settings sections (UI spec #30, #53): links, the current one marked for assistive technology. */
export function SettingsNav({ current }: { current: (typeof SECTIONS)[number]['href'] }) {
  return (
    <nav aria-label={t.settings.nav}>
      <ul className="flex flex-wrap gap-2 border-b pb-2">
        {SECTIONS.map((section) => {
          const active = section.href === current;
          return (
            <li key={section.href}>
              <Link
                href={section.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {section.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
