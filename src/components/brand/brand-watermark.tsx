/** Centered page watermark — always visible behind UI chrome, hidden when printing. */
export function BrandWatermark() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[30] flex items-center justify-center overflow-hidden print:hidden"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/logo.jpeg"
        alt=""
        className="h-auto w-[min(72vw,36rem)] max-w-none select-none object-contain opacity-[0.04]"
        draggable={false}
      />
    </div>
  );
}
