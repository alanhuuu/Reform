'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import gsap from 'gsap'
import { BILLING_ENABLED } from '@/lib/billing'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import MockDashboardBefore from '@/components/demo/MockDashboardBefore'
import MockDashboardAfter from '@/components/demo/MockDashboardAfter'

gsap.registerPlugin(ScrollTrigger)

/* ───────────────────────────────────────────────────────
   CONSTANTS
   ─────────────────────────────────────────────────────── */
const NAV_HEIGHT = 72
const SCROLL_DISTANCE = 3200

// 4 scenes — each tells ONE product idea
const S1 = 0.0   // Intro: "Analyze your existing UI"
const S2 = 0.22  // Detect: "Detect layout and hierarchy issues"
const S3 = 0.48  // Transform: "Generate a cleaner interface"
const S4 = 0.78  // Hero: "Ship better UI with confidence"

/* ───────────────────────────────────────────────────────
   Space Black MacBook Pro — realistic CSS product render

   Goal: Apple product-ad level realism.
   Keyboard rows, trackpad, hinge depth, rim highlights,
   surface reflections, and studio lighting.
   ─────────────────────────────────────────────────────── */
function SpaceBlackMacBook({
  screenRef,
  afterRef,
  dividerRef,
  highlightRef,
}: {
  screenRef: React.Ref<HTMLDivElement>
  afterRef: React.Ref<HTMLDivElement>
  dividerRef: React.Ref<HTMLDivElement>
  highlightRef: React.Ref<HTMLDivElement>
}) {
  return (
    <div style={{ position: 'relative' }}>
      {/* ── DISPLAY LID ── */}
      <div
        style={{
          position: 'relative',
          background: 'linear-gradient(180deg, #2a2a2c 0%, #222224 2%, #1e1e20 30%, #1c1c1e 70%, #1a1a1c 97%, #242426 100%)',
          borderRadius: '12px 12px 0 0',
          padding: '4px',
          boxShadow: `
            inset 0 0 0 0.5px rgba(255,255,255,0.08),
            inset 0 1px 0 rgba(255,255,255,0.06),
            0 -1px 4px rgba(255,255,255,0.02),
            0 0 0 1px rgba(0,0,0,0.5)
          `,
        }}
      >
        {/* Rim highlight — top edge catch light */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: '8%',
            right: '8%',
            height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.12) 30%, rgba(255,255,255,0.18) 50%, rgba(255,255,255,0.12) 70%, transparent)',
            borderRadius: '1px',
          }}
        />

        {/* Camera notch */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            width: '68px',
            height: '14px',
            background: 'linear-gradient(180deg, #0c0c0e, #0a0a0c)',
            borderRadius: '0 0 8px 8px',
            zIndex: 10,
            boxShadow: 'inset 0 -0.5px 0 rgba(255,255,255,0.04)',
          }}
        >
          {/* Camera lens */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -15%)',
              width: '5px',
              height: '5px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, #1e1e22 30%, #141416 60%, #0a0a0c 100%)',
              boxShadow: 'inset 0 0 1px rgba(255,255,255,0.2), 0 0 2px rgba(0,0,0,0.5)',
            }}
          />
          {/* Indicator LED */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: 'calc(50% + 10px)',
              transform: 'translateY(-15%)',
              width: '2px',
              height: '2px',
              borderRadius: '50%',
              background: '#1a1a1c',
              boxShadow: 'inset 0 0 0.5px rgba(255,255,255,0.08)',
            }}
          />
        </div>

        {/* Surface gradient — aluminum studio light catch */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(160deg, transparent 20%, rgba(255,255,255,0.008) 40%, transparent 55%, rgba(255,255,255,0.005) 75%, transparent 90%)',
            borderRadius: 'inherit',
            pointerEvents: 'none',
          }}
        />

        {/* Left edge chamfer highlight */}
        <div
          style={{
            position: 'absolute',
            top: '10%',
            left: 0,
            bottom: 0,
            width: '0.5px',
            background: 'linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.06) 30%, rgba(255,255,255,0.04) 70%, transparent 100%)',
          }}
        />
        {/* Right edge chamfer highlight */}
        <div
          style={{
            position: 'absolute',
            top: '10%',
            right: 0,
            bottom: 0,
            width: '0.5px',
            background: 'linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.06) 30%, rgba(255,255,255,0.04) 70%, transparent 100%)',
          }}
        />

        {/* Screen display area */}
        <div
          ref={screenRef}
          style={{
            borderRadius: '5px',
            overflow: 'hidden',
            background: '#000',
            aspectRatio: '16 / 10',
            position: 'relative',
            boxShadow: '0 0 0 0.5px rgba(0,0,0,0.9), inset 0 0 0 0.5px rgba(255,255,255,0.015)',
          }}
        >
          {/* Before layer (always rendered underneath) */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '900px',
              height: '560px',
              transform: 'scale(var(--screen-s, 0.82))',
              transformOrigin: 'top left',
              pointerEvents: 'none',
            }}
          >
            <MockDashboardBefore />
          </div>

          {/* After layer (clip-revealed during Scene 3) */}
          <div
            ref={afterRef}
            style={{
              position: 'absolute',
              inset: 0,
              clipPath: 'inset(0 100% 0 0)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: '900px',
                height: '560px',
                transform: 'scale(var(--screen-s, 0.82))',
                transformOrigin: 'top left',
                pointerEvents: 'none',
              }}
            >
              <MockDashboardAfter />
            </div>
          </div>

          {/* Sweep divider line */}
          <div
            ref={dividerRef}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: '0%',
              width: '2px',
              background: 'linear-gradient(180deg, transparent 0%, rgba(124,140,255,0.9) 20%, rgba(168,85,247,0.9) 80%, transparent 100%)',
              boxShadow: '0 0 20px rgba(124,140,255,0.4), 0 0 40px rgba(168,85,247,0.15)',
              zIndex: 10,
              opacity: 0,
            }}
          />

          {/* Issue highlight overlay (shows in Scene 2) */}
          <div
            ref={highlightRef}
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 8,
              opacity: 0,
              pointerEvents: 'none',
            }}
          >
            {/* Spacing issue indicators */}
            <div style={{
              position: 'absolute', top: '13%', left: '18%', width: '38%', height: '8%',
              border: '1.5px dashed rgba(255,120,80,0.5)',
              borderRadius: '4px',
              boxShadow: '0 0 8px rgba(255,120,80,0.15)',
            }} />
            <div style={{
              position: 'absolute', top: '13%', left: '58%',
              fontSize: '8px', fontFamily: 'var(--font-mono)', color: 'rgba(255,120,80,0.7)',
              background: 'rgba(0,0,0,0.6)', padding: '2px 6px', borderRadius: '3px',
              whiteSpace: 'nowrap',
            }}>
              inconsistent spacing
            </div>

            <div style={{
              position: 'absolute', top: '32%', left: '18%', width: '22%', height: '20%',
              border: '1.5px dashed rgba(255,180,50,0.5)',
              borderRadius: '4px',
              boxShadow: '0 0 8px rgba(255,180,50,0.15)',
            }} />
            <div style={{
              position: 'absolute', top: '32%', left: '42%',
              fontSize: '8px', fontFamily: 'var(--font-mono)', color: 'rgba(255,180,50,0.7)',
              background: 'rgba(0,0,0,0.6)', padding: '2px 6px', borderRadius: '3px',
              whiteSpace: 'nowrap',
            }}>
              weak hierarchy
            </div>

            <div style={{
              position: 'absolute', top: '60%', left: '18%', width: '62%', height: '12%',
              border: '1.5px dashed rgba(120,160,255,0.5)',
              borderRadius: '4px',
              boxShadow: '0 0 8px rgba(120,160,255,0.15)',
            }} />
            <div style={{
              position: 'absolute', top: '60%', left: '82%',
              fontSize: '8px', fontFamily: 'var(--font-mono)', color: 'rgba(120,160,255,0.7)',
              background: 'rgba(0,0,0,0.6)', padding: '2px 6px', borderRadius: '3px',
              whiteSpace: 'nowrap',
            }}>
              misaligned grid
            </div>
          </div>

          {/* Screen reflection — diagonal light sweep + broad glass sheen */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `
                linear-gradient(115deg, transparent 42%, rgba(255,255,255,0.015) 48%, rgba(255,255,255,0.03) 50%, rgba(255,255,255,0.015) 52%, transparent 58%),
                linear-gradient(165deg, rgba(255,255,255,0.008) 0%, transparent 35%, transparent 65%, rgba(255,255,255,0.005) 100%)
              `,
              zIndex: 12,
              pointerEvents: 'none',
            }}
          />

          {/* Inner screen edge glow — simulates backlight bleed */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              boxShadow: 'inset 0 0 12px 2px rgba(124,140,255,0.04), inset 0 0 30px 4px rgba(0,0,0,0.15)',
              borderRadius: 'inherit',
              zIndex: 13,
              pointerEvents: 'none',
            }}
          />
        </div>
      </div>

      {/* ── HINGE ── */}
      <div
        style={{
          height: '3px',
          background: 'linear-gradient(180deg, #3a3a3c 0%, #2c2c2e 40%, #1c1c1e 100%)',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: '0 6% auto 6%',
            height: '0.5px',
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.10) 40%, rgba(255,255,255,0.10) 60%, transparent)',
          }}
        />
      </div>

      {/* ── KEYBOARD BASE ── */}
      <div
        style={{
          height: '46px',
          background: 'linear-gradient(180deg, #262628 0%, #212123 15%, #1e1e20 40%, #1b1b1d 70%, #18181a 100%)',
          borderRadius: '0 0 10px 10px',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: `
            inset 0 0.5px 0 rgba(255,255,255,0.05),
            inset 0 0 0 0.5px rgba(255,255,255,0.03),
            0 1px 0 rgba(0,0,0,0.3)
          `,
        }}
      >
        {/* Surface reflection — angled studio light on aluminum */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `
              linear-gradient(135deg, transparent 25%, rgba(255,255,255,0.015) 45%, rgba(255,255,255,0.008) 55%, transparent 75%),
              linear-gradient(180deg, rgba(255,255,255,0.006) 0%, transparent 40%)
            `,
            pointerEvents: 'none',
          }}
        />

        {/* Keyboard area */}
        <div
          style={{
            position: 'absolute',
            top: '10%',
            left: '5.5%',
            right: '5.5%',
            height: '48%',
            borderRadius: '2px',
          }}
        >
          {/* Individual key rows for realism */}
          {[0, 1, 2, 3].map((row) => (
            <div
              key={row}
              style={{
                position: 'absolute',
                top: `${row * 26}%`,
                left: row === 3 ? '8%' : '0',
                right: row === 3 ? '8%' : '0',
                height: '22%',
                display: 'flex',
                gap: '1.5px',
              }}
            >
              {Array.from({ length: row === 3 ? 10 : 13 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    flex: (row === 3 && i === 4) ? '3.5 1 0%' : '1 1 0%',
                    background: 'rgba(0,0,0,0.22)',
                    borderRadius: '1.5px',
                    boxShadow: 'inset 0 0.5px 0 rgba(255,255,255,0.02), inset 0 -0.5px 0 rgba(0,0,0,0.1)',
                  }}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Trackpad */}
        <div
          style={{
            position: 'absolute',
            bottom: '8%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '38%',
            height: '38%',
            borderRadius: '6px',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.01), rgba(255,255,255,0.004))',
            boxShadow: `
              inset 0 0.5px 0 rgba(255,255,255,0.05),
              0 0 0 0.5px rgba(255,255,255,0.04),
              inset 0 0 3px rgba(0,0,0,0.05)
            `,
          }}
        />

        {/* Side rim highlights */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            width: '0.5px',
            background: 'linear-gradient(180deg, transparent 20%, rgba(255,255,255,0.06) 50%, transparent 80%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: '0.5px',
            background: 'linear-gradient(180deg, transparent 20%, rgba(255,255,255,0.06) 50%, transparent 80%)',
          }}
        />
      </div>

      {/* ── FRONT LIP ── */}
      <div
        style={{
          height: '2px',
          margin: '0 2px',
          background: 'linear-gradient(180deg, #18181a, #111113)',
          borderRadius: '0 0 10px 10px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
        }}
      />
    </div>
  )
}

