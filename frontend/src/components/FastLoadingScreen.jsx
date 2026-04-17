function FastLoadingScreen() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F4F6F8] text-slate-900">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(135deg, rgba(0,93,170,0.18) 0%, rgba(244,246,248,0.9) 40%, rgba(247,194,0,0.22) 100%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.09]"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, #005DAA 1px, transparent 0)',
          backgroundSize: '26px 26px',
        }}
      />
      <div className="pointer-events-none absolute -left-16 top-6 h-80 w-80 rounded-full bg-[#005DAA]/20 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-0 h-80 w-80 rounded-full bg-[#F7C200]/22 blur-3xl" />
      <div className="pointer-events-none absolute bottom-8 right-12 h-56 w-56 rounded-full bg-[#2E8B3A]/18 blur-3xl" />

      <div className="relative z-10 flex flex-col items-center gap-5 px-6 text-center">
        <div className="relative">
          <div className="absolute inset-0 rounded-3xl bg-[#005DAA]/20 blur-xl animate-pulse" />
          <div className="relative grid h-24 w-24 place-items-center overflow-hidden rounded-3xl border border-[#005DAA]/25 bg-white shadow-lg">
            <img src="/download-removebg-preview.png" alt="FAST logo" className="h-20 w-20 object-contain" />
          </div>
        </div>

        <div>
          <p className="font-display text-lg font-semibold text-[#005DAA]">CampusIQ</p>
          {/* <p className="mt-1 text-xs text-slate-500">LOADING</p> */}
        </div>

        <div className="flex items-center gap-2" aria-label="Loading indicator">
          <span className="h-2.5 w-2.5 rounded-full bg-[#005DAA] animate-bounce" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#F7C200] animate-bounce" style={{ animationDelay: '0.12s' }} />
          <span className="h-2.5 w-2.5 rounded-full bg-[#2E8B3A] animate-bounce" style={{ animationDelay: '0.24s' }} />
        </div>
      </div>
    </div>
  )
}

export default FastLoadingScreen