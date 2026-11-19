import React, { useCallback, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Cloud,
  CloudUpload,
  Download,
  LogOut,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  AppSettings,
  AutoBackupDestination,
  AutoBackupFrequency,
  ChronoAlarm,
  NoteItem,
  ReminderItem,
  TaskItem,
} from '../types/chrono';
import {
  clearAccessToken,
  getAccessToken,
  googleSignIn,
  googleSignOut,
} from '../utils/googleAuth';
import {
  buildBackupPayload,
  createDriveBackup,
  deleteDriveBackup,
  downloadDriveBackup,
  DriveAuthExpiredError,
  formatDefaultBackupFilename,
  listDriveBackups,
  updateDriveBackup,
  type ChronoBackupPayload,
  type DriveBackupFile,
} from '../utils/googleDriveBackup';
import { soundEngine } from '../utils/soundEngine';
import { CopyButton, PasteButton } from './ClipboardButtons';
import { GlowingToggle } from './GlowingToggle';
import { readTextFromClipboard } from '../utils/clipboard';
import {
  isNativeAndroidPlatform,
  saveNativeAndroidBackup,
} from '../utils/nativeAndroidBridge';

export const WEB_AUTO_BACKUP_STORAGE_KEY = 'kairo_auto_backup_latest_v1';

interface BackupSectionProps {
  user: User | null;
  needsAuth: boolean;
  onAuthUpdated: (user: User | null, needsAuth: boolean) => void;
  tasks: TaskItem[];
  reminders: ReminderItem[];
  alarms: ChronoAlarm[];
  notes: NoteItem[];
  onRestoreBackup: (payload: ChronoBackupPayload) => void;
  settings: AppSettings;
  onUpdateSettings: (next: AppSettings) => void;
  onRunAutoBackupNow?: () => Promise<void>;
}

type PendingConfirmAction =
  | { type: 'delete'; file: DriveBackupFile }
  | { type: 'overwrite'; file: DriveBackupFile }
  | { type: 'restore'; file: DriveBackupFile }
  | { type: 'restoreLocal'; payload: ChronoBackupPayload; fileName: string };

