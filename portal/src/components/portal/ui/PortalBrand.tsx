import { useEffect, useState } from 'react';
import { usePortalIdentity } from '../../../lib/portal-identity';

interface PortalBrandProps {
  className?: string;
  logoClassName?: string;
  textClassName?: string;
  nameClassName?: string;
  subtitleClassName?: string;
  layout?: 'inline' | 'stacked';
  showSubtitle?: boolean;
  isRtl?: boolean;
  variant?: 'light' | 'dark' | 'auto';
}

export const PortalBrand = ({
  className = '',
  logoClassName = '',
  textClassName = '',
  nameClassName = '',
  subtitleClassName = '',
  layout = 'inline',
  showSubtitle = true,
  isRtl = false,
  variant = 'auto',
}: PortalBrandProps) => {
  const identity = usePortalIdentity();
  const [logoFailed, setLogoFailed] = useState(false);
  const centerName = identity.center.name || (isRtl ? 'مركز الأشعة' : 'Radiology Center');
  const subtitle = identity.branch.name || (isRtl ? 'مركز الأشعة والتشخيص' : 'Diagnostic Radiology Center');

  useEffect(() => {
    setLogoFailed(false);
  }, [identity.center.logoUrl]);

  return (
    <span
      className={`inline-flex min-w-0 items-center ${layout === 'stacked' ? 'flex-col gap-3 text-center' : 'gap-2.5'} ${className}`}
      aria-label={centerName}
    >
      <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-primary/15 bg-white shadow-sm ${logoClassName}`}>
        {identity.center.logoUrl && !logoFailed ? (
          <img
            src={identity.center.logoUrl}
            alt={`${centerName} logo`}
            className="h-full w-full object-contain p-1"
            decoding="async"
            onError={() => setLogoFailed(true)}
          />
        ) : (
          <span className="text-[0.65em] font-black text-primary">{identity.center.initials}</span>
        )}
      </span>

      <span className={`min-w-0 ${textClassName}`}>
        <span
          className={`block truncate font-extrabold leading-tight ${variant === 'dark' ? 'text-white' : variant === 'light' ? 'text-[#0B2348]' : 'text-foreground'} ${nameClassName}`}
          title={centerName}
        >
          {centerName}
        </span>
        {showSubtitle && (
          <span
            className={`mt-1 block truncate font-bold leading-tight ${variant === 'dark' ? 'text-emerald-100/75' : 'text-primary'} ${subtitleClassName}`}
            title={subtitle}
          >
            {subtitle}
          </span>
        )}
      </span>
    </span>
  );
};

export default PortalBrand;
