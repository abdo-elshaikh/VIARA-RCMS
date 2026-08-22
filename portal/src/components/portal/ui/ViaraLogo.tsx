import React from 'react';

interface ViaraLogoProps {
  className?: string;
  variant?: 'light' | 'dark' | 'auto';
  showText?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const ViaraRibbonIcon: React.FC<{ className?: string; size?: number }> = ({ className = '', size = 38 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`shrink-0 ${className}`}
    aria-hidden="true"
  >
    <defs>
      {/* Cyan/Teal Gradient */}
      <linearGradient id="viara-cyan-grad" x1="6" y1="40" x2="22" y2="8" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#00B4D8" />
        <stop offset="60%" stopColor="#009688" />
        <stop offset="100%" stopColor="#087F5B" />
      </linearGradient>
      {/* Emerald/Green Gradient */}
      <linearGradient id="viara-green-grad" x1="18" y1="36" x2="32" y2="6" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#05563F" />
        <stop offset="50%" stopColor="#087F5B" />
        <stop offset="100%" stopColor="#10B981" />
      </linearGradient>
      {/* Orange/Amber Gradient */}
      <linearGradient id="viara-orange-grad" x1="28" y1="36" x2="42" y2="8" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#F59E0B" />
        <stop offset="70%" stopColor="#EA580C" />
        <stop offset="100%" stopColor="#EF4444" />
      </linearGradient>
      {/* Soft Drop Shadow */}
      <filter id="viara-glow" x="-10%" y="-10%" width="120%" height="120%" filterUnits="userSpaceOnUse">
        <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.15" />
      </filter>
    </defs>

    {/* Left Cyan Ribbon Arm */}
    <path
      d="M12 40C9 36 7 28 11 18C13.5 11.5 18 8 23 8C20 12 17.5 18 16.5 24C15.5 30 14 36 12 40Z"
      fill="url(#viara-cyan-grad)"
      filter="url(#viara-glow)"
    />

    {/* Center Teal/Emerald Loop */}
    <path
      d="M14 38C19 28 25 18 29 10C31 6 34 5 36 8C33 14 26 26 21 37C18.5 41.5 15.5 41 14 38Z"
      fill="url(#viara-green-grad)"
      filter="url(#viara-glow)"
    />

    {/* Right Orange Flare Arm */}
    <path
      d="M24 35C29 27 35 17 40 10C42 7 44 8 43 11C39 19 32 30 27 38C25.5 40 24 38 24 35Z"
      fill="url(#viara-orange-grad)"
      filter="url(#viara-glow)"
    />
  </svg>
);

export const ViaraLogo: React.FC<ViaraLogoProps> = ({
  className = '',
  variant = 'auto',
  showText = true,
  size = 'md',
}) => {
  const iconSizes = {
    sm: 28,
    md: 36,
    lg: 44,
    xl: 52,
  };

  const textStyles = {
    sm: { title: 'text-base tracking-tight', sub: 'text-[7px]' },
    md: { title: 'text-xl tracking-tight', sub: 'text-[8.5px]' },
    lg: { title: 'text-2xl tracking-tight', sub: 'text-[9.5px]' },
    xl: { title: 'text-3xl tracking-tight', sub: 'text-[11px]' },
  };

  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      {showText ? (
        <>
          <div className="flex flex-col leading-none">
            <div className="flex items-center gap-1">
              <span
                className={`font-black font-sans tracking-wide uppercase ${
                  variant === 'dark'
                    ? 'text-white'
                    : variant === 'light'
                    ? 'text-[#071d43]'
                    : 'text-[#071d43] dark:text-white'
                } ${textStyles[size].title}`}
              >
                VIARA
              </span>
            </div>
            <span
              className={`font-extrabold uppercase tracking-[0.2em] mt-0.5 ${
                variant === 'dark'
                  ? 'text-emerald-300/90'
                  : variant === 'light'
                  ? 'text-[#087F5B]'
                  : 'text-[#087F5B] dark:text-emerald-400'
              } ${textStyles[size].sub}`}
            >
              RADIOLOGY CENTER
            </span>
          </div>
          <ViaraRibbonIcon size={iconSizes[size]} />
        </>
      ) : (
        <ViaraRibbonIcon size={iconSizes[size]} />
      )}
    </div>
  );
};

export default ViaraLogo;
