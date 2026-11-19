import React, { useState } from 'react';
import { Check, ClipboardPaste, Copy } from 'lucide-react';
import { copyTextToClipboard, readTextFromClipboard } from '../utils/clipboard';
import { soundEngine } from '../utils/soundEngine';

interface CopyButtonProps {
  text: string;
  ariaLabel?: string;
  label?: string;
  compact?: boolean;
  className?: string;
}

export const CopyButton: React.FC<CopyButtonProps> = ({
  text,
  ariaLabel = 'Copy text',
  label,
  compact = false,
  className = '',
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await copyTextToClipboard(text);
    if (ok) {
      soundEngine.playTick(920, 0.015);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }
  };

  return (
    <button
      type="button"
      onClick={(e) => void handleCopy(e)}
      aria-label={ariaLabel}
      title={copied ? 'Copied' : ariaLabel}
      className={`inline-flex items-center justify-center gap-1.5 rounded-full transition-colors cursor-pointer ${
        compact
          ? 'h-9 w-9 text-slate-400 dark:text-[#64748B] hover:bg-slate-100 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-[#F8FAFC]'
          : 'min-h-[30px] px-2.5 text-[11px] font-medium bg-slate-100 dark:bg-white/[0.05] text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F8FAFC] border border-slate-200 dark:border-white/[0.08]'
      } ${className}`}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-[#34D399]" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      {!compact && <span>{copied ? 'Copied' : (label ?? 'Copy')}</span>}
    </button>
  );
};

interface PasteButtonProps {
  onPasteText: (value: string) => void;
  targetInputId?: string;
  label?: string;
  className?: string;
}

export const PasteButton: React.FC<PasteButtonProps> = ({
  onPasteText,
  targetInputId,
  label = 'Paste',
  className = '',
}) => {
  const [status, setStatus] = useState<'idle' | 'pasted' | 'manual'>('idle');

  const handlePaste = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = await readTextFromClipboard();
    if (text !== null && text.length > 0) {
      soundEngine.playTick(880, 0.015);
      onPasteText(text);
      setStatus('pasted');
      window.setTimeout(() => setStatus('idle'), 1500);
      return;
    }

    if (targetInputId) {
      const el = document.getElementById(targetInputId) as
        | HTMLInputElement
        | HTMLTextAreaElement
        | null;
      el?.focus();
    }
    setStatus('manual');
    window.setTimeout(() => setStatus('idle'), 2000);
  };

  return (
    <button
      type="button"
      onClick={(e) => void handlePaste(e)}
      aria-label={label}
      className={`inline-flex min-h-[26px] items-center gap-1 rounded-full bg-slate-100 dark:bg-white/[0.05] px-2.5 text-[11px] font-medium text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F8FAFC] border border-slate-200 dark:border-white/[0.08] transition-colors cursor-pointer ${className}`}
    >
      {status === 'pasted' ? (
        <>
          <Check className="h-3 w-3 text-emerald-600 dark:text-[#34D399]" />
          <span className="text-emerald-600 dark:text-[#34D399]">Pasted</span>
        </>
      ) : status === 'manual' ? (
        <span>Long-press / Ctrl+V</span>
      ) : (
        <>
          <ClipboardPaste className="h-3 w-3" />
          <span>{label}</span>
        </>
      )}
    </button>
  );
};
