import React from 'react';
import { AlarmClock, Bell, BellRing, CheckSquare, Clock, Square } from 'lucide-react';
import type { ActiveAlert, AlertSourceType } from '../utils/notificationEngine';

interface AlarmRingOverlayProps {
  alert: ActiveAlert | null;
  queueCount?: number;
  onSnooze: () => void;
  onStop: () => void;
}

const TYPE_STYLE: Record<
  AlertSourceType,
  {
    label: string;
    accentText: string;
    iconWrap: string;
    border: string;
    glow: string;
    stopBtn: string;
    Icon: React.ComponentType<{ className?: string }>;
  }
> = {
  alarm: {
    label: 'Alarm',
    accentText: 'text-rose-500 dark:text-[#FB7185]',
    iconWrap:
      'bg-rose-500/10 dark:bg-[#F43F5E]/20 text-rose-500 dark:text-[#FB7185] border-rose-400/40 dark:border-[#F43F5E]/50',
    border: 'border-rose-500/40 dark:border-[#F43F5E]/40',
    glow: 'bg-[#F43F5E]/30',
    stopBtn:
      'bg-gradient-to-r from-rose-500 to-red-600 text-white shadow-[0_0_24px_rgba(244,63,94,0.45)] hover:from-rose-600 hover:to-red-700',
    Icon: AlarmClock,
  },
  reminder: {
    label: 'Reminder',
    accentText: 'text-emerald-500 dark:text-[#34D399]',
    iconWrap:
      'bg-emerald-500/10 dark:bg-[#10B981]/20 text-emerald-500 dark:text-[#34D399] border-emerald-400/40 dark:border-[#10B981]/50',
    border: 'border-emerald-500/40 dark:border-[#10B981]/40',
    glow: 'bg-[#10B981]/30',
    stopBtn:
      'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-[0_0_24px_rgba(16,185,129,0.45)] hover:from-emerald-600 hover:to-teal-700',
    Icon: Bell,
  },
  task: {
    label: 'Task',
    accentText: 'text-indigo-500 dark:text-[#818CF8]',
    iconWrap:
      'bg-indigo-500/10 dark:bg-[#6366F1]/20 text-indigo-500 dark:text-[#818CF8] border-indigo-400/40 dark:border-[#6366F1]/50',
    border: 'border-indigo-500/40 dark:border-[#6366F1]/40',
    glow: 'bg-[#6366F1]/30',
    stopBtn:
      'bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-[0_0_24px_rgba(99,102,241,0.45)] hover:from-indigo-600 hover:to-violet-700',
    Icon: CheckSquare,
  },
};

export const AlarmRingOverlay: React.FC<AlarmRingOverlayProps> = ({
  alert,
  queueCount = 1,
  onSnooze,
  onStop,
}) => {
  if (!alert) return null;

  const style = TYPE_STYLE[alert.type];
  const TypeIcon = style.Icon ?? BellRing;
  const snoozeMins = alert.snoozeMinutes && alert.snoozeMinutes > 0 ? alert.snoozeMinutes : 5;
  const modeLabel =
    alert.vibrationMode === 'vibrate_only'
      ? ' · Vibrate Only'
      : alert.vibrationMode === 'sound_only'
      ? ' · Sound Only'
      : '';

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="active-alert-name"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 dark:bg-[#07090E]/95 backdrop-blur-3xl p-4 sm:p-6"
    >
      <div
        className={`relative w-full max-w-sm overflow-hidden rounded-[32px] bg-slate-900/95 dark:bg-[#111625]/95 border ${style.border} p-6 sm:p-8 text-center shadow-[0_16px_48px_rgba(0,0,0,0.6)]`}
      >
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 h-48 w-48 rounded-full ${style.glow} blur-[64px]`}
        />

        {/* Type Icon & Badge */}
        <div
          className={`relative z-10 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border ${style.iconWrap} shadow-inner`}
        >
          <TypeIcon className="h-8 w-8" />
        </div>

        <p className={`relative z-10 text-xs font-bold tracking-widest uppercase tabular-nums ${style.accentText}`}>
          {style.label} · {alert.timeLabel}{modeLabel}
        </p>

        {/* Title Name */}
        <h2
          id="active-alert-name"
          className="relative z-10 mt-3 text-2xl font-extrabold tracking-tight text-white text-balance break-words"
        >
          {alert.name}
        </h2>

        {queueCount > 1 && (
          <p className="relative z-10 mt-2 text-xs font-medium text-slate-400 tabular-nums">
            1 of {queueCount} active alerts
          </p>
        )}

        {/* Action Buttons */}
        <div className="relative z-10 mt-8 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onSnooze}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white/10 dark:bg-white/[0.08] px-4 text-sm font-bold text-white border border-white/15 hover:bg-white/15 hover:border-white/25 active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap shadow-md"
          >
            <Clock className={`h-4 w-4 shrink-0 ${style.accentText}`} />
            <span>Snooze {snoozeMins}m</span>
          </button>

          <button
            type="button"
            onClick={onStop}
            className={`flex h-14 w-full items-center justify-center gap-2 rounded-2xl px-4 text-sm font-bold active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap ${style.stopBtn}`}
          >
            <Square className="h-3.5 w-3.5 fill-current shrink-0" />
            <span>Stop</span>
          </button>
        </div>
      </div>
    </div>
  );
};
