import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightCircle,
  Clock,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  formatTimeRange,
  getTimeWindowFromHHMM,
  getTimeWindowLabel,
  getTodayDateString,
  hhmmToMinutes,
  normalizeTaskCategory,
  PRIORITY_META,
  TASK_CATEGORIES,
  type PriorityLevel,
  type TaskCategory,
  type TaskItem,
  type TimeWindowPreset,
} from '../types/chrono';
import { TactileCheckbox } from './TactileCheckbox';
import { soundEngine } from '../utils/soundEngine';
import { CopyButton, PasteButton } from './ClipboardButtons';

interface TasksSectionProps {
  tasks: TaskItem[];
  autoOpenCreateKey?: number;
  defaultCreateDate?: string;
  autoCarryoverEnabled: boolean;
  onToggleAutoCarryover: (enabled: boolean) => void;
  onCarryOverOverdue: () => void;
  onToggleTask: (id: string) => void;
  onCreateTask: (task: Omit<TaskItem, 'id' | 'completed'>) => void;
  onUpdateTask: (id: string, updates: Omit<TaskItem, 'id'>) => void;
  onDeleteTask: (id: string) => void;
}

type TaskFilter = 'all' | 'today' | 'pending' | 'completed';

const TIME_SLOT_PRESETS: {
  id: TimeWindowPreset;
  label: string;
  range: string;
  defaultTime: string;
}[] = [
  { id: 'morning', label: 'Morning', range: '09:00–12:00', defaultTime: '09:00' },
  { id: 'afternoon', label: 'Afternoon', range: '13:00–17:00', defaultTime: '13:00' },
  { id: 'evening', label: 'Evening', range: '18:00–21:00', defaultTime: '18:00' },
];

const DURATION_QUICK_CHIPS = [15, 30, 45, 60, 90, 120];

