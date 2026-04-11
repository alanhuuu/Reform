/**
 * Reform v2 UI primitives.
 *
 * Premium dark + emerald accent system. Every new screen should be
 * composed from these six components. They wrap the raw CSS variables
 * declared in globals.css (--ui-*) so a token tweak cascades through
 * the whole product.
 *
 * Keep each primitive under ~60 lines. No magic, no external deps.
 */

'use client'

import { forwardRef } from 'react'
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  HTMLAttributes,
  ReactNode,
} from 'react'

// ── Button ──────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: ReactNode
}

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[12px]',
  md: 'h-10 px-4 text-[13px]',
  lg: 'h-12 px-6 text-[14px]',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className = '', children, disabled, ...rest },
  ref,
) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-[12px] font-medium tracking-[-0.01em] select-none ' +
    'transition-all duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[#10B981]/40 ' +
    'disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none whitespace-nowrap'

  const variants: Record<ButtonVariant, string> = {
    primary:
      'text-[#06221B] bg-[#10B981] border border-[#10B981]/60 ' +
      'shadow-[0_1px_0_rgba(255,255,255,0.16)_inset,0_8px_24px_rgba(16,185,129,0.22)] ' +
      'hover:bg-[#34D399] hover:-translate-y-px ' +
      'hover:shadow-[0_1px_0_rgba(255,255,255,0.2)_inset,0_12px_32px_rgba(16,185,129,0.28)] ' +
      'active:translate-y-0',
    secondary:
      'text-white bg-[#15151A] border border-white/10 ' +
      'hover:bg-[#1C1C21] hover:border-white/18 hover:-translate-y-px',
    ghost:
      'text-[#A1A1AA] bg-transparent border border-transparent ' +
      'hover:text-white hover:bg-white/[0.05]',
    danger:
      'text-[#FCA5A5] bg-[#EF4444]/[0.08] border border-[#EF4444]/25 ' +
      'hover:bg-[#EF4444]/[0.14] hover:text-[#FECACA] hover:-translate-y-px',
  }

  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`${base} ${BUTTON_SIZES[size]} ${variants[variant]} ${className}`}
      {...rest}
    >
      {loading ? (
        <Spinner size={size === 'lg' ? 16 : 14} />
      ) : icon ? (
        <span className="flex-shrink-0">{icon}</span>
      ) : null}
      {children}
    </button>
  )
})

// ── Card ────────────────────────────────────────────────────────────

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean
  elevated?: boolean
  padded?: boolean
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { hoverable, elevated, padded = true, className = '', children, ...rest },
  ref,
) {
  const base =
    'rounded-[16px] border border-white/[0.06] bg-[#111113] ' +
    'transition-all duration-200 ease-out'
  const pad = padded ? 'p-5 sm:p-6' : ''
  const shadow = elevated
    ? 'shadow-[0_1px_0_rgba(255,255,255,0.05)_inset,0_24px_56px_rgba(0,0,0,0.55)]'
    : 'shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_12px_32px_rgba(0,0,0,0.45)]'
  const hover = hoverable
    ? 'hover:-translate-y-0.5 hover:bg-[#141418] hover:border-white/[0.1] cursor-pointer'
    : ''
  return (
    <div ref={ref} className={`${base} ${pad} ${shadow} ${hover} ${className}`} {...rest}>
      {children}
    </div>
  )
})

// ── Input ───────────────────────────────────────────────────────────

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { icon, className = '', ...rest },
  ref,
) {
  const base =
    'w-full h-11 rounded-[12px] bg-[#111113] border border-white/[0.08] ' +
    'text-white placeholder:text-[#6B7280] text-[14px] tracking-[-0.01em] ' +
    'transition-all duration-200 ease-out outline-none ' +
    'hover:border-white/[0.14] ' +
    'focus:border-[#10B981]/45 focus:bg-[#131316] focus:ring-2 focus:ring-[#10B981]/15 ' +
    'disabled:opacity-40 disabled:cursor-not-allowed'
  if (icon) {
    return (
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6B7280] pointer-events-none">
          {icon}
        </span>
        <input ref={ref} className={`${base} pl-10 pr-4 ${className}`} {...rest} />
      </div>
    )
  }
  return <input ref={ref} className={`${base} px-4 ${className}`} {...rest} />
})

