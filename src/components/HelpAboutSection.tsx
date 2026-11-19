import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type {
  AppSettings,
  ChronoAlarm,
  NoteItem,
  ReminderItem,
  TaskItem,
} from '../types/chrono';
import {
  answerKairoHelpQuestion,
  HELP_QUICK_PROMPTS,
  HELP_TOPIC_GUIDES,
  KAIRO_ABOUT_INFO,
  type HelpAnswer,
} from '../utils/kairoHelpEngine';
import { soundEngine } from '../utils/soundEngine';
import { AppLogo } from './AppLogo';
import { CopyButton, PasteButton } from './ClipboardButtons';

interface HelpAboutSectionProps {
  tasks: TaskItem[];
  reminders: ReminderItem[];
  alarms: ChronoAlarm[];
  notes: NoteItem[];
  settings: AppSettings;
  helpOpen?: boolean;
  onToggleHelp?: () => void;
  aboutOpen?: boolean;
  onToggleAbout?: () => void;
}

function formatAnswerForCopy(ans: HelpAnswer): string {
  const lines = [
    `Q: ${ans.question}`,
    `${ans.title} [${ans.category}]`,
    ans.summary,
    ...ans.bullets.map((b) => `- ${b}`),
  ];
  return lines.join('\n');
}

export const HelpAboutSection: React.FC<HelpAboutSectionProps> = ({
  tasks,
  reminders,
  alarms,
  notes,
  settings,
  helpOpen,
  onToggleHelp,
  aboutOpen,
  onToggleAbout,
}) => {
  const [localHelpOpen, setLocalHelpOpen] = useState(false);
  const [localAboutOpen, setLocalAboutOpen] = useState(false);
  const [questionInput, setQuestionInput] = useState('');
  const [answers, setAnswers] = useState<HelpAnswer[]>([]);
  const [showAllGuides, setShowAllGuides] = useState(false);

  const isHelpOpen = helpOpen ?? localHelpOpen;
  const isAboutOpen = aboutOpen ?? localAboutOpen;

  const toggleHelp = () => {
    soundEngine.playTick(820, 0.015);
    if (onToggleHelp) {
      onToggleHelp();
    } else {
      setLocalHelpOpen((v) => !v);
    }
  };

  const toggleAbout = () => {
    soundEngine.playTick(820, 0.015);
    if (onToggleAbout) {
      onToggleAbout();
    } else {
      setLocalAboutOpen((v) => !v);
    }
  };

  const contextData = useMemo(
    () => ({ tasks, reminders, alarms, notes, settings }),
    [tasks, reminders, alarms, notes, settings]
  );

  const askQuestion = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    soundEngine.playTick(880, 0.02);
    const result = answerKairoHelpQuestion(trimmed, contextData);
    setAnswers((prev) => [result, ...prev]);
    setQuestionInput('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    askQuestion(questionInput);
  };

  const aboutInfoText = [
    `${KAIRO_ABOUT_INFO.appName} v${KAIRO_ABOUT_INFO.version} (${KAIRO_ABOUT_INFO.edition})`,
    KAIRO_ABOUT_INFO.tagline,
  ].join('\n');

  return (
    <div className="flex flex-col gap-4">
      {/* Help & Interactive Q&A Card */}
      <div
        id="settings-help-card"
        className="rounded-[28px] bg-white dark:bg-[#1A1D2D]/80 border border-slate-200 dark:border-white/[0.08] shadow-sm dark:shadow-none overflow-hidden"
      >
        <button
          type="button"
          onClick={toggleHelp}
          aria-expanded={isHelpOpen}
          aria-controls="settings-help-body"
          className="w-full flex items-center justify-between gap-3 p-5 sm:p-6 text-left hover:bg-slate-50/70 dark:hover:bg-white/[0.02] transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-[#6366F1]/15 text-indigo-600 dark:text-[#818CF8]">
              <HelpCircle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-slate-900 dark:text-[#F8FAFC]">
                Help &amp; Interactive Q&amp;A
              </h3>
              <p className="mt-0.5 text-xs text-slate-600 dark:text-[#94A3B8] truncate">
                Ask about Kairo features, processes, or your configured data
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden sm:inline-flex rounded-full bg-slate-100 dark:bg-[#12141F] border border-slate-200 dark:border-white/[0.06] px-2.5 py-0.5 text-[11px] font-medium text-slate-600 dark:text-[#94A3B8]">
              Offline Q&amp;A
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 dark:bg-white/[0.05] text-slate-600 dark:text-[#94A3B8]">
              {isHelpOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </span>
          </div>
        </button>

        {isHelpOpen && (
          <div
            id="settings-help-body"
            className="px-5 pb-5 sm:px-6 sm:pb-6 pt-4 border-t border-slate-200 dark:border-white/[0.06] flex flex-col gap-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-600 dark:text-[#94A3B8]">
                Ask questions about Kairo’s features, processes, or your configured tasks, alarms, reminders, and notes
              </p>
              <div className="flex items-center gap-2">
                {answers.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playTick(680, 0.015);
                      setAnswers([]);
                    }}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-slate-100 dark:bg-white/[0.05] px-3 text-xs font-medium text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F8FAFC] border border-slate-200 dark:border-white/[0.08] cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playTick(820, 0.015);
                    setShowAllGuides((v) => !v);
                  }}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-slate-100 dark:bg-white/[0.05] px-3.5 text-xs font-medium text-slate-700 dark:text-[#F8FAFC] border border-slate-200 dark:border-white/[0.08] hover:border-indigo-400 dark:hover:border-[#6366F1]/50 cursor-pointer"
                >
                  <BookOpen className="h-3.5 w-3.5 text-indigo-600 dark:text-[#818CF8]" />
                  <span>{showAllGuides ? 'Hide Guides' : 'Browse Guides'}</span>
                  {showAllGuides ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>

        {/* Question Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="kairo-help-question-input"
              className="text-xs font-medium text-slate-700 dark:text-[#cbd5e1]"
            >
              Ask a question (offline &amp; instant)
            </label>
            <PasteButton
              targetInputId="kairo-help-question-input"
              onPasteText={(val) =>
                setQuestionInput((prev) => (prev ? `${prev} ${val}` : val))
              }
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              id="kairo-help-question-input"
              type="text"
              value={questionInput}
              onChange={(e) => setQuestionInput(e.target.value)}
              placeholder='e.g. "What is on my schedule today?" or "How do Time Slots work?"'
              className="flex-1 min-h-[44px] rounded-2xl bg-slate-50 dark:bg-[#12141F] border border-slate-200 dark:border-white/10 px-4 text-sm text-slate-900 dark:text-[#F8FAFC] placeholder:text-slate-400 dark:placeholder:text-[#64748B] focus:outline-none focus:border-indigo-500 dark:focus:border-[#6366F1]"
            />
            <button
              type="submit"
              disabled={!questionInput.trim()}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#6366F1] to-[#818CF8] px-5 text-xs font-semibold text-white shadow-[0_0_16px_rgba(99,102,241,0.3)] disabled:opacity-45 cursor-pointer shrink-0"
            >
              <Send className="h-3.5 w-3.5" />
              Ask Help
            </button>
          </div>
        </form>

        {/* Quick Prompts */}
        <div className="flex flex-col gap-3">
          {(['Your Configured Data', 'Features & Processes'] as const).map((group) => (
            <div key={group} className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-[#64748B]">
                {group}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {HELP_QUICK_PROMPTS.filter((p) => p.group === group).map((prompt) => (
                  <button
                    key={prompt.question}
                    type="button"
                    onClick={() => askQuestion(prompt.question)}
                    className="min-h-[32px] rounded-full bg-slate-100 dark:bg-[#12141F] border border-slate-200 dark:border-white/[0.07] px-3 py-1 text-xs font-medium text-slate-700 dark:text-[#cbd5e1] hover:border-indigo-400 dark:hover:border-[#6366F1]/55 hover:text-indigo-700 dark:hover:text-[#F8FAFC] transition-colors cursor-pointer text-left"
                  >
                    {prompt.question}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Answers Feed */}
        {answers.length > 0 && (
          <div className="flex flex-col gap-3 pt-2 border-t border-slate-200 dark:border-white/[0.06]">
            {answers.map((ans) => (
              <article
                key={ans.id}
                className={`rounded-2xl border p-4 flex flex-col gap-2.5 ${
                  ans.inScope
                    ? 'bg-slate-50 dark:bg-[#12141F] border-slate-200 dark:border-white/[0.08]'
                    : 'bg-amber-50/70 dark:bg-[#F59E0B]/10 border-amber-200 dark:border-[#F59E0B]/30'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-500 dark:text-[#94A3B8]">
                      Asked: “{ans.question}”
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-[#F8FAFC]">
                        {ans.title}
                      </h4>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          ans.category === 'Your Data'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-[#34D399]/15 dark:text-[#34D399]'
                            : ans.category === 'Out of Scope'
                            ? 'bg-amber-100 text-amber-700 dark:bg-[#F59E0B]/20 dark:text-[#F59E0B]'
                            : 'bg-indigo-100 text-indigo-700 dark:bg-[#6366F1]/20 dark:text-[#818CF8]'
                        }`}
                      >
                        {ans.category}
                      </span>
                    </div>
                  </div>
                  <CopyButton
                    text={formatAnswerForCopy(ans)}
                    ariaLabel="Copy help answer"
                    label="Copy"
                  />
                </div>

                <p className="text-xs leading-relaxed text-slate-700 dark:text-[#cbd5e1]">
                  {ans.summary}
                </p>

                <ul className="flex flex-col gap-1.5 pl-4 list-disc text-xs leading-relaxed text-slate-700 dark:text-[#94A3B8]">
                  {ans.bullets.map((line, idx) => (
                    <li key={idx} className="select-text">
                      {line}
                    </li>
                  ))}
                </ul>

                {ans.followUps && ans.followUps.length > 0 && (
                  <div className="pt-1 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-medium text-slate-500 dark:text-[#64748B]">
                      Related:
                    </span>
                    {ans.followUps.map((fq) => (
                      <button
                        key={fq}
                        type="button"
                        onClick={() => askQuestion(fq)}
                        className="rounded-full bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 px-2.5 py-1 text-[11px] font-medium text-indigo-600 dark:text-[#818CF8] hover:border-indigo-400 cursor-pointer"
                      >
                        {fq}
                      </button>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}

        {/* Collapsible Reference Guides */}
        {showAllGuides && (
          <div className="pt-3 border-t border-slate-200 dark:border-white/[0.06] flex flex-col gap-3">
            <p className="text-xs font-semibold text-slate-800 dark:text-[#F8FAFC]">
              All Kairo Feature &amp; Process Guides
            </p>
            <div className="grid grid-cols-1 gap-3">
              {HELP_TOPIC_GUIDES.map((guide) => (
                <div
                  key={guide.id}
                  className="rounded-2xl bg-slate-50 dark:bg-[#12141F] border border-slate-200 dark:border-white/[0.06] p-4 flex flex-col gap-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-semibold text-slate-900 dark:text-[#F8FAFC]">
                        {guide.title}
                      </h4>
                      <span className="rounded-full bg-indigo-50 dark:bg-[#6366F1]/15 px-2 py-0.5 text-[10px] font-semibold text-indigo-600 dark:text-[#818CF8]">
                        {guide.category}
                      </span>
                    </div>
                    <CopyButton
                      text={`${guide.title}\n${guide.summary}\n${guide.bullets.map((b) => `- ${b}`).join('\n')}`}
                      ariaLabel={`Copy ${guide.title}`}
                    />
                  </div>
                  <p className="text-xs text-slate-600 dark:text-[#94A3B8]">
                    {guide.summary}
                  </p>
                  <ul className="flex flex-col gap-1 pl-4 list-disc text-xs text-slate-700 dark:text-[#cbd5e1]">
                    {guide.bullets.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
          </div>
        )}
      </div>

      {/* About Kairo Card */}
      <div
        id="settings-about-card"
        className="rounded-[28px] bg-white dark:bg-[#1A1D2D]/80 border border-slate-200 dark:border-white/[0.08] shadow-sm dark:shadow-none overflow-hidden"
      >
        <button
          type="button"
          onClick={toggleAbout}
          aria-expanded={isAboutOpen}
          aria-controls="settings-about-body"
          className="w-full flex items-center justify-between gap-3 p-5 sm:p-6 text-left hover:bg-slate-50/70 dark:hover:bg-white/[0.02] transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3 min-w-0">
            <AppLogo className="h-10 w-10 shrink-0" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-slate-900 dark:text-[#F8FAFC]">
                  About {KAIRO_ABOUT_INFO.appName}
                </h3>
                <span className="rounded-full bg-indigo-50 dark:bg-[#6366F1]/15 border border-indigo-200 dark:border-[#6366F1]/40 px-2 py-0.5 font-mono text-[11px] font-semibold text-indigo-700 dark:text-[#818CF8]">
                  v{KAIRO_ABOUT_INFO.version}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-600 dark:text-[#94A3B8] truncate">
                {KAIRO_ABOUT_INFO.edition}
              </p>
            </div>
          </div>

          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-white/[0.05] text-slate-600 dark:text-[#94A3B8]">
            {isAboutOpen ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </span>
        </button>

        {isAboutOpen && (
          <div
            id="settings-about-body"
            className="px-5 pb-5 sm:px-6 sm:pb-6 pt-4 border-t border-slate-200 dark:border-white/[0.06] flex flex-col gap-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <AppLogo className="h-12 w-12" />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-base font-semibold text-slate-900 dark:text-[#F8FAFC]">
                      {KAIRO_ABOUT_INFO.appName}
                    </h4>
                    <span className="rounded-full bg-indigo-50 dark:bg-[#6366F1]/15 border border-indigo-200 dark:border-[#6366F1]/40 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-indigo-700 dark:text-[#818CF8]">
                      v{KAIRO_ABOUT_INFO.version}
                    </span>
                    <span className="rounded-full bg-emerald-50 dark:bg-[#34D399]/15 border border-emerald-200 dark:border-[#34D399]/35 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-[#34D399]">
                      {KAIRO_ABOUT_INFO.edition}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-[#94A3B8]">
                    {KAIRO_ABOUT_INFO.tagline}
                  </p>
                </div>
              </div>

              <CopyButton
                text={aboutInfoText}
                ariaLabel="Copy About Kairo info"
                label="Copy Info"
              />
            </div>

            {/* Capabilities & Privacy Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-2xl bg-slate-50 dark:bg-[#12141F] border border-slate-200 dark:border-white/[0.06] p-4 flex items-start gap-3">
                <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-[#34D399] shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-[#F8FAFC]">
                    Free &amp; Private
                  </h4>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-[#94A3B8]">
                    100% free with no ads or subscriptions. Your schedule, alarms, ringtones, and notes stay on your device, with optional Google Drive or local backups.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl bg-slate-50 dark:bg-[#12141F] border border-slate-200 dark:border-white/[0.06] p-4 flex items-start gap-3">
                <Sparkles className="h-4 w-4 text-indigo-600 dark:text-[#818CF8] shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-[#F8FAFC]">
                    Core Modules
                  </h4>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-[#94A3B8]">
                    Daily Timeline &amp; Focus Timer · Time-Slotted Tasks · Recurring Reminders · Alarms with Crescendo · Formatted Voice Notes · Lock-Screen Alerts.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
