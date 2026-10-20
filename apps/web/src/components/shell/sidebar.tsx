'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  Award,
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  ChevronsUpDown,
  ClipboardCheck,
  ClipboardList,
  Download,
  FileText,
  GitBranch,
  History,
  LayoutDashboard,
  LifeBuoy,
  LibraryBig,
  Mail,
  Settings,
  ShieldCheck,
  ShieldUser,
  TrendingUp,
  UserRoundCog,
  Users,
} from 'lucide-react';
import { switchDemoTenant } from '@/app/demo-actions';
import { BrandLogo } from '@/components/shell/brand-logo';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { activeTenant, type SessionView, type Workspace } from '@/lib/api/session-types';
import { activeNavId, type NavIcon, type NavItem } from '@/lib/nav';
import { cn } from '@/lib/utils';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  building: Building2,
  users: Users,
  shield: ShieldUser,
  history: History,
  settings: Settings,
  branch: GitBranch,
  group: UserRoundCog,
  mail: Mail,
  book: BookOpen,
  assign: ClipboardList,
  progress: TrendingUp,
  quiz: ClipboardCheck,
  certificate: Award,
  compliance: ShieldCheck,
  report: FileText,
  chart: BarChart3,
  download: Download,
  calendar: CalendarDays,
  catalog: LibraryBig,
};

type SidebarBodyProps = {
  session: SessionView;
  workspace: Workspace;
  items: readonly NavItem[];
  /** Called after a nav link is followed (the mobile drawer closes itself). */
  onNavigate?: () => void;
};

/** Sidebar contents, shared by the desktop sidebar and the mobile drawer. Sits on the dark `sidebar` surface. */
export function SidebarBody({ session, workspace, items, onNavigate }: SidebarBodyProps) {
  const pathname = usePathname();
  const current = activeNavId(items, pathname);
  return (
    <div className="flex h-full flex-col gap-4 px-3 py-4">
      <Link href="/" className="self-start rounded-lg px-2 py-1">
        <BrandLogo />
        <span className="sr-only"> {t.brand.homeSuffix}</span>
      </Link>
      <WorkspaceSwitcher session={session} workspace={workspace} />
      <nav aria-label={t.nav.label} className="-mx-1 flex-1 overflow-y-auto px-1">
        <ul className="flex flex-col gap-0.5">
          {items.map((item) => {
            const Icon = ICONS[item.icon];
            const active = item.id === current;
            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  onClick={onNavigate}
                  className={cn(
                    'flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
                    active
                      ? 'bg-sidebar-active text-sidebar-foreground'
                      : 'text-sidebar-muted hover:bg-sidebar-active/40 hover:text-sidebar-foreground',
                  )}
                >
                  <Icon aria-hidden="true" className="size-4 shrink-0" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <Link
        href="/help"
        onClick={onNavigate}
        className="flex items-center gap-3 rounded-xl border border-sidebar-muted/30 px-3 py-3 text-sm hover:bg-sidebar-active/40"
      >
        <LifeBuoy aria-hidden="true" className="size-5 shrink-0 text-sidebar-muted" />
        <span className="flex flex-col">
          <span className="font-medium text-sidebar-foreground">{t.shell.helpCardTitle}</span>
          <span className="text-xs text-sidebar-muted">{t.shell.helpCardBody}</span>
        </span>
      </Link>
    </div>
  );
}

/**
 * Shows where the user is working: tenant + role/scope. A switcher only for users with several tenant memberships
 * (UI spec #47); platform staff see the platform label.
 */
function WorkspaceSwitcher({ session, workspace }: { session: SessionView; workspace: Workspace }) {
  const tenant = activeTenant(session);
  const title = tenant?.tenantName ?? t.workspaces[workspace];
  const subtitle = `${t.roles[session.role]} · ${session.scopeLabel}`;
  const [pending, startTransition] = React.useTransition();

  const summary = (
    <span className="flex min-w-0 flex-col text-left">
      <span className="truncate text-sm font-semibold text-sidebar-foreground">{title}</span>
      <span className="truncate text-xs text-sidebar-muted">{subtitle}</span>
    </span>
  );

  if (session.memberships.length < 2) {
    return <div className="rounded-lg px-3 py-2">{summary}</div>;
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        disabled={pending}
        className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 hover:bg-sidebar-active/40"
      >
        {summary}
        <span className="sr-only">{t.shell.workspaceSwitcherSuffix}</span>
        <ChevronsUpDown aria-hidden="true" className="size-4 shrink-0 text-sidebar-muted" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>{t.shell.switchWorkspace}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={session.activeTenantId ?? undefined}
          onValueChange={(tenantId) => startTransition(() => switchDemoTenant(tenantId))}
        >
          {session.memberships.map((membership) => (
            <DropdownMenuRadioItem key={membership.tenantId} value={membership.tenantId}>
              {membership.tenantName}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
