export function BrandMark({ compact = false, animated = false }) {
  return (
    <div className={`brand-mark ${compact ? 'brand-mark--compact' : ''} ${animated ? 'brand-mark--animated' : ''}`} aria-label="KL Chicken Wings">
      {animated ? (
        <>
          <img className="brand-mark__logo brand-mark__logo--base" src="/assets/kl-logo-base.png" alt="" />
          <img className="brand-mark__logo brand-mark__logo--kl" src="/assets/kl-monogram-layered.svg" alt="" />
          <img className="brand-mark__logo brand-mark__logo--wordmark" src="/assets/kl-logo-wordmark.png" alt="" />
        </>
      ) : (
        <img className="brand-mark__logo" src="/assets/kl-chicken-wings-logo.png" alt="KL Chicken Wings" />
      )}
    </div>
  )
}
