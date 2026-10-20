import { FlaskConical } from 'lucide-react';
import { switchDemoRole } from '@/app/demo-actions';
import { Button } from '@/components/ui/button';
import { ROLE_KEYS, type RoleKey } from '@/lib/api/session-types';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

/**
 * Always-visible demo banner with the dev-only role switcher (Slice 1.4 AC; D-063). A plain form + native select so
 * it works before JavaScript loads and with every assistive technology.
 */
export function DemoBar({ role }: { role: RoleKey }) {
  return (
    <div
      role="region"
      aria-label={t.demo.badge}
      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-warning/40 bg-warning-subtle px-4 py-2 text-sm text-warning sm:px-6"
    >
      <p className="flex items-center gap-2 font-medium">
        <FlaskConical aria-hidden="true" className="size-4 shrink-0" />
        {t.demo.bar}
      </p>
      <form action={switchDemoRole} className="flex items-center gap-2">
        <label htmlFor="demo-role" className="font-medium whitespace-nowrap">
          {t.demo.roleLabel}
        </label>
        <select
          id="demo-role"
          name="role"
          defaultValue={role}
          className="h-8 min-w-0 rounded-lg border border-input bg-card px-2 text-sm text-foreground"
        >
          {ROLE_KEYS.map((key) => (
            <option key={key} value={key}>
              {t.roles[key]}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" variant="outline">
          {t.demo.apply}
        </Button>
      </form>
    </div>
  );
}
