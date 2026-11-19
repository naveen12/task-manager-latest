import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  CheckCircle2,
  CheckSquare,
  Eye,
  Folder,
  FolderPlus,
  Hash,
  List,
  ListOrdered,
  Mic,
  MicOff,
  Pencil,
  Pin,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  DEFAULT_NOTE_FOLDERS,
  getTodayDateString,
  PRIORITY_META,
  type NoteCategory,
  type NoteItem,
  type PriorityLevel,
  type ReminderItem,
  type TaskItem,
} from '../types/chrono';
import { soundEngine } from '../utils/soundEngine';
import { CopyButton, PasteButton } from './ClipboardButtons';
import {
  isNativeAndroidPlatform,
  startNativeVoiceDictation,
} from '../utils/nativeAndroidBridge';

interface NotesSectionProps {
  notes: NoteItem[];
  folders: string[];
  onUpdateFolders: (next: string[]) => void;
  autoOpenCreateKey?: number;
  onCreateNote: (note: Omit<NoteItem, 'id' | 'updatedAt'>) => void;
  onUpdateNote: (id: string, updates: Omit<NoteItem, 'id' | 'updatedAt'>) => void;
  onDeleteNote: (id: string) => void;
  onTogglePin: (id: string) => void;
  onCreateTaskFromNote: (task: Omit<TaskItem, 'id' | 'completed'>) => void;
  onCreateReminderFromNote: (reminder: Omit<ReminderItem, 'id' | 'completed'>) => void;
}

interface WebSpeechRecognitionEvent {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
}

