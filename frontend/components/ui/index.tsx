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
  sm: 'h-7 px-2.5 text-[12px]',
  md: 'h-8 px-3 text-[12.5px]',
  lg: 'h-9 px-4 text-[13px]',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className = '', children, disabled, ...rest },
  ref,
) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-[8px] font-medium tracking-[-0.005em] select-none ' +
    'transition-colors duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[#10B981]/35 ' +
    'disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none whitespace-nowrap'

  const variants: Record<ButtonVariant, string> = {
    primary:
      'text-[#052E1E] bg-[#10B981] border border-[#10B981] ' +
      'hover:bg-[#34D399] hover:border-[#34D399]',
    secondary:
      'text-[#E5E7EB] bg-[#1C1C1C] border border-[#262626] ' +
      'hover:bg-[#222222] hover:border-[#333333]',
    ghost:
      'text-[#9CA3AF] bg-transparent border border-transparent ' +
      'hover:text-[#E5E7EB] hover:bg-[#1A1A1A]',
    danger:
      'text-[#FCA5A5] bg-[#1C1C1C] border border-[#EF4444]/30 ' +
      'hover:bg-[#EF4444]/[0.12] hover:border-[#EF4444]/45 hover:text-[#FECACA]',
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
  { hoverable, elevated: _elevated, padded = true, className = '', children, ...rest },
  ref,
) {
  const base =
    'rounded-[12px] border border-[#262626] bg-[#161616] ' +
    'transition-colors duration-150 ease-out'
  const pad = padded ? 'p-4' : ''
  const hover = hoverable
    ? 'hover:bg-[#191919] hover:border-[#333333] cursor-pointer'
    : ''
  return (
    <div ref={ref} className={`${base} ${pad} ${hover} ${className}`} {...rest}>
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
    'w-full h-9 rounded-[8px] bg-[#161616] border border-[#262626] ' +
    'text-[#E5E7EB] placeholder:text-[#6B7280] text-[13px] tracking-[-0.005em] ' +
    'transition-colors duration-150 ease-out outline-none ' +
    'hover:border-[#333333] ' +
    'focus:border-[#10B981]/50 focus:bg-[#1A1A1A] focus:ring-1 focus:ring-[#10B981]/25 ' +
    'disabled:opacity-40 disabled:cursor-not-allowed'
  if (icon) {
    return (
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280] pointer-events-none">
          {icon}
        </span>
        <input ref={ref} className={`${base} pl-9 pr-3 ${className}`} {...rest} />
      </div>
    )
  }
  return <input ref={ref} className={`${base} px-3 ${className}`} {...rest} />
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
    <div className={`flex items-start justify-between gap-6 ${className}`}>
      <div className={`flex flex-col gap-1 min-w-0 ${alignCls}`}>
        {kicker && (
          <div
            className="text-[10px] font-medium uppercase tracking-[0.12em] mb-1"
            style={{ color: '#6B7280', fontFamily: 'var(--font-mono), monospace' }}
          >
            {kicker}
          </div>
        )}
        <h1
          className="text-[22px] font-semibold leading-[1.15]"
          style={{ letterSpacing: '-0.018em', color: '#E5E7EB' }}
        >
          {title}
        </h1>
        {description && (
          <p className="text-[13px] leading-[1.55] max-w-[640px] mt-0.5" style={{ color: '#9CA3AF' }}>
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-1.5 flex-shrink-0">{actions}</div>}
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
