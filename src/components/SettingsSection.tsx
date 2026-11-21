import React, { useState } from 'react';
import type { User } from 'firebase/auth';
import {
  BellRing,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cloud,
  HelpCircle,
  Info,
  Minus,
  Moon,
  Plus,
  Repeat,
  RotateCcw,
  Shield,
  Smartphone,
  Sun,
  Type,
  Volume2,
} from 'lucide-react';
import { GlowingToggle } from './GlowingToggle';
import {
  DEFAULT_SETTINGS,
  type AppFontFamily,
  type AppSettings,
  type ChronoAlarm,
  type NoteItem,
  type ReminderItem,
  type TaskItem,
  type ThemeMode,
} from '../types/chrono';
import { BackupSection } from './BackupSection';
import { HelpAboutSection } from './HelpAboutSection';
import type { ChronoBackupPayload } from '../utils/googleDriveBackup';
import type { NotificationPermissionState } from '../utils/notificationEngine';
import type {
  AndroidAlertPermissionsStatus,
  AndroidPermissionAction,
} from '../utils/nativeAndroidBridge';
import { soundEngine } from '../utils/soundEngine';

interface SettingsSectionProps {
  settings: AppSettings;
  onUpdateSettings: (next: AppSettings) => void;
  googleUser: User | null;
  needsGoogleAuth: boolean;
  onAuthUpdated: (user: User | null, needsAuth: boolean) => void;
  tasks: TaskItem[];
  reminders: ReminderItem[];
  alarms: ChronoAlarm[];
  notes: NoteItem[];
  onRestoreBackup: (payload: ChronoBackupPayload) => void;
  onRunAutoBackupNow?: () => Promise<void>;
  onRefreshWidget?: () => void;
  notificationPermission: NotificationPermissionState;
  onRequestNotificationPermission: () => void;
  onTestLockScreenAlert?: () => Promise<boolean>;
  androidPermissions?: AndroidAlertPermissionsStatus;
  onTriggerAndroidPermission?: (kind: AndroidPermissionAction) => void;
  onResetAllData?: () => void;
}

type SettingsSectionKey =
  | 'theme'
  | 'notifications'
  | 'typography'
  | 'backup'
  | 'help'
  | 'about';

const INITIAL_OPEN_SECTIONS: Record<SettingsSectionKey, boolean> = {
  theme: false,
  notifications: false,
  typography: false,
  backup: false,
  help: false,
  about: false,
};

interface SettingsAccordionCardProps {
  id?: string;
  isOpen: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  iconBgClass: string;
  title: string;
  subtitle: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}

