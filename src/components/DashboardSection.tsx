import React, { useMemo, useState } from 'react';
import {
  AlarmClock,
  ArrowRight,
  Bell,
  Calendar as CalendarIcon,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FileText,
  Pause,
  Play,
  Pin,
  Plus,
  RotateCcw,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  doesReminderOccurOnDate,
  formatDateToYMD,
  formatTimeRange,
  getTimeWindowFromHHMM,
  getTimeWindowLabel,
  getTodayDateString,
  hhmmToMinutes,
  normalizeTaskCategory,
  parseYMDToLocalDate,
  PRIORITY_META,
  type ChronoAlarm,
  type FocusTimerState,
  type NavTab,
  type NoteItem,
  type PriorityLevel,
  type ReminderItem,
  type TaskItem,
  type TimeWindowPreset,
} from '../types/chrono';
import { TactileCheckbox } from './TactileCheckbox';
import { GlowingToggle } from './GlowingToggle';
import { soundEngine } from '../utils/soundEngine';
import { CopyButton } from './ClipboardButtons';
import { FormattedNoteContent } from './NotesSection';

export type QuickAddTarget = 'tasks' | 'reminders' | 'alarms' | 'notes';

interface DashboardSectionProps {
  tasks: TaskItem[];
  reminders: ReminderItem[];
  alarms: ChronoAlarm[];
  notes: NoteItem[];
  focusState: FocusTimerState;
  onSelectFocusPreset: (minutes: number) => void;
  onSelectFocusTask: (taskId: string | null) => void;
  onToggleFocusRunning: () => void;
  onResetFocus: () => void;
  onNavigate: (tab: NavTab) => void;
  onQuickAdd: (target: QuickAddTarget, defaultDate?: string) => void;
  onToggleTask: (id: string) => void;
  onToggleReminderDone: (id: string) => void;
  onToggleAlarm: (id: string, enabled: boolean) => void;
  onToggleNoteChecklistLine?: (noteId: string, lineIdx: number) => void;
  isNativeAndroid?: boolean;
  dndAccessGranted?: boolean;
  focusAutoDndEnabled?: boolean;
  onEnableDndAccess?: () => void;
}

type TimelineFilter = 'all' | 'p1' | 'tasks' | 'reminders' | 'alarms';

interface TimelineEntry {
  uid: string;
  kind: 'task' | 'reminder' | 'alarm';
  sortMinutes: number;
  timeDisplay: string;
  window: TimeWindowPreset;
  title: string;
  subtitle?: string;
  priority?: PriorityLevel;
  categoryLabel: string;
  completed?: boolean;
  alarmEnabled?: boolean;
  task?: TaskItem;
  reminder?: ReminderItem;
  alarm?: ChronoAlarm;
}

const WEEKDAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_SHORT_CODES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function doesAlarmApplyToWeekday(alarm: ChronoAlarm, weekday: number): boolean {
  return alarm.days.length === 0 || alarm.days.includes(weekday);
}