// ── PageHeader ──────────────────────────────────────────────────────

interface PageHeaderProps {
  kicker?: string
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  align?: 'left' | 'center'
  className?: string
}

export function PageHeader({
  kicker,
  title,
  description,
  actions,
  align = 'left',
  className = '',
}: PageHeaderProps) {
  const alignCls = align === 'center' ? 'text-center items-center' : 'text-left'
  return (
    <div className={`flex flex-col gap-3 ${alignCls} ${className}`}>
      {kicker && (
        <div
          className="text-[11px] font-medium uppercase tracking-[0.14em]"
          style={{ color: '#6B7280', fontFamily: 'var(--font-mono), monospace' }}
        >
          {kicker}
        </div>
      )}
      <h1
        className="text-[34px] sm:text-[38px] font-semibold text-white leading-[1.05]"
        style={{ letterSpacing: '-0.028em' }}
      >
        {title}
      </h1>
      {description && (
        <p
          className={`text-[14px] leading-[1.6] max-w-[640px] ${align === 'center' ? 'mx-auto' : ''}`}
          style={{ color: '#A1A1AA' }}
        >
          {description}
        </p>
      )}
      {actions && <div className={`flex items-center gap-2 mt-2 ${align === 'center' ? 'justify-center' : ''}`}>{actions}</div>}
    </div>
  )
}

// ── Spinner ─────────────────────────────────────────────────────────

export function Spinner({ size = 16, color }: { size?: number; color?: string }) {
  return (
    <div
      className="rounded-full animate-spin flex-shrink-0"
      style={{
        width: size,
        height: size,
        border: `2px solid ${color ? `${color}26` : 'rgba(255,255,255,0.12)'}`,
        borderTopColor: color || '#10B981',
      }}
    />
  )
}

// ── StatusDot ───────────────────────────────────────────────────────

type DotKind = 'live' | 'idle' | 'warn' | 'error' | 'accent'

const DOT_COLORS: Record<DotKind, string> = {
  live: '#10B981',
  idle: 'rgba(255,255,255,0.3)',
  warn: '#F59E0B',
  error: '#EF4444',
  accent: '#10B981',
}

export function StatusDot({
  kind = 'live',
  pulse = false,
  size = 6,
}: {
  kind?: DotKind
  pulse?: boolean
  size?: number
}) {
  const color = DOT_COLORS[kind]
  return (
    <span className="relative inline-flex flex-shrink-0" style={{ width: size, height: size }}>
      <span
        className="rounded-full"
        style={{
          width: size,
          height: size,
          background: color,
          boxShadow: kind === 'live' || kind === 'accent' ? `0 0 ${size}px ${color}80` : undefined,
        }}
      />
      {pulse && (kind === 'live' || kind === 'accent') && (
        <span
          className="absolute inset-0 rounded-full animate-ping"
          style={{ background: color, opacity: 0.4 }}
        />
      )}
    </span>
  )
}

// ── Surface ─────────────────────────────────────────────────────────

interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  tone?: 'default' | 'muted' | 'accent'
}

export function Surface({ tone = 'default', className = '', children, ...rest }: SurfaceProps) {
  const tones: Record<NonNullable<SurfaceProps['tone']>, string> = {
    default: 'bg-[#111113] border-white/[0.06]',
    muted: 'bg-[#0D0D0F] border-white/[0.05]',
    accent: 'bg-[#10B981]/[0.05] border-[#10B981]/20',
  }
  return (
    <div
      className={`rounded-[14px] border ${tones[tone]} transition-colors duration-200 ${className}`}
      {...rest}
    >
      {children}
    </div>
  )
}
