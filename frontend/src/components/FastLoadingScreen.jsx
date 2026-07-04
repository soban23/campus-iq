function FastLoadingScreen() {
  return (
    <div className="crt-scanlines noise-bg crt-flicker relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0a0a0a]">
      {/* Vignette overlay */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.7) 100%)',
        }}
      />

      {/* Subtle grid pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />

      <div className="relative z-10 flex flex-col items-center gap-6 px-6 text-center">
        
        {/* Title */}
        <div>
          <h1 className="font-display text-2xl font-bold tracking-[0.15em] text-[#e8e8e8] retro-glow uppercase">
            CampusIQ
          </h1>
          <p className="font-mono-ui mt-2 text-[11px] tracking-[0.3em] text-[#555] uppercase">
            Knowledge Retrieval System
          </p>
        </div>

        {/* Boot sequence text */}
        <div className="font-mono-ui space-y-1 text-[11px] text-[#666]">
          <p style={{ animation: 'boot-text-appear 0.3s ease-out forwards', animationDelay: '0.2s', opacity: 0 }}>
            {'> '}Initializing system...
          </p>
          <p style={{ animation: 'boot-text-appear 0.3s ease-out forwards', animationDelay: '0.6s', opacity: 0 }}>
            {'> '}Loading knowledge base...
          </p>
          <p style={{ animation: 'boot-text-appear 0.3s ease-out forwards', animationDelay: '1.0s', opacity: 0 }}>
            {'> '}Connecting to RAG engine...
          </p>
          <p
            className="text-[#e8e8e8]"
            style={{ animation: 'boot-text-appear 0.3s ease-out forwards', animationDelay: '1.5s', opacity: 0 }}
          >
            {'> '}System ready.<span className="retro-cursor" />
          </p>
        </div>

        {/* Loading bar */}
        <div className="mt-2 w-48">
          <div className="h-[2px] w-full bg-[#222] overflow-hidden">
            <div
              className="h-full bg-[#e8e8e8]"
              style={{
                animation: 'boot-load-bar 2s ease-in-out forwards',
              }}
            />
          </div>
        </div>

        {/* Loading dots */}
        <div className="flex items-center gap-3 mt-1" aria-label="Loading indicator">
          <span className="retro-dot" />
          <span className="retro-dot" />
          <span className="retro-dot" />
        </div>
      </div>

      <style>{`
        @keyframes boot-load-bar {
          0% { width: 0%; }
          30% { width: 40%; }
          60% { width: 70%; }
          100% { width: 100%; }
        }
      `}</style>
    </div>
  )
}

export default FastLoadingScreen