/* ───────────────────────────────────────────────────────
   Scene text overlay — fades in/out per scene
   ─────────────────────────────────────────────────────── */
function SceneText({
  stepRef,
  headRef,
  subRef,
}: {
  stepRef: React.Ref<HTMLDivElement>
  headRef: React.Ref<HTMLDivElement>
  subRef: React.Ref<HTMLDivElement>
}) {
  return (
    <div
      ref={stepRef}
      className="absolute left-0 right-0 flex justify-center pointer-events-none"
      style={{ top: 'clamp(32px, 8vh, 90px)', zIndex: 20, opacity: 0 }}
    >
      <div
        style={{
          textAlign: 'center',
        }}
      >
        <div
          ref={subRef}
          className="mono mb-3"
          style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em' }}
        />
        <div
          ref={headRef}
          className="text-white font-bold"
          style={{ fontSize: 'clamp(26px, 3.5vw, 42px)', letterSpacing: '-0.03em' }}
        />
      </div>
    </div>
  )
}

/* ───────────────────────────────────────────────────────
   MacBookHero — 4-scene product story

   Every motion communicates ONE idea.
   The MacBook is a frame, not the focus.

   Scene 1  ANALYZE    — MacBook appears, messy UI
   Scene 2  DETECT     — Slight shift, highlight issues
   Scene 3  TRANSFORM  — Closer to screen, before→after
   Scene 4  SHIP       — Settle, clean UI, confidence
   ─────────────────────────────────────────────────────── */
