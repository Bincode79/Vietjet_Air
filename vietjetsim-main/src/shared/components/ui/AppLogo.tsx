'use client';

import React, { memo, useMemo } from 'react';
import AppIcon from './AppIcon';

export type AppLogoVariant = 'default' | 'circle' | 'white' | 'red';

interface AppLogoProps {
  src?: string; // Image source (optional)
  variant?: AppLogoVariant; // Official Vietjet brand variants
  iconName?: string; // Icon name when no image
  size?: number; // Size for icon/image (or height if rectangular)
  width?: number;
  height?: number;
  className?: string; // Additional classes
  onClick?: () => void; // Click handler
}

const LOGO_VARIANT_PATHS: Record<AppLogoVariant, string> = {
  default: '/images/vj-logo.svg',
  circle: '/images/brand/vietjet-air-circle.jpg',
  white: '/images/brand/vietjet-logo-white.png',
  red: '/images/brand/vietjet-logo-red.png',
};

const AppLogo = memo(function AppLogo({
  src,
  variant = 'default',
  iconName = 'SparklesIcon',
  size = 38,
  width,
  height,
  className = '',
  onClick,
}: AppLogoProps) {
  const finalSrc = src || LOGO_VARIANT_PATHS[variant] || LOGO_VARIANT_PATHS.default;

  // Memoize className calculation
  const containerClassName = useMemo(() => {
    const classes = ['flex items-center'];
    if (onClick) classes.push('cursor-pointer hover:opacity-80 transition-opacity');
    if (className) classes.push(className);
    return classes.join(' ');
  }, [onClick, className]);

  return (
    <div className={containerClassName} onClick={onClick}>
      {/* Show image if finalSrc provided, otherwise show icon */}
      {finalSrc ? (
        <img
          src={finalSrc}
          alt="Vietjet Air"
          width={width ?? (variant === 'circle' ? size : undefined)}
          height={height ?? size}
          className={`object-contain ${variant === 'circle' ? 'rounded-full' : ''} ${className}`}
          loading="eager"
        />
      ) : (
        <AppIcon name={iconName} size={size} className="flex-shrink-0" />
      )}
    </div>
  );
});

export default AppLogo;
