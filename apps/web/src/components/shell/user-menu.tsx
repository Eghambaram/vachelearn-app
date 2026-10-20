'use client';

import Link from 'next/link';
import { ArrowLeftRight, ChevronDown, LogOut, UserRound } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { SessionView } from '@/lib/api/session-types';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function UserMenu({ session }: { session: SessionView }) {
  const name = session.user.displayName;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg p-1 hover:bg-muted">
        <Avatar className="size-8">
          <AvatarFallback>{initials(name)}</AvatarFallback>
        </Avatar>
        <span className="hidden flex-col text-left sm:flex">
          <span className="text-sm font-medium">{name}</span>
          <span className="text-xs text-muted-foreground">{t.roles[session.role]}</span>
        </span>
        <span className="sr-only">{t.shell.userMenuSuffix}</span>
        <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col">
          <span className="text-sm font-medium text-foreground">{name}</span>
          <span className="truncate">{session.user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account">
            <UserRound aria-hidden="true" />
            {t.shell.profile}
          </Link>
        </DropdownMenuItem>
        {session.memberships.length > 1 ? (
          <DropdownMenuItem asChild>
            <Link href="/select-workspace">
              <ArrowLeftRight aria-hidden="true" />
              {t.shell.switchWorkspace}
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        {/* Not yet connected: stated, not faked (Phase 1 principles). */}
        <DropdownMenuItem disabled>
          <LogOut aria-hidden="true" />
          {t.shell.signOutUnavailable}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
