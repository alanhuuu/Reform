import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  interpolate,
  spring,
  useVideoConfig,
} from 'remotion';

// ─── Palette ────────────────────────────────────────────────────────────────
const BG = '#0A0A0A';
const PURPLE = '#6d28d9';
const PURPLE_MUTED = '#8b5cf6';
const WHITE = '#f5f5f5';
const DIM = 'rgba(255,255,255,0.22)';
const FONT = 'Inter, -apple-system, system-ui, sans-serif';

// ─── Helpers ────────────────────────────────────────────────────────────────
const clamp = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const };

function ease(frame: number, from: number, to: number, valFrom: number, valTo: number) {
  return interpolate(frame, [from, to], [valFrom, valTo], clamp);
}

// ─── SCENE 1: Opening Text (0–3s / 0–90) ───────────────────────────────────
// Pure black. Two lines fade in sequentially. No movement. Just presence.
const OpeningText: React.FC = () => {
  const frame = useCurrentFrame();

  const line1 = ease(frame, 12, 32, 0, 1);
  const line2 = ease(frame, 38, 58, 0, 1);
  const exit = ease(frame, 75, 90, 1, 0);

  return (
    <AbsoluteFill style={{ background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: exit }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{
          fontSize: 64, fontWeight: 300, fontFamily: FONT, color: DIM,
          margin: 0, letterSpacing: -0.5, opacity: line1,
        }}>
          Your frontend…
        </p>
        <h1 style={{
          fontSize: 82, fontWeight: 600, fontFamily: FONT, color: WHITE,
          margin: '8px 0 0', letterSpacing: -2, opacity: line2,
        }}>
          looks like this.
        </h1>
      </div>
    </AbsoluteFill>
  );
};