export const TasksSection: React.FC<TasksSectionProps> = ({
  tasks,
  autoOpenCreateKey,
  defaultCreateDate,
  autoCarryoverEnabled,
  onToggleAutoCarryover,
  onCarryOverOverdue,
  onToggleTask,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
}) => {
  const today = getTodayDateString();
  const [filter, setFilter] = useState<TaskFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | PriorityLevel>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | TaskCategory>('all');
  const [slotFilter, setSlotFilter] = useState<'all' | TimeWindowPreset>('all');
  const [search, setSearch] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);

  // Form state (duration stored as string so user can delete the full number freely)
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState(today);
  const [dueTime, setDueTime] = useState('09:00');
  const [durationText, setDurationText] = useState('30');
  const [durationError, setDurationError] = useState<string | null>(null);
  const [priority, setPriority] = useState<PriorityLevel>('medium');
  const [category, setCategory] = useState<TaskCategory>('Work');
  const [details, setDetails] = useState('');
  const durationInputRef = useRef<HTMLInputElement>(null);

  const openCreate = (dateOverride?: string) => {
    soundEngine.playTick(840, 0.02);
    setEditingTask(null);
    setTitle('');
    setDueDate(dateOverride || today);
    setDueTime('09:00');
    setDurationText('30');
    setDurationError(null);
    setPriority('medium');
    setCategory('Work');
    setDetails('');
    setEditorOpen(true);
  };

  useEffect(() => {
    if (autoOpenCreateKey && autoOpenCreateKey > 0) {
      openCreate(defaultCreateDate);
    }
  }, [autoOpenCreateKey, defaultCreateDate]);

  const openEdit = (task: TaskItem) => {
    soundEngine.playTick(800, 0.02);
    setEditingTask(task);
    setTitle(task.title);
    setDueDate(task.dueDate);
    setDueTime(task.dueTime);
    setDurationText(String(task.durationMinutes || 30));
    setDurationError(null);
    setPriority(task.priority ?? 'medium');
    setCategory(normalizeTaskCategory(task.category));
    setDetails(task.details ?? '');
    setEditorOpen(true);
  };

  const parsedDuration = useMemo(() => {
    const trimmed = durationText.trim();
    if (!trimmed) return 0;
    const n = Number.parseInt(trimmed, 10);
    return Number.isNaN(n) ? 0 : n;
  }, [durationText]);

  // Live overlap / overbooking detection for the form
  const formOverlaps = useMemo(() => {
    if (!editorOpen || parsedDuration <= 0) return [];
    const startA = hhmmToMinutes(dueTime);
    const endA = startA + parsedDuration;
    return tasks.filter((t) => {
      if (t.completed || t.dueDate !== dueDate) return false;
      if (editingTask && t.id === editingTask.id) return false;
      const startB = hhmmToMinutes(t.dueTime);
      const endB = startB + Math.max(1, t.durationMinutes);
      return startA < endB && startB < endA;
    });
  }, [editorOpen, parsedDuration, dueTime, dueDate, tasks, editingTask]);

  // Precompute set of task IDs with schedule conflicts on the same day
  const overlappingTaskIds = useMemo(() => {
    const active = tasks.filter((t) => !t.completed);
    const ids = new Set<string>();
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i];
        const b = active[j];
        if (a.dueDate !== b.dueDate) continue;
        const startA = hhmmToMinutes(a.dueTime);
        const endA = startA + Math.max(1, a.durationMinutes);
        const startB = hhmmToMinutes(b.dueTime);
        const endB = startB + Math.max(1, b.durationMinutes);
        if (startA < endB && startB < endA) {
          ids.add(a.id);
          ids.add(b.id);
        }
      }
    }
    return ids;
  }, [tasks]);

  const handleDurationChange = (raw: string) => {
    const digitsOnly = raw.replace(/[^0-9]/g, '');
    setDurationText(digitsOnly);
    if (digitsOnly.length === 0) {
      setDurationError('Duration is required (minimum 1 minute).');
    } else {
      const val = Number.parseInt(digitsOnly, 10);
      if (val <= 0) {
        setDurationError('Duration must be greater than 0 minutes.');
      } else if (val > 720) {
        setDurationError('Duration cannot exceed 720 minutes (12 hours).');
      } else {
        setDurationError(null);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const trimmedDuration = durationText.trim();
    const numericDuration = Number.parseInt(trimmedDuration, 10);
    if (
      !trimmedDuration ||
      Number.isNaN(numericDuration) ||
      numericDuration <= 0
    ) {
      setDurationError('Please enter a duration greater than 0 minutes.');
      durationInputRef.current?.focus();
      return;
    }
    if (numericDuration > 720) {
      setDurationError('Duration cannot exceed 720 minutes (12 hours).');
      durationInputRef.current?.focus();
      return;
    }

    soundEngine.playTick(980, 0.03);

    if (editingTask) {
      onUpdateTask(editingTask.id, {
        title: title.trim(),
        dueDate,
        dueTime,
        durationMinutes: numericDuration,
        priority,
        category,
        completed: editingTask.completed,
        details: details.trim() || undefined,
      });
    } else {
      onCreateTask({
        title: title.trim(),
        dueDate,
        dueTime,
        durationMinutes: numericDuration,
        priority,
        category,
        details: details.trim() || undefined,
      });
    }
    setEditorOpen(false);
    setEditingTask(null);
  };

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    const weight: Record<PriorityLevel, number> = { high: 0, medium: 1, low: 2 };
    return tasks
      .filter((t) => {
        if (filter === 'today') return t.dueDate === today;
        if (filter === 'pending') return !t.completed;
        if (filter === 'completed') return t.completed;
        return true;
      })
      .filter((t) =>
        priorityFilter === 'all' ? true : (t.priority ?? 'medium') === priorityFilter
      )
      .filter((t) =>
        categoryFilter === 'all'
          ? true
          : normalizeTaskCategory(t.category) === categoryFilter
      )
      .filter((t) =>
        slotFilter === 'all' ? true : getTimeWindowFromHHMM(t.dueTime) === slotFilter
      )
      .filter((t) =>
        q
          ? t.title.toLowerCase().includes(q) ||
            (t.details ?? '').toLowerCase().includes(q) ||
            normalizeTaskCategory(t.category).toLowerCase().includes(q)
          : true
      )
      .sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        const pDiff =
          weight[a.priority ?? 'medium'] - weight[b.priority ?? 'medium'];
        if (pDiff !== 0) return pDiff;
        return `${a.dueDate} ${a.dueTime}`.localeCompare(`${b.dueDate} ${b.dueTime}`);
      });
  }, [tasks, filter, priorityFilter, categoryFilter, slotFilter, search, today]);

  const pendingCount = tasks.filter((t) => !t.completed).length;
  const criticalPendingCount = tasks.filter(
    (t) => !t.completed && t.priority === 'high'
  ).length;
  const overdueCount = tasks.filter((t) => !t.completed && t.dueDate < today).length;
  const carriedTodayCount = tasks.filter(
    (t) => !t.completed && t.dueDate === today && Boolean(t.carriedOverFrom)
  ).length;
  const activeTimeWindow = getTimeWindowFromHHMM(dueTime);

  return (
    <section className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-[#F8FAFC] tracking-tight">
            Tasks
          </h2>
          <p className="text-xs text-slate-600 dark:text-[#94A3B8] tabular-nums mt-0.5">
            {pendingCount} pending · {criticalPendingCount} P1 Critical · {tasks.length} total
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              soundEngine.playTick(780, 0.02);
              onToggleAutoCarryover(!autoCarryoverEnabled);
            }}
            aria-pressed={autoCarryoverEnabled}
            title="Automatically roll uncompleted tasks from past days into Today"
            className={`flex min-h-[40px] items-center gap-1.5 rounded-full px-3.5 text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
              autoCarryoverEnabled
                ? 'bg-emerald-50 dark:bg-[#10B981]/15 text-emerald-700 dark:text-[#34D399] border-emerald-300 dark:border-[#10B981]/35'
                : 'bg-slate-100 dark:bg-white/[0.05] text-slate-600 dark:text-[#94A3B8] border-slate-200 dark:border-white/10'
            }`}
          >
            <ArrowRightCircle className="h-3.5 w-3.5" />
            <span>Auto-Carryover: {autoCarryoverEnabled ? 'On' : 'Off'}</span>
          </button>

          <button
            type="button"
            onClick={() => openCreate()}
            className="flex min-h-[44px] items-center gap-2 rounded-full bg-gradient-to-r from-[#6366F1] to-[#818CF8] px-5 py-2 text-xs font-semibold text-white shadow-[0_0_16px_rgba(99,102,241,0.35),inset_0_1px_0_rgba(255,255,255,0.3)] active:scale-[0.98] transition-all whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            New Task
          </button>
        </div>
      </div>

      {/* Overdue / Carried-Over Banner */}
      {overdueCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-50 dark:bg-[#F59E0B]/12 border border-amber-300 dark:border-[#F59E0B]/35 px-4 py-3 text-xs">
          <div className="flex items-center gap-2 text-amber-800 dark:text-[#FCD34D]">
            <ArrowRightCircle className="h-4 w-4 shrink-0" />
            <span>
              {overdueCount} missed {overdueCount === 1 ? 'task' : 'tasks'} from past days.
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              soundEngine.playTick(880, 0.025);
              onCarryOverOverdue();
            }}
            className="min-h-[34px] rounded-full bg-amber-600 text-white px-3.5 text-xs font-semibold hover:bg-amber-500 transition-colors cursor-pointer"
          >
            Carry Over to Today
          </button>
        </div>
      )}

      {carriedTodayCount > 0 && overdueCount === 0 && (
        <div className="flex items-center gap-2 rounded-2xl bg-indigo-50 dark:bg-[#6366F1]/12 border border-indigo-200 dark:border-[#6366F1]/30 px-4 py-2.5 text-xs text-indigo-700 dark:text-[#c0c1ff]">
          <ArrowRightCircle className="h-4 w-4 shrink-0" />
          <span>
            {carriedTodayCount} unfinished {carriedTodayCount === 1 ? 'task' : 'tasks'} from earlier days automatically carried over to Today.
          </span>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="tablist"
              aria-label="Filter tasks"
              className="inline-flex rounded-full bg-slate-100 dark:bg-[#12141F] p-1 border border-slate-200 dark:border-white/[0.06]"
            >
              {(['all', 'today', 'pending', 'completed'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={filter === tab}
                  onClick={() => {
                    soundEngine.playTick(780, 0.02);
                    setFilter(tab);
                  }}
                  className={`min-h-[36px] rounded-full px-3.5 text-xs font-medium capitalize transition-all whitespace-nowrap shrink-0 cursor-pointer ${
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
              aria-label="Filter by priority"
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

            <select
              aria-label="Filter by category"
              value={categoryFilter}
              onChange={(e) =>
                setCategoryFilter(e.target.value as 'all' | TaskCategory)
              }
              className="min-h-[40px] rounded-full bg-white dark:bg-[#12141F] px-3.5 text-xs font-medium text-slate-700 dark:text-[#F8FAFC] border border-slate-200 dark:border-white/[0.08] focus:border-[#6366F1] focus:outline-none cursor-pointer"
            >
              <option value="all">All categories</option>
              {TASK_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by time slot"
              value={slotFilter}
              onChange={(e) =>
                setSlotFilter(e.target.value as 'all' | TimeWindowPreset)
              }
              className="min-h-[40px] rounded-full bg-white dark:bg-[#12141F] px-3.5 text-xs font-medium text-slate-700 dark:text-[#F8FAFC] border border-slate-200 dark:border-white/[0.08] focus:border-[#6366F1] focus:outline-none cursor-pointer"
            >
              <option value="all">All time slots</option>
              <option value="morning">Morning (00:00–11:59)</option>
              <option value="afternoon">Afternoon (12:00–16:59)</option>
              <option value="evening">Evening (17:00–23:59)</option>
            </select>
          </div>

          <div className="relative w-full lg:w-64">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-[#64748B]" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks..."
              aria-label="Search tasks"
              className="min-h-[44px] w-full rounded-full bg-white dark:bg-[#12141F] pl-10 pr-4 text-sm text-slate-900 dark:text-[#F8FAFC] placeholder:text-slate-400 dark:placeholder:text-[#64748B] border border-slate-200 dark:border-white/[0.08] focus:border-[#6366F1] focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Create / Edit Form */}
      {editorOpen && (
        <form
          onSubmit={handleSubmit}
          className="rounded-[28px] bg-white dark:bg-[#1A1D2D] border border-indigo-300 dark:border-[#6366F1]/40 p-5 flex flex-col gap-4 shadow-lg dark:shadow-[0_16px_48px_rgba(0,0,0,0.5)]"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-[#F8FAFC]">
              {editingTask ? 'Edit Task' : 'Create Task'}
            </h3>
            <button
              type="button"
              onClick={() => setEditorOpen(false)}
              aria-label="Close task form"
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 dark:text-[#94A3B8] hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-[#F8FAFC] cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label
                htmlFor="task-title-input"
                className="block text-xs font-medium text-slate-600 dark:text-[#94A3B8]"
              >
                Task Title
              </label>
              <div className="flex items-center gap-1.5">
                {title && <CopyButton text={title} ariaLabel="Copy task title" />}
                <PasteButton
                  targetInputId="task-title-input"
                  onPasteText={(val) => setTitle((prev) => (prev ? `${prev} ${val}` : val))}
                />
              </div>
            </div>
            <input
              id="task-title-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Review quarterly roadmap"
              required
              className="min-h-[48px] w-full rounded-2xl bg-slate-50 dark:bg-[#161926] px-4 text-sm text-slate-900 dark:text-[#F8FAFC] placeholder:text-slate-400 dark:placeholder:text-[#64748B] border border-slate-200 dark:border-white/[0.08] focus:border-[#6366F1] focus:outline-none"
            />
          </div>

          {/* Time Slot Presets & Active Window */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <span className="text-xs font-medium text-slate-600 dark:text-[#94A3B8]">
                Time Slot Window
              </span>
              {parsedDuration > 0 && (
                <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-indigo-600 dark:text-[#818CF8] tabular-nums">
                  <Clock className="h-3.5 w-3.5" />
                  {formatTimeRange(dueTime, parsedDuration)} · {getTimeWindowLabel(activeTimeWindow)}
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {TIME_SLOT_PRESETS.map((slot) => {
                const active = activeTimeWindow === slot.id;
                return (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => {
                      soundEngine.playTick(760, 0.015);
                      setDueTime(slot.defaultTime);
                    }}
                    className={`flex flex-col items-start rounded-2xl px-3.5 py-2.5 text-left border transition-all cursor-pointer ${
                      active
                        ? 'bg-indigo-50 dark:bg-[#6366F1]/20 border-indigo-400 dark:border-[#6366F1]/50 text-indigo-800 dark:text-[#F8FAFC]'
                        : 'bg-slate-50 dark:bg-[#12141F] border-slate-200 dark:border-white/[0.06] text-slate-700 dark:text-[#94A3B8]'
                    }`}
                  >
                    <span className="text-xs font-semibold">{slot.label}</span>
                    <span className="font-mono text-[11px] opacity-80 tabular-nums">
                      {slot.range}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="task-date-input"
                className="block text-xs font-medium text-slate-600 dark:text-[#94A3B8] mb-1.5"
              >
                Date
              </label>
              <input
                id="task-date-input"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="min-h-[48px] w-full rounded-2xl bg-slate-50 dark:bg-[#161926] px-3 font-mono text-xs text-slate-900 dark:text-[#F8FAFC] border border-slate-200 dark:border-white/[0.08] focus:border-[#6366F1] focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="task-time-input"
                className="block text-xs font-medium text-slate-600 dark:text-[#94A3B8] mb-1.5"
              >
                Start Time
              </label>
              <input
                id="task-time-input"
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className="min-h-[48px] w-full rounded-2xl bg-slate-50 dark:bg-[#161926] px-3 font-mono text-xs text-slate-900 dark:text-[#F8FAFC] border border-slate-200 dark:border-white/[0.08] focus:border-[#6366F1] focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="task-duration-input"
                className="block text-xs font-medium text-slate-600 dark:text-[#94A3B8] mb-1.5"
              >
                Duration (minutes)
              </label>
              <input
                ref={durationInputRef}
                id="task-duration-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={durationText}
                onChange={(e) => handleDurationChange(e.target.value)}
                placeholder="e.g., 45"
                aria-invalid={Boolean(durationError)}
                className={`min-h-[48px] w-full rounded-2xl bg-slate-50 dark:bg-[#161926] px-3 font-mono text-sm text-slate-900 dark:text-[#F8FAFC] border focus:outline-none ${
                  durationError
                    ? 'border-red-500 dark:border-[#ffb4ab]'
                    : 'border-slate-200 dark:border-white/[0.08] focus:border-[#6366F1]'
                }`}
              />
              <div className="mt-1.5 flex flex-wrap gap-1">
                {DURATION_QUICK_CHIPS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => handleDurationChange(String(m))}
                    className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-medium transition-colors cursor-pointer ${
                      parsedDuration === m
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 dark:bg-[#12141F] text-slate-600 dark:text-[#94A3B8]'
                    }`}
                  >
                    {m}m
                  </button>
                ))}
              </div>
              {durationError && (
                <p role="alert" className="mt-1 text-xs font-medium text-red-600 dark:text-[#ffb4ab]">
                  {durationError}
                </p>
              )}
            </div>
          </div>

          {/* Overbooking / Time Overlap Warning */}
          {formOverlaps.length > 0 && (
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-2xl bg-amber-50 dark:bg-[#F59E0B]/12 border border-amber-300 dark:border-[#F59E0B]/40 px-3.5 py-2.5 text-xs text-amber-800 dark:text-[#FCD34D]"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Time window overlap detected</p>
                <p className="mt-0.5 opacity-90">
                  Overlaps with{' '}
                  {formOverlaps
                    .map((o) => `"${o.title}" (${formatTimeRange(o.dueTime, o.durationMinutes)})`)
                    .join(', ')}
                  . Adjust start time or duration to avoid overbooking.
                </p>
              </div>
            </div>
          )}

          {/* Category & Priority Hierarchy */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <span className="block text-xs font-medium text-slate-600 dark:text-[#94A3B8] mb-1.5">
                Category
              </span>
              <div className="grid grid-cols-4 gap-1 rounded-2xl bg-slate-100 dark:bg-[#12141F] p-1 border border-slate-200 dark:border-white/[0.06] min-h-[48px]">
                {TASK_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`rounded-xl px-1.5 text-xs font-medium transition-all cursor-pointer ${
                      category === cat
                        ? 'bg-white dark:bg-[#1A1D2D] text-slate-900 dark:text-[#F8FAFC] border border-slate-300 dark:border-white/15 shadow-xs'
                        : 'text-slate-500 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F8FAFC]'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block text-xs font-medium text-slate-600 dark:text-[#94A3B8] mb-1.5">
                Priority Hierarchy (Big 3 = P1 Critical)
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
                htmlFor="task-details-input"
                className="block text-xs font-medium text-slate-600 dark:text-[#94A3B8]"
              >
                Details (optional)
              </label>
              <div className="flex items-center gap-1.5">
                {details && <CopyButton text={details} ariaLabel="Copy task details" />}
                <PasteButton
                  targetInputId="task-details-input"
                  onPasteText={(val) => setDetails((prev) => (prev ? `${prev} ${val}` : val))}
                />
              </div>
            </div>
            <input
              id="task-details-input"
              type="text"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Context or checklist summary..."
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
              {editingTask ? 'Save Changes' : 'Create Task'}
            </button>
          </div>
        </form>
      )}

      {/* Task List */}
      {filteredTasks.length === 0 ? (
        <div className="rounded-[28px] bg-white/70 dark:bg-[#1A1D2D]/50 border border-slate-200 dark:border-white/[0.06] p-8 text-center">
          <p className="text-sm font-medium text-slate-900 dark:text-[#F8FAFC]">
            No tasks found
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-[#64748B]">
            Add a task or adjust your filters to see upcoming time blocks.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filteredTasks.map((task) => {
            const pInfo = PRIORITY_META[task.priority ?? 'medium'];
            const cat = normalizeTaskCategory(task.category);
            const windowLabel = getTimeWindowLabel(getTimeWindowFromHHMM(task.dueTime));
            const timeRange = formatTimeRange(task.dueTime, task.durationMinutes);
            const hasOverlap = !task.completed && overlappingTaskIds.has(task.id);

            return (
              <div
                key={task.id}
                className="flex items-center gap-3 rounded-[24px] bg-white dark:bg-[#1A1D2D]/75 border border-slate-200 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/15 p-3.5 sm:p-4 transition-all shadow-xs dark:shadow-none"
              >
                <TactileCheckbox
                  checked={task.completed}
                  onChange={() => onToggleTask(task.id)}
                  ariaLabel={`Mark ${task.title} complete`}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-mono tabular-nums text-slate-500 dark:text-[#94A3B8]">
                    <span className="text-slate-900 dark:text-[#F8FAFC]">
                      {task.dueDate === today ? 'Today' : task.dueDate}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {timeRange} ({windowLabel})
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{task.durationMinutes}m</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-sans font-medium text-slate-700 dark:text-[#cbd5e1]">
                      {cat}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className={`font-sans font-semibold ${pInfo.textClass}`}>
                      {pInfo.label}
                    </span>
                    {hasOverlap && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1 font-sans font-semibold text-amber-600 dark:text-[#F59E0B]">
                          <AlertTriangle className="h-3 w-3" />
                          Overlap
                        </span>
                      </>
                    )}
                    {task.carriedOverFrom && !task.completed && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1 font-sans font-medium text-indigo-600 dark:text-[#818CF8]">
                          <ArrowRightCircle className="h-3 w-3" />
                          From {task.carriedOverFrom}
                        </span>
                      </>
                    )}
                  </div>

                  <p
                    className={`mt-0.5 truncate text-[15px] font-medium select-text ${
                      task.completed
                        ? 'line-through text-slate-400 dark:text-[#64748B]'
                        : 'text-slate-900 dark:text-[#F8FAFC]'
                    }`}
                  >
                    {task.title}
                  </p>

                  {task.details && !task.completed && (
                    <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-[#64748B] select-text">
                      {task.details}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <CopyButton
                    compact
                    text={`${task.title} (${task.dueDate} ${timeRange} · ${cat} · ${pInfo.label})${
                      task.details ? ` — ${task.details}` : ''
                    }`}
                    ariaLabel={`Copy task ${task.title}`}
                  />
                  <button
                    type="button"
                    onClick={() => openEdit(task)}
                    aria-label={`Edit ${task.title}`}
                    className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500 dark:text-[#94A3B8] hover:bg-slate-100 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-[#F8FAFC] transition-colors cursor-pointer"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteTask(task.id)}
                    aria-label={`Delete ${task.title}`}
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
