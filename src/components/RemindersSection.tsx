import React, { useEffect, useMemo, useState } from 'react';
import { Bell, Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  getTodayDateString,
  PRIORITY_META,
  type PriorityLevel,
  type ReminderItem,
  type ReminderRepeat,
} from '../types/chrono';
import { GlowingToggle } from './GlowingToggle';
import { TactileCheckbox } from './TactileCheckbox';
import { soundEngine } from '../utils/soundEngine';
import { CopyButton, PasteButton } from './ClipboardButtons';

interface RemindersSectionProps {
  reminders: ReminderItem[];
  autoOpenCreateKey?: number;
  defaultCreateDate?: string;
  onCreateReminder: (item: Omit<ReminderItem, 'id' | 'completed'>) => void;
  onUpdateReminder: (id: string, updates: Omit<ReminderItem, 'id'>) => void;
  onDeleteReminder: (id: string) => void;
  onToggleActive: (id: string, active: boolean) => void;
  onToggleCompleted: (id: string) => void;
}

type ReminderFilter = 'all' | 'active' | 'completed';

export const RemindersSection: React.FC<RemindersSectionProps> = ({
  reminders,
  autoOpenCreateKey,
  defaultCreateDate,
  onCreateReminder,
  onUpdateReminder,
  onDeleteReminder,
  onToggleActive,
  onToggleCompleted,
}) => {
  const today = getTodayDateString();
  const [filter, setFilter] = useState<ReminderFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | PriorityLevel>('all');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<ReminderItem | null>(
    null
  );

  // Form state
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(today);
  const [time, setTime] = useState('17:00');
  const [repeat, setRepeat] = useState<ReminderRepeat>('once');
  const [priority, setPriority] = useState<PriorityLevel>('medium');
  const [note, setNote] = useState('');

  const openCreate = (dateOverride?: string) => {
    soundEngine.playTick(840, 0.02);
    setEditingReminder(null);
    setTitle('');
    setDate(dateOverride || today);
    setTime('17:00');
    setRepeat('once');
    setPriority('medium');
    setNote('');
    setEditorOpen(true);
  };

  useEffect(() => {
    if (autoOpenCreateKey && autoOpenCreateKey > 0) {
      openCreate(defaultCreateDate);
    }
  }, [autoOpenCreateKey, defaultCreateDate]);

  const openEdit = (item: ReminderItem) => {
    soundEngine.playTick(800, 0.02);
    setEditingReminder(item);
    setTitle(item.title);
    setDate(item.date);
    setTime(item.time);
    setRepeat(item.repeat);
    setPriority(item.priority ?? 'medium');
    setNote(item.note ?? '');
    setEditorOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    soundEngine.playTick(980, 0.03);

    if (editingReminder) {
      onUpdateReminder(editingReminder.id, {
        title: title.trim(),
        date,
        time,
        repeat,
        priority,
        active: editingReminder.active,
        completed: editingReminder.completed,
        note: note.trim() || undefined,
      });
    } else {
      onCreateReminder({
        title: title.trim(),
        date,
        time,
        repeat,
        priority,
        active: true,
        note: note.trim() || undefined,
      });
    }
    setEditorOpen(false);
    setEditingReminder(null);
  };

  const filtered = useMemo(() => {
    const weight: Record<PriorityLevel, number> = { high: 0, medium: 1, low: 2 };
    return reminders
      .filter((r) => {
        if (filter === 'active') return r.active && !r.completed;
        if (filter === 'completed') return r.completed;
        return true;
      })
      .filter((r) =>
        priorityFilter === 'all' ? true : (r.priority ?? 'medium') === priorityFilter
      )
      .sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        const pDiff =
          weight[a.priority ?? 'medium'] - weight[b.priority ?? 'medium'];
        if (pDiff !== 0) return pDiff;
        return `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`);
      });
  }, [reminders, filter, priorityFilter]);

  const activeCount = reminders.filter((r) => r.active && !r.completed).length;

  return (
    <section className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-[#F8FAFC] tracking-tight">
            Reminders
          </h2>
          <p className="text-xs text-slate-600 dark:text-[#94A3B8] tabular-nums mt-0.5">
            {activeCount} scheduled · {reminders.length} total
          </p>
        </div>

        <button
          type="button"
          onClick={() => openCreate()}
          className="flex min-h-[44px] items-center gap-2 rounded-full bg-gradient-to-r from-[#6366F1] to-[#818CF8] px-5 py-2 text-xs font-semibold text-white shadow-[0_0_16px_rgba(99,102,241,0.35),inset_0_1px_0_rgba(255,255,255,0.3)] active:scale-[0.98] transition-all whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          New Reminder
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="tablist"
          aria-label="Filter reminders"
          className="inline-flex rounded-full bg-slate-100 dark:bg-[#12141F] p-1 border border-slate-200 dark:border-white/[0.06]"
        >
          {(['all', 'active', 'completed'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={filter === tab}
              onClick={() => {
                soundEngine.playTick(780, 0.02);
                setFilter(tab);
              }}
              className={`min-h-[36px] rounded-full px-4 text-xs font-medium capitalize transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                filter === tab
                  ? 'bg-white dark:bg-[#1A1D2D] text-slate-900 dark:text-[#F8FAFC] border border-slate-200 dark:border-white/15 shadow-xs'
                  : 'text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F8FAFC] border border-transparent'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <select
          aria-label="Filter reminders by priority"
          value={priorityFilter}
          onChange={(e) =>
            setPriorityFilter(e.target.value as 'all' | PriorityLevel)
          }
          className="min-h-[40px] rounded-full bg-white dark:bg-[#12141F] px-3.5 text-xs font-medium text-slate-700 dark:text-[#F8FAFC] border border-slate-200 dark:border-white/[0.08] focus:border-[#6366F1] focus:outline-none cursor-pointer"
        >
          <option value="all">All priorities</option>
          <option value="high">P1 Critical</option>
          <option value="medium">P2 Medium</option>
          <option value="low">P3 Low</option>
        </select>
      </div>

      {/* Create / Edit Form */}
      {editorOpen && (
        <form
          onSubmit={handleSubmit}
          className="rounded-[28px] bg-white dark:bg-[#1A1D2D] border border-indigo-300 dark:border-[#6366F1]/40 p-5 flex flex-col gap-4 shadow-lg dark:shadow-[0_16px_48px_rgba(0,0,0,0.5)]"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-[#F8FAFC]">
              {editingReminder ? 'Edit Reminder' : 'Create Reminder'}
            </h3>
            <button
              type="button"
              onClick={() => setEditorOpen(false)}
              aria-label="Close reminder form"
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 dark:text-[#94A3B8] hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-[#F8FAFC] cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label
                htmlFor="rem-title-input"
                className="block text-xs font-medium text-slate-600 dark:text-[#94A3B8]"
              >
                Reminder Title
              </label>
              <div className="flex items-center gap-1.5">
                {title && <CopyButton text={title} ariaLabel="Copy reminder title" />}
                <PasteButton
                  targetInputId="rem-title-input"
                  onPasteText={(val) => setTitle((prev) => (prev ? `${prev} ${val}` : val))}
                />
              </div>
            </div>
            <input
              id="rem-title-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Call supplier before 4 PM"
              required
              className="min-h-[48px] w-full rounded-2xl bg-slate-50 dark:bg-[#161926] px-4 text-sm text-slate-900 dark:text-[#F8FAFC] placeholder:text-slate-400 dark:placeholder:text-[#64748B] border border-slate-200 dark:border-white/[0.08] focus:border-[#6366F1] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label
                htmlFor="rem-date-input"
                className="block text-xs font-medium text-slate-600 dark:text-[#94A3B8] mb-1.5"
              >
                Date
              </label>
              <input
                id="rem-date-input"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="min-h-[48px] w-full rounded-2xl bg-slate-50 dark:bg-[#161926] px-3.5 font-mono text-xs text-slate-900 dark:text-[#F8FAFC] border border-slate-200 dark:border-white/[0.08] focus:border-[#6366F1] focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="rem-time-input"
                className="block text-xs font-medium text-slate-600 dark:text-[#94A3B8] mb-1.5"
              >
                Time
              </label>
              <input
                id="rem-time-input"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="min-h-[48px] w-full rounded-2xl bg-slate-50 dark:bg-[#161926] px-3.5 font-mono text-xs text-slate-900 dark:text-[#F8FAFC] border border-slate-200 dark:border-white/[0.08] focus:border-[#6366F1] focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="rem-repeat-select"
                className="block text-xs font-medium text-slate-600 dark:text-[#94A3B8] mb-1.5"
              >
                Repeat
              </label>
              <select
                id="rem-repeat-select"
                value={repeat}
                onChange={(e) => setRepeat(e.target.value as ReminderRepeat)}
                className="min-h-[48px] w-full rounded-2xl bg-slate-50 dark:bg-[#161926] px-3.5 text-sm text-slate-900 dark:text-[#F8FAFC] border border-slate-200 dark:border-white/[0.08] focus:border-[#6366F1] focus:outline-none cursor-pointer"
              >
                <option value="once">Once</option>
                <option value="daily">Daily</option>
                <option value="weekdays">Weekdays</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>

            <div>
              <span className="block text-xs font-medium text-slate-600 dark:text-[#94A3B8] mb-1.5">
                Priority
              </span>
              <div className="grid grid-cols-3 gap-1 rounded-2xl bg-slate-100 dark:bg-[#12141F] p-1 border border-slate-200 dark:border-white/[0.06] min-h-[48px]">
                {(['high', 'medium', 'low'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`rounded-xl px-1.5 text-[11px] font-semibold transition-all cursor-pointer ${
                      priority === p
                        ? `${PRIORITY_META[p].bgClass} ${PRIORITY_META[p].textClass} border ${PRIORITY_META[p].borderClass}`
                        : 'text-slate-500 dark:text-[#94A3B8]'
                    }`}
                  >
                    {PRIORITY_META[p].shortLabel}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label
                htmlFor="rem-note-input"
                className="block text-xs font-medium text-slate-600 dark:text-[#94A3B8]"
              >
                Note (optional)
              </label>
              <div className="flex items-center gap-1.5">
                {note && <CopyButton text={note} ariaLabel="Copy reminder note" />}
                <PasteButton
                  targetInputId="rem-note-input"
                  onPasteText={(val) => setNote((prev) => (prev ? `${prev} ${val}` : val))}
                />
              </div>
            </div>
            <input
              id="rem-note-input"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Extra context for this alert..."
              className="min-h-[48px] w-full rounded-2xl bg-slate-50 dark:bg-[#161926] px-4 text-sm text-slate-900 dark:text-[#F8FAFC] placeholder:text-slate-400 dark:placeholder:text-[#64748B] border border-slate-200 dark:border-white/[0.08] focus:border-[#6366F1] focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setEditorOpen(false)}
              className="min-h-[44px] rounded-full px-5 text-xs font-medium text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F8FAFC] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="min-h-[44px] rounded-full bg-gradient-to-r from-[#6366F1] to-[#818CF8] px-6 text-xs font-semibold text-white shadow-[0_0_16px_rgba(99,102,241,0.4)] cursor-pointer"
            >
              {editingReminder ? 'Save Changes' : 'Create Reminder'}
            </button>
          </div>
        </form>
      )}

      {/* Reminders List */}
      {filtered.length === 0 ? (
        <div className="rounded-[28px] bg-white/70 dark:bg-[#1A1D2D]/50 border border-slate-200 dark:border-white/[0.06] p-8 text-center">
          <Bell className="mx-auto h-6 w-6 text-slate-400 dark:text-[#64748B] mb-2" />
          <p className="text-sm font-medium text-slate-900 dark:text-[#F8FAFC]">
            No reminders here
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-[#64748B]">
            Create a reminder so you never miss a time-sensitive checkpoint.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((item) => {
            const pInfo = PRIORITY_META[item.priority ?? 'medium'];
            return (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-[24px] bg-white dark:bg-[#1A1D2D]/75 border border-slate-200 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/15 p-3.5 sm:p-4 transition-all shadow-xs dark:shadow-none"
              >
                <TactileCheckbox
                  checked={item.completed}
                  onChange={() => onToggleCompleted(item.id)}
                  ariaLabel={`Mark reminder ${item.title} done`}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono tabular-nums text-slate-500 dark:text-[#94A3B8]">
                    <span className="text-slate-900 dark:text-[#F8FAFC]">
                      {item.date === today ? 'Today' : item.date}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="text-indigo-600 dark:text-[#818CF8]">
                      {item.time}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="capitalize font-sans">{item.repeat}</span>
                    <span aria-hidden="true">·</span>
                    <span className={`font-sans font-medium ${pInfo.textClass}`}>
                      {pInfo.label}
                    </span>
                  </div>

                  <p
                    className={`mt-0.5 truncate text-[15px] font-medium select-text ${
                      item.completed
                        ? 'line-through text-slate-400 dark:text-[#64748B]'
                        : 'text-slate-900 dark:text-[#F8FAFC]'
                    }`}
                  >
                    {item.title}
                  </p>

                  {item.note && !item.completed && (
                    <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-[#64748B] select-text">
                      {item.note}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <CopyButton
                    compact
                    text={`${item.title} (${item.date} ${item.time}, ${item.repeat})${
                      item.note ? ` — ${item.note}` : ''
                    }`}
                    ariaLabel={`Copy reminder ${item.title}`}
                  />
                  <GlowingToggle
                    checked={item.active}
                    onChange={(next) => onToggleActive(item.id, next)}
                    ariaLabel={`Toggle reminder ${item.title}`}
                  />
                  <button
                    type="button"
                    onClick={() => openEdit(item)}
                    aria-label={`Edit ${item.title}`}
                    className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500 dark:text-[#94A3B8] hover:bg-slate-100 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-[#F8FAFC] transition-colors cursor-pointer"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteReminder(item.id)}
                    aria-label={`Delete ${item.title}`}
                    className="flex h-11 w-11 items-center justify-center rounded-full text-slate-400 dark:text-[#64748B] hover:bg-red-50 dark:hover:bg-white/[0.06] hover:text-red-600 dark:hover:text-[#ffb4ab] transition-colors cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
