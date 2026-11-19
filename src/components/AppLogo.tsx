import React, { useId } from 'react';

interface AppLogoProps {
  className?: string;
}

export const AppLogo: React.FC<AppLogoProps> = ({ className = 'h-9 w-9' }) => {
  const uid = useId().replace(/:/g, '');
  const bgId = `kairo-bg-${uid}`;
  const arcId = `kairo-arc-${uid}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 96 96"
      fill="none"
      aria-hidden="true"
      className={`${className} shrink-0 drop-shadow-[0_6px_16px_rgba(99,102,241,0.38)]`}
    >
      <defs>
        <linearGradient
          id={bgId}
          x1="8"
          y1="6"
          x2="88"
          y2="90"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#1E1B4B" />
          <stop offset="52%" stopColor="#4F46E5" />
          <stop offset="100%" stopColor="#818CF8" />
        </linearGradient>
        <linearGradient
          id={arcId}
          x1="22"
          y1="24"
          x2="72"
          y2="74"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#E0E7FF" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="88" height="88" rx="24" fill={`url(#${bgId})`} />
      <rect
        x="5"
        y="5"
        width="86"
        height="86"
        rx="23"
        stroke="#FFFFFF"
        strokeOpacity="0.2"
        strokeWidth="2"
      />
      <path
        d="M66.5 31.2A24 24 0 1 0 72 48"
        stroke={`url(#${arcId})`}
        strokeWidth="6.5"
        strokeLinecap="round"
      />
      <path
        d="M45 33V49L56.5 56"
        stroke="#FFFFFF"
        strokeWidth="6.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="67.5" cy="29" r="6" fill="#F59E0B" />
    </svg>
  );
};
