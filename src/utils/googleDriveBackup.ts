import type {
  ChronoAlarm,
  NoteItem,
  ReminderItem,
  TaskItem,
} from '../types/chrono';

export interface ChronoBackupPayload {
  app: 'Kairo' | 'Chrono Tempo';
  version: 1;
  createdAt: string;
  counts: {
    tasks: number;
    reminders: number;
    alarms: number;
    notes: number;
  };
  data: {
    tasks: TaskItem[];
    reminders: ReminderItem[];
    alarms: ChronoAlarm[];
    notes: NoteItem[];
  };
}

export interface DriveBackupFile {
  id: string;
  name: string;
  modifiedTime: string;
  size?: string;
}

export class DriveAuthExpiredError extends Error {
  constructor() {
    super('Google session expired. Please sign in again.');
    this.name = 'DriveAuthExpiredError';
  }
}

async function handleDriveResponse(res: Response): Promise<Response> {
  if (res.status === 401) {
    throw new DriveAuthExpiredError();
  }
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(
      `Google Drive request failed (${res.status})${errText ? `: ${errText}` : ''}`
    );
  }
  return res;
}

export function buildBackupPayload(input: {
  tasks: TaskItem[];
  reminders: ReminderItem[];
  alarms: ChronoAlarm[];
  notes: NoteItem[];
}): ChronoBackupPayload {
  return {
    app: 'Kairo',
    version: 1,
    createdAt: new Date().toISOString(),
    counts: {
      tasks: input.tasks.length,
      reminders: input.reminders.length,
      alarms: input.alarms.length,
      notes: input.notes.length,
    },
    data: {
      tasks: input.tasks,
      reminders: input.reminders,
      alarms: input.alarms,
      notes: input.notes,
    },
  };
}

export function formatDefaultBackupFilename(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `kairo-backup-${y}-${m}-${day}-${hh}${mm}.json`;
}

export async function listDriveBackups(
  accessToken: string
): Promise<DriveBackupFile[]> {
  const query = encodeURIComponent(
    "trashed = false and mimeType = 'application/json' and appProperties has { key='chronoTempoApp' and value='true' }"
  );
  const fields = encodeURIComponent('files(id,name,modifiedTime,size)');
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&orderBy=modifiedTime desc&pageSize=25`;

  const res = await handleDriveResponse(
    await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
  );
  const json = (await res.json()) as { files?: DriveBackupFile[] };
  return json.files ?? [];
}

export async function createDriveBackup(
  accessToken: string,
  fileName: string,
  payload: ChronoBackupPayload
): Promise<DriveBackupFile> {
  const safeName = fileName.trim().endsWith('.json')
    ? fileName.trim()
    : `${fileName.trim() || 'kairo-backup'}.json`;

  const metadata = {
    name: safeName,
    mimeType: 'application/json',
    description: 'Kairo backup archive (Tasks, Reminders, Alarms, Notes)',
    appProperties: {
      chronoTempoApp: 'true',
      backupVersion: '1',
    },
  };

  const boundary = `chrono_boundary_${Date.now()}`;
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${JSON.stringify(payload, null, 2)}\r\n` +
    `--${boundary}--`;

  const res = await handleDriveResponse(
    await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,size',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      }
    )
  );

  return (await res.json()) as DriveBackupFile;
}

export async function updateDriveBackup(
  accessToken: string,
  fileId: string,
  payload: ChronoBackupPayload
): Promise<DriveBackupFile> {
  const res = await handleDriveResponse(
    await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(
        fileId
      )}?uploadType=media&fields=id,name,modifiedTime,size`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload, null, 2),
      }
    )
  );
  return (await res.json()) as DriveBackupFile;
}

export async function downloadDriveBackup(
  accessToken: string,
  fileId: string
): Promise<ChronoBackupPayload> {
  const res = await handleDriveResponse(
    await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
        fileId
      )}?alt=media`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )
  );
  const parsed = (await res.json()) as Partial<ChronoBackupPayload>;
  if (
    !parsed ||
    !parsed.data ||
    !Array.isArray(parsed.data.tasks) ||
    !Array.isArray(parsed.data.reminders) ||
    !Array.isArray(parsed.data.alarms) ||
    !Array.isArray(parsed.data.notes)
  ) {
    throw new Error('Selected file is not a valid Kairo backup.');
  }
  return parsed as ChronoBackupPayload;
}

export async function deleteDriveBackup(
  accessToken: string,
  fileId: string
): Promise<void> {
  await handleDriveResponse(
    await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )
  );
}