// ─── SCENE 2: Messy UI in 3D (3–7s / 90–210) ──────────────────────────────
// A tilted dashboard with bad hierarchy. Slow camera drift. Red X fades in.
const MessyUI: React.FC = () => {
  const frame = useCurrentFrame();

  const enter = ease(frame, 0, 30, 0, 1);
  const exit = ease(frame, 100, 120, 1, 0);
  const rotY = ease(frame, 0, 120, -4, -1);
  const rotX = ease(frame, 0, 120, 3, 1);
  const drift = ease(frame, 0, 120, 8, -4);
  const xOverlay = ease(frame, 60, 80, 0, 0.12);

  return (
    <AbsoluteFill style={{ background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', perspective: 1800, opacity: exit }}>
      <div style={{
        opacity: enter,
        transform: `rotateY(${rotY}deg) rotateX(${rotX}deg) translateY(${drift}px)`,
        transformStyle: 'preserve-3d',
        width: 1100, height: 640,
        borderRadius: 14,
        background: '#111113',
        border: '1px solid rgba(255,255,255,0.05)',
        boxShadow: '0 80px 200px rgba(0,0,0,0.9), 0 2px 40px rgba(0,0,0,0.5)',
        overflow: 'hidden',
        position: 'relative',
      }}>
        {/* Top bar */}
        <div style={{ height: 36, background: '#0c0c0e', display: 'flex', alignItems: 'center', padding: '0 14px', gap: 7, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ width: 10, height: 10, borderRadius: 5, background: 'rgba(255,90,90,0.7)' }} />
          <div style={{ width: 10, height: 10, borderRadius: 5, background: 'rgba(255,190,50,0.6)' }} />
          <div style={{ width: 10, height: 10, borderRadius: 5, background: 'rgba(50,200,70,0.6)' }} />
        </div>

        {/* Messy content */}
        <div style={{ padding: 28, display: 'flex', gap: 20 }}>
          {/* Sidebar — uneven spacing */}
          <div style={{ width: 170, display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ height: 32, borderRadius: 4, background: 'rgba(255,255,255,0.04)' }} />
            <div style={{ height: 40, borderRadius: 4, background: 'rgba(255,255,255,0.06)' }} />
            <div style={{ height: 28, borderRadius: 4, background: 'rgba(255,255,255,0.03)' }} />
            <div style={{ height: 45, borderRadius: 4, background: 'rgba(255,255,255,0.05)', marginTop: 12 }} />
            <div style={{ height: 30, borderRadius: 4, background: 'rgba(255,255,255,0.04)' }} />
          </div>
          {/* Main — misaligned cards */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ height: 40, borderRadius: 6, background: 'rgba(255,255,255,0.03)', width: '70%' }} />
            <div style={{ display: 'flex', gap: 14 }}>
              <div style={{ width: '45%', height: 180, borderRadius: 6, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ height: 7, width: '80%', background: 'rgba(255,255,255,0.06)', borderRadius: 3, margin: '18px 16px 0' }} />
                <div style={{ height: 5, width: '50%', background: 'rgba(255,255,255,0.03)', borderRadius: 3, margin: '10px 16px 0' }} />
              </div>
              <div style={{ width: '30%', height: 160, borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.03)', marginTop: 20 }} />
              <div style={{ width: '25%', height: 200, borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)' }} />
            </div>
            <div style={{ height: 120, borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.03)', width: '90%' }} />
          </div>
        </div>

        {/* Red X — subtle overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: xOverlay,
        }}>
          <svg width="220" height="220" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="1.2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── SCENE 3: "What if it didn't?" (7–10s / 210–300) ───────────────────────
const PivotText: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const s = spring({ frame: Math.max(0, frame - 10), fps, config: { damping: 30, stiffness: 40, mass: 1.2 } });
  const exit = ease(frame, 72, 90, 1, 0);

  return (
    <AbsoluteFill style={{ background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: exit }}>
      <h1 style={{
        fontSize: 78, fontWeight: 600, fontFamily: FONT, color: WHITE,
        margin: 0, letterSpacing: -1.5, textAlign: 'center',
        opacity: s,
        transform: `scale(${interpolate(s, [0, 1], [0.96, 1])})`,
      }}>
        What if it didn't?
      </h1>
    </AbsoluteFill>
  );
};

// ─── SCENE 4: Transformation (10–16s / 300–480) ────────────────────────────
// The core moment. A 3D dashboard morphs from messy to clean. Slow, fluid.
const TransformScene: React.FC = () => {
  const frame = useCurrentFrame();

  // Transformation progress: 0 → 1 over the scene, with an ease curve
  const t = ease(frame, 20, 140, 0, 1);
  // Camera zoom — very subtle
  const camScale = ease(frame, 0, 180, 0.98, 1.04);
  const camRotY = ease(frame, 0, 180, 2, -0.5);
  const camRotX = ease(frame, 0, 180, -2, 0.5);
  const enter = ease(frame, 0, 25, 0, 1);
  const exit = ease(frame, 160, 180, 1, 0);

  // Interpolate from messy to clean values
  const sidebarGap = interpolate(t, [0, 1], [5, 8], clamp);
  const card1Width = interpolate(t, [0, 1], [45, 33.3], clamp);
  const card2Width = interpolate(t, [0, 1], [30, 33.3], clamp);
  const card3Width = interpolate(t, [0, 1], [25, 33.3], clamp);
  const card1Height = interpolate(t, [0, 1], [180, 160], clamp);
  const card2Height = interpolate(t, [0, 1], [160, 160], clamp);
  const card3Height = interpolate(t, [0, 1], [200, 160], clamp);
  const card2Offset = interpolate(t, [0, 1], [20, 0], clamp);
  const headerWidth = interpolate(t, [0, 1], [70, 100], clamp);
  const bottomWidth = interpolate(t, [0, 1], [90, 100], clamp);
  const sidebarBg = interpolate(t, [0, 1], [0.04, 0.06], clamp);
  const borderOpacity = interpolate(t, [0, 1], [0.04, 0.08], clamp);
  const accentOpacity = interpolate(t, [0.6, 1], [0, 0.15], clamp);
  const cardRadius = interpolate(t, [0, 1], [6, 10], clamp);

  // Sidebar items morph to even height
  const sb1 = interpolate(t, [0, 1], [32, 36], clamp);
  const sb2 = interpolate(t, [0, 1], [40, 36], clamp);
  const sb3 = interpolate(t, [0, 1], [28, 36], clamp);
  const sb4 = interpolate(t, [0, 1], [45, 36], clamp);
  const sb5 = interpolate(t, [0, 1], [30, 36], clamp);
  const sbMarginGone = interpolate(t, [0, 1], [12, 0], clamp);

  // Purple accent on first sidebar item when clean
  const sbAccent = interpolate(t, [0.7, 1], [0, 0.12], clamp);

  return (
    <AbsoluteFill style={{ background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', perspective: 1800, opacity: enter * exit }}>
      <div style={{
        transform: `rotateY(${camRotY}deg) rotateX(${camRotX}deg) scale(${camScale})`,
        transformStyle: 'preserve-3d',
        width: 1100, height: 640,
        borderRadius: 14,
        background: '#111113',
        border: `1px solid rgba(255,255,255,${borderOpacity})`,
        boxShadow: `0 80px 200px rgba(0,0,0,0.9), 0 0 ${interpolate(t, [0.5, 1], [0, 40], clamp)}px rgba(109,40,217,${accentOpacity})`,
        overflow: 'hidden',
        position: 'relative',
      }}>
        {/* Top bar */}
        <div style={{ height: 36, background: '#0c0c0e', display: 'flex', alignItems: 'center', padding: '0 14px', gap: 7, borderBottom: `1px solid rgba(255,255,255,${borderOpacity})` }}>
          <div style={{ width: 10, height: 10, borderRadius: 5, background: 'rgba(255,90,90,0.7)' }} />
          <div style={{ width: 10, height: 10, borderRadius: 5, background: 'rgba(255,190,50,0.6)' }} />
          <div style={{ width: 10, height: 10, borderRadius: 5, background: 'rgba(50,200,70,0.6)' }} />
        </div>

        {/* Content */}
        <div style={{ padding: 28, display: 'flex', gap: 20 }}>
          {/* Sidebar */}
          <div style={{ width: 170, display: 'flex', flexDirection: 'column', gap: sidebarGap }}>
            {[sb1, sb2, sb3, sb4, sb5].map((h, i) => (
              <div key={i} style={{
                height: h,
                borderRadius: interpolate(t, [0, 1], [4, 8], clamp),
                background: i === 0
                  ? `rgba(109,40,217,${sbAccent})`
                  : `rgba(255,255,255,${sidebarBg})`,
                border: i === 0 && sbAccent > 0.05
                  ? `1px solid rgba(109,40,217,${sbAccent * 1.5})`
                  : '1px solid transparent',
                marginTop: i === 3 ? sbMarginGone : 0,
                transition: 'none',
              }} />
            ))}
          </div>

          {/* Main content */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Header bar */}
            <div style={{
              height: 40,
              borderRadius: cardRadius,
              background: `rgba(255,255,255,${interpolate(t, [0, 1], [0.03, 0.04], clamp)})`,
              width: `${headerWidth}%`,
              border: `1px solid rgba(255,255,255,${borderOpacity})`,
            }} />

            {/* Three cards — morph from misaligned to equal grid */}
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              {[
                { w: card1Width, h: card1Height, mt: 0 },
                { w: card2Width, h: card2Height, mt: card2Offset },
                { w: card3Width, h: card3Height, mt: 0 },
              ].map((card, i) => (
                <div key={i} style={{
                  width: `${card.w}%`,
                  height: card.h,
                  borderRadius: cardRadius,
                  background: `rgba(255,255,255,${interpolate(t, [0, 1], [0.025, 0.035], clamp)})`,
                  border: `1px solid rgba(255,255,255,${borderOpacity})`,
                  marginTop: card.mt,
                  position: 'relative',
                  overflow: 'hidden',
                }}>
                  {/* Inner content lines */}
                  <div style={{
                    height: 6, width: '60%', borderRadius: 3, margin: '20px 18px 0',
                    background: `rgba(255,255,255,${interpolate(t, [0, 1], [0.05, 0.07], clamp)})`,
                  }} />
                  <div style={{
                    height: 4, width: '40%', borderRadius: 2, margin: '10px 18px 0',
                    background: `rgba(255,255,255,${interpolate(t, [0, 1], [0.03, 0.04], clamp)})`,
                  }} />
                  {/* Stat number that appears when clean */}
                  <div style={{
                    position: 'absolute', bottom: 18, left: 18,
                    fontSize: 26, fontWeight: 700, fontFamily: FONT, color: WHITE,
                    opacity: interpolate(t, [0.6, 0.9], [0, 1], clamp),
                  }}>
                    {['12.8k', '$48k', '1,024'][i]}
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom section */}
            <div style={{
              height: 120,
              borderRadius: cardRadius,
              background: `rgba(255,255,255,${interpolate(t, [0, 1], [0.02, 0.025], clamp)})`,
              border: `1px solid rgba(255,255,255,${borderOpacity})`,
              width: `${bottomWidth}%`,
              display: 'flex', alignItems: 'flex-end', padding: '0 20px 16px', gap: 8,
              overflow: 'hidden',
            }}>
              {/* Chart bars that appear during transformation */}
              {[35, 55, 40, 70, 50, 80, 60, 90, 45, 75, 65, 85].map((h, i) => (
                <div key={i} style={{
                  flex: 1,
                  height: `${interpolate(t, [0.3 + i * 0.03, 0.6 + i * 0.03], [0, h], clamp)}%`,
                  borderRadius: 3,
                  background: `rgba(109,40,217,${interpolate(t, [0.3, 0.8], [0, 0.5], clamp)})`,
                }} />
              ))}
            </div>
          </div>
        </div>

        {/* Subtle green checkmark — appears at end of transformation */}
        <div style={{
          position: 'absolute', top: 50, right: 24,
          width: 40, height: 40, borderRadius: 20,
          background: 'rgba(34,197,94,0.1)',
          border: '1px solid rgba(34,197,94,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: interpolate(t, [0.85, 1], [0, 1], clamp),
          transform: `scale(${interpolate(t, [0.85, 1], [0.7, 1], clamp)})`,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── SCENE 5: Clean Result — Hold (16–20s / 480–600) ────────────────────────
// The finished UI centered on screen with soft purple ambient depth.
const CleanResult: React.FC = () => {
  const frame = useCurrentFrame();

  const enter = ease(frame, 0, 25, 0, 1);
  const drift = ease(frame, 0, 120, 3, -3);
  const scale = ease(frame, 0, 120, 1.0, 1.03);
  const exit = ease(frame, 100, 120, 1, 0);
  const ambient = ease(frame, 10, 40, 0, 0.08);

  return (
    <AbsoluteFill style={{ background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', perspective: 2000, opacity: enter * exit }}>
      {/* Ambient light — behind, not on top */}
      <div style={{
        position: 'absolute',
        width: 800, height: 500, borderRadius: '50%',
        background: `radial-gradient(ellipse, rgba(109,40,217,${ambient}) 0%, transparent 70%)`,
        top: '55%', left: '50%', transform: 'translate(-50%, -50%)',
      }} />

      <div style={{
        transform: `translateY(${drift}px) scale(${scale}) rotateY(-0.5deg) rotateX(0.5deg)`,
        transformStyle: 'preserve-3d',
        width: 1100, height: 640,
        borderRadius: 14,
        background: '#111113',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 80px 200px rgba(0,0,0,0.9), 0 0 40px rgba(109,40,217,0.06)',
        overflow: 'hidden',
      }}>
        <div style={{ height: 36, background: '#0c0c0e', display: 'flex', alignItems: 'center', padding: '0 14px', gap: 7, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ width: 10, height: 10, borderRadius: 5, background: 'rgba(255,90,90,0.7)' }} />
          <div style={{ width: 10, height: 10, borderRadius: 5, background: 'rgba(255,190,50,0.6)' }} />
          <div style={{ width: 10, height: 10, borderRadius: 5, background: 'rgba(50,200,70,0.6)' }} />
          <div style={{ flex: 1, textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace' }}>myapp.vercel.app</div>
        </div>
        <div style={{ padding: 28, display: 'flex', gap: 20 }}>
          <div style={{ width: 170, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {['Dashboard', 'Analytics', 'Projects', 'Settings', 'Team'].map((label, i) => (
              <div key={i} style={{
                height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', paddingLeft: 14,
                background: i === 0 ? 'rgba(109,40,217,0.12)' : 'transparent',
                border: i === 0 ? '1px solid rgba(109,40,217,0.18)' : '1px solid transparent',
              }}>
                <span style={{ fontSize: 12, color: i === 0 ? PURPLE_MUTED : 'rgba(255,255,255,0.3)', fontFamily: FONT, fontWeight: i === 0 ? 600 : 400 }}>{label}</span>
              </div>
            ))}
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 20, fontWeight: 700, color: WHITE, fontFamily: FONT }}>Dashboard</span>
              <div style={{ height: 32, width: 110, borderRadius: 8, background: PURPLE, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: WHITE, fontFamily: FONT }}>New Project</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 14 }}>
              {[
                { label: 'Total Users', val: '12,847', chg: '+12%' },
                { label: 'Revenue', val: '$48.2k', chg: '+8%' },
                { label: 'Active Now', val: '1,024', chg: '' },
              ].map((s, i) => (
                <div key={i} style={{ flex: 1, padding: 18, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: FONT, margin: 0, textTransform: 'uppercase', letterSpacing: 1 }}>{s.label}</p>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
                    <span style={{ fontSize: 24, fontWeight: 700, color: WHITE, fontFamily: FONT }}>{s.val}</span>
                    {s.chg && <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 600 }}>{s.chg}</span>}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ height: 160, borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'flex-end', padding: '0 20px 14px', gap: 8 }}>
              {[35, 55, 40, 70, 50, 80, 60, 90, 45, 75, 65, 85].map((h, i) => (
                <div key={i} style={{ flex: 1, height: `${h}%`, borderRadius: 3, background: `rgba(109,40,217,0.45)` }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── SCENE 6: Closing (20–25s / 600–750) ────────────────────────────────────
const Closing: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoS = spring({ frame: Math.max(0, frame - 5), fps, config: { damping: 30, stiffness: 40, mass: 1.2 } });
  const tagS = ease(frame, 30, 50, 0, 1);
  const captionS = ease(frame, 55, 75, 0, 1);
  const ambient = ease(frame, 10, 60, 0, 0.06);
  const fadeOut = ease(frame, 135, 150, 1, 0);

  return (
    <AbsoluteFill style={{ background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', opacity: fadeOut }}>
      {/* Ambient */}
      <div style={{
        position: 'absolute', width: 700, height: 700, borderRadius: '50%',
        background: `radial-gradient(circle, rgba(109,40,217,${ambient}) 0%, transparent 50%)`,
      }} />

      <h1 style={{
        fontSize: 100, fontWeight: 700, fontFamily: FONT, margin: 0, letterSpacing: -3,
        color: WHITE, opacity: logoS,
        transform: `scale(${interpolate(logoS, [0, 1], [0.94, 1])})`,
      }}>
        Reform.
      </h1>

      <p style={{
        fontSize: 26, fontWeight: 400, fontFamily: FONT,
        color: DIM, margin: '20px 0 0', opacity: tagS,
        transform: `translateY(${interpolate(tagS, [0, 1], [8, 0])}px)`,
      }}>
        Fix your UI in minutes.
      </p>

      <p style={{
        fontSize: 15, fontWeight: 400, fontFamily: FONT,
        color: 'rgba(255,255,255,0.12)', margin: '16px 0 0', opacity: captionS,
        letterSpacing: 1,
      }}>
        No design. No code. Just better UI.
      </p>
    </AbsoluteFill>
  );
};

// ─── Composition ────────────────────────────────────────────────────────────
export const ReformAd: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: BG }}>
      <Sequence from={0} durationInFrames={90}>
        <OpeningText />
      </Sequence>
      <Sequence from={90} durationInFrames={120}>
        <MessyUI />
      </Sequence>
      <Sequence from={210} durationInFrames={90}>
        <PivotText />
      </Sequence>
      <Sequence from={300} durationInFrames={180}>
        <TransformScene />
      </Sequence>
      <Sequence from={480} durationInFrames={120}>
        <CleanResult />
      </Sequence>
      <Sequence from={600} durationInFrames={150}>
        <Closing />
      </Sequence>
    </AbsoluteFill>
  );
};
