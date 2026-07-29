type BrandMarkProps = {
  size?: 'sm' | 'md' | 'lg';
  light?: boolean;
  className?: string;
};

const sizeMap = {
  sm: { mark: 'h-8 w-8', text: 'text-lg', tag: 'text-[10px]' },
  md: { mark: 'h-11 w-11', text: 'text-2xl', tag: 'text-xs' },
  lg: { mark: 'h-14 w-14', text: 'text-4xl md:text-5xl', tag: 'text-sm' },
};

export function BrandMark({ size = 'md', light = false, className = '' }: BrandMarkProps) {
  const s = sizeMap[size];
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div
        className={`${s.mark} relative rounded-2xl overflow-hidden shrink-0`}
        aria-hidden="true"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-400 via-brand to-teal-700" />
        <div className="absolute inset-[2px] rounded-[14px] bg-ink/90" />
        <svg
          viewBox="0 0 32 32"
          className="absolute inset-0 m-auto h-[58%] w-[58%] text-cyan-300"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 24h20" />
          <path d="M10 24V10h12" />
          <path d="M22 10v6" />
          <path d="M18 16h8" />
          <path d="M20 16v5M24 16v5" />
          <circle cx="16" cy="7" r="1.4" fill="currentColor" stroke="none" className="gh-pulse" />
        </svg>
      </div>
      <div className="min-w-0">
        <p
          className={`font-display font-bold tracking-tight leading-none ${s.text} ${
            light ? 'text-white' : 'text-ink dark:text-white'
          }`}
        >
          GruaHub
        </p>
        <p
          className={`mt-1 font-medium uppercase tracking-[0.18em] ${s.tag} ${
            light ? 'text-cyan-200/80' : 'text-[color:var(--text-soft)]'
          }`}
        >
          Fleet ops
        </p>
      </div>
    </div>
  );
}
