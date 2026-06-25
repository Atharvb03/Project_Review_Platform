/**
 * Logo.jsx — PRP brand logo in 3 variations.
 *
 * Usage:
 *   <Logo variant="monogram" />           — Logo + PRP text
 *   <Logo variant="full" />               — Logo + PRP + "Project Review Platform"
 *   <Logo variant="icon" />               — Logo icon only
 *   <Logo variant="monogram" size={48} /> — custom size
 */

export default function Logo({ variant = 'full', size = 40, className = '' }) {
  if (variant === 'icon') {
    return (
      <img
        src="/logo.png"
        alt="PRP Logo"
        className={className}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          objectFit: 'contain',
          flexShrink: 0,
        }}
      />
    );
  }

  if (variant === 'monogram') {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        <img
          src="/logo.png"
          alt="PRP Logo"
          style={{
            width: `${size}px`,
            height: `${size}px`,
            objectFit: 'contain',
            flexShrink: 0,
          }}
        />
        <span
          className="font-extrabold gradient-text tracking-wider"
          style={{ fontSize: `${size * 0.7}px`, lineHeight: 1 }}
        >
          PRP
        </span>
      </div>
    );
  }

  // variant === 'full' — Logo + PRP + subtitle
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <img
        src="/logo.png"
        alt="PRP Logo"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          objectFit: 'contain',
          flexShrink: 0,
        }}
      />
      <div className="flex items-center gap-2">
        <span
          className="font-extrabold gradient-text tracking-wider"
          style={{ fontSize: `${size * 0.5}px`, lineHeight: 1 }}
        >
          PRP
        </span>
        <div
          style={{
            height: `${size * 0.6}px`,
            width: '1px',
            background: 'linear-gradient(to bottom, transparent, #c4b5fd, transparent)',
          }}
        />
        <span
          className="font-semibold"
          style={{ fontSize: `${size * 0.30}px`, lineHeight: 1, color: 'var(--text-secondary)' }}
        >
          Project Review Platform
        </span>
      </div>
    </div>
  );
}
