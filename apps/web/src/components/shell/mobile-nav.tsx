'use client';

import * as React from 'react';
import { Menu, X } from 'lucide-react';
import { IconButton } from '@/components/icon-button';
import { SidebarBody } from '@/components/shell/sidebar';
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import type { SessionView, Workspace } from '@/lib/api/session-types';
import type { NavItem } from '@/lib/nav';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

/** Below `lg` the sidebar collapses into a left drawer: focus is trapped, Escape closes it, focus returns. */
export function MobileNav(props: {
  session: SessionView;
  workspace: Workspace;
  items: readonly NavItem[];
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <IconButton label={t.shell.openMenu} icon={<Menu />} className="lg:hidden" />
      </SheetTrigger>
      <SheetContent
        side="left"
        showCloseButton={false}
        className="surface-dark w-72 gap-0 border-none bg-sidebar text-sidebar-foreground"
      >
        <SheetTitle className="sr-only">{t.shell.menuTitle}</SheetTitle>
        <SheetClose asChild>
          <IconButton
            label={t.common.close}
            icon={<X />}
            size="icon-sm"
            className="absolute top-4 right-3 text-sidebar-foreground hover:bg-sidebar-active/40"
          />
        </SheetClose>
        <SidebarBody {...props} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
