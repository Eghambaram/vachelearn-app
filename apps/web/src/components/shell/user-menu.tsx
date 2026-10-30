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
import { InlineAlert, useFocusOnChange } from '@/components/inline-alert';
import { useSignOut } from '@/features/auth/use-sign-out';
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
  const { signOut, pending, error } = useSignOut();
  const errorRef = useFocusOnChange<HTMLDivElement>(error);
  const canSwitch = session.memberships.length > 1 || session.availableRoles.length > 1;
  return (
    <>
      {error ? (
        // Just below the top bar, full width: never squeezed into the 56 px bar (UX review 2.4d).
        <div className="absolute inset-x-0 top-full px-4 pt-2 sm:px-6">
          <InlineAlert ref={errorRef} tone="danger">
            {error}
          </InlineAlert>
        </div>
      ) : null}
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
          {canSwitch ? (
            <DropdownMenuItem asChild>
              <Link href="/select-workspace">
                <ArrowLeftRight aria-hidden="true" />
                {t.shell.switchWorkspace}
              </Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          {session.demo ? (
            // Demo sessions have no sign-in: stated, not faked (Phase 1 principles).
            <DropdownMenuItem disabled>
              <LogOut aria-hidden="true" />
              {t.shell.signOutUnavailable}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => void signOut()} disabled={pending}>
              <LogOut aria-hidden="true" />
              {pending ? t.auth.signingOut : t.shell.signOut}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