interface WebSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: WebSpeechRecognitionEvent) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function getSpeechRecognitionConstructor(): (new () => WebSpeechRecognition) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => WebSpeechRecognition;
    webkitSpeechRecognition?: new () => WebSpeechRecognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function formatUpdated(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function stripInlineSyntaxForTitle(raw: string): string {
  return raw
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/<\/?u>/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

function normalizeTag(raw: string): string {
  return raw
    .trim()
    .replace(/^#+/, '')
    .replace(/\s+/g, '-')
    .toLowerCase();
}

// XSS-safe inline rich text parser (**bold**, *italic*, <u>underline</u>, `code`)
function renderInlineFormatted(text: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|<u>[^<]+<\/u>|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      tokens.push(
        <strong key={keyIdx++} className="font-semibold text-slate-900 dark:text-[#F8FAFC]">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      tokens.push(
        <em key={keyIdx++} className="italic">
          {token.slice(1, -1)}
        </em>
      );
    } else if (token.startsWith('<u>') && token.endsWith('</u>')) {
      tokens.push(
        <span key={keyIdx++} className="underline decoration-indigo-500/70 underline-offset-2">
          {token.slice(3, -4)}
        </span>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      tokens.push(
        <code
          key={keyIdx++}
          className="rounded-md bg-slate-100 dark:bg-white/[0.08] px-1.5 py-0.5 font-mono text-[0.85em] text-indigo-700 dark:text-[#c0c1ff]"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push(text.slice(lastIndex));
  }
  return tokens;
}

export function toggleChecklistLineInContent(
  content: string,
  lineIdx: number
): string | null {
  const lines = content.split('\n');
  const target = lines[lineIdx];
  if (target === undefined) return null;
  const leading = target.match(/^\s*/)?.[0] ?? '';
  const trimmed = target.trim();
  const match = trimmed.match(/^-\s\[([ xX])\](?:\s(.*))?$/);
  if (!match) return null;
  const isChecked = match[1].toLowerCase() === 'x';
  const body = match[2] ?? '';
  lines[lineIdx] = `${leading}- [${isChecked ? ' ' : 'x'}] ${body}`;
  return lines.join('\n');
}

export const FormattedNoteContent: React.FC<{
  content: string;
  compact?: boolean;
  maxLines?: number;
  textSize?: 'xs' | 'sm';
  onToggleChecklistLine?: (lineIdx: number) => void;
  onConvertChecklistLine?: (text: string, target: 'task' | 'reminder') => void;
}> = ({
  content,
  compact = false,
  maxLines,
  textSize = 'sm',
  onToggleChecklistLine,
  onConvertChecklistLine,
}) => {
  if (!content.trim()) {
    return (
      <p className="text-xs italic text-slate-400 dark:text-[#64748B]">
        No content
      </p>
    );
  }

  const lines = content.split('\n');
  const lineLimit = maxLines ?? (compact ? 8 : undefined);
  const visibleLines =
    lineLimit !== undefined ? lines.slice(0, lineLimit) : lines;

  return (
    <div
      className={`flex flex-col gap-1.5 ${
        textSize === 'xs' ? 'text-xs' : 'text-sm'
      } leading-relaxed text-slate-600 dark:text-[#94A3B8] select-text`}
    >
      {visibleLines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={idx} className="h-1" />;
        }
        if (trimmed.startsWith('## ')) {
          return (
            <h4
              key={idx}
              className="text-sm font-semibold text-slate-900 dark:text-[#F8FAFC] mt-0.5"
            >
              {renderInlineFormatted(trimmed.slice(3))}
            </h4>
          );
        }
        if (trimmed.startsWith('# ')) {
          return (
            <h3
              key={idx}
              className="text-[15px] font-bold text-slate-900 dark:text-[#F8FAFC] mt-0.5"
            >
              {renderInlineFormatted(trimmed.slice(2))}
            </h3>
          );
        }
        const checklistMatch = trimmed.match(/^-\s\[([ xX])\](?:\s(.*))?$/);
        if (checklistMatch) {
          const isChecked = checklistMatch[1].toLowerCase() === 'x';
          const itemText = checklistMatch[2] ?? '';
          const cleanText = stripInlineSyntaxForTitle(itemText);

          return (
            <div
              key={idx}
              className="flex flex-wrap items-start justify-between gap-2 rounded-xl px-1.5 py-0.5 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors"
            >
              <div className="flex items-start gap-2 min-w-0 flex-1">
                {onToggleChecklistLine ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleChecklistLine(idx);
                    }}
                    aria-label={
                      isChecked
                        ? `Uncheck ${cleanText || 'item'}`
                        : `Check ${cleanText || 'item'}`
                    }
                    className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] transition-colors cursor-pointer ${
                      isChecked
                        ? 'border-emerald-500 bg-emerald-500/20 text-emerald-600 dark:text-[#34D399]'
                        : 'border-slate-400 dark:border-white/30 hover:border-indigo-500'
                    }`}
                  >
                    {isChecked ? '✓' : ''}
                  </button>
                ) : (
                  <span
                    className={`mt-0.5 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border text-[10px] ${
                      isChecked
                        ? 'border-emerald-500 bg-emerald-500/20 text-emerald-600 dark:text-[#34D399]'
                        : 'border-slate-400 dark:border-white/25'
                    }`}
                  >
                    {isChecked ? '✓' : ''}
                  </span>
                )}
                <span
                  className={`min-w-0 break-words ${
                    isChecked ? 'line-through opacity-70' : 'text-slate-700 dark:text-[#cbd5e1]'
                  }`}
                >
                  {renderInlineFormatted(itemText)}
                </span>
              </div>

              {onConvertChecklistLine && cleanText && (
                <div className="flex items-center gap-1 shrink-0 pt-0.5">
                  <button
                    type="button"
                    onClick={() => onConvertChecklistLine(cleanText, 'task')}
                    title="Convert line to Task"
                    className="inline-flex items-center gap-1 rounded-full bg-indigo-50 dark:bg-[#6366F1]/15 border border-indigo-200 dark:border-[#6366F1]/35 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:text-[#818CF8] hover:border-indigo-400 cursor-pointer whitespace-nowrap"
                  >
                    <CheckSquare className="h-2.5 w-2.5" />
                    Task
                  </button>
                  <button
                    type="button"
                    onClick={() => onConvertChecklistLine(cleanText, 'reminder')}
                    title="Convert line to Reminder"
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-[#10B981]/15 border border-emerald-200 dark:border-[#10B981]/35 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-[#34D399] hover:border-emerald-400 cursor-pointer whitespace-nowrap"
                  >
                    <Bell className="h-2.5 w-2.5" />
                    Reminder
                  </button>
                </div>
              )}
            </div>
          );
        }
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-1">
              <span className="text-indigo-500 dark:text-[#818CF8]">•</span>
              <span>{renderInlineFormatted(trimmed.slice(2))}</span>
            </div>
          );
        }
        if (/^\d+\.\s+/.test(trimmed)) {
          const match = trimmed.match(/^(\d+\.)\s+(.*)$/);
          if (match) {
            return (
              <div key={idx} className="flex items-start gap-2 pl-1">
                <span className="font-mono text-xs font-semibold text-indigo-600 dark:text-[#818CF8] mt-0.5">
                  {match[1]}
                </span>
                <span>{renderInlineFormatted(match[2])}</span>
              </div>
            );
          }
        }
        if (trimmed.startsWith('> ')) {
          return (
            <blockquote
              key={idx}
              className="border-l-2 border-indigo-400 dark:border-[#818CF8] pl-3 italic text-slate-700 dark:text-[#cbd5e1]"
            >
              {renderInlineFormatted(trimmed.slice(2))}
            </blockquote>
          );
        }
        return <p key={idx}>{renderInlineFormatted(line)}</p>;
      })}
      {lineLimit !== undefined && lines.length > lineLimit && (
        <p className="text-[11px] font-medium text-indigo-600 dark:text-[#818CF8]">
          +{lines.length - lineLimit} more lines…
        </p>
      )}
    </div>
  );
};

interface ConvertDraft {
  text: string;
  target: 'task' | 'reminder';
  date: string;
  time: string;
  priority: PriorityLevel;
}

export const NotesSection: React.FC<NotesSectionProps> = ({
  notes,
  folders,
  onUpdateFolders,
  autoOpenCreateKey,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
  onTogglePin,
  onCreateTaskFromNote,
  onCreateReminderFromNote,
}) => {
  const [folderFilter, setFolderFilter] = useState<string>('All');
  const [tagFilter, setTagFilter] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<NoteItem | null>(null);
  const [previewMode, setPreviewMode] = useState(false);

  // New folder quick-creator state
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // Form state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<NoteCategory>('General');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [pinned, setPinned] = useState(false);

  // Convert checklist item -> Task / Reminder dialog
  const [convertDraft, setConvertDraft] = useState<ConvertDraft | null>(null);
  const [convertToast, setConvertToast] = useState<string | null>(null);

  // Voice-to-Text state
  const [isListening, setIsListening] = useState(false);
  const [voiceTarget, setVoiceTarget] = useState<'title' | 'content'>('content');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<WebSpeechRecognition | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Merge configured folders with any folder names on existing notes
  const allFolders = useMemo(() => {
    const set = new Set<string>([...DEFAULT_NOTE_FOLDERS, ...folders]);
    notes.forEach((n) => {
      if (n.category?.trim()) set.add(n.category.trim());
    });
    return Array.from(set);
  }, [folders, notes]);

  // All distinct tags across notes
  const allTags = useMemo(() => {
    const set = new Set<string>();
    notes.forEach((n) => {
      (n.tags ?? []).forEach((t) => {
        const clean = normalizeTag(t);
        if (clean) set.add(clean);
      });
    });
    return Array.from(set).sort();
  }, [notes]);

  const stopVoiceDictation = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore stop errors
      }
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimTranscript('');
  };

  useEffect(() => {
    return () => {
      stopVoiceDictation();
    };
  }, []);

  const openCreate = () => {
    soundEngine.playTick(840, 0.02);
    stopVoiceDictation();
    setEditingNote(null);
    setTitle('');
    setContent('');
    setCategory(
      folderFilter !== 'All' && folderFilter !== 'Pinned'
        ? folderFilter
        : allFolders[0] ?? 'General'
    );
    setTags(tagFilter !== 'All' ? [tagFilter] : []);
    setTagInput('');
    setPinned(folderFilter === 'Pinned');
    setPreviewMode(false);
    setVoiceError(null);
    setEditorOpen(true);
  };

  useEffect(() => {
    if (autoOpenCreateKey && autoOpenCreateKey > 0) {
      openCreate();
    }
  }, [autoOpenCreateKey]);

  const openEdit = (note: NoteItem) => {
    soundEngine.playTick(800, 0.02);
    stopVoiceDictation();
    setEditingNote(note);
    setTitle(note.title);
    setContent(note.content);
    setCategory(note.category || 'General');
    setTags((note.tags ?? []).map(normalizeTag).filter(Boolean));
    setTagInput('');
    setPinned(note.pinned);
    setPreviewMode(false);
    setVoiceError(null);
    setEditorOpen(true);
  };

  const handleAddFolder = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newFolderName.trim();
    if (!cleaned) return;
    if (!allFolders.some((f) => f.toLowerCase() === cleaned.toLowerCase())) {
      onUpdateFolders([...allFolders, cleaned]);
    }
    soundEngine.playTick(860, 0.02);
    setFolderFilter(cleaned);
    setNewFolderName('');
    setNewFolderOpen(false);
  };

  const handleDeleteFolder = (folderName: string) => {
    if ((DEFAULT_NOTE_FOLDERS as readonly string[]).includes(folderName)) return;
    const inUse = notes.some((n) => n.category === folderName);
    if (inUse) return;
    soundEngine.playTick(680, 0.02);
    onUpdateFolders(folders.filter((f) => f !== folderName));
    if (folderFilter === folderName) {
      setFolderFilter('All');
    }
  };

  const handleAddTag = (rawTag?: string) => {
    const clean = normalizeTag(rawTag ?? tagInput);
    if (!clean) return;
    soundEngine.playTick(820, 0.015);
    setTags((prev) => (prev.includes(clean) ? prev : [...prev, clean]));
    if (!rawTag) setTagInput('');
  };

  const handleRemoveTag = (target: string) => {
    soundEngine.playTick(700, 0.015);
    setTags((prev) => prev.filter((t) => t !== target));
  };

  const appendDictatedText = (target: 'title' | 'content', spoken: string) => {
    const clean = spoken.trim();
    if (!clean) return;
    if (target === 'title') {
      setTitle((prev) => (prev.trim() ? `${prev.trim()} ${clean}` : clean));
    } else {
      setContent((prev) => {
        if (!prev.trim()) return clean;
        const needsSpace = !prev.endsWith(' ') && !prev.endsWith('\n');
        return `${prev}${needsSpace ? ' ' : ''}${clean}`;
      });
    }
  };

  const handleToggleVoiceDictation = async (target: 'title' | 'content') => {
    setVoiceError(null);

    if (isListening) {
      stopVoiceDictation();
      return;
    }

    setVoiceTarget(target);
    soundEngine.playTick(900, 0.02);

    // 1. Try Native Android Speech Recognizer first inside Capacitor APK
    if (isNativeAndroidPlatform()) {
      setIsListening(true);
      const nativeRes = await startNativeVoiceDictation(
        target === 'title' ? 'Speak note title...' : 'Dictate your note...'
      );
      setIsListening(false);
      if (nativeRes.supported) {
        if (nativeRes.text) {
          appendDictatedText(target, nativeRes.text);
        } else if (nativeRes.error) {
          setVoiceError(nativeRes.error);
        }
        return;
      }
    }

    // 2. Fallback to Web Speech API
    const SpeechRec = getSpeechRecognitionConstructor();
    if (!SpeechRec) {
      setVoiceError(
        'Voice-to-text is not supported in this browser. Try Chrome, Edge, or the Kairo Android app.'
      );
      return;
    }

    try {
      const recognition = new SpeechRec();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = navigator.language || 'en-US';

      recognition.onresult = (event) => {
        let finalChunk = '';
        let interimChunk = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const piece = event.results[i][0]?.transcript ?? '';
          if (event.results[i].isFinal) {
            finalChunk += piece;
          } else {
            interimChunk += piece;
          }
        }
        setInterimTranscript(interimChunk);
        if (finalChunk.trim()) {
          appendDictatedText(target, finalChunk);
        }
      };

      recognition.onerror = (err) => {
        setIsListening(false);
        setInterimTranscript('');
        if (err.error === 'not-allowed' || err.error === 'service-not-allowed') {
          setVoiceError('Microphone permission denied. Allow mic access in browser/app settings.');
        } else if (err.error && err.error !== 'no-speech' && err.error !== 'aborted') {
          setVoiceError(`Voice recognition error: ${err.error}`);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        setInterimTranscript('');
        recognitionRef.current = null;
      };

      recognitionRef.current = recognition;
      setIsListening(true);
      recognition.start();
    } catch (err) {
      setIsListening(false);
      setVoiceError(
        err instanceof Error ? err.message : 'Unable to start voice dictation.'
      );
    }
  };

  const parseListLinePrefix = (
    line: string
  ):
    | {
        kind: 'checklist' | 'numbered' | 'bullet';
        nextPrefix: string;
        prefixLen: number;
        body: string;
      }
    | null => {
    const checklistMatch = line.match(/^(\s*)-\s\[(?: |x|X)\]\s(.*)$/);
    if (checklistMatch) {
      const indent = checklistMatch[1] ?? '';
      return {
        kind: 'checklist',
        nextPrefix: `${indent}- [ ] `,
        prefixLen: indent.length + 6,
        body: checklistMatch[2] ?? '',
      };
    }

    const numberedMatch = line.match(/^(\s*)(\d+)\.\s(.*)$/);
    if (numberedMatch) {
      const indent = numberedMatch[1] ?? '';
      const num = Number(numberedMatch[2] ?? '1');
      return {
        kind: 'numbered',
        nextPrefix: `${indent}${num + 1}. `,
        prefixLen: indent.length + String(num).length + 2,
        body: numberedMatch[3] ?? '',
      };
    }

    const bulletMatch = line.match(/^(\s*)([-*])\s(.*)$/);
    if (bulletMatch) {
      const indent = bulletMatch[1] ?? '';
      const marker = bulletMatch[2] ?? '-';
      return {
        kind: 'bullet',
        nextPrefix: `${indent}${marker} `,
        prefixLen: indent.length + 2,
        body: bulletMatch[3] ?? '',
      };
    }

    return null;
  };

  const handleNoteContentKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (
      e.key !== 'Enter' ||
      e.shiftKey ||
      e.ctrlKey ||
      e.altKey ||
      e.metaKey ||
      e.nativeEvent.isComposing
    ) {
      return;
    }

    const el = e.currentTarget;
    const start = el.selectionStart ?? content.length;
    const end = el.selectionEnd ?? content.length;
    if (start !== end) return;

    const lineStart = content.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const nextNewline = content.indexOf('\n', start);
    const lineEnd = nextNewline === -1 ? content.length : nextNewline;
    const fullLine = content.slice(lineStart, lineEnd);

    const parsed = parseListLinePrefix(fullLine);
    if (!parsed) return;

    const col = start - lineStart;
    if (col < parsed.prefixLen) return;

    e.preventDefault();
    soundEngine.playTick(760, 0.01);

    // Exit list cleanly if pressing Enter on an empty list item
    if (parsed.body.trim() === '') {
      const nextContent = content.slice(0, lineStart) + content.slice(lineEnd);
      setContent(nextContent);
      window.requestAnimationFrame(() => {
        if (!textareaRef.current) return;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(lineStart, lineStart);
      });
      return;
    }

    const insertion = `\n${parsed.nextPrefix}`;
    const nextContent = content.slice(0, start) + insertion + content.slice(end);
    const nextCursor = start + insertion.length;
    setContent(nextContent);
    window.requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(nextCursor, nextCursor);
    });
  };

  // Fallback for mobile virtual keyboards (Android IME) that insert '\n' without a standard Enter keyDown
  const handleNoteContentChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    const nextVal = e.target.value;
    const pos = e.target.selectionStart ?? nextVal.length;

    if (
      nextVal.length === content.length + 1 &&
      pos > 0 &&
      nextVal[pos - 1] === '\n' &&
      nextVal.slice(0, pos - 1) === content.slice(0, pos - 1)
    ) {
      const prevLineStart =
        nextVal.lastIndexOf('\n', Math.max(0, pos - 2)) + 1;
      const prevLine = nextVal.slice(prevLineStart, pos - 1);
      const parsed = parseListLinePrefix(prevLine);

      if (parsed && pos - 1 - prevLineStart >= parsed.prefixLen) {
        if (parsed.body.trim() === '') {
          const exited =
            nextVal.slice(0, prevLineStart) + nextVal.slice(pos);
          setContent(exited);
          window.requestAnimationFrame(() => {
            if (!textareaRef.current) return;
            textareaRef.current.setSelectionRange(prevLineStart, prevLineStart);
          });
          return;
        }

        const continued =
          nextVal.slice(0, pos) + parsed.nextPrefix + nextVal.slice(pos);
        const nextCursor = pos + parsed.nextPrefix.length;
        setContent(continued);
        window.requestAnimationFrame(() => {
          if (!textareaRef.current) return;
          textareaRef.current.setSelectionRange(nextCursor, nextCursor);
        });
        return;
      }
    }

    setContent(nextVal);
  };

  // Text formatting helper around textarea selection
  const applyFormat = (
    prefix: string,
    suffix = '',
    placeholder = 'text',
    lineMode = false
  ) => {
    soundEngine.playTick(820, 0.015);
    const el = textareaRef.current;
    if (!el) {
      setContent((prev) =>
        prev
          ? `${prev}${lineMode ? '\n' : ' '}${prefix}${placeholder}${suffix}`
          : `${prefix}${placeholder}${suffix}`
      );
      return;
    }

    const start = el.selectionStart ?? content.length;
    const end = el.selectionEnd ?? content.length;
    const selected = content.slice(start, end);

    let nextContent = '';
    let nextCursorStart = start;
    let nextCursorEnd = end;

    if (lineMode) {
      const lineStart = content.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
      const blockEndIdx = content.indexOf('\n', end);
      const lineEnd = blockEndIdx === -1 ? content.length : blockEndIdx;
      const targetSlice = content.slice(lineStart, lineEnd);

      const rawLines = targetSlice.split('\n');
      const formattedLines = rawLines
        .map((line, i) => {
          const linePrefix = prefix === '1. ' ? `${i + 1}. ` : prefix;
          const existing = parseListLinePrefix(line);
          if (existing) {
            const cleanBody = existing.body || placeholder;
            return `${existing.kind === 'numbered' || prefix === '1. ' ? linePrefix : prefix}${cleanBody}`;
          }
          return line.startsWith(linePrefix)
            ? line
            : `${linePrefix}${line || placeholder}`;
        })
        .join('\n');

      nextContent =
        content.slice(0, lineStart) + formattedLines + content.slice(lineEnd);
      if (rawLines.length === 1 && targetSlice.trim() === '') {
        nextCursorStart = lineStart + prefix.length;
        nextCursorEnd = lineStart + formattedLines.length;
      } else {
        nextCursorStart = lineStart;
        nextCursorEnd = lineStart + formattedLines.length;
      }
    } else {
      const inner = selected || placeholder;
      const replacement = `${prefix}${inner}${suffix}`;
      nextContent = content.slice(0, start) + replacement + content.slice(end);
      nextCursorStart = start + prefix.length;
      nextCursorEnd = nextCursorStart + inner.length;
    }

    setContent(nextContent);
    setPreviewMode(false);
    window.requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(nextCursorStart, nextCursorEnd);
    });
  };

  const handleToggleChecklistOnNote = (note: NoteItem, lineIdx: number) => {
    const nextContent = toggleChecklistLineInContent(note.content, lineIdx);
    if (nextContent === null) return;
    soundEngine.playTick(840, 0.015);
    onUpdateNote(note.id, {
      title: note.title,
      content: nextContent,
      category: note.category,
      tags: note.tags,
      pinned: note.pinned,
    });
  };

  const openConvertChecklistModal = (
    text: string,
    target: 'task' | 'reminder'
  ) => {
    soundEngine.playTick(860, 0.02);
    const now = new Date();
    const nextHour = (now.getHours() + 1) % 24;
    const defaultTime = `${String(nextHour).padStart(2, '0')}:00`;
    setConvertDraft({
      text,
      target,
      date: getTodayDateString(),
      time: defaultTime,
      priority: 'medium',
    });
  };

  const handleConfirmConvert = (e: React.FormEvent) => {
    e.preventDefault();
    if (!convertDraft || !convertDraft.text.trim()) return;
    soundEngine.playCompletionChime();
    if (convertDraft.target === 'task') {
      onCreateTaskFromNote({
        title: convertDraft.text.trim(),
        dueDate: convertDraft.date,
        dueTime: convertDraft.time,
        durationMinutes: 30,
        priority: convertDraft.priority,
        category: 'Work',
      });
      setConvertToast(`Converted "${convertDraft.text.trim()}" to a Task.`);
    } else {
      onCreateReminderFromNote({
        title: convertDraft.text.trim(),
        date: convertDraft.date,
        time: convertDraft.time,
        repeat: 'once',
        priority: convertDraft.priority,
        active: true,
      });
      setConvertToast(`Converted "${convertDraft.text.trim()}" to a Reminder.`);
    }
    setConvertDraft(null);
    window.setTimeout(() => setConvertToast(null), 4000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() && !content.trim()) return;
    stopVoiceDictation();
    soundEngine.playTick(980, 0.03);

    const pendingTag = normalizeTag(tagInput);
    const finalTags = pendingTag
      ? Array.from(new Set([...tags, pendingTag]))
      : tags;

    const payload: Omit<NoteItem, 'id' | 'updatedAt'> = {
      title: title.trim() || 'Untitled Note',
      content: content.trim(),
      category: category.trim() || 'General',
      tags: finalTags.length > 0 ? finalTags : undefined,
      pinned,
    };

    if (editingNote) {
      onUpdateNote(editingNote.id, payload);
    } else {
      onCreateNote(payload);
    }
    setEditorOpen(false);
    setEditingNote(null);
  };

  const filteredNotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notes
      .filter((n) => {
        if (folderFilter === 'All') return true;
        if (folderFilter === 'Pinned') return n.pinned;
        return n.category === folderFilter;
      })
      .filter((n) =>
        tagFilter === 'All'
          ? true
          : (n.tags ?? []).map(normalizeTag).includes(tagFilter)
      )
      .filter((n) =>
        q
          ? n.title.toLowerCase().includes(q) ||
            n.content.toLowerCase().includes(q) ||
            (n.tags ?? []).some((t) => t.toLowerCase().includes(q))
          : true
      )
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.updatedAt.localeCompare(a.updatedAt);
      });
  }, [notes, folderFilter, tagFilter, search]);

  const pinnedFiltered = filteredNotes.filter((n) => n.pinned);
  const unpinnedFiltered = filteredNotes.filter((n) => !n.pinned);

  const renderNoteCard = (note: NoteItem) => (
    <article
      key={note.id}
      className={`flex flex-col justify-between rounded-[26px] p-5 transition-all border shadow-xs dark:shadow-none ${
        note.pinned
          ? 'bg-white dark:bg-[#1A1D2D] border-indigo-300 dark:border-[#6366F1]/40'
          : 'bg-white dark:bg-[#1A1D2D]/75 border-slate-200 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/15'
      }`}
    >
      <div>
        <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-[#94A3B8]">
          <span className="inline-flex items-center gap-1.5 min-w-0 truncate">
            <Folder className="h-3.5 w-3.5 text-indigo-600 dark:text-[#818CF8] shrink-0" />
            <span className="font-medium text-slate-700 dark:text-[#cbd5e1]">
              {note.category}
            </span>
            <span aria-hidden="true">·</span>
            <span className="truncate">{formatUpdated(note.updatedAt)}</span>
          </span>
          <div className="flex items-center gap-0.5 shrink-0">
            <CopyButton
              compact
              text={`${note.title}${note.content ? `\n\n${note.content}` : ''}`}
              ariaLabel={`Copy note ${note.title}`}
            />
            <button
              type="button"
              onClick={() => onTogglePin(note.id)}
              aria-label={note.pinned ? `Unpin ${note.title}` : `Pin ${note.title}`}
              className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors cursor-pointer ${
                note.pinned
                  ? 'text-indigo-600 dark:text-[#818CF8] bg-indigo-50 dark:bg-[#6366F1]/15'
                  : 'text-slate-400 dark:text-[#64748B] hover:text-slate-900 dark:hover:text-[#F8FAFC]'
              }`}
            >
              <Pin className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => openEdit(note)}
              aria-label={`Edit ${note.title}`}
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 dark:text-[#94A3B8] hover:bg-slate-100 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-[#F8FAFC] transition-colors cursor-pointer"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDeleteNote(note.id)}
              aria-label={`Delete ${note.title}`}
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 dark:text-[#64748B] hover:bg-red-50 dark:hover:bg-white/[0.06] hover:text-red-600 dark:hover:text-[#ffb4ab] transition-colors cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <h3 className="mt-2 mb-2 text-base font-semibold text-slate-900 dark:text-[#F8FAFC] select-text">
          {note.title}
        </h3>

        {note.tags && note.tags.length > 0 && (
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {note.tags.map((t) => {
              const clean = normalizeTag(t);
              if (!clean) return null;
              return (
                <button
                  key={clean}
                  type="button"
                  onClick={() =>
                    setTagFilter((prev) => (prev === clean ? 'All' : clean))
                  }
                  className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-medium border transition-colors cursor-pointer ${
                    tagFilter === clean
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-100 dark:bg-[#12141F] text-indigo-700 dark:text-[#818CF8] border-slate-200 dark:border-white/[0.08]'
                  }`}
                >
                  <Hash className="h-2.5 w-2.5" />
                  {clean}
                </button>
              );
            })}
          </div>
        )}

        <FormattedNoteContent
          content={note.content}
          compact
          onToggleChecklistLine={(lineIdx) => handleToggleChecklistOnNote(note, lineIdx)}
          onConvertChecklistLine={openConvertChecklistModal}
        />
      </div>
    </article>
  );

  return (
    <section className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-[#F8FAFC] tracking-tight">
            Notes
          </h2>
          <p className="text-xs text-slate-600 dark:text-[#94A3B8] tabular-nums mt-0.5">
            {notes.filter((n) => n.pinned).length} pinned · {allFolders.length} folders · {notes.length} total
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              soundEngine.playTick(780, 0.015);
              setNewFolderOpen((v) => !v);
            }}
            className="flex min-h-[42px] items-center gap-1.5 rounded-full bg-slate-100 dark:bg-white/[0.05] px-4 text-xs font-medium text-slate-700 dark:text-[#F8FAFC] border border-slate-200 dark:border-white/10 hover:border-indigo-400 transition-colors cursor-pointer whitespace-nowrap"
          >
            <FolderPlus className="h-3.5 w-3.5 text-indigo-600 dark:text-[#818CF8]" />
            New Folder
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="flex min-h-[44px] items-center gap-2 rounded-full bg-gradient-to-r from-[#6366F1] to-[#818CF8] px-5 py-2 text-xs font-semibold text-white shadow-[0_0_16px_rgba(99,102,241,0.35),inset_0_1px_0_rgba(255,255,255,0.3)] active:scale-[0.98] transition-all whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            New Note
          </button>
        </div>
      </div>

      {/* Toast Confirmation for Checklist Conversion */}
      {convertToast && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-2xl bg-emerald-50 dark:bg-[#10B981]/15 border border-emerald-300 dark:border-[#10B981]/35 px-4 py-2.5 text-xs font-medium text-emerald-700 dark:text-[#34D399]"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{convertToast}</span>
        </div>
      )}

      {/* Inline New Folder Creator */}
      {newFolderOpen && (
        <form
          onSubmit={handleAddFolder}
          className="flex flex-wrap items-center gap-2 rounded-2xl bg-white dark:bg-[#1A1D2D] border border-indigo-300 dark:border-[#6366F1]/40 p-3 shadow-sm"
        >
          <Folder className="h-4 w-4 text-indigo-600 dark:text-[#818CF8] ml-1 shrink-0" />
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Folder name (e.g., Projects, Health, Journal)"
            className="flex-1 min-w-[180px] min-h-[38px] rounded-xl bg-slate-50 dark:bg-[#12141F] px-3 text-xs text-slate-900 dark:text-[#F8FAFC] border border-slate-200 dark:border-white/10 focus:border-[#6366F1] focus:outline-none"
          />
          <button
            type="submit"
            disabled={!newFolderName.trim()}
            className="min-h-[38px] rounded-full bg-indigo-600 px-4 text-xs font-semibold text-white disabled:opacity-45 cursor-pointer"
          >
            Add Folder
          </button>
          <button
            type="button"
            onClick={() => setNewFolderOpen(false)}
            className="min-h-[38px] rounded-full px-3 text-xs text-slate-500 dark:text-[#94A3B8] cursor-pointer"
          >
            Cancel
          </button>
        </form>
      )}

      {/* Folders & Search Bar */}
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div
            role="tablist"
            aria-label="Filter notes by folder"
            className="flex flex-wrap items-center gap-1 rounded-2xl bg-slate-100 dark:bg-[#12141F] p-1 border border-slate-200 dark:border-white/[0.06]"
          >
            {(['All', 'Pinned', ...allFolders] as const).map((folder) => {
              const isCustomUnused =
                folder !== 'All' &&
                folder !== 'Pinned' &&
                !(DEFAULT_NOTE_FOLDERS as readonly string[]).includes(folder) &&
                !notes.some((n) => n.category === folder);
              return (
                <div key={folder} className="inline-flex items-center">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={folderFilter === folder}
                    onClick={() => {
                      soundEngine.playTick(780, 0.02);
                      setFolderFilter(folder);
                    }}
                    className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-full px-3.5 text-xs font-medium transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                      folderFilter === folder
                        ? 'bg-white dark:bg-[#1A1D2D] text-slate-900 dark:text-[#F8FAFC] border border-slate-200 dark:border-white/15 shadow-xs'
                        : 'text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F8FAFC] border border-transparent'
                    }`}
                  >
                    {folder === 'Pinned' && <Pin className="h-3 w-3" />}
                    <span>{folder}</span>
                  </button>
                  {isCustomUnused && (
                    <button
                      type="button"
                      onClick={() => handleDeleteFolder(folder)}
                      aria-label={`Remove empty folder ${folder}`}
                      className="ml-0.5 flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:text-red-500 cursor-pointer"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-[#64748B]" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notes & tags..."
              aria-label="Search notes"
              className="min-h-[44px] w-full rounded-full bg-white dark:bg-[#12141F] pl-10 pr-4 text-sm text-slate-900 dark:text-[#F8FAFC] placeholder:text-slate-400 dark:placeholder:text-[#64748B] border border-slate-200 dark:border-white/[0.08] focus:border-[#6366F1] focus:outline-none"
            />
          </div>
        </div>

        {/* Tag Filter Pills */}
        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium text-slate-500 dark:text-[#64748B] mr-1">
              Tags:
            </span>
            <button
              type="button"
              onClick={() => setTagFilter('All')}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium border cursor-pointer transition-colors ${
                tagFilter === 'All'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white dark:bg-[#12141F] text-slate-600 dark:text-[#94A3B8] border-slate-200 dark:border-white/[0.08]'
              }`}
            >
              All
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setTagFilter((prev) => (prev === tag ? 'All' : tag))}
                className={`inline-flex items-center gap-0.5 rounded-full px-2.5 py-1 text-[11px] font-medium border cursor-pointer transition-colors ${
                  tagFilter === tag
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white dark:bg-[#12141F] text-indigo-700 dark:text-[#818CF8] border-slate-200 dark:border-white/[0.08]'
                }`}
              >
                <Hash className="h-2.5 w-2.5" />
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit Note Form */}
      {editorOpen && (
        <form
          onSubmit={handleSubmit}
          className="rounded-[28px] bg-white dark:bg-[#1A1D2D] border border-indigo-300 dark:border-[#6366F1]/40 p-5 flex flex-col gap-4 shadow-lg dark:shadow-[0_16px_48px_rgba(0,0,0,0.5)]"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-[#F8FAFC]">
              {editingNote ? 'Edit Note' : 'Create Note'}
            </h3>
            <button
              type="button"
              onClick={() => {
                stopVoiceDictation();
                setEditorOpen(false);
              }}
              aria-label="Close note editor"
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 dark:text-[#94A3B8] hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-[#F8FAFC] cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label
                  htmlFor="note-title-input"
                  className="block text-xs font-medium text-slate-600 dark:text-[#94A3B8]"
                >
                  Title
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void handleToggleVoiceDictation('title')}
                    aria-label="Dictate note title"
                    className={`inline-flex min-h-[26px] items-center gap-1 rounded-full px-2.5 text-[11px] font-medium border transition-colors cursor-pointer ${
                      isListening && voiceTarget === 'title'
                        ? 'bg-red-500/15 text-red-600 dark:text-[#ffb4ab] border-red-400/50 animate-pulse'
                        : 'bg-slate-100 dark:bg-white/[0.05] text-slate-600 dark:text-[#94A3B8] border-slate-200 dark:border-white/[0.08] hover:text-slate-900 dark:hover:text-[#F8FAFC]'
                    }`}
                  >
                    {isListening && voiceTarget === 'title' ? (
                      <>
                        <MicOff className="h-3 w-3" />
                        <span>Stop</span>
                      </>
                    ) : (
                      <>
                        <Mic className="h-3 w-3" />
                        <span>Voice</span>
                      </>
                    )}
                  </button>
                  {title && <CopyButton text={title} ariaLabel="Copy note title" />}
                  <PasteButton
                    targetInputId="note-title-input"
                    onPasteText={(val) => setTitle((prev) => (prev ? `${prev} ${val}` : val))}
                  />
                </div>
              </div>
              <input
                id="note-title-input"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Note title..."
                required
                className="min-h-[48px] w-full rounded-2xl bg-slate-50 dark:bg-[#161926] px-4 text-sm text-slate-900 dark:text-[#F8FAFC] placeholder:text-slate-400 dark:placeholder:text-[#64748B] border border-slate-200 dark:border-white/[0.08] focus:border-[#6366F1] focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="note-folder-select"
                className="block text-xs font-medium text-slate-600 dark:text-[#94A3B8] mb-1.5"
              >
                Folder
              </label>
              <select
                id="note-folder-select"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="min-h-[48px] w-full rounded-2xl bg-slate-50 dark:bg-[#161926] px-3.5 text-sm text-slate-900 dark:text-[#F8FAFC] border border-slate-200 dark:border-white/[0.08] focus:border-[#6366F1] focus:outline-none cursor-pointer"
              >
                {allFolders.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Tags Editor */}
          <div>
            <label
              htmlFor="note-tag-input"
              className="block text-xs font-medium text-slate-600 dark:text-[#94A3B8] mb-1.5"
            >
              Tags (optional)
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
                <input
                  id="note-tag-input"
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  placeholder="Type tag & press Add (e.g., meeting)"
                  className="min-h-[40px] flex-1 rounded-xl bg-slate-50 dark:bg-[#161926] px-3 text-xs text-slate-900 dark:text-[#F8FAFC] placeholder:text-slate-400 dark:placeholder:text-[#64748B] border border-slate-200 dark:border-white/[0.08] focus:border-[#6366F1] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleAddTag()}
                  disabled={!tagInput.trim()}
                  className="min-h-[40px] rounded-xl bg-slate-100 dark:bg-white/[0.06] px-3.5 text-xs font-medium text-slate-700 dark:text-[#F8FAFC] border border-slate-200 dark:border-white/10 disabled:opacity-40 cursor-pointer"
                >
                  Add Tag
                </button>
              </div>
              {(['urgent', 'meeting', 'shopping'] as const).map((preset) =>
                tags.includes(preset) ? null : (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleAddTag(preset)}
                    className="rounded-full bg-slate-100 dark:bg-[#12141F] border border-slate-200 dark:border-white/[0.07] px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:text-[#94A3B8] hover:border-indigo-400 cursor-pointer"
                  >
                    +#{preset}
                  </button>
                )
              )}
            </div>
            {tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full bg-indigo-50 dark:bg-[#6366F1]/15 border border-indigo-200 dark:border-[#6366F1]/35 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:text-[#c0c1ff]"
                  >
                    #{tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      aria-label={`Remove tag ${tag}`}
                      className="hover:text-red-600 cursor-pointer"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <label
                htmlFor="note-content-input"
                className="block text-xs font-medium text-slate-600 dark:text-[#94A3B8]"
              >
                Content (Formatted Text &amp; Voice)
              </label>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void handleToggleVoiceDictation('content')}
                  className={`inline-flex min-h-[28px] items-center gap-1.5 rounded-full px-3 text-[11px] font-semibold border transition-all cursor-pointer ${
                    isListening && voiceTarget === 'content'
                      ? 'bg-red-500/15 text-red-600 dark:text-[#ffb4ab] border-red-400/50 animate-pulse'
                      : 'bg-indigo-50 dark:bg-[#6366F1]/15 text-indigo-700 dark:text-[#c0c1ff] border-indigo-300 dark:border-[#6366F1]/40'
                  }`}
                >
                  {isListening && voiceTarget === 'content' ? (
                    <>
                      <MicOff className="h-3.5 w-3.5" />
                      <span>Stop Listening</span>
                    </>
                  ) : (
                    <>
                      <Mic className="h-3.5 w-3.5" />
                      <span>Voice to Text</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setPreviewMode((p) => !p)}
                  className={`inline-flex min-h-[28px] items-center gap-1 rounded-full px-2.5 text-[11px] font-medium border transition-colors cursor-pointer ${
                    previewMode
                      ? 'bg-emerald-50 dark:bg-[#10B981]/15 text-emerald-700 dark:text-[#34D399] border-emerald-300 dark:border-[#10B981]/40'
                      : 'bg-slate-100 dark:bg-white/[0.05] text-slate-600 dark:text-[#94A3B8] border-slate-200 dark:border-white/[0.08]'
                  }`}
                >
                  {previewMode ? (
                    <>
                      <Pencil className="h-3 w-3" />
                      <span>Edit</span>
                    </>
                  ) : (
                    <>
                      <Eye className="h-3 w-3" />
                      <span>Preview</span>
                    </>
                  )}
                </button>

                {content && <CopyButton text={content} ariaLabel="Copy note content" />}
                <PasteButton
                  targetInputId="note-content-input"
                  onPasteText={(val) =>
                    setContent((prev) => (prev ? `${prev}\n${val}` : val))
                  }
                />
              </div>
            </div>

            {/* Text Formatting Toolbar (Bullets, Numbered, Checklists only) */}
            <div
              role="toolbar"
              aria-label="Text formatting tools"
              className="mb-2 flex flex-wrap items-center gap-1.5 rounded-2xl bg-slate-100 dark:bg-[#12141F] p-1.5 border border-slate-200 dark:border-white/[0.06]"
            >
              <button
                type="button"
                title="Bullet List (- item)"
                aria-label="Bullet list"
                onClick={() => applyFormat('- ', '', 'List item', true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium text-slate-700 dark:text-[#cbd5e1] hover:bg-white dark:hover:bg-white/10 transition-colors cursor-pointer"
              >
                <List className="h-3.5 w-3.5 text-indigo-600 dark:text-[#818CF8]" />
                <span>Bullets</span>
              </button>
              <button
                type="button"
                title="Numbered List (1. item)"
                aria-label="Numbered list"
                onClick={() => applyFormat('1. ', '', 'Step', true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium text-slate-700 dark:text-[#cbd5e1] hover:bg-white dark:hover:bg-white/10 transition-colors cursor-pointer"
              >
                <ListOrdered className="h-3.5 w-3.5 text-indigo-600 dark:text-[#818CF8]" />
                <span>Numbered</span>
              </button>
              <button
                type="button"
                title="Checklist (- [ ] item)"
                aria-label="Checklist"
                onClick={() => applyFormat('- [ ] ', '', 'To-do item', true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium text-slate-700 dark:text-[#cbd5e1] hover:bg-white dark:hover:bg-white/10 transition-colors cursor-pointer"
              >
                <CheckSquare className="h-3.5 w-3.5 text-indigo-600 dark:text-[#818CF8]" />
                <span>Checklist</span>
              </button>
            </div>

            {isListening && (
              <div className="mb-2 flex items-center justify-between gap-2 rounded-xl bg-indigo-50 dark:bg-[#6366F1]/15 border border-indigo-200 dark:border-[#6366F1]/35 px-3 py-2 text-xs text-indigo-700 dark:text-[#c0c1ff]">
                <span className="truncate">
                  {interimTranscript
                    ? `Hearing: "${interimTranscript}"`
                    : `Listening for ${voiceTarget}… speak clearly.`}
                </span>
                <button
                  type="button"
                  onClick={stopVoiceDictation}
                  className="font-semibold underline cursor-pointer shrink-0"
                >
                  Stop
                </button>
              </div>
            )}

            {voiceError && (
              <p role="alert" className="mb-2 text-xs text-red-600 dark:text-[#ffb4ab]">
                {voiceError}
              </p>
            )}

            {previewMode ? (
              <div className="min-h-[140px] w-full rounded-2xl bg-slate-50 dark:bg-[#161926] p-4 border border-slate-200 dark:border-white/[0.08]">
                <FormattedNoteContent
                  content={content}
                  onConvertChecklistLine={openConvertChecklistModal}
                />
              </div>
            ) : (
              <textarea
                ref={textareaRef}
                id="note-content-input"
                rows={6}
                value={content}
                onKeyDown={handleNoteContentKeyDown}
                onChange={handleNoteContentChange}
                placeholder="Write or dictate ideas, checklists (- [ ] item), and meeting notes..."
                className="w-full rounded-2xl bg-slate-50 dark:bg-[#161926] p-4 text-sm leading-relaxed text-slate-900 dark:text-[#F8FAFC] placeholder:text-slate-400 dark:placeholder:text-[#64748B] border border-slate-200 dark:border-white/[0.08] focus:border-[#6366F1] focus:outline-none resize-y"
              />
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={() => setPinned((p) => !p)}
              className={`flex min-h-[40px] items-center gap-2 rounded-full px-4 text-xs font-medium border transition-colors cursor-pointer ${
                pinned
                  ? 'bg-indigo-50 dark:bg-[#6366F1]/20 text-indigo-700 dark:text-[#c0c1ff] border-indigo-300 dark:border-[#6366F1]/40'
                  : 'bg-slate-100 dark:bg-[#12141F] text-slate-600 dark:text-[#94A3B8] border-slate-200 dark:border-white/[0.06]'
              }`}
            >
              <Pin className="h-3.5 w-3.5" />
              {pinned ? 'Pinned to top' : 'Pin note'}
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  stopVoiceDictation();
                  setEditorOpen(false);
                }}
                className="min-h-[44px] rounded-full px-5 text-xs font-medium text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F8FAFC] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="min-h-[44px] rounded-full bg-gradient-to-r from-[#6366F1] to-[#818CF8] px-6 text-xs font-semibold text-white shadow-[0_0_16px_rgba(99,102,241,0.4)] cursor-pointer"
              >
                {editingNote ? 'Save Changes' : 'Save Note'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Notes Grid (Pinned grouped visibly first) */}
      {filteredNotes.length === 0 ? (
        <div className="rounded-[28px] bg-white/70 dark:bg-[#1A1D2D]/50 border border-slate-200 dark:border-white/[0.06] p-8 text-center">
          <p className="text-sm font-medium text-slate-900 dark:text-[#F8FAFC]">
            No notes found
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-[#64748B]">
            Create a note or adjust your folder, tag, or search filter.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {pinnedFiltered.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-[#818CF8]">
                <Pin className="h-3.5 w-3.5" />
                <span>Pinned</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {pinnedFiltered.map(renderNoteCard)}
              </div>
            </div>
          )}

          {unpinnedFiltered.length > 0 && (
            <div className="flex flex-col gap-2.5">
              {pinnedFiltered.length > 0 && (
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-[#64748B]">
                  Notes
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {unpinnedFiltered.map(renderNoteCard)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Convert Checklist Line -> Task / Reminder Modal */}
      {convertDraft && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="convert-checklist-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 dark:bg-[#090A0F]/85 backdrop-blur-md p-5"
        >
          <form
            onSubmit={handleConfirmConvert}
            className="w-full max-w-md rounded-[28px] bg-white dark:bg-[#1A1D2D] border border-slate-200 dark:border-white/15 p-6 shadow-2xl flex flex-col gap-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h3
                id="convert-checklist-title"
                className="text-base font-semibold text-slate-900 dark:text-[#F8FAFC]"
              >
                Convert Checklist Item
              </h3>
              <button
                type="button"
                onClick={() => setConvertDraft(null)}
                aria-label="Close conversion dialog"
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 dark:bg-[#12141F] p-1 border border-slate-200 dark:border-white/[0.06]">
              {(['task', 'reminder'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() =>
                    setConvertDraft((prev) => (prev ? { ...prev, target: mode } : prev))
                  }
                  className={`min-h-[38px] rounded-xl text-xs font-semibold capitalize transition-all cursor-pointer ${
                    convertDraft.target === mode
                      ? 'bg-white dark:bg-[#1A1D2D] text-slate-900 dark:text-[#F8FAFC] shadow-xs'
                      : 'text-slate-600 dark:text-[#94A3B8]'
                  }`}
                >
                  {mode === 'task' ? 'To Task' : 'To Reminder'}
                </button>
              ))}
            </div>

            <div>
              <label
                htmlFor="convert-item-title"
                className="block text-xs font-medium text-slate-600 dark:text-[#94A3B8] mb-1"
              >
                Title
              </label>
              <input
                id="convert-item-title"
                type="text"
                value={convertDraft.text}
                onChange={(e) =>
                  setConvertDraft((prev) =>
                    prev ? { ...prev, text: e.target.value } : prev
                  )
                }
                required
                className="min-h-[44px] w-full rounded-2xl bg-slate-50 dark:bg-[#161926] px-3.5 text-sm text-slate-900 dark:text-[#F8FAFC] border border-slate-200 dark:border-white/10 focus:border-[#6366F1] focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="convert-item-date"
                  className="block text-xs font-medium text-slate-600 dark:text-[#94A3B8] mb-1"
                >
                  Date
                </label>
                <input
                  id="convert-item-date"
                  type="date"
                  value={convertDraft.date}
                  onChange={(e) =>
                    setConvertDraft((prev) =>
                      prev ? { ...prev, date: e.target.value } : prev
                    )
                  }
                  className="min-h-[44px] w-full rounded-2xl bg-slate-50 dark:bg-[#161926] px-3 font-mono text-xs text-slate-900 dark:text-[#F8FAFC] border border-slate-200 dark:border-white/10 focus:border-[#6366F1] focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="convert-item-time"
                  className="block text-xs font-medium text-slate-600 dark:text-[#94A3B8] mb-1"
                >
                  Time
                </label>
                <input
                  id="convert-item-time"
                  type="time"
                  value={convertDraft.time}
                  onChange={(e) =>
                    setConvertDraft((prev) =>
                      prev ? { ...prev, time: e.target.value } : prev
                    )
                  }
                  className="min-h-[44px] w-full rounded-2xl bg-slate-50 dark:bg-[#161926] px-3 font-mono text-xs text-slate-900 dark:text-[#F8FAFC] border border-slate-200 dark:border-white/10 focus:border-[#6366F1] focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-slate-100 dark:bg-[#12141F] p-1 border border-slate-200 dark:border-white/[0.06]">
              {(['high', 'medium', 'low'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() =>
                    setConvertDraft((prev) => (prev ? { ...prev, priority: p } : prev))
                  }
                  className={`min-h-[38px] rounded-xl text-[11px] font-semibold cursor-pointer ${
                    convertDraft.priority === p
                      ? `${PRIORITY_META[p].bgClass} ${PRIORITY_META[p].textClass} border ${PRIORITY_META[p].borderClass}`
                      : 'text-slate-500 dark:text-[#94A3B8]'
                  }`}
                >
                  {PRIORITY_META[p].shortLabel}
                </button>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConvertDraft(null)}
                className="min-h-[42px] rounded-full px-4 text-xs font-medium text-slate-600 dark:text-[#94A3B8] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="min-h-[42px] rounded-full bg-gradient-to-r from-[#6366F1] to-[#818CF8] px-5 text-xs font-semibold text-white cursor-pointer"
              >
                {convertDraft.target === 'task' ? 'Create Task' : 'Create Reminder'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
};
