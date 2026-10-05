'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Input / Textarea / Select / Field.
 *
 * Radius 14px, 1px hairline border, min-height 2.75rem so the tap target is
 * honest, and 16px font on mobile or iOS zooms the viewport on focus (that
 * last one is handled globally in globals.css).
 *
 * Inputs are *recessed*, not raised: an inset shadow over a light wash. A
 * raised input inside a raised card gives you two bevels fighting.
 */
export const inputVariants = cva(
  [
    'w-full rounded-input border bg-white/70 px-3.5 text-sm text-ink-strong',
    'placeholder:text-ink-faint',
    'shadow-inner-track',
    'transition-[box-shadow,border-color,background-color] duration-quick ease-settle',
    'focus:outline-none focus:border-brand focus:bg-white/90 focus:ring-[3px] focus:ring-ring/50',
    'disabled:cursor-not-allowed disabled:opacity-disabled',
  ].join(' '),
  {
    variants: {
      state: {
        default: 'border-glass-hairline',
        /* Never colour alone: pair with the Field message. */
        invalid: 'border-error text-error-text focus:border-error focus:ring-error/40',
        valid: 'border-success-border',
      },
      inputSize: {
        md: 'min-h-input py-2.5',
        sm: 'min-h-[2.25rem] py-1.5 text-sm',
        lg: 'min-h-[3rem] py-3 text-base',
      },
    },
    defaultVariants: { state: 'default', inputSize: 'md' },
  }
);

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, state, inputSize, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      aria-invalid={state === 'invalid' || undefined}
      className={cn(inputVariants({ state, inputSize }), className)}
      {...props}
    />
  )
);
Input.displayName = 'Input';

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    VariantProps<typeof inputVariants> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, state, inputSize, rows = 4, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={state === 'invalid' || undefined}
      className={cn(inputVariants({ state, inputSize }), 'resize-y py-2.5', className)}
      {...props}
    />
  )
);
Textarea.displayName = 'Textarea';

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'>,
    VariantProps<typeof inputVariants> {}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, state, inputSize, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(inputVariants({ state, inputSize }), 'appearance-none pr-9', className)}
      {...props}
    />
  )
);
Select.displayName = 'Select';

/**
 * Field — the label / control / message wrapper. Wire `htmlFor` through `id`
 * and the error message is announced, not just coloured.
 */
export interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: React.ReactNode;
  /** Must match the control's `id`. */
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
}

export const Field = React.forwardRef<HTMLDivElement, FieldProps>(
  ({ className, label, htmlFor, hint, error, required, children, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-1.5', className)} {...props}>
      {label ? (
        <label htmlFor={htmlFor} className="text-sm font-medium text-ink-body">
          {label}
          {required ? (
            <span className="ml-0.5 text-error-text" aria-hidden>
              *
            </span>
          ) : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p id={htmlFor ? `${htmlFor}-error` : undefined} role="alert" className="text-xs font-medium text-error-text">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-ink-faint">{hint}</p>
      ) : null}
    </div>
  )
);
Field.displayName = 'Field';