export const DashboardSection: React.FC<DashboardSectionProps> = ({
  tasks,
  reminders,
  alarms,
  notes,
  focusState,
  onSelectFocusPreset,
  onSelectFocusTask,
  onToggleFocusRunning,
  onResetFocus,
  onNavigate,
  onQuickAdd,
  onToggleTask,
  onToggleReminderDone,
  onToggleAlarm,
  onToggleNoteChecklistLine,
  isNativeAndroid = false,
  dndAccessGranted = false,
  focusAutoDndEnabled = true,
  onEnableDndAccess,
}) => {
  const today = getTodayDateString();
  const todayLocal = useMemo(() => parseYMDToLocalDate(today), [today]);

  // Top Calendar visibility (default set to hide) & date selection state
  const [calendarVisible, setCalendarVisible] = useState<boolean>(false);
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [viewMonth, setViewMonth] = useState<{ year: number; month: number }>(() => ({
    year: todayLocal.getFullYear(),
    month: todayLocal.getMonth(),
  }));

  // Single + Quick Add Menu state & Time-Based Schedule Filter
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>('all');

  const selectedLocalDate = useMemo(
    () => parseYMDToLocalDate(selectedDate),
    [selectedDate]
  );
  const selectedWeekday = selectedLocalDate.getDay();
  const isTodaySelected = selectedDate === today;

  const selectedDayMeta = useMemo(() => {
    const shortLabel = selectedLocalDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    const fullLabel = selectedLocalDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const weekdayLong = selectedLocalDate.toLocaleDateString('en-US', {
      weekday: 'long',
    });
    const weekdayShort = selectedLocalDate.toLocaleDateString('en-US', {
      weekday: 'short',
    });
    return {
      title: isTodaySelected ? 'Today' : shortLabel,
      shortLabel,
      fullLabel,
      weekdayLong,
      weekdayShort,
    };
  }, [selectedLocalDate, isTodaySelected]);

  // Day-specific data derived from selectedDate
  const dayTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.dueDate === selectedDate)
        .sort((a, b) => a.dueTime.localeCompare(b.dueTime)),
    [tasks, selectedDate]
  );
  const completedTasksForDay = dayTasks.filter((t) => t.completed).length;

  const dayReminders = useMemo(
    () =>
      reminders
        .filter((r) => doesReminderOccurOnDate(r, selectedDate))
        .sort((a, b) => a.time.localeCompare(b.time)),
    [reminders, selectedDate]
  );
  const pendingRemindersForDay = dayReminders.filter((r) => !r.completed).length;

  const dayAlarms = useMemo(
    () =>
      alarms
        .filter((a) => doesAlarmApplyToWeekday(a, selectedWeekday))
        .sort((a, b) => a.hour24 * 60 + a.minute - (b.hour24 * 60 + b.minute)),
    [alarms, selectedWeekday]
  );
  const activeAlarmsForDay = dayAlarms.filter((a) => a.enabled);

  const dayNotes = useMemo(
    () =>
      notes
        .filter((n) => formatDateToYMD(new Date(n.updatedAt)) === selectedDate)
        .sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          return b.updatedAt.localeCompare(a.updatedAt);
        }),
    [notes, selectedDate]
  );

  const recentNotes = useMemo(
    () =>
      [...notes]
        .sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          return b.updatedAt.localeCompare(a.updatedAt);
        })
        .slice(0, 3),
    [notes]
  );

  // Unified chronological Time-Based Agenda with Priorities
  const timeBasedAgenda = useMemo(() => {
    const priWeight: Record<PriorityLevel, number> = { high: 0, medium: 1, low: 2 };
    const items: TimelineEntry[] = [];

    dayTasks.forEach((task) => {
      const p = task.priority ?? 'medium';
      items.push({
        uid: `task-${task.id}`,
        kind: 'task',
        sortMinutes: hhmmToMinutes(task.dueTime),
        timeDisplay: formatTimeRange(task.dueTime, task.durationMinutes),
        window: getTimeWindowFromHHMM(task.dueTime),
        title: task.title,
        subtitle: task.details,
        priority: p,
        categoryLabel: `Task · ${normalizeTaskCategory(task.category)} · ${task.durationMinutes}m`,
        completed: task.completed,
        task,
      });
    });

    dayReminders.forEach((rem) => {
      const p = rem.priority ?? 'medium';
      items.push({
        uid: `rem-${rem.id}`,
        kind: 'reminder',
        sortMinutes: hhmmToMinutes(rem.time),
        timeDisplay: rem.time,
        window: getTimeWindowFromHHMM(rem.time),
        title: rem.title,
        subtitle: rem.note,
        priority: p,
        categoryLabel: `Reminder · ${rem.repeat}`,
        completed: rem.completed,
        reminder: rem,
      });
    });

    dayAlarms.forEach((alarm) => {
      const hhmm = `${String(alarm.hour24).padStart(2, '0')}:${String(
        alarm.minute
      ).padStart(2, '0')}`;
      const h12 = alarm.hour24 % 12 || 12;
      const period = alarm.hour24 >= 12 ? 'PM' : 'AM';
      items.push({
        uid: `alarm-${alarm.id}`,
        kind: 'alarm',
        sortMinutes: alarm.hour24 * 60 + alarm.minute,
        timeDisplay: `${String(h12).padStart(2, '0')}:${String(
          alarm.minute
        ).padStart(2, '0')} ${period}`,
        window: getTimeWindowFromHHMM(hhmm),
        title: alarm.label,
        categoryLabel: 'Alarm',
        alarmEnabled: alarm.enabled,
        alarm,
      });
    });

    const filtered = items.filter((item) => {
      if (timelineFilter === 'p1') return item.priority === 'high';
      if (timelineFilter === 'tasks') return item.kind === 'task';
      if (timelineFilter === 'reminders') return item.kind === 'reminder';
      if (timelineFilter === 'alarms') return item.kind === 'alarm';
      return true;
    });

    return filtered.sort((a, b) => {
      if (a.sortMinutes !== b.sortMinutes) return a.sortMinutes - b.sortMinutes;
      const wa = a.priority ? priWeight[a.priority] : 3;
      const wb = b.priority ? priWeight[b.priority] : 3;
      return wa - wb;
    });
  }, [dayTasks, dayReminders, dayAlarms, timelineFilter]);

  const groupedTimeline = useMemo(() => {
    const order: TimeWindowPreset[] = ['morning', 'afternoon', 'evening'];
    return order
      .map((win) => ({
        window: win,
        label: getTimeWindowLabel(win),
        range:
          win === 'morning'
            ? '00:00 – 11:59'
            : win === 'afternoon'
              ? '12:00 – 16:59'
              : '17:00 – 23:59',
        entries: timeBasedAgenda.filter((item) => item.window === win),
      }))
      .filter((g) => g.entries.length > 0);
  }, [timeBasedAgenda]);

  const criticalCountForDay = useMemo(
    () =>
      dayTasks.filter((t) => !t.completed && t.priority === 'high').length +
      dayReminders.filter((r) => !r.completed && r.priority === 'high').length,
    [dayTasks, dayReminders]
  );

  // Calendar Month Grid calculation
  const calendarCells = useMemo(() => {
    const firstOfMonth = new Date(viewMonth.year, viewMonth.month, 1);
    const startOffset = firstOfMonth.getDay(); // 0=Sun..6=Sat
    const daysInMonth = new Date(viewMonth.year, viewMonth.month + 1, 0).getDate();
    const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

    const cells: {
      dateStr: string;
      dayNum: number;
      inCurrentMonth: boolean;
      taskCount: number;
      reminderCount: number;
    }[] = [];

    for (let i = 0; i < totalCells; i++) {
      const cellDate = new Date(viewMonth.year, viewMonth.month, 1 - startOffset + i);
      const dateStr = formatDateToYMD(cellDate);
      const inCurrentMonth =
        cellDate.getMonth() === viewMonth.month &&
        cellDate.getFullYear() === viewMonth.year;

      const taskCount = tasks.filter((t) => t.dueDate === dateStr).length;
      const reminderCount = reminders.filter((r) =>
        doesReminderOccurOnDate(r, dateStr)
      ).length;

      cells.push({
        dateStr,
        dayNum: cellDate.getDate(),
        inCurrentMonth,
        taskCount,
        reminderCount,
      });
    }
    return cells;
  }, [viewMonth, tasks, reminders]);

  const monthHeading = useMemo(
    () =>
      new Date(viewMonth.year, viewMonth.month, 1).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      }),
    [viewMonth]
  );

  const isViewingCurrentMonth =
    viewMonth.year === todayLocal.getFullYear() &&
    viewMonth.month === todayLocal.getMonth();

  const shiftMonth = (delta: number) => {
    soundEngine.playTick(760, 0.015);
    setViewMonth((prev) => {
      const next = new Date(prev.year, prev.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  };

  const jumpToToday = () => {
    soundEngine.playTick(880, 0.02);
    setSelectedDate(today);
    setViewMonth({ year: todayLocal.getFullYear(), month: todayLocal.getMonth() });
  };

  const handleSelectDate = (dateStr: string) => {
    soundEngine.playTick(840, 0.015);
    setSelectedDate(dateStr);
    const parsed = parseYMDToLocalDate(dateStr);
    if (
      parsed.getFullYear() !== viewMonth.year ||
      parsed.getMonth() !== viewMonth.month
    ) {
      setViewMonth({ year: parsed.getFullYear(), month: parsed.getMonth() });
    }
  };

  const mins = Math.floor(focusState.secondsLeft / 60);
  const secs = focusState.secondsLeft % 60;
  const progress = Math.max(
    0,
    Math.min(1, focusState.secondsLeft / (Math.max(1, focusState.presetMinutes) * 60))
  );
  const r = 54;
  const circ = 2 * Math.PI * r;
  const dashOffset = circ * (1 - progress);
  const pendingFocusTasks = useMemo(
    () => tasks.filter((t) => !t.completed),
    [tasks]
  );

  return (
    <section className="relative flex flex-col gap-6">
      {/* Top Overview Header with Calendar Show/Hide Toggle and '+' Quick Add */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-[#F8FAFC] tracking-tight">
              {isTodaySelected ? "Today's Overview" : selectedDayMeta.fullLabel}
            </h2>
            {!isTodaySelected && (
              <button
                type="button"
                onClick={jumpToToday}
                className="min-h-[30px] rounded-full bg-indigo-50 dark:bg-[#6366F1]/15 px-3 text-xs font-medium text-indigo-700 dark:text-[#818CF8] border border-indigo-200 dark:border-[#6366F1]/35 hover:opacity-85 transition-opacity cursor-pointer whitespace-nowrap"
              >
                Back to Today
              </button>
            )}
          </div>
          <p className="text-xs text-slate-600 dark:text-[#94A3B8] tabular-nums mt-0.5">
            {completedTasksForDay}/{dayTasks.length} tasks · {pendingRemindersForDay}{' '}
            reminders due · {activeAlarmsForDay.length} alarms active
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <CopyButton
            label="Copy Day"
            ariaLabel={`Copy agenda summary for ${selectedDayMeta.fullLabel}`}
            text={[
              `Kairo — ${selectedDayMeta.fullLabel}`,
              '',
              `Tasks (${dayTasks.length}):`,
              ...(dayTasks.length > 0
                ? dayTasks.map((t) => {
                    const p = PRIORITY_META[t.priority ?? 'medium'].code;
                    return `- [${t.completed ? 'x' : ' '}] ${formatTimeRange(
                      t.dueTime,
                      t.durationMinutes
                    )} [${p} · ${normalizeTaskCategory(t.category)}] ${t.title}`;
                  })
                : ['- None']),
              '',
              `Reminders (${dayReminders.length}):`,
              ...(dayReminders.length > 0
                ? dayReminders.map((r) => {
                    const p = PRIORITY_META[r.priority ?? 'medium'].code;
                    return `- [${r.completed ? 'x' : ' '}] ${r.time} [${p}] ${r.title}`;
                  })
                : ['- None']),
              '',
              `Alarms (${activeAlarmsForDay.length} active):`,
              ...(activeAlarmsForDay.length > 0
                ? activeAlarmsForDay.map((a) => {
                    const h12 = a.hour24 % 12 || 12;
                    const p = a.hour24 >= 12 ? 'PM' : 'AM';
                    return `- ${String(h12).padStart(2, '0')}:${String(a.minute).padStart(
                      2,
                      '0'
                    )} ${p} ${a.label}`;
                  })
                : ['- None']),
            ].join('\n')}
            className="min-h-[44px] px-3.5 text-xs"
          />
          {/* Calendar Show / Hide Toggle (default hidden) */}
          <button
            type="button"
            onClick={() => {
              soundEngine.playTick(820, 0.02);
              setCalendarVisible((v) => !v);
            }}
            aria-expanded={calendarVisible}
            className={`flex min-h-[44px] items-center gap-2 rounded-full px-4 text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              calendarVisible
                ? 'bg-indigo-50 dark:bg-[#6366F1]/20 text-indigo-700 dark:text-[#c0c1ff] border-indigo-300 dark:border-[#6366F1]/45'
                : 'bg-white dark:bg-[#1A1D2D]/80 text-slate-700 dark:text-[#F8FAFC] border-slate-200 dark:border-white/[0.08] hover:border-indigo-400 dark:hover:border-[#6366F1]/40'
            }`}
          >
            <CalendarIcon className="h-4 w-4 text-indigo-600 dark:text-[#818CF8]" />
            <span>{calendarVisible ? 'Hide Calendar' : 'Calendar'}</span>
            {calendarVisible ? (
              <ChevronUp className="h-3.5 w-3.5 opacity-75" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 opacity-75" />
            )}
          </button>

          {/* Single + Icon Button & Quick Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                soundEngine.playTick(860, 0.025);
                setQuickMenuOpen((v) => !v);
              }}
              aria-label="Quick add item"
              aria-expanded={quickMenuOpen}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-r from-[#6366F1] to-[#818CF8] text-white shadow-[0_0_20px_rgba(99,102,241,0.45),inset_0_1px_0_rgba(255,255,255,0.3)] hover:scale-105 active:scale-95 transition-transform cursor-pointer"
            >
              {quickMenuOpen ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
            </button>

            {quickMenuOpen && (
              <>
                <div
                  aria-hidden="true"
                  onClick={() => setQuickMenuOpen(false)}
                  className="fixed inset-0 z-30"
                />
                <div
                  role="menu"
                  aria-label="Quick create options"
                  className="absolute right-0 mt-2.5 z-40 w-56 rounded-[22px] bg-white dark:bg-[#1A1D2D] border border-slate-200 dark:border-white/15 p-2 shadow-xl dark:shadow-[0_20px_48px_rgba(0,0,0,0.65)]"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setQuickMenuOpen(false);
                      onQuickAdd('tasks', selectedDate);
                    }}
                    className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3.5 text-sm font-medium text-slate-800 dark:text-[#F8FAFC] hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
                  >
                    <CheckSquare className="h-4 w-4 text-indigo-600 dark:text-[#818CF8]" />
                    <span>Add Task</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setQuickMenuOpen(false);
                      onQuickAdd('reminders', selectedDate);
                    }}
                    className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3.5 text-sm font-medium text-slate-800 dark:text-[#F8FAFC] hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
                  >
                    <Bell className="h-4 w-4 text-emerald-600 dark:text-[#34D399]" />
                    <span>Add Reminder</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setQuickMenuOpen(false);
                      onQuickAdd('alarms');
                    }}
                    className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3.5 text-sm font-medium text-slate-800 dark:text-[#F8FAFC] hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
                  >
                    <AlarmClock className="h-4 w-4 text-amber-600 dark:text-[#F59E0B]" />
                    <span>Add Alarm</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setQuickMenuOpen(false);
                      onQuickAdd('notes');
                    }}
                    className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3.5 text-sm font-medium text-slate-800 dark:text-[#F8FAFC] hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
                  >
                    <FileText className="h-4 w-4 text-indigo-500 dark:text-[#c0c1ff]" />
                    <span>Add Note</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Collapsible Calendar on Top (hidden by default) */}
      {calendarVisible && (
        <div className="rounded-[28px] bg-white dark:bg-[#1A1D2D]/80 border border-slate-200 dark:border-white/[0.08] p-5 sm:p-6 shadow-xs dark:shadow-none">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2.5">
              <CalendarIcon className="h-4 w-4 text-indigo-600 dark:text-[#818CF8]" />
              <h3 className="text-base font-semibold text-slate-900 dark:text-[#F8FAFC]">
                {monthHeading}
              </h3>
            </div>

            <div className="flex items-center gap-1.5">
              {(!isTodaySelected || !isViewingCurrentMonth) && (
                <button
                  type="button"
                  onClick={jumpToToday}
                  className="min-h-[36px] rounded-full bg-slate-100 dark:bg-white/[0.06] px-3 text-xs font-medium text-slate-700 dark:text-[#F8FAFC] hover:bg-slate-200 dark:hover:bg-white/10 transition-colors cursor-pointer mr-1"
                >
                  Today
                </button>
              )}
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label="Previous month"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 dark:bg-white/[0.05] text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F8FAFC] transition-colors cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label="Next month"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 dark:bg-white/[0.05] text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F8FAFC] transition-colors cursor-pointer"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setCalendarVisible(false)}
                aria-label="Hide calendar"
                className="min-h-[36px] rounded-full px-3 text-xs font-medium text-slate-500 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F8FAFC] hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer ml-1"
              >
                Hide
              </button>
            </div>
          </div>

          {/* Weekday Header */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1.5">
            {WEEKDAY_HEADERS.map((wd) => (
              <div
                key={wd}
                className="py-1 text-[11px] font-medium text-slate-500 dark:text-[#64748B]"
              >
                {wd}
              </div>
            ))}
          </div>

          {/* Calendar Day Grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarCells.map((cell) => {
              const isSelected = cell.dateStr === selectedDate;
              const isTodayCell = cell.dateStr === today;
              const hasTasks = cell.taskCount > 0;
              const hasReminders = cell.reminderCount > 0;

              return (
                <button
                  key={cell.dateStr}
                  type="button"
                  onClick={() => handleSelectDate(cell.dateStr)}
                  aria-pressed={isSelected}
                  aria-label={`${cell.dateStr}${
                    hasTasks ? `, ${cell.taskCount} tasks` : ''
                  }${hasReminders ? `, ${cell.reminderCount} reminders` : ''}`}
                  className={`relative flex min-h-[44px] sm:min-h-[48px] flex-col items-center justify-center rounded-2xl transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-gradient-to-br from-[#6366F1] to-[#818CF8] text-white shadow-[0_6px_18px_rgba(99,102,241,0.38)]'
                      : isTodayCell
                        ? 'bg-indigo-50 dark:bg-[#6366F1]/15 text-indigo-700 dark:text-[#c0c1ff] border border-indigo-300 dark:border-[#6366F1]/45'
                        : cell.inCurrentMonth
                          ? 'text-slate-900 dark:text-[#F8FAFC] hover:bg-slate-100 dark:hover:bg-white/[0.05]'
                          : 'text-slate-400 dark:text-[#64748B]/60 hover:bg-slate-100/70 dark:hover:bg-white/[0.03]'
                  }`}
                >
                  <span className="font-mono text-sm font-medium tabular-nums leading-none">
                    {cell.dayNum}
                  </span>

                  <span className="mt-1.5 flex h-1.5 items-center gap-1" aria-hidden="true">
                    {hasTasks && (
                      <span
                        className={`h-1 w-1 rounded-full ${
                          isSelected ? 'bg-white' : 'bg-indigo-500 dark:bg-[#818CF8]'
                        }`}
                      />
                    )}
                    {hasReminders && (
                      <span
                        className={`h-1 w-1 rounded-full ${
                          isSelected
                            ? 'bg-emerald-200'
                            : 'bg-emerald-500 dark:bg-[#34D399]'
                        }`}
                      />
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Selected Day Summary Strip */}
          <div className="mt-4 pt-3.5 border-t border-slate-200 dark:border-white/[0.06] flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-[#94A3B8]">
            <span className="font-medium text-slate-900 dark:text-[#F8FAFC]">
              {selectedDayMeta.fullLabel}
            </span>
            <div className="flex items-center gap-3 tabular-nums">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 dark:bg-[#818CF8]" />
                {dayTasks.length} {dayTasks.length === 1 ? 'task' : 'tasks'}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-[#34D399]" />
                {dayReminders.length}{' '}
                {dayReminders.length === 1 ? 'reminder' : 'reminders'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Selected Day KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <button
          type="button"
          onClick={() => onNavigate('tasks')}
          className="text-left rounded-[24px] bg-white dark:bg-[#1A1D2D]/75 border border-slate-200 dark:border-white/[0.08] hover:border-indigo-400 dark:hover:border-[#6366F1]/40 p-4 sm:p-5 transition-all shadow-xs dark:shadow-none cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-[#94A3B8]">
            <span>Tasks</span>
            <CheckSquare className="h-4 w-4 text-indigo-600 dark:text-[#818CF8]" />
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 dark:text-[#F8FAFC] tabular-nums">
            {completedTasksForDay}/{dayTasks.length}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-[#64748B] truncate">
            {isTodaySelected ? 'Completed today' : `Scheduled ${selectedDayMeta.shortLabel}`}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('reminders')}
          className="text-left rounded-[24px] bg-white dark:bg-[#1A1D2D]/75 border border-slate-200 dark:border-white/[0.08] hover:border-emerald-400 dark:hover:border-[#10B981]/40 p-4 sm:p-5 transition-all shadow-xs dark:shadow-none cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-[#94A3B8]">
            <span>Reminders</span>
            <Bell className="h-4 w-4 text-emerald-600 dark:text-[#34D399]" />
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 dark:text-[#F8FAFC] tabular-nums">
            {pendingRemindersForDay}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-[#64748B] truncate">
            Due {isTodaySelected ? 'today' : selectedDayMeta.shortLabel}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('alarms')}
          className="text-left rounded-[24px] bg-white dark:bg-[#1A1D2D]/75 border border-slate-200 dark:border-white/[0.08] hover:border-amber-400 dark:hover:border-[#F59E0B]/40 p-4 sm:p-5 transition-all shadow-xs dark:shadow-none cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-[#94A3B8]">
            <span>Alarms</span>
            <AlarmClock className="h-4 w-4 text-amber-600 dark:text-[#F59E0B]" />
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 dark:text-[#F8FAFC] tabular-nums">
            {activeAlarmsForDay.length}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-[#64748B] truncate">
            Active on {selectedDayMeta.weekdayShort}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('notes')}
          className="text-left rounded-[24px] bg-white dark:bg-[#1A1D2D]/75 border border-slate-200 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/25 p-4 sm:p-5 transition-all shadow-xs dark:shadow-none cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-[#94A3B8]">
            <span>Notes</span>
            <FileText className="h-4 w-4 text-indigo-500 dark:text-[#c0c1ff]" />
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 dark:text-[#F8FAFC] tabular-nums">
            {dayNotes.length}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-[#64748B] truncate tabular-nums">
            {notes.length} total saved
          </p>
        </button>
      </div>

      {/* Main 2-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Chronological Time-Based Schedule with Priority */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <div className="rounded-[28px] bg-white dark:bg-[#1A1D2D]/75 border border-slate-200 dark:border-white/[0.08] p-5 sm:p-6 shadow-xs dark:shadow-none">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-[#F8FAFC]">
                  Time-Based Schedule · {selectedDayMeta.title}
                </h3>
                <p className="text-xs text-slate-600 dark:text-[#94A3B8] tabular-nums mt-0.5">
                  {timeBasedAgenda.length} scheduled · {criticalCountForDay} P1 Critical open
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onNavigate('tasks')}
                  className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-[#818CF8] hover:opacity-80 transition-opacity cursor-pointer"
                >
                  All Tasks
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Schedule Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5 mb-5">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'p1', label: 'P1 Critical' },
                  { id: 'tasks', label: 'Tasks' },
                  { id: 'reminders', label: 'Reminders' },
                  { id: 'alarms', label: 'Alarms' },
                ] as const
              ).map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => {
                    soundEngine.playTick(780, 0.015);
                    setTimelineFilter(pill.id);
                  }}
                  className={`min-h-[32px] rounded-full px-3 text-xs font-medium border transition-colors cursor-pointer ${
                    timelineFilter === pill.id
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-50 dark:bg-[#12141F] text-slate-600 dark:text-[#94A3B8] border-slate-200 dark:border-white/[0.06] hover:text-slate-900 dark:hover:text-[#F8FAFC]'
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>

            {groupedTimeline.length === 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 py-4">
                <p className="text-sm text-slate-500 dark:text-[#64748B]">
                  No time blocks match this filter for {selectedDayMeta.title}.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onQuickAdd('tasks', selectedDate)}
                    className="min-h-[38px] rounded-full bg-indigo-50 dark:bg-[#6366F1]/15 px-3.5 text-xs font-medium text-indigo-700 dark:text-[#818CF8] border border-indigo-200 dark:border-[#6366F1]/35 cursor-pointer"
                  >
                    + Add Task
                  </button>
                  <button
                    type="button"
                    onClick={() => onQuickAdd('reminders', selectedDate)}
                    className="min-h-[38px] rounded-full bg-emerald-50 dark:bg-[#10B981]/15 px-3.5 text-xs font-medium text-emerald-700 dark:text-[#34D399] border border-emerald-200 dark:border-[#10B981]/35 cursor-pointer"
                  >
                    + Add Reminder
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {groupedTimeline.map((group) => (
                  <div key={group.window}>
                    <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-200 dark:border-white/[0.06]">
                      <span className="text-xs font-semibold tracking-wide text-slate-800 dark:text-[#F8FAFC]">
                        {group.label}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 dark:text-[#64748B] tabular-nums">
                        {group.range}
                      </span>
                    </div>

                    <div className="divide-y divide-slate-200 dark:divide-white/[0.06]">
                      {group.entries.map((entry) => {
                        const pMeta = entry.priority
                          ? PRIORITY_META[entry.priority]
                          : null;

                        return (
                          <div
                            key={entry.uid}
                            className="flex items-start gap-3 py-3 first:pt-1 last:pb-0"
                          >
                            {entry.kind === 'task' && entry.task ? (
                              <TactileCheckbox
                                checked={Boolean(entry.completed)}
                                onChange={() => onToggleTask(entry.task!.id)}
                                ariaLabel={`Complete ${entry.title}`}
                              />
                            ) : entry.kind === 'reminder' && entry.reminder ? (
                              <TactileCheckbox
                                checked={Boolean(entry.completed)}
                                onChange={() => onToggleReminderDone(entry.reminder!.id)}
                                ariaLabel={`Complete reminder ${entry.title}`}
                              />
                            ) : (
                              <div className="flex h-6 w-6 mt-0.5 shrink-0 items-center justify-center rounded-full bg-amber-50 dark:bg-[#F59E0B]/15 text-amber-600 dark:text-[#F59E0B]">
                                <AlarmClock className="h-3.5 w-3.5" />
                              </div>
                            )}

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                                <span className="font-mono font-semibold text-slate-900 dark:text-[#F8FAFC] tabular-nums">
                                  {entry.timeDisplay}
                                </span>
                                <span className="text-slate-400 dark:text-[#64748B]" aria-hidden="true">
                                  ·
                                </span>
                                <span className="text-slate-500 dark:text-[#94A3B8]">
                                  {entry.categoryLabel}
                                </span>
                                {pMeta && (
                                  <>
                                    <span className="text-slate-400 dark:text-[#64748B]" aria-hidden="true">
                                      ·
                                    </span>
                                    <span className={`font-semibold ${pMeta.textClass}`}>
                                      {pMeta.label}
                                    </span>
                                  </>
                                )}
                              </div>

                              <p
                                className={`mt-0.5 text-sm font-medium select-text ${
                                  entry.completed
                                    ? 'line-through text-slate-400 dark:text-[#64748B]'
                                    : 'text-slate-900 dark:text-[#F8FAFC]'
                                }`}
                              >
                                {entry.title}
                              </p>

                              {entry.subtitle && !entry.completed && (
                                <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-[#64748B] select-text">
                                  {entry.subtitle}
                                </p>
                              )}
                            </div>

                            {entry.kind === 'alarm' && entry.alarm && (
                              <div className="shrink-0">
                                <GlowingToggle
                                  checked={Boolean(entry.alarmEnabled)}
                                  onChange={(next) =>
                                    onToggleAlarm(entry.alarm!.id, next)
                                  }
                                  ariaLabel={`Toggle ${entry.title}`}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Focus Timer, Alarms for Selected Day, Day & Recent Notes */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <div className="rounded-[28px] bg-white dark:bg-[#1A1D2D]/80 border border-slate-200 dark:border-white/[0.08] p-5 sm:p-6 shadow-xs dark:shadow-none flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-slate-900 dark:text-[#F8FAFC]">
                  Focus Timer
                </h3>
                {focusState.running && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-[#34D399]/15 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-[#34D399] border border-emerald-200 dark:border-[#34D399]/35">
                    <ShieldCheck className="h-3 w-3" />
                    {focusState.dndActive ? 'DND Active' : 'Focusing'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {[15, 25, 45, 60].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => onSelectFocusPreset(m)}
                    className={`min-h-[30px] rounded-full px-2.5 text-xs font-medium tabular-nums transition-colors cursor-pointer ${
                      focusState.presetMinutes === m
                        ? 'bg-indigo-50 dark:bg-[#6366F1]/25 text-indigo-700 dark:text-[#c0c1ff] border border-indigo-300 dark:border-[#6366F1]/45'
                        : 'bg-slate-100 dark:bg-[#12141F] text-slate-600 dark:text-[#94A3B8] border border-slate-200 dark:border-white/[0.06]'
                    }`}
                  >
                    {m}m
                  </button>
                ))}
              </div>
            </div>

            {/* Optional Focus Task Selector */}
            <div>
              <select
                aria-label="Focus session task"
                value={focusState.linkedTaskId ?? ''}
                onChange={(e) =>
                  onSelectFocusTask(e.target.value ? e.target.value : null)
                }
                className="min-h-[38px] w-full rounded-2xl bg-slate-50 dark:bg-[#12141F] px-3 text-xs text-slate-700 dark:text-[#cbd5e1] border border-slate-200 dark:border-white/[0.06] focus:border-[#6366F1] focus:outline-none cursor-pointer"
              >
                <option value="">Free Focus Session (no linked task)</option>
                {pendingFocusTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    Focus on: {t.title} ({t.dueTime})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="relative h-[124px] w-[124px] shrink-0">
                <svg className="h-full w-full -rotate-90" viewBox="0 0 124 124" aria-hidden="true">
                  <circle
                    cx="62"
                    cy="62"
                    r={r}
                    fill="none"
                    className="stroke-slate-200 dark:stroke-white/[0.08]"
                    strokeWidth="6"
                  />
                  <circle
                    cx="62"
                    cy="62"
                    r={r}
                    fill="none"
                    stroke={focusState.running && focusState.dndActive ? '#10B981' : '#6366F1'}
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={circ}
                    strokeDashoffset={dashOffset}
                    className="transition-[stroke-dashoffset] duration-300 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center font-mono text-2xl font-semibold text-slate-900 dark:text-[#F8FAFC] tabular-nums">
                  {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
                </div>
              </div>

              <div className="flex flex-1 flex-col gap-2.5">
                <button
                  type="button"
                  onClick={onToggleFocusRunning}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#6366F1] to-[#818CF8] text-xs font-semibold text-white shadow-[0_0_16px_rgba(99,102,241,0.35)] cursor-pointer"
                >
                  {focusState.running ? (
                    <>
                      <Pause className="h-3.5 w-3.5 fill-current" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5 fill-current" />
                      {focusState.secondsLeft > 0 &&
                      focusState.secondsLeft < focusState.presetMinutes * 60
                        ? 'Resume Focus'
                        : 'Start Focus'}
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={onResetFocus}
                  className="flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-full bg-slate-100 dark:bg-white/[0.05] text-xs font-medium text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F8FAFC] border border-slate-200 dark:border-white/10 cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset
                </button>
              </div>
            </div>

            {isNativeAndroid && focusAutoDndEnabled && !dndAccessGranted && onEnableDndAccess && (
              <div className="rounded-2xl bg-amber-50 dark:bg-[#F59E0B]/10 border border-amber-200 dark:border-[#F59E0B]/30 px-3.5 py-2.5 flex items-center justify-between gap-2.5">
                <p className="text-[11px] leading-snug text-amber-800 dark:text-[#FCD34D]">
                  {focusState.running
                    ? 'Do Not Disturb access is off — WhatsApp & calls are not silenced yet.'
                    : 'Allow Do Not Disturb access so Focus silences WhatsApp & incoming calls.'}
                </p>
                <button
                  type="button"
                  onClick={onEnableDndAccess}
                  className="min-h-[32px] shrink-0 rounded-full bg-amber-500 px-3 text-[11px] font-semibold text-slate-950 cursor-pointer whitespace-nowrap"
                >
                  Enable DND
                </button>
              </div>
            )}

            {focusState.running && focusState.dndActive && (
              <p className="text-[11px] leading-snug text-emerald-700 dark:text-[#34D399]">
                Do Not Disturb active — WhatsApp, app notifications &amp; call ringers are silenced until Focus finishes.
              </p>
            )}
          </div>

          <div className="rounded-[28px] bg-white dark:bg-[#1A1D2D]/75 border border-slate-200 dark:border-white/[0.08] p-5 sm:p-6 shadow-xs dark:shadow-none">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-[#F8FAFC]">
                  Alarms · {selectedDayMeta.weekdayLong}
                </h3>
                <p className="text-xs text-slate-500 dark:text-[#64748B] tabular-nums">
                  {dayAlarms.length} scheduled for {selectedDayMeta.weekdayShort}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('alarms')}
                className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-[#F59E0B] hover:opacity-80 transition-opacity cursor-pointer"
              >
                Manage Alarms
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {dayAlarms.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-[#64748B] py-3">
                No alarms scheduled for {selectedDayMeta.weekdayLong}s.
              </p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-white/[0.06]">
                {dayAlarms.map((alarm) => {
                  const h12 = alarm.hour24 % 12 || 12;
                  const period = alarm.hour24 >= 12 ? 'PM' : 'AM';
                  const repeatLabel =
                    alarm.days.length === 7
                      ? 'Every day'
                      : alarm.days.length === 0
                        ? 'One-time'
                        : alarm.days.map((d) => DAY_SHORT_CODES[d]).join(' · ');
                  return (
                    <div
                      key={alarm.id}
                      className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <div className="font-mono text-lg font-semibold text-slate-900 dark:text-[#F8FAFC] tabular-nums">
                          {String(h12).padStart(2, '0')}:
                          {String(alarm.minute).padStart(2, '0')}{' '}
                          <span className="text-xs text-amber-600 dark:text-[#F59E0B]">
                            {period}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-[#94A3B8] truncate">
                          {alarm.label} · {repeatLabel}
                        </p>
                      </div>
                      <GlowingToggle
                        checked={alarm.enabled}
                        onChange={(next) => onToggleAlarm(alarm.id, next)}
                        ariaLabel={`Toggle ${alarm.label}`}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-[28px] bg-white dark:bg-[#1A1D2D]/75 border border-slate-200 dark:border-white/[0.08] p-5 sm:p-6 shadow-xs dark:shadow-none">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-[#F8FAFC]">
                  Notes · {selectedDayMeta.title}
                </h3>
                <p className="text-xs text-slate-500 dark:text-[#64748B] tabular-nums">
                  {dayNotes.length > 0
                    ? `${dayNotes.length} updated on ${selectedDayMeta.shortLabel}`
                    : `No notes updated on ${selectedDayMeta.shortLabel}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('notes')}
                className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-[#818CF8] hover:opacity-80 transition-opacity cursor-pointer"
              >
                All Notes
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {dayNotes.length > 0 ? (
              <div className="divide-y divide-slate-200 dark:divide-white/[0.06]">
                {dayNotes.map((note) => (
                  <div key={note.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <button
                        type="button"
                        onClick={() => onNavigate('notes')}
                        className="flex min-w-0 items-center gap-1.5 text-left hover:opacity-80 transition-opacity cursor-pointer"
                      >
                        {note.pinned && (
                          <Pin className="h-3 w-3 shrink-0 text-indigo-500 dark:text-[#818CF8]" />
                        )}
                        <span className="truncate text-sm font-semibold text-slate-900 dark:text-[#F8FAFC]">
                          {note.title}
                        </span>
                      </button>
                      <span className="shrink-0 rounded-full bg-slate-100 dark:bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:text-[#94A3B8]">
                        {note.category}
                      </span>
                    </div>
                    <FormattedNoteContent
                      content={note.content}
                      compact
                      maxLines={4}
                      textSize="xs"
                      onToggleChecklistLine={
                        onToggleNoteChecklistLine
                          ? (lineIdx) => {
                              soundEngine.playTick(840, 0.015);
                              onToggleNoteChecklistLine(note.id, lineIdx);
                            }
                          : undefined
                      }
                    />
                  </div>
                ))}
              </div>
            ) : recentNotes.length > 0 ? (
              <div>
                <p className="text-xs text-slate-500 dark:text-[#64748B] mb-2">
                  Recent &amp; pinned notes
                </p>
                <div className="divide-y divide-slate-200 dark:divide-white/[0.06]">
                  {recentNotes.map((note) => (
                    <div key={note.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <button
                          type="button"
                          onClick={() => onNavigate('notes')}
                          className="flex min-w-0 items-center gap-1.5 text-left hover:opacity-80 transition-opacity cursor-pointer"
                        >
                          {note.pinned && (
                            <Pin className="h-3 w-3 shrink-0 text-indigo-500 dark:text-[#818CF8]" />
                          )}
                          <span className="truncate text-sm font-semibold text-slate-900 dark:text-[#F8FAFC]">
                            {note.title}
                          </span>
                        </button>
                        <span className="shrink-0 rounded-full bg-slate-100 dark:bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:text-[#94A3B8]">
                          {note.category}
                        </span>
                      </div>
                      <FormattedNoteContent
                        content={note.content}
                        compact
                        maxLines={4}
                        textSize="xs"
                        onToggleChecklistLine={
                          onToggleNoteChecklistLine
                            ? (lineIdx) => {
                                soundEngine.playTick(840, 0.015);
                                onToggleNoteChecklistLine(note.id, lineIdx);
                              }
                            : undefined
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500 dark:text-[#64748B] py-2">
                No notes yet. Tap + to capture one.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
