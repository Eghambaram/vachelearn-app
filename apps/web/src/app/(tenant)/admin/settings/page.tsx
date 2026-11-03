import type { Metadata } from 'next';
import { ErrorState } from '@/components/error-state';
import { PageHeader } from '@/components/page-header';
import { PermissionDenied } from '@/components/permission-denied';
import { ReloadButton } from '@/components/reload-button';
import { RealDataOnly } from '@/features/people/real-data-only';
import { SettingsGeneral } from '@/features/tenancy/settings-general';
import { SettingsNav } from '@/features/tenancy/settings-nav';
import { readTenantSettings } from '@/lib/api/tenancy-server';
import { getSession } from '@/lib/api/session';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const s = t.settings;

export const metadata: Metadata = { title: s.title };

export const dynamic = 'force-dynamic';

/** Organisation settings — general (UI spec #30; Slice 2.5c). Branding arrives in 3.8. */
export default async function SettingsPage() {
  const session = await getSession();
  if (session.demo) return <RealDataOnly />;
  const perms = new Set(session.permissions);
  if (!perms.has('tenant_settings.read')) return <PermissionDenied headingLevel="h1" />;
  const result = await readTenantSettings();
  if (!result.ok && result.status === 403) return <PermissionDenied headingLevel="h1" />;
  const editable = perms.has('tenant_settings.update');
  return (
    <>
      <PageHeader title={s.title} description={s.description} />
      <SettingsNav current="/admin/settings" />
      {!result.ok ? (
        <ErrorState
          requestId={result.error.requestId === 'none' ? undefined : result.error.requestId}
          action={<ReloadButton />}
        />
      ) : (
        <>
          {editable ? null : <p className="text-sm text-muted-foreground">{s.readOnlyNote}</p>}
          <SettingsGeneral settings={result.data} editable={editable} />
          <section
            aria-labelledby="settings-features"
            className="flex max-w-3xl flex-col gap-3 rounded-xl border bg-card p-4 sm:p-6"
          >
            <div className="flex flex-col gap-1">
              <h2 id="settings-features" className="text-lg font-semibold">
                {s.featuresTitle}
              </h2>
              <p className="text-sm text-muted-foreground">{s.featuresHelp}</p>
            </div>
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
              {(Object.keys(s.features) as (keyof typeof s.features)[]).map((key) => (
                <div key={key} className="contents">
                  <dt className="text-sm text-muted-foreground">{s.features[key]}</dt>
                  <dd className="text-sm font-medium">
                    {result.data.features[key] ? s.on : s.off}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </>
      )}
    </>
  );
}
