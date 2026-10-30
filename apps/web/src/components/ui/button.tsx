import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import { cn } from '@/lib/utils';

/*
 * shadcn/ui Button (radix-nova, shadcn@4.22.1), restyled for VacheLearn tokens:
 * - solid hover colours instead of opacity (opacity lowered text contrast below 4.5:1);
 * - focus uses the global :focus-visible outline (shadcn's 50%-opacity ring was ~2.3:1, below the 3:1 minimum);
 * - no `dark:` variants (light theme only, D-059).
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-transparent text-sm font-medium whitespace-nowrap transition-colors duration-150 select-none disabled:pointer-events-none disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-70 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary-hover',
        outline: 'border-input bg-card text-foreground hover:bg-muted',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-border',
        ghost: 'text-foreground hover:bg-muted',
        destructive:
          'bg-danger-subtle text-danger hover:bg-destructive hover:text-destructive-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-3',
        sm: 'h-8 px-2.5 text-[0.8125rem]',
        lg: 'h-10 px-4',
        icon: 'size-9',
        'icon-sm': 'size-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