function formatFileSize(bytesStr?: string): string {
  const bytes = Number(bytesStr);
  if (!bytes || Number.isNaN(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatModified(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export const BackupSection: React.FC<BackupSectionProps> = ({
  user,
  needsAuth,
  onAuthUpdated,
  tasks,
  reminders,
  alarms,
  notes,
  onRestoreBackup,
  settings,
  onUpdateSettings,
  onRunAutoBackupNow,
}) => {
  const [backups, setBackups] = useState<DriveBackupFile[]>([]);
  const [backupName, setBackupName] = useState<string>(
    () => formatDefaultBackupFilename()
  );
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [isRunningAutoBackup, setIsRunningAutoBackup] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastExportPath, setLastExportPath] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] =
    useState<PendingConfirmAction | null>(null);

  const handleAuthError = useCallback(
    (err: unknown) => {
      if (err instanceof DriveAuthExpiredError) {
        clearAccessToken();
        onAuthUpdated(user, true);
        setErrorMessage('Google Drive session expired. Please sign in again.');
        return;
      }
      setErrorMessage(
        err instanceof Error ? err.message : 'Something went wrong with Google Drive.'
      );
    },
    [onAuthUpdated, user]
  );

  const fetchBackups = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    setIsLoadingList(true);
    setErrorMessage(null);
    try {
      const files = await listDriveBackups(token);
      setBackups(files);
    } catch (err) {
      handleAuthError(err);
    } finally {
      setIsLoadingList(false);
    }
  }, [handleAuthError]);

  useEffect(() => {
    if (!needsAuth && getAccessToken()) {
      void fetchBackups();
    } else {
      setBackups([]);
    }
  }, [needsAuth, fetchBackups]);

  const handleGoogleLogin = async () => {
    setIsSigningIn(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const result = await googleSignIn();
      onAuthUpdated(result.user, false);
      setStatusMessage(`Connected to Google Drive as ${result.user.email ?? 'user'}.`);
      await fetchBackups();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to sign in with Google.'
      );
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    soundEngine.playTick(620, 0.02);
    await googleSignOut();
    onAuthUpdated(null, true);
    setBackups([]);
    setStatusMessage('Signed out of Google account.');
    setErrorMessage(null);
  };

  const handleCreateBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) {
      onAuthUpdated(user, true);
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const payload = buildBackupPayload({ tasks, reminders, alarms, notes });
      const created = await createDriveBackup(token, backupName, payload);
      soundEngine.playCompletionChime();
      setStatusMessage(`Saved "${created.name}" to Google Drive.`);
      setBackupName(formatDefaultBackupFilename());
      await fetchBackups();
    } catch (err) {
      handleAuthError(err);
    } finally {
      setIsSaving(false);
    }
  };

  const executeConfirmedAction = async () => {
    if (!confirmAction) return;

    if (confirmAction.type === 'restoreLocal') {
      onRestoreBackup(confirmAction.payload);
      soundEngine.playCompletionChime();
      setStatusMessage(`Restored data from local file "${confirmAction.fileName}".`);
      setConfirmAction(null);
      return;
    }

    const token = getAccessToken();
    if (!token) {
      setConfirmAction(null);
      onAuthUpdated(user, true);
      return;
    }

    setIsMutating(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      if (confirmAction.type === 'delete') {
        await deleteDriveBackup(token, confirmAction.file.id);
        soundEngine.playTick(600, 0.025);
        setStatusMessage(`Deleted "${confirmAction.file.name}" from Google Drive.`);
        await fetchBackups();
      } else if (confirmAction.type === 'overwrite') {
        const payload = buildBackupPayload({ tasks, reminders, alarms, notes });
        const updated = await updateDriveBackup(
          token,
          confirmAction.file.id,
          payload
        );
        soundEngine.playCompletionChime();
        setStatusMessage(`Updated "${updated.name}" in Google Drive.`);
        await fetchBackups();
      } else if (confirmAction.type === 'restore') {
        const downloaded = await downloadDriveBackup(
          token,
          confirmAction.file.id
        );
        onRestoreBackup(downloaded);
        soundEngine.playCompletionChime();
        setStatusMessage(`Restored backup "${confirmAction.file.name}".`);
      }
    } catch (err) {
      handleAuthError(err);
    } finally {
      setIsMutating(false);
      setConfirmAction(null);
    }
  };

  const handleLocalExport = async () => {
    soundEngine.playTick(920, 0.025);
    setErrorMessage(null);
    const fileName = formatDefaultBackupFilename();
    const payload = buildBackupPayload({ tasks, reminders, alarms, notes });
    const serialized = JSON.stringify(payload, null, 2);

    if (isNativeAndroidPlatform()) {
      const nativeRes = await saveNativeAndroidBackup(fileName, serialized);
      if (nativeRes.supported) {
        if (nativeRes.saved && nativeRes.location) {
          setLastExportPath(nativeRes.location);
          setStatusMessage(`Backup exported to ${nativeRes.location}`);
        } else {
          setErrorMessage(
            nativeRes.error ?? 'Failed to save backup file on device.'
          );
        }
        return;
      }
    }

    const blob = new Blob([serialized], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);

    const browserPath = `Downloads/${fileName}`;
    setLastExportPath(browserPath);
    setStatusMessage(
      `Backup exported to your browser's ${browserPath} folder.`
    );
  };

  const handleLocalFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<ChronoBackupPayload>;
      if (
        !parsed ||
        !parsed.data ||
        !Array.isArray(parsed.data.tasks) ||
        !Array.isArray(parsed.data.reminders) ||
        !Array.isArray(parsed.data.alarms) ||
        !Array.isArray(parsed.data.notes)
      ) {
        throw new Error('Selected file is not a valid Kairo backup file.');
      }
      setConfirmAction({
        type: 'restoreLocal',
        payload: parsed as ChronoBackupPayload,
        fileName: file.name,
      });
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to read backup file.'
      );
    }
  };

  const handlePasteBackupRestore = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    const text = await readTextFromClipboard();
    if (!text) {
      setErrorMessage('Clipboard is empty or blocked. Copy a Kairo backup first, or use Import Backup.');
      return;
    }
    try {
      const parsed = JSON.parse(text) as Partial<ChronoBackupPayload>;
      if (
        !parsed ||
        !parsed.data ||
        !Array.isArray(parsed.data.tasks) ||
        !Array.isArray(parsed.data.reminders) ||
        !Array.isArray(parsed.data.alarms) ||
        !Array.isArray(parsed.data.notes)
      ) {
        throw new Error('Clipboard text is not a valid Kairo backup.');
      }
      setConfirmAction({
        type: 'restoreLocal',
        payload: parsed as ChronoBackupPayload,
        fileName: 'Clipboard Backup',
      });
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Clipboard does not contain a valid backup.'
      );
    }
  };

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-[#F8FAFC] tracking-tight">
          Google Drive Backup
        </h2>
        <p className="text-xs text-slate-600 dark:text-[#94A3B8] tabular-nums mt-0.5">
          Current local snapshot · {tasks.length} tasks · {reminders.length} reminders ·{' '}
          {alarms.length} alarms · {notes.length} notes
        </p>
      </div>

      {statusMessage && (
        <div
          role="status"
          className="flex items-center gap-2.5 rounded-2xl bg-emerald-50 dark:bg-[#10B981]/15 border border-emerald-300 dark:border-[#10B981]/35 px-4 py-3 text-sm text-emerald-700 dark:text-[#34D399]"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-2xl bg-red-50 dark:bg-[#93000a]/30 border border-red-300 dark:border-[#ffb4ab]/35 px-4 py-3 text-sm text-red-700 dark:text-[#ffb4ab]"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Google Account Connection Card */}
      <div className="rounded-[28px] bg-white dark:bg-[#1A1D2D]/80 backdrop-blur-xl border border-slate-200 dark:border-white/[0.08] p-6 shadow-sm dark:shadow-none">
        {needsAuth ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-[#6366F1]/15 text-indigo-600 dark:text-[#818CF8] border border-indigo-200 dark:border-[#6366F1]/30">
                <Cloud className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-[#F8FAFC]">
                  Connect your Google Account
                </h3>
                <p className="mt-1 text-sm text-slate-600 dark:text-[#94A3B8] max-w-xl">
                  Sign in with Google to save, view, overwrite, and restore Kairo
                  backup files directly in your Google Drive.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isSigningIn}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-3 rounded-full bg-white px-5 text-sm font-medium text-[#1f1f1f] border border-slate-300 dark:border-transparent shadow-md hover:bg-[#f8f9fa] active:scale-[0.98] disabled:opacity-60 transition-all cursor-pointer"
            >
              <svg
                className="h-5 w-5 shrink-0"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 48 48"
                aria-hidden="true"
              >
                <path
                  fill="#EA4335"
                  d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                />
                <path
                  fill="#4285F4"
                  d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                />
                <path
                  fill="#FBBC05"
                  d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                />
                <path
                  fill="#34A853"
                  d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                />
              </svg>
              <span className="whitespace-nowrap">
                {isSigningIn ? 'Connecting...' : 'Sign in with Google'}
              </span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-white/[0.06]">
              <div className="flex items-center gap-3.5 min-w-0">
                {user?.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName ?? 'Google account avatar'}
                    referrerPolicy="no-referrer"
                    className="h-11 w-11 rounded-full object-cover border border-slate-200 dark:border-white/15 shrink-0"
                  />
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-50 dark:bg-[#6366F1]/25 text-sm font-semibold text-indigo-700 dark:text-[#c0c1ff] border border-indigo-200 dark:border-[#6366F1]/40">
                    {(user?.displayName ?? user?.email ?? 'G')[0]?.toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-[#F8FAFC]">
                    {user?.displayName ?? 'Google Account'}
                  </p>
                  <p className="truncate text-xs text-slate-600 dark:text-[#94A3B8]">
                    {user?.email ?? 'Connected to Google Drive'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void fetchBackups()}
                  disabled={isLoadingList}
                  className="flex h-10 items-center gap-2 rounded-full bg-slate-100 dark:bg-white/[0.05] px-4 text-xs font-medium text-slate-800 dark:text-[#F8FAFC] border border-slate-200 dark:border-white/10 hover:bg-slate-200/70 dark:hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${isLoadingList ? 'animate-spin' : ''}`}
                  />
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex h-10 items-center gap-2 rounded-full bg-slate-100 dark:bg-white/[0.05] px-4 text-xs font-medium text-slate-600 dark:text-[#94A3B8] border border-slate-200 dark:border-white/10 hover:text-slate-900 dark:hover:text-[#F8FAFC] transition-colors cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </button>
              </div>
            </div>

            <form
              onSubmit={handleCreateBackup}
              className="flex flex-col sm:flex-row sm:items-end gap-3"
            >
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label
                    htmlFor="backup-filename-input"
                    className="block text-xs font-medium text-slate-600 dark:text-[#94A3B8]"
                  >
                    Backup Filename (Google Drive)
                  </label>
                  <div className="flex items-center gap-1.5">
                    {backupName && (
                      <CopyButton text={backupName} ariaLabel="Copy backup filename" />
                    )}
                    <PasteButton
                      targetInputId="backup-filename-input"
                      onPasteText={(val) => setBackupName(val)}
                    />
                  </div>
                </div>
                <input
                  id="backup-filename-input"
                  type="text"
                  value={backupName}
                  onChange={(e) => setBackupName(e.target.value)}
                  required
                  className="min-h-[48px] w-full rounded-2xl bg-slate-50 dark:bg-[#161926] px-4 font-mono text-sm text-slate-900 dark:text-[#F8FAFC] border border-slate-200 dark:border-white/[0.08] focus:border-[#6366F1] focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={isSaving}
                className="flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#6366F1] to-[#818CF8] px-6 text-xs font-semibold text-white shadow-[0_0_20px_rgba(99,102,241,0.4),inset_0_1px_0_rgba(255,255,255,0.3)] active:scale-[0.98] disabled:opacity-60 transition-all whitespace-nowrap shrink-0 cursor-pointer"
              >
                <CloudUpload className="h-4 w-4" />
                {isSaving ? 'Backing up...' : 'Save Backup to Drive'}
              </button>
            </form>

            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-[#F8FAFC]">
                  Stored Drive Backups
                </h3>
                <span className="text-xs text-slate-600 dark:text-[#94A3B8] tabular-nums">
                  {backups.length} file{backups.length === 1 ? '' : 's'}
                </span>
              </div>

              {isLoadingList ? (
                <div className="rounded-2xl bg-slate-50 dark:bg-[#12141F] border border-slate-200 dark:border-white/[0.06] p-6 text-center text-xs text-slate-600 dark:text-[#94A3B8]">
                  Loading backups from Google Drive...
                </div>
              ) : backups.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 dark:bg-[#12141F] border border-slate-200 dark:border-white/[0.06] p-6 text-center">
                  <p className="text-sm font-medium text-slate-900 dark:text-[#F8FAFC]">
                    No backup files in Google Drive yet
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-[#64748B]">
                    Click &ldquo;Save Backup to Drive&rdquo; above to store your first snapshot.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-white/[0.06] rounded-2xl bg-slate-50 dark:bg-[#12141F] border border-slate-200 dark:border-white/[0.06]">
                  {backups.map((file) => (
                    <div
                      key={file.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-mono text-sm font-medium text-slate-900 dark:text-[#F8FAFC]">
                          {file.name}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-600 dark:text-[#94A3B8] tabular-nums">
                          {formatModified(file.modifiedTime)} · {formatFileSize(file.size)}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmAction({ type: 'restore', file })
                          }
                          className="flex h-10 items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-[#10B981]/15 px-3.5 text-xs font-semibold text-emerald-700 dark:text-[#34D399] border border-emerald-300 dark:border-[#10B981]/35 hover:bg-emerald-100 dark:hover:bg-[#10B981]/25 transition-colors cursor-pointer"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Restore
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setConfirmAction({ type: 'overwrite', file })
                          }
                          className="flex h-10 items-center gap-1.5 rounded-full bg-white dark:bg-white/[0.05] px-3.5 text-xs font-medium text-slate-800 dark:text-[#F8FAFC] border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
                        >
                          <CloudUpload className="h-3.5 w-3.5 text-indigo-600 dark:text-[#818CF8]" />
                          Overwrite
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setConfirmAction({ type: 'delete', file })
                          }
                          aria-label={`Delete ${file.name}`}
                          className="flex h-10 w-10 items-center justify-center rounded-full text-slate-400 dark:text-[#64748B] hover:bg-red-50 dark:hover:bg-white/[0.06] hover:text-red-600 dark:hover:text-[#ffb4ab] transition-colors cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Backup Export & Import Card */}
      <div className="rounded-[28px] bg-white dark:bg-[#1A1D2D]/60 border border-slate-200 dark:border-white/[0.08] p-5 sm:p-6 flex flex-col gap-4 shadow-xs dark:shadow-none">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-[#F8FAFC]">
              Backup Export &amp; Import
            </h3>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-[#94A3B8]">
              {isNativeAndroidPlatform()
                ? 'Saves exported backups to Internal Storage/Download/Kairo/ or restores from a saved backup.'
                : 'Downloads exported backups to your Downloads folder or restores from a saved backup.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <CopyButton
              label="Copy Backup"
              ariaLabel="Copy entire Kairo backup"
              text={JSON.stringify(
                buildBackupPayload({ tasks, reminders, alarms, notes }),
                null,
                2
              )}
              className="h-11 px-4 text-xs"
            />

            <button
              type="button"
              onClick={() => void handlePasteBackupRestore()}
              className="flex h-11 items-center gap-2 rounded-full bg-slate-100 dark:bg-white/[0.05] px-4 text-xs font-medium text-slate-800 dark:text-[#F8FAFC] border border-slate-200 dark:border-white/10 hover:bg-slate-200/70 dark:hover:bg-white/10 transition-colors cursor-pointer"
            >
              Paste Backup
            </button>

            <button
              type="button"
              onClick={() => void handleLocalExport()}
              className="flex h-11 items-center gap-2 rounded-full bg-slate-100 dark:bg-white/[0.05] px-4 text-xs font-medium text-slate-800 dark:text-[#F8FAFC] border border-slate-200 dark:border-white/10 hover:bg-slate-200/70 dark:hover:bg-white/10 transition-colors cursor-pointer"
            >
              <Download className="h-4 w-4 text-indigo-600 dark:text-[#818CF8]" />
              Export Backup
            </button>

            <label className="flex h-11 items-center gap-2 rounded-full bg-slate-100 dark:bg-white/[0.05] px-4 text-xs font-medium text-slate-800 dark:text-[#F8FAFC] border border-slate-200 dark:border-white/10 hover:bg-slate-200/70 dark:hover:bg-white/10 transition-colors cursor-pointer">
              <Upload className="h-4 w-4 text-emerald-600 dark:text-[#34D399]" />
              <span>Import Backup</span>
              <input
                type="file"
                accept="application/json,.json"
                onChange={handleLocalFilePick}
                className="sr-only"
              />
            </label>
          </div>
        </div>

        {lastExportPath && (
          <div className="rounded-2xl bg-slate-50 dark:bg-[#12141F] border border-slate-200 dark:border-white/[0.06] px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-slate-500 dark:text-[#64748B]">
                Last Exported Backup Location
              </p>
              <p className="mt-0.5 font-mono text-xs text-slate-900 dark:text-[#F8FAFC] break-all select-text">
                {lastExportPath}
              </p>
            </div>
            <CopyButton
              text={lastExportPath}
              ariaLabel="Copy exported backup path"
              label="Copy Path"
            />
          </div>
        )}
      </div>

      {/* Scheduled Auto-Backup Card */}
      <div className="rounded-[28px] bg-white dark:bg-[#1A1D2D]/60 border border-slate-200 dark:border-white/[0.08] p-5 sm:p-6 flex flex-col gap-4 shadow-xs dark:shadow-none">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-[#6366F1]/15 text-indigo-600 dark:text-[#818CF8]">
              <CalendarClock className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-[#F8FAFC]">
                Scheduled Auto-Backup
              </h3>
              <p className="mt-0.5 text-xs text-slate-600 dark:text-[#94A3B8]">
                {isNativeAndroidPlatform()
                  ? 'Automatically saves snapshots to Internal Storage/Download/Kairo/ and/or Google Drive on schedule.'
                  : 'Automatically saves a local snapshot in Kairo and/or syncs kairo-auto-backup.json to Google Drive.'}
              </p>
            </div>
          </div>
          <GlowingToggle
            checked={settings.autoBackupEnabled}
            onChange={(next) =>
              onUpdateSettings({ ...settings, autoBackupEnabled: next })
            }
            ariaLabel="Toggle scheduled auto-backup"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200 dark:border-white/[0.06]">
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-[#94A3B8] mb-2">
              Frequency
            </p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: 'daily', label: 'Daily' },
                  { id: 'weekly', label: 'Weekly' },
                ] as { id: AutoBackupFrequency; label: string }[]
              ).map((freq) => {
                const active = settings.autoBackupFrequency === freq.id;
                return (
                  <button
                    key={freq.id}
                    type="button"
                    onClick={() => {
                      soundEngine.playTick(820, 0.015);
                      onUpdateSettings({
                        ...settings,
                        autoBackupFrequency: freq.id,
                      });
                    }}
                    className={`min-h-[38px] rounded-full px-4 text-xs font-semibold border transition-all cursor-pointer ${
                      active
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-slate-100 dark:bg-[#12141F] text-slate-700 dark:text-[#94A3B8] border-slate-200 dark:border-white/[0.08] hover:text-slate-900 dark:hover:text-[#F8FAFC]'
                    }`}
                  >
                    {freq.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-[#94A3B8] mb-2">
              Destination
            </p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: 'local', label: 'Local' },
                  { id: 'drive', label: 'Google Drive' },
                  { id: 'both', label: 'Both' },
                ] as { id: AutoBackupDestination; label: string }[]
              ).map((dest) => {
                const active = settings.autoBackupDestination === dest.id;
                return (
                  <button
                    key={dest.id}
                    type="button"
                    onClick={() => {
                      soundEngine.playTick(820, 0.015);
                      onUpdateSettings({
                        ...settings,
                        autoBackupDestination: dest.id,
                      });
                    }}
                    className={`min-h-[38px] rounded-full px-3.5 text-xs font-semibold border transition-all cursor-pointer ${
                      active
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-slate-100 dark:bg-[#12141F] text-slate-700 dark:text-[#94A3B8] border-slate-200 dark:border-white/[0.08] hover:text-slate-900 dark:hover:text-[#F8FAFC]'
                    }`}
                  >
                    {dest.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {(settings.autoBackupDestination === 'drive' ||
          settings.autoBackupDestination === 'both') &&
          needsAuth && (
            <p className="text-xs text-amber-600 dark:text-[#F59E0B]">
              Sign in with Google above so scheduled Drive backups can upload automatically while your session is active.
            </p>
          )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-white/[0.06]">
          <div className="min-w-0 flex-1 text-xs text-slate-600 dark:text-[#94A3B8]">
            {settings.lastAutoBackupAt ? (
              <>
                <span className="font-medium text-slate-800 dark:text-[#F8FAFC]">
                  Last run: {formatModified(settings.lastAutoBackupAt)}
                </span>
                {settings.lastAutoBackupStatus && (
                  <span className="block mt-0.5 text-[11px] text-slate-500 dark:text-[#94A3B8] break-words">
                    {settings.lastAutoBackupStatus}
                  </span>
                )}
              </>
            ) : (
              <span>No auto-backup has run yet.</span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {!isNativeAndroidPlatform() &&
              typeof localStorage !== 'undefined' &&
              Boolean(localStorage.getItem(WEB_AUTO_BACKUP_STORAGE_KEY)) && (
                <button
                  type="button"
                  onClick={() => {
                    const cached = localStorage.getItem(WEB_AUTO_BACKUP_STORAGE_KEY);
                    if (!cached) return;
                    const blob = new Blob([cached], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = formatDefaultBackupFilename();
                    a.click();
                    URL.revokeObjectURL(url);
                    setStatusMessage('Downloaded latest auto-backup snapshot.');
                  }}
                  className="flex h-10 items-center gap-1.5 rounded-full bg-slate-100 dark:bg-white/[0.05] px-3.5 text-xs font-medium text-slate-800 dark:text-[#F8FAFC] border border-slate-200 dark:border-white/10 hover:bg-slate-200/70 dark:hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5 text-indigo-600 dark:text-[#818CF8]" />
                  Download Latest Snapshot
                </button>
              )}

            {onRunAutoBackupNow && (
              <button
                type="button"
                disabled={isRunningAutoBackup}
                onClick={async () => {
                  setIsRunningAutoBackup(true);
                  setErrorMessage(null);
                  try {
                    await onRunAutoBackupNow();
                    soundEngine.playCompletionChime();
                    setStatusMessage('Auto-backup snapshot completed.');
                  } catch (err) {
                    setErrorMessage(
                      err instanceof Error ? err.message : 'Auto-backup failed.'
                    );
                  } finally {
                    setIsRunningAutoBackup(false);
                  }
                }}
                className="flex h-10 items-center gap-1.5 rounded-full bg-gradient-to-r from-[#6366F1] to-[#818CF8] px-4 text-xs font-semibold text-white shadow-[0_0_16px_rgba(99,102,241,0.35)] active:scale-[0.98] disabled:opacity-60 transition-all cursor-pointer"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isRunningAutoBackup ? 'animate-spin' : ''}`}
                />
                {isRunningAutoBackup ? 'Backing up...' : 'Back Up Now'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmAction && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="backup-confirm-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 dark:bg-[#090A0F]/85 backdrop-blur-md p-5"
        >
          <div className="w-full max-w-md rounded-[28px] bg-white dark:bg-[#1A1D2D] border border-slate-200 dark:border-white/15 p-6 shadow-2xl">
            <h3
              id="backup-confirm-title"
              className="text-lg font-semibold text-slate-900 dark:text-[#F8FAFC]"
            >
              {confirmAction.type === 'delete' && 'Delete Backup from Google Drive?'}
              {confirmAction.type === 'overwrite' && 'Overwrite Google Drive Backup?'}
              {(confirmAction.type === 'restore' ||
                confirmAction.type === 'restoreLocal') &&
                'Restore Backup Data?'}
            </h3>

            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-[#94A3B8]">
              {confirmAction.type === 'delete' &&
                `This will permanently delete "${confirmAction.file.name}" from your Google Drive. This action cannot be undone.`}
              {confirmAction.type === 'overwrite' &&
                `This will replace the contents of "${confirmAction.file.name}" in Google Drive with your current ${tasks.length} tasks, ${reminders.length} reminders, ${alarms.length} alarms, and ${notes.length} notes.`}
              {confirmAction.type === 'restore' &&
                `This will download "${confirmAction.file.name}" from Google Drive and replace your current local tasks, reminders, alarms, and notes.`}
              {confirmAction.type === 'restoreLocal' &&
                `This will load "${confirmAction.fileName}" and replace your current local tasks, reminders, alarms, and notes.`}
            </p>

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                disabled={isMutating}
                onClick={() => setConfirmAction(null)}
                className="h-11 rounded-full px-5 text-xs font-medium text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F8FAFC] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isMutating}
                onClick={() => void executeConfirmedAction()}
                className={`h-11 rounded-full px-6 text-xs font-semibold transition-all cursor-pointer ${
                  confirmAction.type === 'delete'
                    ? 'bg-red-600 text-white dark:bg-[#ffb4ab] dark:text-[#690005]'
                    : confirmAction.type === 'restore' ||
                        confirmAction.type === 'restoreLocal'
                      ? 'bg-[#10B981] text-white dark:text-[#090A0F]'
                      : 'bg-gradient-to-r from-[#6366F1] to-[#818CF8] text-white'
                }`}
              >
                {isMutating
                  ? 'Working...'
                  : confirmAction.type === 'delete'
                    ? 'Delete File'
                    : confirmAction.type === 'overwrite'
                      ? 'Overwrite File'
                      : 'Restore Backup'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
