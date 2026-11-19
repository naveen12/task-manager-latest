import React, { useEffect, useRef, useState } from 'react';
import {
  AlarmClock,
  BellRing,
  Clock,
  FolderOpen,
  Music,
  Pencil,
  Plus,
  Smartphone,
  Square,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import {
  ALARM_SNOOZE_PRESETS,
  type AlarmTone,
  type AlarmVibrationMode,
  type ChronoAlarm,
} from '../types/chrono';
import { GlowingToggle } from './GlowingToggle';
import { TemporalWheel } from './TemporalWheel';
import { soundEngine } from '../utils/soundEngine';
import {
  deleteCustomRingtone,
  listCustomRingtones,
  saveCustomRingtone,
  type SavedRingtoneMeta,
} from '../utils/ringtoneStore';
import { CopyButton, PasteButton } from './ClipboardButtons';

interface AlarmsSectionProps {
  alarms: ChronoAlarm[];
  autoOpenCreateKey?: number;
  onToggleAlarm: (id: string, enabled: boolean) => void;
  onSaveAlarm: (alarm: Omit<ChronoAlarm, 'id'>, existingId?: string) => void;
  onDeleteAlarm: (id: string) => void;
  onTriggerTestRing: (alarm: ChronoAlarm) => void;
}

const WEEK_DAYS = [
  { idx: 1, short: 'M', name: 'Monday' },
  { idx: 2, short: 'T', name: 'Tuesday' },
  { idx: 3, short: 'W', name: 'Wednesday' },
  { idx: 4, short: 'T', name: 'Thursday' },
  { idx: 5, short: 'F', name: 'Friday' },
  { idx: 6, short: 'S', name: 'Saturday' },
  { idx: 0, short: 'S', name: 'Sunday' },
];

const TONES: { id: Exclude<AlarmTone, 'custom'>; label: string }[] = [
  { id: 'dawn', label: 'Dawn Chime' },
  { id: 'zenith', label: 'Zenith Bell' },
  { id: 'amber', label: 'Amber Tone' },
  { id: 'pulse', label: 'Crisp Pulse' },
];

const VIBRATION_MODES: {
  id: AlarmVibrationMode;
  label: string;
  short: string;
}[] = [
  { id: 'sound_and_vibrate', label: 'Sound + Vibrate', short: 'Sound + Vib' },
  { id: 'vibrate_only', label: 'Vibrate Only', short: 'Vibrate only' },
  { id: 'sound_only', label: 'Sound Only', short: 'Sound only' },
];

function formatDaysSummary(days: number[]): string {
  if (days.length === 7) return 'Every day';
  if (days.length === 0) return 'Once';
  const sorted = [...days].sort((a, b) => a - b).join(',');
  if (sorted === '1,2,3,4,5') return 'Weekdays';
  if (sorted === '0,6') return 'Weekends';
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days.map((d) => names[d]).join(' ');
}

export const AlarmsSection: React.FC<AlarmsSectionProps> = ({
  alarms,
  autoOpenCreateKey,
  onToggleAlarm,
  onSaveAlarm,
  onDeleteAlarm,
  onTriggerTestRing,
}) => {
  const [editorOpen, setEditorOpen] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [hour24, setHour24] = useState<number>(7);
  const [minute, setMinute] = useState<number>(0);
  const [label, setLabel] = useState<string>('Morning Wake');
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [tone, setTone] = useState<AlarmTone>('dawn');
  const [customRingtoneId, setCustomRingtoneId] = useState<string | undefined>(
    undefined
  );
  const [customRingtoneName, setCustomRingtoneName] = useState<string | undefined>(
    undefined
  );
  const [snoozeMinutes, setSnoozeMinutes] = useState<number>(5);
  const [vibrationMode, setVibrationMode] =
    useState<AlarmVibrationMode>('sound_and_vibrate');

  // OS Ringtone Library (stored persistently in IndexedDB)
  const [osRingtones, setOsRingtones] = useState<SavedRingtoneMeta[]>([]);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [ringtoneError, setRingtoneError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void listCustomRingtones().then(setOsRingtones);
    return () => {
      soundEngine.stopAlarmLoop();
    };
  }, []);

  const openEditAlarm = (alarm: ChronoAlarm) => {
    soundEngine.playTick(800, 0.02);
    setEditingId(alarm.id);
    setHour24(alarm.hour24);
    setMinute(alarm.minute);
    setLabel(alarm.label);
    setDays(alarm.days);
    setTone(alarm.tone);
    setCustomRingtoneId(alarm.customRingtoneId);
    setCustomRingtoneName(alarm.customRingtoneName);
    setSnoozeMinutes(alarm.snoozeMinutes ?? 5);
    setVibrationMode(alarm.vibrationMode ?? 'sound_and_vibrate');
    setRingtoneError(null);
    setEditorOpen(true);
  };

  const openNewAlarm = () => {
    soundEngine.playTick(920, 0.02);
    setEditingId(null);
    setHour24(7);
    setMinute(0);
    setLabel('New Alarm');
    setDays([1, 2, 3, 4, 5]);
    setTone('dawn');
    setCustomRingtoneId(undefined);
    setCustomRingtoneName(undefined);
    setSnoozeMinutes(5);
    setVibrationMode('sound_and_vibrate');
    setRingtoneError(null);
    setEditorOpen(true);
  };

  useEffect(() => {
    if (autoOpenCreateKey && autoOpenCreateKey > 0) {
      openNewAlarm();
    }
  }, [autoOpenCreateKey]);

  const closeEditor = () => {
    soundEngine.stopAlarmLoop();
    setPreviewingId(null);
    setEditorOpen(false);
    setEditingId(null);
  };

  const toggleDay = (dayIdx: number) => {
    soundEngine.playTick(760, 0.015);
    setDays((prev) =>
      prev.includes(dayIdx) ? prev.filter((d) => d !== dayIdx) : [...prev, dayIdx]
    );
  };

  const handlePickOsRingtone = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setRingtoneError(null);
    if (!file.type.startsWith('audio/') && !/\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i.test(file.name)) {
      setRingtoneError('Please select a valid audio or ringtone file (.mp3, .ogg, .wav, .m4a).');
      return;
    }

    try {
      const saved = await saveCustomRingtone(file);
      const updated = await listCustomRingtones();
      setOsRingtones(updated);
      setTone('custom');
      setCustomRingtoneId(saved.id);
      setCustomRingtoneName(saved.name);
      setPreviewingId(saved.id);
      void soundEngine.playCustomRingtone(saved.id, false, () => {
        setPreviewingId((prev) => (prev === saved.id ? null : prev));
      });
    } catch (err) {
      setRingtoneError(
        err instanceof Error ? err.message : 'Unable to import OS ringtone.'
      );
    }
  };

  const handleSelectSavedRingtone = (item: SavedRingtoneMeta) => {
    setTone('custom');
    setCustomRingtoneId(item.id);
    setCustomRingtoneName(item.name);
    if (previewingId === item.id) {
      soundEngine.stopAlarmLoop();
      setPreviewingId(null);
    } else {
      setPreviewingId(item.id);
      void soundEngine.playCustomRingtone(item.id, false, () => {
        setPreviewingId((prev) => (prev === item.id ? null : prev));
      });
    }
  };

  const handleRemoveSavedRingtone = async (id: string) => {
    if (previewingId === id) {
      soundEngine.stopAlarmLoop();
      setPreviewingId(null);
    }
    await deleteCustomRingtone(id);
    const updated = await listCustomRingtones();
    setOsRingtones(updated);
    if (customRingtoneId === id) {
      setTone('dawn');
      setCustomRingtoneId(undefined);
      setCustomRingtoneName(undefined);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    soundEngine.stopAlarmLoop();
    soundEngine.playTick(1020, 0.03);
    const useCustom = tone === 'custom' && Boolean(customRingtoneId);
    onSaveAlarm(
      {
        hour24,
        minute,
        label: label.trim() || 'Kairo Alarm',
        enabled: true,
        days,
        tone: useCustom ? 'custom' : tone === 'custom' ? 'dawn' : tone,
        customRingtoneId: useCustom ? customRingtoneId : undefined,
        customRingtoneName: useCustom ? customRingtoneName : undefined,
        snoozeMinutes,
        vibrationMode,
      },
      editingId ?? undefined
    );
    closeEditor();
  };

  const sortedAlarms = [...alarms].sort(
    (a, b) => a.hour24 * 60 + a.minute - (b.hour24 * 60 + b.minute)
  );

  return (
    <section className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-[#F8FAFC] tracking-tight">
            Alarms
          </h2>
          <p className="text-xs text-slate-600 dark:text-[#94A3B8] tabular-nums mt-0.5">
            {alarms.filter((a) => a.enabled).length} of {alarms.length} active
          </p>
        </div>

        <button
          type="button"
          onClick={() => (editorOpen ? closeEditor() : openNewAlarm())}
          className="flex min-h-[44px] items-center gap-2 rounded-full bg-gradient-to-r from-[#6366F1] to-[#818CF8] px-5 py-2 text-xs font-semibold text-white shadow-[0_0_16px_rgba(99,102,241,0.35),inset_0_1px_0_rgba(255,255,255,0.3)] active:scale-[0.98] transition-all whitespace-nowrap shrink-0 cursor-pointer"
        >
          {editorOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {editorOpen ? 'Close' : 'New Alarm'}
        </button>
      </div>

      {/* Create / Edit Alarm Editor */}
      {editorOpen && (
        <form
          onSubmit={handleSave}
          className="rounded-[32px] bg-white dark:bg-[#1A1D2D] border border-indigo-300 dark:border-[#6366F1]/40 p-5 sm:p-6 flex flex-col gap-5 shadow-lg dark:shadow-[0_16px_48px_rgba(0,0,0,0.5)]"
        >
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-slate-900 dark:text-[#F8FAFC]">
              {editingId ? 'Edit Alarm' : 'Create New Alarm'}
            </h3>
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-indigo-600 dark:text-[#818CF8] tabular-nums">
                {String(hour24 % 12 || 12).padStart(2, '0')}:
                {String(minute).padStart(2, '0')} {hour24 >= 12 ? 'PM' : 'AM'}
              </span>
              <button
                type="button"
                onClick={closeEditor}
                aria-label="Close alarm editor"
                className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 dark:text-[#94A3B8] hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-[#F8FAFC] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <TemporalWheel
            hour24={hour24}
            minute={minute}
            onChange={(h, m) => {
              setHour24(h);
              setMinute(m);
            }}
          />

          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label
                htmlFor="alarm-label-input"
                className="block text-xs font-medium text-slate-600 dark:text-[#94A3B8]"
              >
                Alarm Label
              </label>
              <div className="flex items-center gap-1.5">
                {label && <CopyButton text={label} ariaLabel="Copy alarm label" />}
                <PasteButton
                  targetInputId="alarm-label-input"
                  onPasteText={(val) => setLabel(val)}
                />
              </div>
            </div>
            <input
              id="alarm-label-input"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Morning Wake"
              className="min-h-[50px] w-full rounded-2xl bg-slate-50 dark:bg-[#161926] px-4 py-2 text-[15px] text-slate-900 dark:text-[#F8FAFC] placeholder:text-slate-400 dark:placeholder:text-[#64748B] border border-slate-200 dark:border-white/[0.08] focus:border-[#6366F1] focus:outline-none focus:ring-3 focus:ring-[#6366F1]/25"
            />
          </div>

          <div>
            <span className="block text-xs font-medium text-slate-600 dark:text-[#94A3B8] mb-2">
              Repeat Cadence
            </span>
            <div className="grid grid-cols-7 gap-1.5">
              {WEEK_DAYS.map((d) => {
                const selected = days.includes(d.idx);
                return (
                  <button
                    key={d.idx}
                    type="button"
                    aria-label={d.name}
                    aria-pressed={selected}
                    onClick={() => toggleDay(d.idx)}
                    className={`flex h-11 items-center justify-center rounded-full text-xs font-semibold transition-all cursor-pointer ${
                      selected
                        ? 'bg-[#6366F1] text-white shadow-[0_0_12px_rgba(99,102,241,0.45)]'
                        : 'bg-slate-100 dark:bg-[#12141F] text-slate-600 dark:text-[#94A3B8] border border-slate-200 dark:border-white/[0.06] hover:text-slate-900 dark:hover:text-[#F8FAFC]'
                    }`}
                  >
                    {d.short}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="block text-xs font-medium text-slate-600 dark:text-[#94A3B8] mb-2">
              Built-in Acoustic Tone
            </span>
            <div className="grid grid-cols-2 gap-2">
              {TONES.map((t) => {
                const active = tone === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setPreviewingId(null);
                      setTone(t.id);
                      soundEngine.playAlarmToneOnce(t.id);
                    }}
                    className={`flex min-h-[44px] items-center justify-between rounded-2xl px-3.5 py-2 text-xs font-medium transition-all cursor-pointer ${
                      active
                        ? 'bg-indigo-50 dark:bg-[#6366F1]/20 text-indigo-700 dark:text-[#F8FAFC] border border-indigo-400 dark:border-[#6366F1]/50'
                        : 'bg-slate-100 dark:bg-[#12141F] text-slate-600 dark:text-[#94A3B8] border border-slate-200 dark:border-white/[0.06] hover:text-slate-900 dark:hover:text-[#F8FAFC]'
                    }`}
                  >
                    <span>{t.label}</span>
                    <Volume2 className="h-3.5 w-3.5 opacity-70 shrink-0" />
                  </button>
                );
              })}
            </div>

            {/* OS Ringtone / Device Audio Picker */}
            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-white/[0.06]">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                <div>
                  <span className="block text-xs font-medium text-slate-700 dark:text-[#F8FAFC]">
                    OS Ringtone &amp; Device Audio
                  </span>
                  <span className="block text-[11px] text-slate-500 dark:text-[#94A3B8]">
                    Select a ringtone, notification sound, or audio file from your device
                  </span>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*,.mp3,.ogg,.wav,.m4a,.aac,.flac,.opus"
                  onChange={handlePickOsRingtone}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex min-h-[40px] items-center gap-2 rounded-full bg-slate-100 dark:bg-white/[0.06] px-4 text-xs font-medium text-slate-800 dark:text-[#F8FAFC] border border-slate-200 dark:border-white/10 hover:border-indigo-400 dark:hover:border-[#6366F1]/50 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <FolderOpen className="h-3.5 w-3.5 text-indigo-600 dark:text-[#818CF8]" />
                  Browse OS Ringtones
                </button>
              </div>

              {ringtoneError && (
                <p role="alert" className="text-xs text-red-600 dark:text-[#ffb4ab] mb-2">
                  {ringtoneError}
                </p>
              )}

              {osRingtones.length > 0 && (
                <div className="flex flex-col gap-1.5 mt-2">
                  {osRingtones.map((item) => {
                    const isSelected = tone === 'custom' && customRingtoneId === item.id;
                    const isPlaying = previewingId === item.id;
                    return (
                      <div
                        key={item.id}
                        className={`flex items-center justify-between gap-2 rounded-2xl px-3 py-1.5 border transition-colors ${
                          isSelected
                            ? 'bg-indigo-50 dark:bg-[#6366F1]/20 border-indigo-400 dark:border-[#6366F1]/50'
                            : 'bg-slate-50 dark:bg-[#12141F] border-slate-200 dark:border-white/[0.06]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleSelectSavedRingtone(item)}
                          className="flex min-h-[38px] min-w-0 flex-1 items-center gap-2.5 text-left cursor-pointer"
                        >
                          {isPlaying ? (
                            <Square className="h-3.5 w-3.5 text-amber-600 dark:text-[#F59E0B] fill-current shrink-0" />
                          ) : (
                            <Music className="h-3.5 w-3.5 text-indigo-600 dark:text-[#818CF8] shrink-0" />
                          )}
                          <span
                            className={`truncate text-xs font-medium ${
                              isSelected
                                ? 'text-indigo-700 dark:text-[#F8FAFC]'
                                : 'text-slate-700 dark:text-[#94A3B8]'
                            }`}
                          >
                            {item.name}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleRemoveSavedRingtone(item.id)}
                          aria-label={`Remove ${item.name}`}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 dark:text-[#64748B] hover:text-red-600 dark:hover:text-[#ffb4ab] cursor-pointer shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Snooze Duration & Vibration Mode Presets */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200 dark:border-white/[0.06]">
            <div>
              <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-[#94A3B8] mb-2">
                <Clock className="h-3.5 w-3.5 text-indigo-600 dark:text-[#818CF8]" />
                Snooze Preset
              </span>
              <div className="grid grid-cols-5 gap-1.5">
                {ALARM_SNOOZE_PRESETS.map((mins) => {
                  const active = snoozeMinutes === mins;
                  return (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => {
                        soundEngine.playTick(760, 0.015);
                        setSnoozeMinutes(mins);
                      }}
                      className={`min-h-[40px] rounded-2xl font-mono text-xs font-semibold transition-all cursor-pointer ${
                        active
                          ? 'bg-[#6366F1] text-white shadow-[0_0_12px_rgba(99,102,241,0.35)]'
                          : 'bg-slate-100 dark:bg-[#12141F] text-slate-600 dark:text-[#94A3B8] border border-slate-200 dark:border-white/[0.06]'
                      }`}
                    >
                      {mins}m
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-[#94A3B8] mb-2">
                <Smartphone className="h-3.5 w-3.5 text-amber-600 dark:text-[#F59E0B]" />
                Vibration &amp; Ring Mode
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {VIBRATION_MODES.map((mode) => {
                  const active = vibrationMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => {
                        soundEngine.playTick(780, 0.015);
                        setVibrationMode(mode.id);
                      }}
                      className={`min-h-[40px] rounded-2xl px-2 text-[11px] font-semibold transition-all cursor-pointer ${
                        active
                          ? 'bg-amber-50 dark:bg-[#F59E0B]/15 text-amber-700 dark:text-[#FCD34D] border border-amber-400 dark:border-[#F59E0B]/50'
                          : 'bg-slate-100 dark:bg-[#12141F] text-slate-600 dark:text-[#94A3B8] border border-slate-200 dark:border-white/[0.06]'
                      }`}
                    >
                      {mode.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={closeEditor}
              className="min-h-[44px] rounded-full px-5 text-xs font-medium text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F8FAFC] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="min-h-[44px] rounded-full bg-gradient-to-r from-[#6366F1] to-[#818CF8] px-7 text-xs font-semibold text-white shadow-[0_0_20px_rgba(99,102,241,0.45),inset_0_1px_0_rgba(255,255,255,0.3)] active:scale-[0.98] transition-all cursor-pointer"
            >
              {editingId ? 'Save Changes' : 'Save Alarm'}
            </button>
          </div>
        </form>
      )}

      {/* Alarm List */}
      {sortedAlarms.length === 0 ? (
        <div className="rounded-[28px] bg-white/70 dark:bg-[#1A1D2D]/50 border border-slate-200 dark:border-white/[0.06] p-8 text-center">
          <AlarmClock className="mx-auto h-6 w-6 text-slate-400 dark:text-[#64748B] mb-2" />
          <p className="text-sm font-medium text-slate-900 dark:text-[#F8FAFC]">
            No alarms configured
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-[#64748B]">
            Tap &ldquo;New Alarm&rdquo; to set a wake or focus checkpoint alarm.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {sortedAlarms.map((alarm) => {
            const h12 = alarm.hour24 % 12 || 12;
            const period = alarm.hour24 >= 12 ? 'PM' : 'AM';
            const timeStr = `${String(h12).padStart(2, '0')}:${String(
              alarm.minute
            ).padStart(2, '0')}`;
            const isSelected = editorOpen && editingId === alarm.id;
            const toneLabel =
              alarm.vibrationMode === 'vibrate_only'
                ? 'Silent (Vibrate Only)'
                : alarm.tone === 'custom'
                ? alarm.customRingtoneName || 'OS Ringtone'
                : (TONES.find((t) => t.id === alarm.tone)?.label ?? 'Dawn Chime');
            const alarmSnooze = alarm.snoozeMinutes ?? 5;
            const vibSummary =
              VIBRATION_MODES.find(
                (v) => v.id === (alarm.vibrationMode ?? 'sound_and_vibrate')
              )?.short ?? 'Sound + Vib';

            return (
              <div
                key={alarm.id}
                className={`flex items-center justify-between gap-3 rounded-[28px] p-4 sm:p-5 transition-all border shadow-xs dark:shadow-none ${
                  isSelected
                    ? 'bg-white dark:bg-[#1A1D2D] border-indigo-400 dark:border-[#6366F1]/50 shadow-[0_0_24px_rgba(99,102,241,0.14)]'
                    : 'bg-white dark:bg-[#1A1D2D]/75 border-slate-200 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/15'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 font-mono tabular-nums">
                    <span
                      className={`text-3xl font-semibold tracking-tight ${
                        alarm.enabled
                          ? 'text-slate-900 dark:text-[#F8FAFC]'
                          : 'text-slate-400 dark:text-[#64748B]'
                      }`}
                    >
                      {timeStr}
                    </span>
                    <span
                      className={`text-sm font-medium ${
                        alarm.enabled
                          ? 'text-amber-600 dark:text-[#F59E0B]'
                          : 'text-slate-400 dark:text-[#64748B]'
                      }`}
                    >
                      {period}
                    </span>
                  </div>

                  <p className="mt-1 truncate text-sm font-medium text-slate-900 dark:text-[#F8FAFC] select-text">
                    {alarm.label}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-[#94A3B8] select-text">
                    {formatDaysSummary(alarm.days)} · {toneLabel} · {alarmSnooze}m snooze · {vibSummary}
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <CopyButton
                    compact
                    text={`${timeStr} ${period} — ${alarm.label} (${formatDaysSummary(alarm.days)})`}
                    ariaLabel={`Copy alarm ${alarm.label}`}
                  />
                  <button
                    type="button"
                    onClick={() => onTriggerTestRing(alarm)}
                    title="Preview Alarm Ring"
                    aria-label={`Preview ${alarm.label}`}
                    className="flex h-11 w-11 items-center justify-center rounded-full text-amber-600 dark:text-[#F59E0B] hover:bg-amber-50 dark:hover:bg-[#F59E0B]/10 transition-colors cursor-pointer"
                  >
                    <BellRing className="h-4 w-4" />
                  </button>

                  <GlowingToggle
                    checked={alarm.enabled}
                    onChange={(next) => onToggleAlarm(alarm.id, next)}
                    ariaLabel={`Toggle ${alarm.label}`}
                  />

                  <button
                    type="button"
                    onClick={() => openEditAlarm(alarm)}
                    aria-label={`Edit ${alarm.label}`}
                    className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500 dark:text-[#94A3B8] hover:bg-slate-100 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-[#F8FAFC] transition-colors cursor-pointer"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (editingId === alarm.id) closeEditor();
                      onDeleteAlarm(alarm.id);
                    }}
                    aria-label={`Delete ${alarm.label}`}
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
