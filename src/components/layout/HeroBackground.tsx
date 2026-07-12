/** Full-bleed background used on the marketing/auth pages (home, login,
 * signup) — swaps between a tall portrait crop and a wide landscape crop
 * based on device orientation (not just viewport width, so a landscape
 * tablet gets the wide art too), with a dark scrim on top so page text
 * stays readable against the bright parts of the artwork. */
export function HeroBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div
        className="absolute inset-0 hidden bg-cover bg-center landscape:block"
        style={{ backgroundImage: "url('/images/hero-bg-landscape.jpg')" }}
      />
      <div
        className="absolute inset-0 block bg-cover bg-center landscape:hidden"
        style={{ backgroundImage: "url('/images/hero-bg-portrait.jpg')" }}
      />
      <div className="absolute inset-0 bg-ink/55" />
    </div>
  );
}
