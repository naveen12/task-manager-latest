import React from 'react';
import { Check } from 'lucide-react';
import { soundEngine } from '../utils/soundEngine';

interface TactileCheckboxProps {
  checked: boolean;
  onChange: () => void;
  ariaLabel: string;
}

export const TactileCheckbox: React.FC<TactileCheckboxProps> = ({
  checked,
  onChange,
  ariaLabel,
}) => {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    soundEngine.playTick(checked ? 520 : 1080, 0.03);
    onChange();
  };

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={handleClick}
      className="group relative flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10B981] cursor-pointer"
    >
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          checked
            ? 'scale-100 bg-[#10B981] text-white dark:text-[#090A0F] shadow-[0_0_12px_rgba(16,185,129,0.5)] ring-2 ring-[#10B981]/35'
            : 'scale-95 border-2 border-slate-300 dark:border-white/20 bg-transparent group-hover:border-[#10B981]/60'
        }`}
      >
        <Check
          className={`h-3.5 w-3.5 stroke-[3] transition-transform duration-150 ${
            checked ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
          }`}
        />
      </span>
    </button>
  );
};
