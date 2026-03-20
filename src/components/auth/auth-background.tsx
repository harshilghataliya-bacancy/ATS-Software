'use client'

/**
 * Ambient animated background for auth pages.
 * Floating gradient orbs + subtle mesh — no icons.
 */
export function AuthBackground() {
  return (
    <>
      <style jsx global>{`
        @keyframes orb-drift-1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(40px, -30px) scale(1.05); }
          66% { transform: translate(-20px, 20px) scale(0.95); }
        }
        @keyframes orb-drift-2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(-35px, 25px) scale(1.08); }
          66% { transform: translate(25px, -15px) scale(0.92); }
        }
        @keyframes orb-drift-3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(20px, 35px) scale(0.96); }
          66% { transform: translate(-30px, -20px) scale(1.04); }
        }
        @keyframes orb-breathe {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 0.55; }
        }
        @keyframes mesh-shift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
      `}</style>
      <div
        className="fixed inset-0 overflow-hidden pointer-events-none"
        style={{ zIndex: 0 }}
        aria-hidden="true"
      >
        {/* Slow-moving mesh gradient base */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(125deg, rgba(219,234,254,0.4) 0%, rgba(241,245,249,0.1) 25%, rgba(224,231,255,0.3) 50%, rgba(241,245,249,0.1) 75%, rgba(207,250,254,0.3) 100%)',
            backgroundSize: '200% 200%',
            animation: 'mesh-shift 20s ease-in-out infinite',
          }}
        />

        {/* Orb 1 — top left, blue */}
        <div
          className="absolute rounded-full blur-3xl"
          style={{
            width: 380, height: 380,
            top: '5%', left: '5%',
            background: 'radial-gradient(circle, rgba(59,130,246,0.18) 0%, rgba(59,130,246,0.04) 50%, transparent 70%)',
            animation: 'orb-drift-1 16s ease-in-out infinite, orb-breathe 8s ease-in-out infinite',
          }}
        />

        {/* Orb 2 — bottom right, indigo */}
        <div
          className="absolute rounded-full blur-3xl"
          style={{
            width: 340, height: 340,
            bottom: '8%', right: '5%',
            background: 'radial-gradient(circle, rgba(99,102,241,0.16) 0%, rgba(99,102,241,0.03) 50%, transparent 70%)',
            animation: 'orb-drift-2 20s ease-in-out infinite 2s, orb-breathe 10s ease-in-out infinite 3s',
          }}
        />

        {/* Orb 3 — center right, cyan */}
        <div
          className="absolute rounded-full blur-3xl"
          style={{
            width: 260, height: 260,
            top: '40%', right: '15%',
            background: 'radial-gradient(circle, rgba(14,165,233,0.12) 0%, rgba(14,165,233,0.02) 50%, transparent 70%)',
            animation: 'orb-drift-3 18s ease-in-out infinite 1s, orb-breathe 12s ease-in-out infinite 5s',
          }}
        />

        {/* Orb 4 — bottom left, sky */}
        <div
          className="absolute rounded-full blur-3xl"
          style={{
            width: 300, height: 300,
            bottom: '15%', left: '10%',
            background: 'radial-gradient(circle, rgba(56,189,248,0.1) 0%, rgba(56,189,248,0.02) 50%, transparent 70%)',
            animation: 'orb-drift-1 22s ease-in-out infinite 4s, orb-breathe 9s ease-in-out infinite 2s',
          }}
        />

        {/* Orb 5 — top right, violet hint */}
        <div
          className="absolute rounded-full blur-3xl"
          style={{
            width: 220, height: 220,
            top: '10%', right: '10%',
            background: 'radial-gradient(circle, rgba(139,92,246,0.1) 0%, rgba(139,92,246,0.02) 50%, transparent 70%)',
            animation: 'orb-drift-2 15s ease-in-out infinite 3s, orb-breathe 11s ease-in-out infinite 1s',
          }}
        />
      </div>
    </>
  )
}
