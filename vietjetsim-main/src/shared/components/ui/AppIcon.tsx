'use client';

import React from 'react';
import * as HeroIcons from '@heroicons/react/24/outline';
import * as HeroIconsSolid from '@heroicons/react/24/solid';
import { QuestionMarkCircleIcon } from '@heroicons/react/24/outline';

type IconVariant = 'outline' | 'solid';

export interface CustomIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

/** Icon máy bay thương mại chuẩn hàng không (thay thế PaperAirplaneIcon origami) */
export function AirplaneIcon({ size = 24, className = '', ...props }: CustomIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
    </svg>
  );
}

/** Icon máy bay cất cánh */
export function AirplaneTakeoffIcon({ size = 24, className = '', ...props }: CustomIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <path d="M2.5 19h19v2h-19v-2zm19.57-9.36c-.21-.8-1.04-1.28-1.84-1.06L14.92 10 8.46 3.98l-1.93.52 3.82 6.77-4.99 1.34-2.02-1.57-1.45.39 1.83 3.16c.36.63 1.03 1.02 1.76 1.02.16 0 .32-.02.48-.06l14.13-3.78c.8-.21 1.28-1.04 1.06-1.84z" />
    </svg>
  );
}

/** Icon máy bay hạ cánh */
export function AirplaneLandingIcon({ size = 24, className = '', ...props }: CustomIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <path d="M2.5 19h19v2h-19v-2zm16.84-8.81c.8-.21 1.28-1.04 1.06-1.84-.21-.8-1.04-1.28-1.84-1.06l-4.14 1.11-6.49-5.99-1.93.52 3.82 6.77-5 1.34-2.01-1.57-1.45.39 1.83 3.16c.36.63 1.03 1.02 1.76 1.02.16 0 .32-.02.48-.06l13.9-3.85z" />
    </svg>
  );
}

export const PlaneIcon = AirplaneIcon;
export const FlightIcon = AirplaneIcon;

const AVIATION_ICONS: Record<string, React.ComponentType<CustomIconProps>> = {
  AirplaneIcon,
  PlaneIcon,
  FlightIcon,
  AirplaneTakeoffIcon,
  PlaneTakeoffIcon: AirplaneTakeoffIcon,
  FlightTakeoffIcon: AirplaneTakeoffIcon,
  AirplaneLandingIcon,
  PlaneLandingIcon: AirplaneLandingIcon,
  FlightLandingIcon: AirplaneLandingIcon,
};

interface IconProps {
  name: string; // Changed to string to accept dynamic values
  variant?: IconVariant;
  size?: number;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  [key: string]: unknown;
}

function Icon({
  name,
  variant = 'outline',
  size = 24,
  className = '',
  onClick,
  disabled = false,
  ...props
}: IconProps) {
  // Ưu tiên các icon hàng không thương mại thật
  if (name in AVIATION_ICONS) {
    const AviationIcon = AVIATION_ICONS[name];
    return (
      <AviationIcon
        size={size}
        className={`${disabled ? 'opacity-50 cursor-not-allowed' : onClick ? 'cursor-pointer hover:opacity-80' : ''} ${className}`}
        onClick={disabled ? undefined : onClick}
        {...props}
      />
    );
  }

  const iconSet = variant === 'solid' ? HeroIconsSolid : HeroIcons;
  const IconComponent = iconSet[name as keyof typeof iconSet] as React.ComponentType<
    React.SVGProps<SVGSVGElement>
  >;

  if (!IconComponent) {
    return (
      <QuestionMarkCircleIcon
        width={size}
        height={size}
        className={`text-vj-muted ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
        onClick={disabled ? undefined : onClick}
        {...props}
      />
    );
  }

  return (
    <IconComponent
      width={size}
      height={size}
      className={`${disabled ? 'opacity-50 cursor-not-allowed' : onClick ? 'cursor-pointer hover:opacity-80' : ''} ${className}`}
      onClick={disabled ? undefined : onClick}
      {...props}
    />
  );
}

export default Icon;
