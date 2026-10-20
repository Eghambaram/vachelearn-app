import * as React from 'react';

export function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="rounded-xl border bg-card p-4 shadow-card sm:p-6">
      <h2 id={id} className="mb-4 text-xl font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}
