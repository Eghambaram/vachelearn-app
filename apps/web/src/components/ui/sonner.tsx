'use client';

import { Toaster as Sonner, type ToasterProps } from 'sonner';
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
} from 'lucide-react';

// shadcn's wrapper followed next-themes; VacheLearn is light-only (D-059), so the theme is fixed and colours come
// from tokens (the shadcn --popover/--border/--radius variables are not defined in this app).
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon aria-hidden="true" className="size-4 text-success" />,
        info: <InfoIcon aria-hidden="true" className="size-4 text-info" />,
        warning: <TriangleAlertIcon aria-hidden="true" className="size-4 text-warning" />,
        error: <OctagonXIcon aria-hidden="true" className="size-4 text-danger" />,
        loading: <Loader2Icon aria-hidden="true" className="size-4 animate-spin" />,
      }}
      style={
        {
          '--normal-bg': 'var(--vl-color-surface)',
          '--normal-text': 'var(--vl-color-text)',
          '--normal-border': 'var(--vl-color-border)',
          '--border-radius': 'var(--vl-radius-card)',
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
