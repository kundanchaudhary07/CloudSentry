import { useId } from 'react'
import type { ReactNode } from 'react'

export function GradientHeroBanner({
  eyebrow,
  title,
  description,
  status,
  icon,
  action,
  className = '',
}: {
  eyebrow: string
  title: string
  description: string
  status?: string
  icon: ReactNode
  action?: ReactNode
  className?: string
}) {
  const gradientId = `hero-cloud-${useId().replaceAll(':', '')}`

  return (
    <section className={`gradient-hero-banner${className ? ` ${className}` : ''}`}>
      <div className="gradient-hero-top">
        <span className="gradient-hero-icon" aria-hidden="true">{icon}</span>
        <div>
          <p>{eyebrow}</p>
          {status && <span className="gradient-hero-status"><i />{status}</span>}
        </div>
        <span className="gradient-hero-more" aria-hidden="true">···</span>
      </div>
      <div className="gradient-hero-copy">
        <h2>{title}</h2>
        <p>{description}</p>
        {action && <div className="gradient-hero-action">{action}</div>}
      </div>
      <svg className="gradient-hero-cloud" viewBox="0 0 280 150" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity=".84" />
            <stop offset=".55" stopColor="#E7E7FF" stopOpacity=".56" />
            <stop offset="1" stopColor="#B6C7FF" stopOpacity=".32" />
          </linearGradient>
        </defs>
        <path
          d="M54 111c-20 0-35-14-35-32 0-17 13-31 31-33C57 20 76 8 98 8c25 0 46 16 53 39 5-2 10-3 15-3 21 0 38 16 38 36 0 7-2 14-6 19 23 0 40 14 40 31 0 14-13 25-30 25H55z"
          fill={`url(#${gradientId})`}
          stroke="#FFFFFF"
          strokeOpacity=".6"
          strokeWidth="2"
        />
        <path d="M32 113c34 14 78 14 111-1 35-16 66-15 93-4" fill="none" stroke="#FFFFFF" strokeOpacity=".55" strokeWidth="3" />
      </svg>
    </section>
  )
}
