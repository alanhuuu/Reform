'use client'

import Link from 'next/link'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import InteractiveBackground from '@/components/landing/InteractiveBackground'

const CHECK_ICON = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#aab4ff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

interface Plan {
  name: string
  price: string
  period: string
  description: string
  features: string[]
  cta: string
  highlighted?: boolean
  badge?: string
}

const plans: Plan[] = [
  {
    name: 'Free',
    price: '$0',
    period: '',
    description: 'Get started and see what Reform can do for your frontend.',
    features: [
      '1 connected repo',
      '3 UI scans per month',
      'Basic UX scoring',
      'Single-page analysis',
      'Community support',
    ],
    cta: 'Get Started',
  },
  {
    name: 'Pro',
    price: '$29',
    period: '/month',
    description: 'For developers who ship fast and want every page polished.',
    features: [
      'Up to 5 repos',
      '50 UI scans per month',
      'Auto-generated PR fixes',
      'Multi-page analysis & reports',
      'UX scoring with insights',
      'Shareable improvement reports',
      'Priority email support',
    ],
    cta: 'Upgrade to Pro',
    highlighted: true,
    badge: 'Most Popular',
  },
  {
    name: 'Team',
    price: '$99',
    period: '/month',
    description: 'Built for teams that care about design quality at scale.',
    features: [
      'Unlimited repos',
      'Unlimited UI scans',
      'CI/CD pipeline integration',
      'Shared team workspace',
      'Improvement history tracking',
      'Auto-generated PR fixes',
      'Role-based access controls',
      'Dedicated support channel',
    ],
    cta: 'Start Team Plan',
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'Tailored for organizations with advanced requirements.',
    features: [
      'Everything in Team',
      'Competitor UI monitoring',
      'Custom analysis rules',
      'SSO & advanced security',
      'Dedicated account manager',
      'Priority support & SLA',
      'Custom onboarding & training',
    ],
    cta: 'Contact Sales',
  },
]

function PlanCard({ plan }: { plan: Plan }) {
  const isHighlighted = plan.highlighted

  return (
    <div
      className="relative flex flex-col rounded-[30px] p-6 sm:p-7"
      style={{
        background: isHighlighted
          ? 'linear-gradient(180deg, rgba(124,140,255,0.16) 0%, rgba(124,140,255,0.05) 100%)'
          : 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)',
        border: isHighlighted
          ? '1px solid rgba(170,180,255,0.24)'
          : '1px solid rgba(255,255,255,0.08)',
        boxShadow: isHighlighted
          ? '0 24px 70px rgba(86,102,245,0.18)'
          : '0 18px 50px rgba(0,0,0,0.24)',
      }}
    >
      {plan.badge && (
        <div
          className="absolute -top-3 left-6 text-[10px] font-semibold uppercase tracking-[0.22em] px-3 py-1 rounded-full"
          style={{
            background: 'linear-gradient(135deg, #aab4ff, #7c8cff)',
            color: '#09111d',
          }}
        >
          {plan.badge}
        </div>
      )}

      <div className="mb-7">
        <div className="mono text-[11px] mb-3" style={{ color: isHighlighted ? 'rgba(232,236,255,0.78)' : 'rgba(255,255,255,0.34)' }}>
          {plan.name}
        </div>
        <div className="flex items-end gap-1 mb-3">
          <span
            className="font-bold text-white"
            style={{
              fontSize: plan.price === 'Custom' ? '30px' : '42px',
              letterSpacing: '-0.05em',
              lineHeight: 1,
            }}
          >
            {plan.price}
          </span>
          {plan.period && (
            <span style={{ color: 'rgba(255,255,255,0.34)', fontSize: '14px' }}>
              {plan.period}
            </span>
          )}
        </div>
        <p style={{ color: 'rgba(255,255,255,0.46)', fontSize: '14px', lineHeight: '1.75' }}>
          {plan.description}
        </p>
      </div>

      <div className="mb-7 border-t pt-6" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <ul className="flex flex-col gap-3.5">
          {plan.features.map((feature, index) => (
            <li key={feature} className="flex items-start gap-3">
              <span className="flex-shrink-0 mt-0.5">{CHECK_ICON}</span>
              <div>
                <span style={{ color: 'rgba(255,255,255,0.68)', fontSize: '13px', lineHeight: '1.55' }}>
                  {feature}
                </span>
                {index === 0 && (
                  <div className="mono text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.24)' }}>
                    included in plan baseline
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <button
        className={`w-full py-3 rounded-2xl text-sm font-semibold transition-all duration-200 ${
          isHighlighted ? 'btn-primary' : 'btn-ghost'
        }`}
      >
        {plan.cta}
      </button>
    </div>
  )
}

export default function SubscriptionPage() {
  return (
    <main className="app-shell min-h-screen overflow-x-hidden">
      <InteractiveBackground />
      <div className="relative" style={{ zIndex: 1 }}>
        <Navbar />

        <section className="pt-28 sm:pt-36 pb-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="surface-panel rounded-[34px] overflow-hidden">
              <div className="grid lg:grid-cols-[0.9fr_1.1fr] border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                <div className="p-8 sm:p-10 lg:p-12">
                  <div className="eyebrow mb-5">Pricing</div>
                  <h1 className="section-title text-[clamp(40px,7vw,72px)] font-extrabold text-white mb-6">
                    Choose the plan that matches your redesign pace.
                  </h1>
                  <p className="max-w-lg" style={{ color: 'rgba(255,255,255,0.5)', lineHeight: 1.85, fontSize: '16px' }}>
                    Start free, then scale up when you need more scans, more repositories, and deeper collaboration.
                    Every plan keeps the same core promise: better frontend quality without rewriting your product.
                  </p>
                </div>

                <div className="p-8 sm:p-10 lg:p-12 flex flex-col justify-center" style={{ background: 'rgba(124,140,255,0.05)' }}>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {[
                      ['Included', 'Competitor analysis, UX scoring, and frontend transformation workflows'],
                      ['Deployment style', 'Built for developers who want a faster path from critique to polish'],
                    ].map(([label, body]) => (
                      <div key={label} className="surface-interactive rounded-[28px] p-5">
                        <div className="mono text-[11px] mb-2" style={{ color: 'rgba(255,255,255,0.28)' }}>{label}</div>
                        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.62)', lineHeight: 1.75 }}>{body}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-6 sm:p-8 lg:p-10">
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
                  {plans.map((plan) => (
                    <PlanCard key={plan.name} plan={plan} />
                  ))}
                </div>

                <div className="mt-10 rounded-[28px] p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div>
                    <div className="eyebrow mb-2">Security and access</div>
                    <p className="text-sm" style={{ color: 'rgba(255,255,255,0.46)', lineHeight: 1.8 }}>
                      All plans include HTTPS encryption and secure GitHub OAuth. You can cancel anytime.
                    </p>
                  </div>
                  <Link href="/" className="btn-ghost inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-sm font-medium">
                    Back to home
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        <Footer />
      </div>
    </main>
  )
}
