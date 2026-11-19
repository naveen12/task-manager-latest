import React, { useEffect, useRef } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { soundEngine } from '../utils/soundEngine';

interface WheelColumnProps {
  values: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  label: string;
}

const ITEM_HEIGHT = 48;

const WheelColumn: React.FC<WheelColumnProps> = ({
  values,
  selectedIndex,
  onSelect,
  label,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isProgrammatic = useRef(false);
  const debounceTimer = useRef<number | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    isProgrammatic.current = true;
    el.scrollTo({
      top: selectedIndex * ITEM_HEIGHT,
      behavior: 'smooth',
    });
    const t = window.setTimeout(() => {
      isProgrammatic.current = false;
    }, 220);
    return () => window.clearTimeout(t);
  }, [selectedIndex]);

  const handleScroll = () => {
    if (isProgrammatic.current) return;
    const el = scrollRef.current;
    if (!el) return;
    if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(() => {
      const idx = Math.round(el.scrollTop / ITEM_HEIGHT);
      const clamped = Math.max(0, Math.min(values.length - 1, idx));
      if (clamped !== selectedIndex) {
        soundEngine.playTick(760, 0.015);
        onSelect(clamped);
      }
      el.scrollTo({
        top: clamped * ITEM_HEIGHT,
        behavior: 'smooth',
      });
    }, 80);
  };

  const step = (delta: number) => {
    const next = (selectedIndex + delta + values.length) % values.length;
    soundEngine.playTick(820, 0.02);
    onSelect(next);
  };

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={() => step(-1)}
        aria-label={`Decrease ${label}`}
        className="flex h-9 w-16 items-center justify-center rounded-full text-slate-400 dark:text-[#64748B] hover:text-slate-900 dark:hover:text-[#F8FAFC] hover:bg-slate-200/60 dark:hover:bg-white/5 transition-colors cursor-pointer"
      >
        <ChevronUp className="h-4 w-4" />
      </button>

      <div className="relative h-[144px] w-20 sm:w-24 overflow-hidden">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          aria-label={label}
          className="no-scrollbar h-full overflow-y-auto snap-y snap-mandatory"
        >
          <div style={{ height: ITEM_HEIGHT }} />
          {values.map((val, idx) => {
            const isActive = idx === selectedIndex;
            return (
              <button
                key={`${label}-${val}`}
                type="button"
                onClick={() => {
                  soundEngine.playTick(820, 0.02);
                  onSelect(idx);
                }}
                style={{ height: ITEM_HEIGHT }}
                className={`flex w-full snap-center items-center justify-center font-mono tabular-nums transition-all duration-150 cursor-pointer ${
                  isActive
                    ? 'text-[34px] font-semibold text-slate-900 dark:text-[#F8FAFC] scale-105'
                    : 'text-xl font-medium text-slate-400 dark:text-[#64748B]/70 hover:text-slate-700 dark:hover:text-[#94A3B8]'
                }`}
              >
                {val}
              </button>
            );
          })}
          <div style={{ height: ITEM_HEIGHT }} />
        </div>
      </div>

      <button
        type="button"
        onClick={() => step(1)}
        aria-label={`Increase ${label}`}
        className="flex h-9 w-16 items-center justify-center rounded-full text-slate-400 dark:text-[#64748B] hover:text-slate-900 dark:hover:text-[#F8FAFC] hover:bg-slate-200/60 dark:hover:bg-white/5 transition-colors cursor-pointer"
      >
        <ChevronDown className="h-4 w-4" />
      </button>
    </div>
  );
};

interface TemporalWheelProps {
  hour24: number;
  minute: number;
  onChange: (hour24: number, minute: number) => void;
}

const HOURS_12 = Array.from({ length: 12 }, (_, i) =>
  String(i === 0 ? 12 : i).padStart(2, '0')
);
const MINUTES_60 = Array.from({ length: 60 }, (_, i) =>
  String(i).padStart(2, '0')
);

export const TemporalWheel: React.FC<TemporalWheelProps> = ({
  hour24,
  minute,
  onChange,
}) => {
  const isPM = hour24 >= 12;
  const hour12Idx = hour24 % 12;

  const handleHourSelect = (idx: number) => {
    const newHour24 = isPM ? (idx === 0 ? 12 : idx + 12) : idx === 0 ? 0 : idx;
    onChange(newHour24, minute);
  };

  const handleMinuteSelect = (idx: number) => {
    onChange(hour24, idx);
  };

  const handlePeriodToggle = (pm: boolean) => {
    if (pm === isPM) return;
    soundEngine.playTick(900, 0.02);
    const nextHour = pm ? (hour24 % 12) + 12 : hour24 % 12;
    onChange(nextHour, minute);
  };

  return (
    <div className="relative flex items-center justify-center gap-2 sm:gap-4 rounded-[28px] bg-slate-100 dark:bg-[#12141F] px-4 py-4 border border-slate-200 dark:border-white/[0.08]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-5 right-5 top-1/2 -translate-y-1/2 h-[50px] rounded-2xl border-y border-[#6366F1]/45 bg-[#6366F1]/[0.08]"
      />

      <WheelColumn
        values={HOURS_12}
        selectedIndex={hour12Idx}
        onSelect={handleHourSelect}
        label="Hour"
      />

      <span className="font-mono text-3xl font-semibold text-[#6366F1] dark:text-[#818CF8] pb-1 select-none">
        :
      </span>

      <WheelColumn
        values={MINUTES_60}
        selectedIndex={minute}
        onSelect={handleMinuteSelect}
        label="Minute"
      />

      <div className="relative z-10 ml-2 flex flex-col gap-1.5 rounded-2xl bg-white dark:bg-[#1A1D2D] p-1.5 border border-slate-200 dark:border-white/[0.08]">
        <button
          type="button"
          onClick={() => handlePeriodToggle(false)}
          className={`min-h-[40px] px-3.5 rounded-xl text-xs font-semibold tracking-wider transition-all cursor-pointer ${
            !isPM
              ? 'bg-gradient-to-r from-[#6366F1] to-[#818CF8] text-white shadow-[0_0_12px_rgba(99,102,241,0.4)]'
              : 'text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F8FAFC]'
          }`}
        >
          AM
        </button>
        <button
          type="button"
          onClick={() => handlePeriodToggle(true)}
          className={`min-h-[40px] px-3.5 rounded-xl text-xs font-semibold tracking-wider transition-all cursor-pointer ${
            isPM
              ? 'bg-gradient-to-r from-[#6366F1] to-[#818CF8] text-white shadow-[0_0_12px_rgba(99,102,241,0.4)]'
              : 'text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F8FAFC]'
          }`}
        >
          PM
        </button>
      </div>
    </div>
  );
};
