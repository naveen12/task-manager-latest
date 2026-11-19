import React from 'react';
import { soundEngine } from '../utils/soundEngine';

interface GlowingToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}

export const GlowingToggle: React.FC<GlowingToggleProps> = ({
  checked,
  onChange,
  ariaLabel,
}) => {
  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    soundEngine.playTick(checked ? 620 : 940, 0.025);
    onChange(!checked);
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={handleToggle}
      className="relative inline-flex min-h-[44px] min-w-[52px] items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6366F1] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#090A0F] rounded-full cursor-pointer"
    >
      <span
        className={`relative inline-flex h-8 w-[52px] shrink-0 items-center rounded-full border transition-all duration-200 ${
          checked
            ? 'border-white/20 bg-gradient-to-r from-[#6366F1] to-[#818CF8] shadow-[0_0_14px_rgba(99,102,241,0.45)]'
            : 'border-slate-300 dark:border-white/10 bg-slate-200 dark:bg-[#1A1D2D]'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-[26px] w-[26px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.3)] transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            checked ? 'translate-x-[22px]' : 'translate-x-[3px]'
          }`}
        />
      </span>
    </button>
  );
};
