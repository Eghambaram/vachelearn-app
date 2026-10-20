import * as React from 'react';
import { Button } from '@/components/ui/button';

type IconButtonProps = Omit<
  React.ComponentProps<typeof Button>,
  'size' | 'children' | 'aria-label'
> & {
  /** Accessible name — required, because the button shows only an icon. */
  label: string;
  icon: React.ReactNode;
  size?: 'icon' | 'icon-sm';
};

/** Icon-only button (36×36 px by default; 32×32 for `icon-sm` — both above the 24 px target minimum). */
export function IconButton({
  label,
  icon,
  size = 'icon',
  variant = 'ghost',
  ...props
}: IconButtonProps) {
  return (
    <Button aria-label={label} title={label} size={size} variant={variant} {...props}>
      <span aria-hidden="true" className="contents">
        {icon}
      </span>
    </Button>
  );
}