const SettingsAccordionCard: React.FC<SettingsAccordionCardProps> = ({
  id,
  isOpen,
  onToggle,
  icon,
  iconBgClass,
  title,
  subtitle,
  badge,
  children,
}) => {
  const bodyId = id ? `${id}-body` : undefined;
  return (
    <div
      id={id}
      className="rounded-[28px] bg-white dark:bg-[#1A1D2D]/80 border border-slate-200 dark:border-white/[0.08] shadow-sm dark:shadow-none overflow-hidden"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={bodyId}
        className="w-full flex items-center justify-between gap-3 p-5 sm:p-6 text-left hover:bg-slate-50/70 dark:hover:bg-white/[0.02] transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${iconBgClass}`}
          >
            {icon}
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-900 dark:text-[#F8FAFC]">
              {title}
            </h3>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-[#94A3B8] truncate">
              {subtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {badge}
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 dark:bg-white/[0.05] text-slate-600 dark:text-[#94A3B8]">
            {isOpen ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </span>
        </div>
      </button>

      {isOpen && (
        <div
          id={bodyId}
          className="px-5 pb-5 sm:px-6 sm:pb-6 pt-4 border-t border-slate-200 dark:border-white/[0.06]"
        >
          {children}
        </div>
      )}
    </div>
  );
};

const FONT_OPTIONS: {
  id: AppFontFamily;
  name: string;
  subtitle: string;
  cssFamily: string;
}[] = [
  {
    id: 'jakarta',
    name: 'Plus Jakarta Sans',
    subtitle: 'Modern geometric default',
    cssFamily: '"Plus Jakarta Sans", "DM Sans", sans-serif',
  },
  {
    id: 'manrope',
    name: 'Manrope',
    subtitle: 'Crisp humanist neo-grotesque',
    cssFamily: '"Manrope", sans-serif',
  },
  {
    id: 'outfit',
    name: 'Outfit',
    subtitle: 'Clean rounded display',
    cssFamily: '"Outfit", sans-serif',
  },
  {
    id: 'lora',
    name: 'Lora',
    subtitle: 'Warm editorial serif',
    cssFamily: '"Lora", Georgia, serif',
  },
  {
    id: 'mono',
    name: 'JetBrains Mono',
    subtitle: 'Precision monospace',
    cssFamily: '"JetBrains Mono", monospace',
  },
];

const SIZE_PRESETS = [
  { label: 'Compact', px: 14 },
  { label: 'Default', px: 16 },
  { label: 'Large', px: 18 },
  { label: 'Extra Large', px: 20 },
];

export const SettingsSection: React.FC<SettingsSectionProps> = ({
  settings,
  onUpdateSettings,
  googleUser,
  needsGoogleAuth,
  onAuthUpdated,
  tasks,
  reminders,
  alarms,
  notes,
  onRestoreBackup,
  onRunAutoBackupNow,
  onRefreshWidget,
  notificationPermission,
  onRequestNotificationPermission,
  onTestLockScreenAlert,
  androidPermissions,
  onTriggerAndroidPermission,
  onResetAllData,
}) => {
  const [openSections, setOpenSections] = useState<
    Record<SettingsSectionKey, boolean>
  >(INITIAL_OPEN_SECTIONS);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [lockTestStatus, setLockTestStatus] = useState<string | null>(null);

  const toggleSection = (key: SettingsSectionKey) => {
    soundEngine.playTick(820, 0.015);
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const expandAndScroll = (key: 'help' | 'about', elementId: string) => {
    soundEngine.playTick(840, 0.015);
    setOpenSections((prev) => ({ ...prev, [key]: true }));
    requestAnimationFrame(() => {
      document
        .getElementById(elementId)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const anyExpanded = Object.values(openSections).some(Boolean);

  const toggleAllSections = () => {
    soundEngine.playTick(800, 0.018);
    const nextValue = !anyExpanded;
    setOpenSections({
      theme: nextValue,
      notifications: nextValue,
      typography: nextValue,
      backup: nextValue,
      help: nextValue,
      about: nextValue,
    });
  };

  const setTheme = (theme: ThemeMode) => {
    soundEngine.playTick(840, 0.02);
    onUpdateSettings({ ...settings, theme });
  };

  const setFontSize = (px: number) => {
    const clamped = Math.max(13, Math.min(22, px));
    soundEngine.playTick(780, 0.015);
    onUpdateSettings({ ...settings, fontSizePx: clamped });
  };

  const setFontFamily = (fontFamily: AppFontFamily) => {
    soundEngine.playTick(860, 0.02);
    onUpdateSettings({ ...settings, fontFamily });
  };

  const activeFontName =
    FONT_OPTIONS.find((f) => f.id === settings.fontFamily)?.name ??
    'Plus Jakarta Sans';

  const androidChecks = androidPermissions?.isNativeAndroid
    ? [
        androidPermissions.postNotifications,
        androidPermissions.fullScreenIntent,
        androidPermissions.overlayPermission,
        androidPermissions.exactAlarms,
        androidPermissions.batteryOptimizationIgnored,
        androidPermissions.dndAccess,
      ]
    : [];
  const androidGrantedCount = androidChecks.filter(Boolean).length;
  const androidAllGranted =
    androidChecks.length > 0 && androidGrantedCount === androidChecks.length;

  const notificationSummaryBadge = androidPermissions?.isNativeAndroid ? (
    <span
      className={`hidden sm:inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
        androidAllGranted
          ? 'bg-emerald-50 dark:bg-[#34D399]/15 border-emerald-200 dark:border-[#34D399]/35 text-emerald-700 dark:text-[#34D399]'
          : 'bg-amber-50 dark:bg-[#F59E0B]/15 border-amber-200 dark:border-[#F59E0B]/35 text-amber-700 dark:text-[#F59E0B]'
      }`}
    >
      {androidGrantedCount}/{androidChecks.length} Ready
    </span>
  ) : (
    <span
      className={`hidden sm:inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
        notificationPermission === 'granted'
          ? 'bg-emerald-50 dark:bg-[#34D399]/15 border-emerald-200 dark:border-[#34D399]/35 text-emerald-700 dark:text-[#34D399]'
          : 'bg-slate-100 dark:bg-[#12141F] border-slate-200 dark:border-white/[0.06] text-slate-600 dark:text-[#94A3B8]'
      }`}
    >
      {notificationPermission === 'granted' ? 'Enabled' : 'Setup'}
    </span>
  );

  const backupSummaryBadge = (
    <span
      className={`hidden sm:inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
        settings.autoBackupEnabled || (googleUser && !needsGoogleAuth)
          ? 'bg-emerald-50 dark:bg-[#34D399]/15 border-emerald-200 dark:border-[#34D399]/35 text-emerald-700 dark:text-[#34D399]'
          : 'bg-slate-100 dark:bg-[#12141F] border-slate-200 dark:border-white/[0.06] text-slate-600 dark:text-[#94A3B8]'
      }`}
    >
      {settings.autoBackupEnabled
        ? `Auto · ${settings.autoBackupFrequency}`
        : googleUser && !needsGoogleAuth
          ? 'Drive Connected'
          : 'Local & Drive'}
    </span>
  );

  return (
    <section className="flex flex-col gap-4 max-w-4xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-1">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-[#F8FAFC] tracking-tight">
            Appearance &amp; Settings
          </h2>
          <p className="text-xs text-slate-600 dark:text-[#94A3B8] mt-0.5">
            Tap any section below to expand and configure its options
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => expandAndScroll('help', 'settings-help-card')}
            className="flex min-h-[40px] items-center gap-1.5 rounded-full bg-indigo-50 dark:bg-[#6366F1]/15 px-3.5 text-xs font-semibold text-indigo-700 dark:text-[#818CF8] border border-indigo-200 dark:border-[#6366F1]/35 hover:border-indigo-400 transition-colors cursor-pointer"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            Help
          </button>
          <button
            type="button"
            onClick={() => expandAndScroll('about', 'settings-about-card')}
            className="flex min-h-[40px] items-center gap-1.5 rounded-full bg-slate-200/70 dark:bg-white/[0.05] px-3.5 text-xs font-medium text-slate-700 dark:text-[#94A3B8] border border-slate-300/70 dark:border-white/10 hover:text-slate-900 dark:hover:text-[#F8FAFC] transition-colors cursor-pointer"
          >
            <Info className="h-3.5 w-3.5" />
            About
          </button>
          <button
            type="button"
            onClick={toggleAllSections}
            className="flex min-h-[40px] items-center gap-1.5 rounded-full bg-slate-200/70 dark:bg-white/[0.05] px-3.5 text-xs font-medium text-slate-700 dark:text-[#94A3B8] border border-slate-300/70 dark:border-white/10 hover:text-slate-900 dark:hover:text-[#F8FAFC] transition-colors cursor-pointer"
          >
            {anyExpanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                Collapse All
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                Expand All
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              soundEngine.playTick(760, 0.015);
              setShowResetConfirm(true);
            }}
            className="flex min-h-[40px] items-center gap-2 rounded-full bg-slate-200/70 dark:bg-white/[0.05] px-4 text-xs font-medium text-slate-700 dark:text-[#94A3B8] border border-slate-300/70 dark:border-white/10 hover:text-slate-900 dark:hover:text-[#F8FAFC] transition-colors cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset Defaults
          </button>
        </div>
      </div>

      {/* Theme Mode Card */}
      <SettingsAccordionCard
        id="settings-theme-card"
        isOpen={openSections.theme}
        onToggle={() => toggleSection('theme')}
        icon={
          settings.theme === 'dark' ? (
            <Moon className="h-5 w-5" />
          ) : (
            <Sun className="h-5 w-5" />
          )
        }
        iconBgClass="bg-indigo-50 dark:bg-[#6366F1]/15 text-indigo-600 dark:text-[#818CF8]"
        title="Theme"
        subtitle="Switch between Obsidian Dark and Daylight Light mode"
        badge={
          <span className="hidden sm:inline-flex rounded-full bg-slate-100 dark:bg-[#12141F] border border-slate-200 dark:border-white/[0.06] px-2.5 py-0.5 text-[11px] font-medium text-slate-700 dark:text-[#cbd5e1] capitalize">
            {settings.theme}
          </span>
        }
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <p className="text-xs text-slate-600 dark:text-[#94A3B8]">
            Choose your preferred surface contrast across all Kairo screens.
          </p>

          <div
            role="radiogroup"
            aria-label="App theme"
            className="inline-flex rounded-full bg-slate-100 dark:bg-[#12141F] p-1 border border-slate-200 dark:border-white/[0.06] self-start"
          >
            <button
              type="button"
              role="radio"
              aria-checked={settings.theme === 'dark'}
              onClick={() => setTheme('dark')}
              className={`flex min-h-[40px] items-center gap-2 rounded-full px-4 text-xs font-semibold transition-all cursor-pointer ${
                settings.theme === 'dark'
                  ? 'bg-[#1A1D2D] text-white shadow-sm border border-white/15'
                  : 'text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Moon className="h-3.5 w-3.5" />
              Dark
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={settings.theme === 'light'}
              onClick={() => setTheme('light')}
              className={`flex min-h-[40px] items-center gap-2 rounded-full px-4 text-xs font-semibold transition-all cursor-pointer ${
                settings.theme === 'light'
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                  : 'text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Sun className="h-3.5 w-3.5 text-amber-500" />
              Light
            </button>
          </div>
        </div>
      </SettingsAccordionCard>

      {/* Notifications & Lock-Screen Alerts Card */}
      <SettingsAccordionCard
        id="settings-notifications-card"
        isOpen={openSections.notifications}
        onToggle={() => toggleSection('notifications')}
        icon={<BellRing className="h-5 w-5" />}
        iconBgClass="bg-amber-50 dark:bg-[#F59E0B]/15 text-amber-600 dark:text-[#F59E0B]"
        title="Notifications & Alert Popups"
        subtitle="Lock-screen alerts, crescendo volume, Focus DND, and Android permissions"
        badge={notificationSummaryBadge}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs text-slate-600 dark:text-[#94A3B8]">
              Show system notifications and minimal Snooze / Stop popups for Tasks, Reminders, and Alarms
            </p>
            <p className="mt-1.5 text-xs font-medium text-slate-700 dark:text-[#cbd5e1] inline-flex items-center gap-1.5">
              {notificationPermission === 'granted' ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-[#34D399]" />
                  <span className="text-emerald-700 dark:text-[#34D399]">
                    Notifications enabled
                  </span>
                </>
              ) : notificationPermission === 'denied' ? (
                <span className="text-red-600 dark:text-[#ffb4ab]">
                  Blocked in browser/OS settings — allow notifications for this site to see lock-screen alerts
                </span>
              ) : notificationPermission === 'unsupported' ? (
                <span>System notifications not supported in this browser</span>
              ) : (
                <span>Permission not yet granted</span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {notificationPermission !== 'granted' &&
              notificationPermission !== 'unsupported' && (
                <button
                  type="button"
                  onClick={onRequestNotificationPermission}
                  className="min-h-[42px] rounded-full bg-gradient-to-r from-[#6366F1] to-[#818CF8] px-4 text-xs font-semibold text-white shadow-[0_0_16px_rgba(99,102,241,0.35)] cursor-pointer whitespace-nowrap"
                >
                  Enable Notifications
                </button>
              )}
          </div>
        </div>

        {/* Gradual Volume Crescendo Toggle */}
        <div className="mt-5 pt-4 border-t border-slate-200 dark:border-white/[0.06] flex items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-[#6366F1]/15 text-indigo-600 dark:text-[#818CF8]">
              <Volume2 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-900 dark:text-[#F8FAFC]">
                Gradual Ringtone Volume (Crescendo)
              </p>
              <p className="mt-0.5 text-xs text-slate-600 dark:text-[#94A3B8]">
                Gently increases alarm and alert volume from soft to full over 15 seconds
              </p>
            </div>
          </div>
          <GlowingToggle
            checked={settings.gradualAlarmVolume}
            onChange={(next) =>
              onUpdateSettings({ ...settings, gradualAlarmVolume: next })
            }
            ariaLabel="Toggle gradual ringtone volume"
          />
        </div>

        {/* Focus Timer Auto Do Not Disturb & Quiet Popups Toggles */}
        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-white/[0.06] flex flex-col gap-3.5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-[#34D399]/15 text-emerald-600 dark:text-[#34D399]">
                <Shield className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-900 dark:text-[#F8FAFC]">
                  Auto Do Not Disturb in Focus Timer
                </p>
                <p className="mt-0.5 text-xs text-slate-600 dark:text-[#94A3B8]">
                  Automatically mutes notifications from other apps on Android while Focus runs and restores them when finished
                </p>
              </div>
            </div>
            <GlowingToggle
              checked={settings.focusAutoDnd}
              onChange={(next) =>
                onUpdateSettings({ ...settings, focusAutoDnd: next })
              }
              ariaLabel="Toggle automatic Do Not Disturb during focus"
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-[#94A3B8]">
                <BellRing className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-900 dark:text-[#F8FAFC]">
                  Quiet Kairo Task &amp; Reminder Popups in Focus
                </p>
                <p className="mt-0.5 text-xs text-slate-600 dark:text-[#94A3B8]">
                  Defers non-alarm Kairo Task &amp; Reminder banners while Focus Timer is active (Alarms still ring)
                </p>
              </div>
            </div>
            <GlowingToggle
              checked={settings.focusMuteInAppAlerts}
              onChange={(next) =>
                onUpdateSettings({ ...settings, focusMuteInAppAlerts: next })
              }
              ariaLabel="Toggle quiet in-app alerts during focus"
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 dark:bg-[#F59E0B]/15 text-amber-600 dark:text-[#F59E0B]">
                <Repeat className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-900 dark:text-[#F8FAFC]">
                  Auto-Carryover Missed Tasks
                </p>
                <p className="mt-0.5 text-xs text-slate-600 dark:text-[#94A3B8]">
                  Automatically moves uncompleted past tasks to today with a &ldquo;From&rdquo; date badge
                </p>
              </div>
            </div>
            <GlowingToggle
              checked={settings.autoCarryoverTasks}
              onChange={(next) =>
                onUpdateSettings({ ...settings, autoCarryoverTasks: next })
              }
              ariaLabel="Toggle automatic carryover for missed tasks"
            />
          </div>
        </div>

        {androidPermissions?.isNativeAndroid && onTriggerAndroidPermission && (
          <div className="mt-5 pt-5 border-t border-slate-200 dark:border-white/[0.06] flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-800 dark:text-[#F8FAFC]">
                Android App &amp; Lock-Screen Permissions ({androidGrantedCount}/{androidChecks.length})
              </p>
              <button
                type="button"
                onClick={() => onTriggerAndroidPermission('appInfo')}
                className="min-h-[32px] rounded-full bg-slate-100 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 px-3 text-[11px] font-medium text-slate-700 dark:text-[#F8FAFC] cursor-pointer whitespace-nowrap"
              >
                Open App Info
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-[#94A3B8] mb-1">
              Enable the core permissions below so Alarms, Reminders, and Tasks wake your locked screen and Focus Timer can silence calls &amp; WhatsApp while showing the lock-screen countdown.
            </p>
            {(
              [
                {
                  key: 'notifications' as AndroidPermissionAction,
                  manageAction: 'notificationSettings' as AndroidPermissionAction,
                  title: 'Heads-Up, Lock-Screen & High-Priority Notifications',
                  granted: androidPermissions.postNotifications,
                  hint: 'Also confirm "Lock screen notifications" and "Pop on screen" are turned ON inside Channel Settings.',
                },
                {
                  key: 'fullScreen' as AndroidPermissionAction,
                  manageAction: 'fullScreen' as AndroidPermissionAction,
                  title: 'Full-Screen Intent (Show Alert Over Lock Screen)',
                  granted: androidPermissions.fullScreenIntent,
                  hint: 'Required on Android 14+ so alarms appear full-screen when your phone is locked.',
                },
                {
                  key: 'overlay' as AndroidPermissionAction,
                  manageAction: 'overlay' as AndroidPermissionAction,
                  title: 'Overlay / Draw Over Other Apps',
                  granted: androidPermissions.overlayPermission,
                  hint: 'Android 13+ APK note: If disabled, tap "App Info" → tap ⋮ (top-right) → "Allow restricted settings", then tap Enable.',
                },
                {
                  key: 'exactAlarm' as AndroidPermissionAction,
                  manageAction: 'exactAlarm' as AndroidPermissionAction,
                  title: 'Exact Alarm & Reminder Timing',
                  granted: androidPermissions.exactAlarms,
                  hint: null,
                },
                {
                  key: 'battery' as AndroidPermissionAction,
                  manageAction: 'battery' as AndroidPermissionAction,
                  title: 'Unrestricted Background / Battery Optimization Off',
                  granted: androidPermissions.batteryOptimizationIgnored,
                  hint: 'Prevents Android from delaying alarms while the phone sleeps.',
                },
                {
                  key: 'dnd' as AndroidPermissionAction,
                  manageAction: 'dnd' as AndroidPermissionAction,
                  title: 'Do Not Disturb Access (Focus Timer)',
                  granted: androidPermissions.dndAccess,
                  hint: 'Allows Focus Timer to silence WhatsApp & calls while focusing and restore them afterward.',
                },
              ] as const
            ).map((perm) => (
              <div
                key={perm.key}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-slate-50 dark:bg-[#12141F] border border-slate-200 dark:border-white/[0.06] px-3.5 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-900 dark:text-[#F8FAFC]">
                    {perm.title}
                  </p>
                  <p
                    className={`text-[11px] font-medium ${
                      perm.granted
                        ? 'text-emerald-600 dark:text-[#34D399]'
                        : 'text-amber-600 dark:text-[#F59E0B]'
                    }`}
                  >
                    {perm.granted ? 'Granted' : 'Permission required'}
                  </p>
                  {!perm.granted && perm.hint && (
                    <p className="mt-1 text-[11px] leading-snug text-slate-500 dark:text-[#94A3B8]">
                      {perm.hint}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {!perm.granted ? (
                    <>
                      {perm.key === 'overlay' && (
                        <button
                          type="button"
                          onClick={() => onTriggerAndroidPermission('appInfo')}
                          className="min-h-[36px] rounded-full bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 px-3 text-xs font-medium text-slate-700 dark:text-[#F8FAFC] cursor-pointer whitespace-nowrap"
                        >
                          App Info
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onTriggerAndroidPermission(perm.key)}
                        className="min-h-[36px] rounded-full bg-indigo-600 px-3.5 text-xs font-semibold text-white cursor-pointer whitespace-nowrap"
                      >
                        Enable
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onTriggerAndroidPermission(perm.manageAction)}
                      className="min-h-[32px] rounded-full bg-white dark:bg-white/[0.05] border border-slate-200 dark:border-white/10 px-3 text-[11px] font-medium text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F8FAFC] cursor-pointer whitespace-nowrap"
                    >
                      Manage
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Lock-Screen Verification & OEM Lock-Screen Tip */}
            <div className="mt-1 rounded-2xl bg-amber-50/70 dark:bg-[#F59E0B]/10 border border-amber-200 dark:border-[#F59E0B]/25 px-3.5 py-3 flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-900 dark:text-[#F8FAFC]">
                    Verify Alarm on Locked Screen
                  </p>
                  <p className="mt-0.5 text-[11px] leading-snug text-slate-600 dark:text-[#94A3B8]">
                    Xiaomi, Oppo, Vivo, Realme &amp; OnePlus devices also require enabling &ldquo;Show on Lock Screen&rdquo; and &ldquo;Display pop-up windows while running in background&rdquo; inside App Info → Other permissions.
                  </p>
                </div>
                {onTestLockScreenAlert && (
                  <button
                    type="button"
                    onClick={() => {
                      void onTestLockScreenAlert().then((scheduled) => {
                        setLockTestStatus(
                          scheduled
                            ? 'Test alarm scheduled in 5 seconds — lock your phone screen now to verify!'
                            : 'Unable to schedule native lock-screen test.'
                        );
                      });
                    }}
                    className="min-h-[36px] rounded-full bg-amber-500 text-slate-950 px-3.5 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Test Lock-Screen (5s)
                  </button>
                )}
              </div>
              {lockTestStatus && (
                <p className="text-[11px] font-medium text-amber-800 dark:text-[#FCD34D]">
                  {lockTestStatus}
                </p>
              )}
            </div>

            <div className="mt-2 rounded-2xl bg-indigo-50/70 dark:bg-[#6366F1]/10 border border-indigo-200 dark:border-[#6366F1]/25 px-3.5 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                <Smartphone className="h-4 w-4 text-indigo-600 dark:text-[#818CF8] shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 dark:text-[#F8FAFC]">
                    Android Home Screen Quick-Add Widget
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-600 dark:text-[#94A3B8]">
                    Long-press your Android home screen → Widgets → Kairo Quick Add for 1-tap Task, Reminder, Alarm &amp; Note shortcuts.
                  </p>
                </div>
              </div>
              {onRefreshWidget && (
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playTick(840, 0.02);
                    onRefreshWidget();
                  }}
                  className="min-h-[36px] rounded-full bg-white dark:bg-white/[0.08] border border-indigo-200 dark:border-white/15 px-3.5 text-xs font-semibold text-indigo-700 dark:text-[#818CF8] cursor-pointer whitespace-nowrap"
                >
                  Sync Widget
                </button>
              )}
            </div>
          </div>
        )}
      </SettingsAccordionCard>

      {/* Combined Font Size & App Font Module */}
      <SettingsAccordionCard
        id="settings-typography-card"
        isOpen={openSections.typography}
        onToggle={() => toggleSection('typography')}
        icon={<Type className="h-5 w-5" />}
        iconBgClass="bg-indigo-50 dark:bg-[#6366F1]/15 text-indigo-600 dark:text-[#818CF8]"
        title="Font Size & App Font"
        subtitle="Adjust text scale and choose typeface across all screens"
        badge={
          <span className="hidden sm:inline-flex rounded-full bg-indigo-50 dark:bg-[#6366F1]/15 border border-indigo-200 dark:border-[#6366F1]/35 px-2.5 py-0.5 text-[11px] font-medium text-indigo-700 dark:text-[#818CF8] tabular-nums">
            {activeFontName} · {settings.fontSizePx}px
          </span>
        }
      >
        <div className="flex flex-col gap-6">
          {/* Font Size Controls */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-semibold text-slate-900 dark:text-[#F8FAFC]">
                  Font Size
                </h4>
                <p className="text-xs text-slate-600 dark:text-[#94A3B8]">
                  Scale body and interface text
                </p>
              </div>
              <span className="font-mono text-sm font-semibold text-indigo-600 dark:text-[#818CF8] tabular-nums">
                {settings.fontSizePx}px
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setFontSize(settings.fontSizePx - 1)}
                disabled={settings.fontSizePx <= 13}
                aria-label="Decrease font size"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-[#12141F] text-slate-700 dark:text-[#F8FAFC] border border-slate-200 dark:border-white/10 disabled:opacity-40 cursor-pointer"
              >
                <Minus className="h-4 w-4" />
              </button>

              <input
                type="range"
                min={13}
                max={22}
                step={1}
                value={settings.fontSizePx}
                onChange={(e) => setFontSize(Number(e.target.value))}
                aria-label="Font size slider"
                className="flex-1 accent-[#6366F1] cursor-pointer"
              />

              <button
                type="button"
                onClick={() => setFontSize(settings.fontSizePx + 1)}
                disabled={settings.fontSizePx >= 22}
                aria-label="Increase font size"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-[#12141F] text-slate-700 dark:text-[#F8FAFC] border border-slate-200 dark:border-white/10 disabled:opacity-40 cursor-pointer"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {SIZE_PRESETS.map((preset) => {
                const active = settings.fontSizePx === preset.px;
                return (
                  <button
                    key={preset.px}
                    type="button"
                    onClick={() => setFontSize(preset.px)}
                    className={`min-h-[42px] rounded-2xl px-3 text-xs font-medium transition-all cursor-pointer ${
                      active
                        ? 'bg-indigo-600 text-white shadow-[0_0_14px_rgba(99,102,241,0.35)]'
                        : 'bg-slate-100 dark:bg-[#12141F] text-slate-700 dark:text-[#94A3B8] border border-slate-200 dark:border-white/[0.06] hover:text-slate-900 dark:hover:text-[#F8FAFC]'
                    }`}
                  >
                    {preset.label} ({preset.px}px)
                  </button>
                );
              })}
            </div>
          </div>

          {/* App Font Selector */}
          <div className="pt-5 border-t border-slate-200 dark:border-white/[0.06] flex flex-col gap-3">
            <div>
              <h4 className="text-xs font-semibold text-slate-900 dark:text-[#F8FAFC]">
                App Font
              </h4>
              <p className="mt-0.5 text-xs text-slate-600 dark:text-[#94A3B8]">
                Choose the typeface used for headings, tasks, reminders, and notes
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {FONT_OPTIONS.map((font) => {
                const active = settings.fontFamily === font.id;
                return (
                  <button
                    key={font.id}
                    type="button"
                    onClick={() => setFontFamily(font.id)}
                    style={{ fontFamily: font.cssFamily }}
                    className={`flex flex-col items-start rounded-2xl p-4 text-left transition-all border cursor-pointer ${
                      active
                        ? 'bg-indigo-50 dark:bg-[#6366F1]/15 border-indigo-500 dark:border-[#6366F1]/60'
                        : 'bg-slate-50 dark:bg-[#12141F] border-slate-200 dark:border-white/[0.06] hover:border-slate-300 dark:hover:border-white/15'
                    }`}
                  >
                    <span className="text-sm font-semibold text-slate-900 dark:text-[#F8FAFC]">
                      {font.name}
                    </span>
                    <span className="mt-0.5 text-xs text-slate-600 dark:text-[#94A3B8]">
                      {font.subtitle}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </SettingsAccordionCard>

      {/* Embedded Google Drive Backup & Backup Export/Import */}
      <SettingsAccordionCard
        id="settings-backup-card"
        isOpen={openSections.backup}
        onToggle={() => toggleSection('backup')}
        icon={<Cloud className="h-5 w-5" />}
        iconBgClass="bg-emerald-50 dark:bg-[#34D399]/15 text-emerald-600 dark:text-[#34D399]"
        title="Backup & Google Drive"
        subtitle="Google Drive cloud sync and Backup Export & Import"
        badge={backupSummaryBadge}
      >
        <BackupSection
          user={googleUser}
          needsAuth={needsGoogleAuth}
          onAuthUpdated={onAuthUpdated}
          tasks={tasks}
          reminders={reminders}
          alarms={alarms}
          notes={notes}
          onRestoreBackup={onRestoreBackup}
          settings={settings}
          onUpdateSettings={onUpdateSettings}
          onRunAutoBackupNow={onRunAutoBackupNow}
        />
      </SettingsAccordionCard>

      {/* Help & About Kairo (each card individually collapsible & hidden by default) */}
      <HelpAboutSection
        tasks={tasks}
        reminders={reminders}
        alarms={alarms}
        notes={notes}
        settings={settings}
        helpOpen={openSections.help}
        onToggleHelp={() => toggleSection('help')}
        aboutOpen={openSections.about}
        onToggleAbout={() => toggleSection('about')}
      />

      {showResetConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-reset-confirm-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 dark:bg-[#090A0F]/85 backdrop-blur-md p-5"
        >
          <div className="w-full max-w-md rounded-[28px] bg-white dark:bg-[#1A1D2D] border border-slate-200 dark:border-white/15 p-6 shadow-2xl">
            <h3
              id="settings-reset-confirm-title"
              className="text-lg font-semibold text-slate-900 dark:text-[#F8FAFC]"
            >
              Reset Settings or Factory Reset All Data?
            </h3>

            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-[#94A3B8]">
              Choose whether to reset UI preferences only or perform a full factory reset to clear all Tasks, Reminders, Alarms, Notes, and scheduled system alarms.
            </p>

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  soundEngine.playTick(640, 0.015);
                  setShowResetConfirm(false);
                }}
                className="h-11 rounded-full px-4 text-xs font-medium text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F8FAFC] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  soundEngine.playTick(840, 0.025);
                  onUpdateSettings(DEFAULT_SETTINGS);
                  setShowResetConfirm(false);
                }}
                className="h-11 rounded-full bg-slate-200 dark:bg-white/10 text-slate-800 dark:text-[#F8FAFC] px-4 text-xs font-semibold hover:bg-slate-300 dark:hover:bg-white/20 transition-all cursor-pointer"
              >
                Reset Settings Only
              </button>
              <button
                type="button"
                onClick={() => {
                  soundEngine.playTick(840, 0.025);
                  if (onResetAllData) {
                    onResetAllData();
                  } else {
                    onUpdateSettings(DEFAULT_SETTINGS);
                  }
                  setShowResetConfirm(false);
                }}
                className="h-11 rounded-full bg-red-600 text-white dark:bg-[#ffb4ab] dark:text-[#690005] px-5 text-xs font-semibold transition-all cursor-pointer"
              >
                Reset All App Data &amp; Alarms
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