export default function MacBookHero() {
  const sectionRef = useRef<HTMLElement>(null)
  const heroTextRef = useRef<HTMLDivElement>(null)
  const laptopRef = useRef<HTMLDivElement>(null)
  const perspRef = useRef<HTMLDivElement>(null)
  const screenRef = useRef<HTMLDivElement>(null)
  const afterRef = useRef<HTMLDivElement>(null)
  const dividerRef = useRef<HTMLDivElement>(null)
  const highlightRef = useRef<HTMLDivElement>(null)
  const glowRef = useRef<HTMLDivElement>(null)
  const screenGlowRef = useRef<HTMLDivElement>(null)
  const shadowRef = useRef<HTMLDivElement>(null)

  // Scene text refs — 4 steps
  const step1Ref = useRef<HTMLDivElement>(null)
  const head1Ref = useRef<HTMLDivElement>(null)
  const sub1Ref = useRef<HTMLDivElement>(null)
  const step2Ref = useRef<HTMLDivElement>(null)
  const head2Ref = useRef<HTMLDivElement>(null)
  const sub2Ref = useRef<HTMLDivElement>(null)
  const step3Ref = useRef<HTMLDivElement>(null)
  const head3Ref = useRef<HTMLDivElement>(null)
  const sub3Ref = useRef<HTMLDivElement>(null)
  const step4Ref = useRef<HTMLDivElement>(null)
  const head4Ref = useRef<HTMLDivElement>(null)
  const sub4Ref = useRef<HTMLDivElement>(null)

  /* ── Screen content scale ── */
  useEffect(() => {
    const el = screenRef.current
    if (!el) return
    const sync = () => {
      el.style.setProperty('--screen-s', String(Math.min(el.offsetWidth / 900, 1)))
    }
    sync()
    window.addEventListener('resize', sync)
    return () => window.removeEventListener('resize', sync)
  }, [])

  /* ── Populate scene text on mount ── */
  useEffect(() => {
    if (head1Ref.current) head1Ref.current.textContent = 'Analyze your existing UI'
    if (sub1Ref.current) sub1Ref.current.textContent = 'STEP 1 — ANALYZE'
    if (head2Ref.current) head2Ref.current.textContent = 'Detect layout and hierarchy issues'
    if (sub2Ref.current) sub2Ref.current.textContent = 'STEP 2 — DETECT'
    if (head3Ref.current) head3Ref.current.textContent = 'Generate a cleaner interface'
    if (sub3Ref.current) sub3Ref.current.textContent = 'STEP 3 — TRANSFORM'
    if (head4Ref.current) head4Ref.current.textContent = 'Ship better UI with confidence'
    if (sub4Ref.current) sub4Ref.current.textContent = 'STEP 4 — SHIP'
  }, [])

  /* ── GSAP 4-scene timeline ── */
  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top top',
          end: `+=${SCROLL_DISTANCE}`,
          pin: true,
          scrub: 0.8,
          anticipatePin: 1,
        },
      })

      /* ============================================
         SCENE 1 — ANALYZE  (0% → 22%)
         Hero text fades out. MacBook at slight angle.
         Scene text: "Analyze your existing UI"
         ============================================ */
      const s1dur = S2 - S1

      // Hero text exits
      tl.to(
        heroTextRef.current,
        { y: -60, opacity: 0, duration: s1dur * 0.4, ease: 'power2.in' },
        S1,
      )

      // Scene 1 text fades in
      tl.fromTo(
        step1Ref.current,
        { y: 16, opacity: 0 },
        { y: 0, opacity: 1, duration: s1dur * 0.25, ease: 'power2.out' },
        S1 + s1dur * 0.35,
      )
      // Scene 1 text fades out before Scene 2
      tl.to(
        step1Ref.current,
        { y: -12, opacity: 0, duration: s1dur * 0.2, ease: 'power2.in' },
        S1 + s1dur * 0.8,
      )

      // MacBook rises from resting position into prominence
      tl.fromTo(
        laptopRef.current,
        { y: 14 },
        { y: -16, duration: s1dur * 0.8, ease: 'power2.out' },
        S1,
      )

      // Glow warms up
      tl.to(
        glowRef.current,
        { opacity: 0.4, duration: s1dur * 0.5, ease: 'power2.out' },
        S1 + s1dur * 0.3,
      )

      /* ============================================
         SCENE 2 — DETECT  (22% → 48%)
         Subtle perspective shift (NOT rotation).
         Issue highlights appear on the screen.
         Scene text: "Detect layout and hierarchy issues"
         ============================================ */
      const s2dur = S3 - S2

      // Very subtle camera shift — communicate "scanning"
      tl.to(
        perspRef.current,
        { rotateY: 1.5, rotateX: 1, duration: s2dur * 0.5, ease: 'power2.inOut' },
        S2,
      )

      // Laptop shifts slightly right (camera panning feel)
      tl.to(
        laptopRef.current,
        { x: 10, y: -22, scale: 1.02, duration: s2dur * 0.5, ease: 'power2.inOut' },
        S2,
      )

      // Issue highlights fade in
      tl.to(
        highlightRef.current,
        { opacity: 1, duration: s2dur * 0.3, ease: 'power2.out' },
        S2 + s2dur * 0.15,
      )

      // Scene 2 text fades in
      tl.fromTo(
        step2Ref.current,
        { y: 16, opacity: 0 },
        { y: 0, opacity: 1, duration: s2dur * 0.2, ease: 'power2.out' },
        S2 + s2dur * 0.1,
      )

      // Glow shifts subtly with camera
      tl.to(
        glowRef.current,
        { x: -20, opacity: 0.45, duration: s2dur * 0.5, ease: 'power2.out' },
        S2,
      )

      // Shadow follows the shift
      tl.to(
        shadowRef.current,
        { x: 6, scaleX: 1.03, duration: s2dur * 0.5, ease: 'power2.inOut' },
        S2,
      )

      // Issue highlights fade out before Scene 3
      tl.to(
        highlightRef.current,
        { opacity: 0, duration: s2dur * 0.2, ease: 'power2.in' },
        S2 + s2dur * 0.75,
      )

      // Scene 2 text fades out
      tl.to(
        step2Ref.current,
        { y: -12, opacity: 0, duration: s2dur * 0.15, ease: 'power2.in' },
        S2 + s2dur * 0.8,
      )

      /* ============================================
         SCENE 3 — TRANSFORM  (48% → 78%)
         Camera moves closer to the screen (zoom).
         Before → After reveal is the star here.
         Scene text: "Generate a cleaner interface"
         ============================================ */
      const s3dur = S4 - S3

      // Camera straightens and pushes in
      tl.to(
        perspRef.current,
        { rotateY: 0, rotateX: 0.5, duration: s3dur * 0.4, ease: 'power2.inOut' },
        S3,
      )

      // Laptop centers and scales closer — focus on screen
      tl.to(
        laptopRef.current,
        { x: 0, scale: 1.10, y: -34, duration: s3dur * 0.5, ease: 'power3.inOut' },
        S3,
      )

      // Screen glow intensifies as transformation happens
      tl.to(
        screenGlowRef.current,
        { opacity: 0.5, duration: s3dur * 0.5, ease: 'power2.out' },
        S3 + s3dur * 0.1,
      )

      // Glow centers
      tl.to(
        glowRef.current,
        { x: 0, opacity: 0.5, scale: 1.08, duration: s3dur * 0.4, ease: 'power2.out' },
        S3,
      )

      // Shadow centers and tightens
      tl.to(
        shadowRef.current,
        { x: 0, scaleX: 0.95, opacity: 0.55, duration: s3dur * 0.4, ease: 'power2.inOut' },
        S3,
      )

      // Scene 3 text fades in
      tl.fromTo(
        step3Ref.current,
        { y: 16, opacity: 0 },
        { y: 0, opacity: 1, duration: s3dur * 0.15, ease: 'power2.out' },
        S3 + s3dur * 0.05,
      )

      // ── THE CORE: Before → After reveal ──
      const revealStart = S3 + s3dur * 0.2
      const revealDur = s3dur * 0.6

      tl.fromTo(
        afterRef.current,
        { clipPath: 'inset(0 100% 0 0)' },
        { clipPath: 'inset(0 0% 0 0)', duration: revealDur, ease: 'power2.inOut' },
        revealStart,
      )

      // Divider sweeps with the reveal
      tl.fromTo(
        dividerRef.current,
        { left: '0%', opacity: 1 },
        { left: '100%', opacity: 0.2, duration: revealDur, ease: 'power2.inOut' },
        revealStart,
      )

      // Scene 3 text fades out
      tl.to(
        step3Ref.current,
        { y: -12, opacity: 0, duration: s3dur * 0.12, ease: 'power2.in' },
        S3 + s3dur * 0.85,
      )

      /* ============================================
         SCENE 4 — SHIP  (78% → 100%)
         MacBook settles to its best "hero" angle.
         Clean polished UI visible. Confidence.
         Scene text: "Ship better UI with confidence"
         ============================================ */
      const s4dur = 1.0 - S4

      // Settle to final comfortable viewing angle
      tl.to(
        perspRef.current,
        { rotateY: -1, rotateX: 2, duration: s4dur * 0.7, ease: 'power3.out' },
        S4,
      )

      // Pull back slightly to "hero shot" framing
      tl.to(
        laptopRef.current,
        { scale: 1.02, y: -18, x: 0, duration: s4dur * 0.7, ease: 'power3.out' },
        S4,
      )

      // Screen glow settles
      tl.to(
        screenGlowRef.current,
        { opacity: 0.3, duration: s4dur * 0.5, ease: 'power2.out' },
        S4,
      )

      // Glow settles to rest
      tl.to(
        glowRef.current,
        { opacity: 0.35, scale: 1.0, x: 0, duration: s4dur * 0.6, ease: 'power2.out' },
        S4,
      )

      // Shadow settles
      tl.to(
        shadowRef.current,
        { x: -3, scaleX: 1.0, opacity: 0.7, duration: s4dur * 0.5, ease: 'power2.out' },
        S4,
      )

      // Scene 4 text fades in and stays
      tl.fromTo(
        step4Ref.current,
        { y: 16, opacity: 0 },
        { y: 0, opacity: 1, duration: s4dur * 0.3, ease: 'power2.out' },
        S4 + s4dur * 0.1,
      )
    }, sectionRef)

    // Refresh after layout settles + fonts load
    const raf = requestAnimationFrame(() => ScrollTrigger.refresh())
    document.fonts?.ready.then(() => ScrollTrigger.refresh())

    return () => {
      cancelAnimationFrame(raf)
      ctx.revert()
    }
  }, [])

  /* ── JSX ── */
  return (
    <section
      ref={sectionRef}
      className="relative"
      style={{
        height: '100vh',
        overflow: 'hidden',
        background: `
          radial-gradient(ellipse 85% 65% at 50% 42%, #10111a 0%, #0b0c13 25%, #07080e 50%, #040509 80%, #030305 100%)
        `,
      }}
    >
      {/* ── Background atmosphere ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Top-down soft light wash — overhead studio lighting */}
        <div
          className="absolute"
          style={{
            top: '-15%',
            left: '50%',
            width: '110%',
            height: '60%',
            transform: 'translateX(-50%)',
            background: `
              radial-gradient(ellipse 55% 45% at 50% 0%, rgba(150,160,210,0.07), transparent 65%),
              radial-gradient(ellipse 35% 30% at 50% 10%, rgba(180,185,220,0.04), transparent 60%)
            `,
          }}
        />

        {/* Primary ambient glow — cool blue/purple centered on MacBook area */}
        <div
          ref={glowRef}
          className="absolute"
          style={{
            top: '8%',
            left: '50%',
            width: '130%',
            height: '92%',
            transform: 'translate(-50%, 0)',
            background: `
              radial-gradient(ellipse 48% 38% at 50% 48%,
                rgba(124,140,255,0.14), transparent 68%),
              radial-gradient(ellipse 32% 26% at 47% 50%,
                rgba(168,85,247,0.09), transparent 58%),
              radial-gradient(ellipse 65% 48% at 50% 46%,
                rgba(100,115,200,0.06), transparent 72%)
            `,
            opacity: 0.6,
          }}
        />

        {/* Secondary warm glow — bottom for grounding depth */}
        <div
          className="absolute"
          style={{
            bottom: '-5%',
            left: '50%',
            width: '150%',
            height: '50%',
            transform: 'translateX(-50%)',
            background: `
              radial-gradient(ellipse 50% 60% at 30% 80%,
                rgba(90,65,140,0.06), transparent 65%),
              radial-gradient(ellipse 50% 60% at 70% 80%,
                rgba(65,75,150,0.05), transparent 65%),
              radial-gradient(ellipse 70% 40% at 50% 100%,
                rgba(40,45,80,0.08), transparent 70%)
            `,
          }}
        />

        {/* Vignette — draws focus to center */}
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse 60% 55% at 50% 44%, transparent 40%, rgba(0,0,0,0.55) 100%)',
          }}
        />

        {/* Noise texture */}
        <div
          className="absolute inset-0"
          style={{
            opacity: 0.03,
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E")`,
            backgroundSize: '200px 200px',
          }}
        />
      </div>

      {/* ── Content layout ── */}
      <div
        className="relative flex flex-col items-center justify-start"
        style={{
          height: `calc(100vh - ${NAV_HEIGHT}px)`,
          marginTop: `${NAV_HEIGHT}px`,
        }}
      >
        {/* Hero text + CTAs */}
        <div ref={heroTextRef} className="text-center flex-shrink-0 px-6 pt-2 sm:pt-3 lg:pt-4">
          <div className="eyebrow mb-2.5">AI-assisted redesign for live products</div>

          <h1
            className="section-title font-extrabold text-balance mb-2.5"
            style={{ fontSize: 'clamp(30px, 4.8vw, 60px)', color: '#fff' }}
          >
            Upgrade the interface.
            <br />
            Keep the behavior.
          </h1>

          <p
            className="max-w-lg mx-auto text-balance mb-3"
            style={{
              fontSize: 'clamp(14px, 1.4vw, 16px)',
              color: 'rgba(255,255,255,0.46)',
              lineHeight: 1.65,
            }}
          >
            Reform turns inconsistent frontend surfaces into clear, production-grade
            UI while preserving the logic your team depends on.
          </p>

          <div className="flex items-center justify-center gap-3 mb-2">
            <Link
              href="/new"
              className="btn-primary inline-flex items-center gap-2 px-6 py-2.5 rounded-2xl text-sm font-semibold"
            >
              Start a Redesign
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M3 7h8M8 4l3 3-3 3"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
            {BILLING_ENABLED && (
              <Link
                href="/subscription"
                className="btn-ghost inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-medium"
              >
                View plans
              </Link>
            )}
          </div>
        </div>

        {/* MacBook Pro — Space Black */}
        <div
          ref={laptopRef}
          className="relative w-full px-4 sm:px-6"
          style={{
            flex: '0 0 auto',
            width: '100%',
            maxWidth: 'min(800px, 88vw, calc((100vh - 300px) * 1.45))',
            margin: 'auto',
            zIndex: 1,
          }}
        >
          {/* Screen glow (intensifies during transformation) */}
          <div
            ref={screenGlowRef}
            className="absolute pointer-events-none"
            style={{
              top: '-18%',
              left: '-22%',
              width: '144%',
              height: '136%',
              background: `radial-gradient(ellipse 42% 35% at 50% 42%,
                rgba(124,140,255,0.1), rgba(168,85,247,0.04) 55%, transparent 72%)`,
              opacity: 0,
              zIndex: 0,
            }}
          />

          {/* 3D perspective container */}
          <div className="w-full relative" style={{ perspective: '2000px', zIndex: 1 }}>
            <div
              ref={perspRef}
              style={{
                transform: 'rotateX(2deg) rotateY(-2deg)',
                transformStyle: 'preserve-3d',
                transition: 'none',
              }}
            >
              <SpaceBlackMacBook
                screenRef={screenRef}
                afterRef={afterRef}
                dividerRef={dividerRef}
                highlightRef={highlightRef}
              />
            </div>
          </div>

          {/* Contact shadow — realistic multi-layer */}
          <div
            ref={shadowRef}
            style={{
              position: 'absolute',
              bottom: '-10px',
              left: '8%',
              right: '8%',
              height: '40px',
              background: `
                radial-gradient(ellipse 75% 100% at 50% 0%, rgba(0,0,0,0.5), transparent 55%),
                radial-gradient(ellipse 50% 65% at 50% 0%, rgba(0,0,0,0.3), transparent 45%),
                radial-gradient(ellipse 30% 35% at 50% 0%, rgba(0,0,0,0.2), transparent 35%)
              `,
              filter: 'blur(16px)',
              zIndex: 0,
            }}
          />
        </div>

        {/* Scene text overlays */}
        <SceneText stepRef={step1Ref} headRef={head1Ref} subRef={sub1Ref} />
        <SceneText stepRef={step2Ref} headRef={head2Ref} subRef={sub2Ref} />
        <SceneText stepRef={step3Ref} headRef={head3Ref} subRef={sub3Ref} />
        <SceneText stepRef={step4Ref} headRef={head4Ref} subRef={sub4Ref} />
      </div>

      {/* Bottom gradient blend into next section */}
      <div
        className="absolute bottom-0 left-0 right-0 h-28 pointer-events-none"
        style={{
          background: 'linear-gradient(to bottom, transparent, #040509)',
          zIndex: 20,
        }}
      />
    </section>
  )
}
