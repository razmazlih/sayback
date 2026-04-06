'use client';

import {
  startTransition,
  useDeferredValue,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AdminUsageEntry } from '@/app/admin/types';

type AdminDashboardClientProps = {
  rows: AdminUsageEntry[];
};

type SourceFilter = 'all' | AdminUsageEntry['source'];
type StatusFilter = 'all' | 'success' | 'failed';
type SortOrder = 'newest' | 'oldest';

type ActionInfo = {
  normalized: string;
  actionLabel: string;
  eventTypeLabel: 'הודעה חדשה' | 'תיקון';
  isRefine: boolean;
  className: string;
};

type UserGroup = {
  uid: string;
  rows: AdminUsageEntry[];
  latestInitialMessages: Array<{
    id: string;
    createdAt: string;
    message: string | null;
    hasImage: boolean;
    noReplyMode: boolean | null;
    lastOutgoingMessage: string | null;
  }>;
  totalCount: number;
  successCount: number;
  nonSuccessCount: number;
  newMessageCount: number;
  refineCount: number;
  firstAt: string;
  firstAtMs: number;
  lastAt: string;
  lastAtMs: number;
};

const dateFormatter = new Intl.DateTimeFormat('he-IL', {
  dateStyle: 'short',
  timeStyle: 'medium',
});

const SOURCE_OPTIONS: Array<{ value: SourceFilter; label: string }> = [
  { value: 'all', label: 'כל המקורות' },
  { value: 'production', label: 'פרודקשן' },
  { value: 'local', label: 'מקומי' },
];

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'כל הסטטוסים' },
  { value: 'success', label: 'הצלחות' },
  { value: 'failed', label: 'כשלים / חסומים / בתהליך' },
];

const SORT_OPTIONS: Array<{ value: SortOrder; label: string }> = [
  { value: 'newest', label: 'חדש ← ישן (מומלץ)' },
  { value: 'oldest', label: 'ישן ← חדש' },
];

const MAX_EVENTS_PER_USER_COLLAPSED = 6;

export default function AdminDashboardClient({ rows }: AdminDashboardClientProps) {
  const searchId = useId();
  const sourceId = useId();
  const statusId = useId();
  const actionId = useId();
  const sortId = useId();

  const [search, setSearch] = useState('');
  const [source, setSource] = useState<SourceFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [action, setAction] = useState('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [expandedUsers, setExpandedUsers] = useState<Record<string, boolean>>({});
  const [showAllPerUser, setShowAllPerUser] = useState<Record<string, boolean>>({});

  const deferredSearch = useDeferredValue(search);
  const normalizedSearch = deferredSearch.trim().toLowerCase();

  const availableActions = useMemo(
    () =>
      Array.from(
        new Set(
          rows
            .map((row) => normalizeAction(row.action))
            .filter((value) => value.length > 0),
        ),
      ).sort((left, right) => left.localeCompare(right, 'he')),
    [rows],
  );

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        if (source !== 'all' && row.source !== source) {
          return false;
        }

        if (status !== 'all') {
          const normalizedStatus = normalizeStatus(row.status);

          if (status === 'success' && normalizedStatus !== 'success') {
            return false;
          }

          if (status === 'failed' && normalizedStatus === 'success') {
            return false;
          }
        }

        if (action !== 'all' && normalizeAction(row.action) !== action) {
          return false;
        }

        if (!normalizedSearch) {
          return true;
        }

        return buildSearchHaystack(row).includes(normalizedSearch);
      }),
    [action, normalizedSearch, rows, source, status],
  );

  const groupedUsers = useMemo(
    () => buildUserGroups(filteredRows, sortOrder),
    [filteredRows, sortOrder],
  );

  const summary = useMemo(() => {
    const uniqueUsers = new Set<string>();
    let successCount = 0;
    let nonSuccessCount = 0;
    let productionCount = 0;
    let localCount = 0;
    let refineCount = 0;
    let newMessageCount = 0;

    for (const row of filteredRows) {
      uniqueUsers.add(normalizeUid(row.uid));

      if (row.source === 'production') {
        productionCount += 1;
      } else {
        localCount += 1;
      }

      if (normalizeStatus(row.status) === 'success') {
        successCount += 1;
      } else {
        nonSuccessCount += 1;
      }

      if (describeAction(row.action).isRefine) {
        refineCount += 1;
      } else {
        newMessageCount += 1;
      }
    }

    return {
      uniqueUsersCount: uniqueUsers.size,
      successCount,
      nonSuccessCount,
      productionCount,
      localCount,
      refineCount,
      newMessageCount,
    };
  }, [filteredRows]);

  const latestRow = useMemo(
    () =>
      filteredRows
        .slice()
        .sort((left, right) => safeTimestamp(right.createdAt) - safeTimestamp(left.createdAt))[0] ??
      null,
    [filteredRows],
  );

  function toggleRow(id: string) {
    setExpandedRows((current) => ({
      ...current,
      [id]: !current[id],
    }));
  }

  function toggleShowAll(uid: string) {
    setShowAllPerUser((current) => ({
      ...current,
      [uid]: !current[uid],
    }));
  }

  function isUserExpanded(uid: string, state = expandedUsers) {
    if (Object.prototype.hasOwnProperty.call(state, uid)) {
      return state[uid] === true;
    }

    return false;
  }

  function resetFilters() {
    setSearch('');
    startTransition(() => {
      setSource('all');
      setStatus('all');
      setAction('all');
      setSortOrder('newest');
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="relative overflow-hidden rounded-[2rem] border border-black/10 bg-surface px-5 py-5 shadow-[0_20px_60px_rgba(25,19,15,0.08)] sm:px-6 sm:py-6">
        <div className="absolute inset-x-0 top-0 h-24 bg-[linear-gradient(90deg,rgba(255,212,0,0.22),rgba(255,77,0,0.14),transparent)]" />
        <div className="absolute -left-10 top-8 h-24 w-24 rounded-full bg-accent/20 blur-3xl" />
        <div className="absolute -right-6 top-0 h-28 w-28 rounded-full bg-brand/15 blur-3xl" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-medium tracking-[0.14em] text-black/45">לוח בקרה מקומי</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-brand-ink sm:text-4xl">
              חלוקה ברורה לפי משתמשים וציר זמן לכל הודעה
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-black/65 sm:text-base">
              כל משתמש מוצג בנפרד, ובתוך כל משתמש תראה סדר כרונולוגי מלא של הבקשות. בכל אירוע יש
              סימון מפורש אם זו הודעה חדשה או תיקון (softer / sharper / retry) + מה בדיוק נשלח ומה התקבל.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <CompactFact
              label="רשומה אחרונה"
              value={latestRow ? formatDateTime(latestRow.createdAt) : 'אין נתונים'}
            />
            <CompactFact label="קבוצות משתמשים" value={String(groupedUsers.length)} />
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="סה״כ ברשימה" value={String(filteredRows.length)} toneClass="bg-brand text-white" />
        <StatCard label="הודעות חדשות" value={String(summary.newMessageCount)} toneClass="bg-[#111111] text-white" />
        <StatCard label="תיקונים" value={String(summary.refineCount)} toneClass="bg-[#ff8a3d] text-white" />
        <StatCard
          label="משתמשים ייחודיים"
          value={String(summary.uniqueUsersCount)}
          toneClass="bg-accent text-brand-ink"
        />
      </section>

      <section className="sticky top-3 z-20 rounded-[2rem] border border-black/10 bg-surface px-4 py-4 shadow-[0_16px_45px_rgba(25,19,15,0.06)] backdrop-blur supports-[backdrop-filter]:bg-surface/90 sm:px-5">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.7fr)_repeat(4,minmax(0,0.8fr))]">
          <Field label="חיפוש חופשי" htmlFor={searchId}>
            <input
              id={searchId}
              type="search"
              dir="rtl"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="חפש לפי UID, הודעה/הודעה אחרונה, רקע, תשובה, שגיאה, intent או sourceReply"
              className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black/80 outline-none transition focus:border-brand/40 focus:ring-4 focus:ring-brand/10"
            />
          </Field>
          <Field label="מקור" htmlFor={sourceId}>
            <select
              id={sourceId}
              value={source}
              onChange={(event) =>
                startTransition(() => setSource(event.target.value as SourceFilter))
              }
              className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black/80 outline-none transition focus:border-brand/40 focus:ring-4 focus:ring-brand/10"
            >
              {SOURCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="סטטוס" htmlFor={statusId}>
            <select
              id={statusId}
              value={status}
              onChange={(event) =>
                startTransition(() => setStatus(event.target.value as StatusFilter))
              }
              className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black/80 outline-none transition focus:border-brand/40 focus:ring-4 focus:ring-brand/10"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="פעולה" htmlFor={actionId}>
            <select
              id={actionId}
              value={action}
              onChange={(event) => startTransition(() => setAction(event.target.value))}
              className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black/80 outline-none transition focus:border-brand/40 focus:ring-4 focus:ring-brand/10"
            >
              <option value="all">כל הפעולות</option>
              {availableActions.map((availableAction) => (
                <option key={availableAction} value={availableAction}>
                  {availableAction}
                </option>
              ))}
            </select>
          </Field>
          <Field label="מיון בתוך משתמש" htmlFor={sortId}>
            <div className="flex gap-2">
              <select
                id={sortId}
                value={sortOrder}
                onChange={(event) =>
                  startTransition(() => setSortOrder(event.target.value as SortOrder))
                }
                className="min-w-0 flex-1 rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black/80 outline-none transition focus:border-brand/40 focus:ring-4 focus:ring-brand/10"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={resetFilters}
                className="rounded-2xl border border-black/10 bg-black px-4 py-3 text-sm font-medium text-white transition hover:bg-black/85 focus:outline-none focus:ring-4 focus:ring-black/15"
              >
                איפוס
              </button>
            </div>
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-black/55">
          <InfoPill label={`${filteredRows.length} אירועים`} />
          <InfoPill label={`${groupedUsers.length} משתמשים`} />
          <InfoPill label={normalizedSearch ? 'חיפוש פעיל' : 'ללא חיפוש'} />
          <InfoPill label={`פרודקשן: ${summary.productionCount}`} />
          <InfoPill label={`מקומי: ${summary.localCount}`} />
          <InfoPill label={`הצלחות: ${summary.successCount}`} />
          <InfoPill label={`לא הצליחו: ${summary.nonSuccessCount}`} />
        </div>
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-black/10 bg-surface shadow-[0_16px_50px_rgba(25,19,15,0.06)]">
        <div className="flex items-center justify-between gap-3 border-b border-black/10 px-4 py-4 sm:px-6">
          <div>
            <h2 className="text-lg font-semibold text-brand-ink">משתמשים וציר הודעות</h2>
            <p className="text-sm text-black/60">
              לכל משתמש ציר זמן נפרד. כל אירוע מציג את הקלט שנשלח ואת הפלט שהתקבל.
            </p>
          </div>
        </div>

        {groupedUsers.length === 0 ? (
          <div className="px-4 py-14 text-center sm:px-6">
            <div className="mx-auto max-w-md rounded-[1.5rem] border border-dashed border-black/15 bg-white/80 px-6 py-8">
              <p className="text-base font-medium text-brand-ink">לא נמצאו תוצאות</p>
              <p className="mt-2 text-sm leading-7 text-black/60">נסה לשנות את החיפוש או הסינון.</p>
            </div>
          </div>
        ) : (
          <ul className="grid gap-3 p-3 sm:p-4" aria-label="רשימת משתמשים">
            {groupedUsers.map((group) => {
              const isExpandedUser = isUserExpanded(group.uid);
              const showAll = showAllPerUser[group.uid] === true;
              const visibleRows = showAll
                ? group.rows
                : group.rows.slice(0, MAX_EVENTS_PER_USER_COLLAPSED);
              const hiddenCount = Math.max(0, group.rows.length - visibleRows.length);

              return (
                <li
                  key={group.uid}
                  className="overflow-hidden rounded-[1.4rem] border border-black/10 bg-white/80 shadow-[0_10px_28px_rgba(25,19,15,0.05)]"
                >
                  <details
                    className={isExpandedUser ? 'bg-[#fffdf6]' : 'bg-white/80'}
                    open={isExpandedUser}
                    onToggle={(event) => {
                      const isOpen = event.currentTarget.open;
                      setExpandedUsers((current) => ({
                        ...current,
                        [group.uid]: isOpen,
                      }));
                    }}
                  >
                    <summary className="cursor-pointer list-none px-3 py-2.5 sm:px-4 sm:py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0 space-y-1">
                          <p className="text-[10px] font-semibold tracking-[0.12em] text-black/45">משתמש</p>
                          <code className="block max-w-full break-all text-[11px] font-medium text-brand-ink">
                            {group.uid}
                          </code>
                          <div className="flex flex-wrap gap-1.5">
                            <InfoPill label={`${group.totalCount} אירועים`} />
                            <InfoPill label={`${group.newMessageCount} חדש`} />
                            <InfoPill label={`${group.refineCount} תיקון`} />
                            <InfoPill label={`אחרון: ${formatDateTime(group.lastAt)}`} />
                          </div>
                        </div>

                        <span className="inline-flex rounded-full border border-black/10 bg-black px-2.5 py-1 text-[10px] font-semibold text-white">
                          {isExpandedUser ? 'סגור' : 'פתח'}
                        </span>
                      </div>

                      {!isExpandedUser ? (
                        <div className="mt-1.5 space-y-1">
                          <div className="text-[10px] font-semibold tracking-[0.1em] text-black/45">
                            3 הודעות חדשות אחרונות (ללא תיקונים)
                          </div>
                          {group.latestInitialMessages.length > 0 ? (
                            <ol className="grid gap-1">
                              {group.latestInitialMessages.map((entry, previewIndex) => (
                                <li
                                  key={entry.id}
                                  className="flex items-center gap-1.5 rounded-lg border border-black/10 bg-white/70 px-2 py-1"
                                >
                                  <span className="inline-flex rounded-full border border-black/15 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-black/65">
                                    {previewIndex + 1}
                                  </span>
                                  <span className="shrink-0 text-[10px] text-black/55">
                                    {formatDateTime(entry.createdAt)}
                                  </span>
                                  <span className="truncate text-[11px] text-black/75">
                                    {toCompactMessagePreview(
                                      entry.message,
                                      entry.hasImage,
                                      entry.noReplyMode,
                                      entry.lastOutgoingMessage,
                                    )}
                                  </span>
                                </li>
                              ))}
                            </ol>
                          ) : (
                            <div className="rounded-lg border border-dashed border-black/15 bg-white/60 px-2 py-1 text-[11px] text-black/55">
                              אין הודעות חדשות להצגה.
                            </div>
                          )}
                        </div>
                      ) : null}
                    </summary>

                    <div className="border-t border-black/10 px-3 py-2.5 sm:px-4">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-1.5">
                          <InfoPill label={`הצלחות: ${group.successCount}`} />
                          <InfoPill label={`שגיאות/חסימות: ${group.nonSuccessCount}`} />
                          <InfoPill label={`התחלה: ${formatDateTime(group.firstAt)}`} />
                        </div>

                        {group.rows.length > MAX_EVENTS_PER_USER_COLLAPSED ? (
                          <button
                            type="button"
                            onClick={() => toggleShowAll(group.uid)}
                            className="rounded-xl border border-black/10 bg-white px-2.5 py-1 text-[11px] font-medium text-black/75 transition hover:bg-black/[0.03] focus:outline-none focus:ring-2 focus:ring-black/10"
                          >
                            {showAll
                              ? 'פחות'
                              : `הכול (${group.rows.length})`}
                          </button>
                        ) : null}
                      </div>

                      <ol className="grid gap-2.5" aria-label={`ציר זמן למשתמש ${group.uid}`}>
                      {visibleRows.map((row, index) => {
                        const isExpandedRow = expandedRows[row.id] === true;
                        const actionInfo = describeAction(row.action);
                        const eventContainerClass = getEventContainerClass(
                          actionInfo,
                          row.status,
                        );
                        const refinedReply = actionInfo.isRefine
                          ? pickPrimaryRefineReply(row.replies)
                          : null;

                        return (
                          <li
                            key={row.id}
                            className={`rounded-[1rem] border p-2.5 ${eventContainerClass}`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-black/65">
                                  <span className="inline-flex rounded-full border border-black/15 bg-white px-1.5 py-0.5 font-semibold text-black/70">
                                    #{index + 1}
                                  </span>
                                  <span>{formatDateTime(row.createdAt)}</span>
                                </div>
                                <p className="mt-1 text-xs text-black/65">
                                  {actionInfo.isRefine
                                    ? `תיקון על בסיס תשובה קיימת (${actionInfo.actionLabel}).`
                                    : 'הודעה חדשה שנשלחה למחולל.'}
                                </p>
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                {renderSourcePill(row.source)}
                                {renderModelSourcePill(row.modelSource)}
                                {renderEventTypePill(actionInfo)}
                                {renderActionPill(actionInfo)}
                                {renderStatusPill(row.status)}
                              </div>
                            </div>

                            <div className="mt-2 grid gap-2 lg:grid-cols-2">
                              <TextPanel title="מה נשלח" tone="input">
                                <div className="space-y-2">
                                  <div>
                                    <div className="text-[10px] font-medium text-black/55">
                                      {row.noReplyMode ? 'הודעה אחרונה שנשלחה' : 'הודעה נכנסת'}
                                    </div>
                                    <p className="whitespace-pre-wrap break-words text-xs leading-5 text-black/80">
                                      {row.noReplyMode
                                        ? row.lastOutgoingMessage || 'ללא טקסט'
                                        : row.message || 'ללא טקסט'}
                                    </p>
                                  </div>

                                  {row.conversationBackground ? (
                                    <div>
                                      <div className="text-[10px] font-medium text-black/55">רקע שיחה נוסף</div>
                                      <p className="whitespace-pre-wrap break-words text-xs leading-5 text-black/80">
                                        {row.conversationBackground}
                                      </p>
                                    </div>
                                  ) : null}

                                  {row.sourceReply ? (
                                    <div>
                                      <div className="text-[10px] font-medium text-black/55">
                                        תשובה שעליה בוצע תיקון
                                      </div>
                                      <p className="whitespace-pre-wrap break-words text-xs leading-5 text-black/80">
                                        {row.sourceReply}
                                      </p>
                                    </div>
                                  ) : null}

                                  <div className="flex flex-wrap gap-1 text-[11px] text-black/65">
                                    {renderMetaPill(`הקשר: ${row.context || 'ללא הקשר'}`)}
                                    {renderMetaPill(`טון: ${row.tone || 'ללא טון'}`)}
                                    {renderMetaPill(
                                      `המשך שיחה: ${row.continuePreference || 'לא צוין'}`,
                                    )}
                                    {renderMetaPill(
                                      row.noReplyMode ? 'מצב: לא ענו הרבה זמן' : 'מצב: הודעה נכנסת',
                                    )}
                                    {row.noReplyMode && row.noReplyDurationValue && row.noReplyDurationUnit
                                      ? renderMetaPill(
                                          `זמן ללא מענה: ${row.noReplyDurationValue} ${toDurationUnitLabel(row.noReplyDurationUnit)}`,
                                        )
                                      : null}
                                    {renderMetaPill(
                                      row.hasImage ? 'צורפה תמונה' : 'ללא תמונה',
                                    )}
                                  </div>
                                </div>
                              </TextPanel>

                              <TextPanel title="מה חזר" tone="output">
                                <div className="space-y-2">
                                  <div>
                                    <div className="text-[10px] font-medium text-black/55">כוונה (intent)</div>
                                    <p className="whitespace-pre-wrap break-words text-xs leading-5 text-black/80">
                                      {row.intent || 'לא התקבל intent'}
                                    </p>
                                  </div>

                                  {actionInfo.isRefine ? (
                                    <div className="grid gap-1.5">
                                      <div className="rounded-xl border border-black/10 bg-white px-2 py-1.5">
                                        <div className="text-[10px] font-medium text-black/55">מהודעה</div>
                                        <p className="whitespace-pre-wrap break-words text-xs leading-5 text-black/78">
                                          {row.sourceReply || 'לא נמצאה תשובה מקורית לתיקון.'}
                                        </p>
                                      </div>
                                      <div className="rounded-xl border border-black/10 bg-white px-2 py-1.5">
                                        <div className="text-[10px] font-medium text-black/55">להודעה</div>
                                        <p className="whitespace-pre-wrap break-words text-xs leading-5 text-black/78">
                                          {refinedReply || 'לא התקבלה תשובת תיקון.'}
                                        </p>
                                      </div>
                                    </div>
                                  ) : row.replies.length > 0 ? (
                                    <ol className="grid gap-1.5">
                                      {row.replies.map((reply, replyIndex) => (
                                        <li
                                          key={`${row.id}-reply-${replyIndex}`}
                                          className="rounded-xl border border-black/10 bg-white px-2 py-1.5"
                                        >
                                          <div className="text-[10px] font-medium text-black/55">
                                            תשובה {replyIndex + 1}
                                          </div>
                                          <p className="whitespace-pre-wrap break-words text-xs leading-5 text-black/78">
                                            {reply}
                                          </p>
                                        </li>
                                      ))}
                                    </ol>
                                  ) : (
                                    <p className="text-sm text-black/60">לא התקבלו תשובות באירוע הזה.</p>
                                  )}
                                </div>
                              </TextPanel>
                            </div>

                            {row.error ? (
                              <div className="mt-2">
                                <TextPanel title="שגיאה" tone="error">
                                  <p className="whitespace-pre-wrap break-words text-xs leading-5 text-rose-800">
                                    {row.error}
                                  </p>
                                </TextPanel>
                              </div>
                            ) : null}

                            {isExpandedRow ? (
                              <div className="mt-2 flex flex-wrap gap-1 text-[11px] text-black/60">
                                {row.consumption ? (
                                  <InfoPill label={`חיוב: ${toConsumptionLabel(row.consumption)}`} />
                                ) : null}
                                {typeof row.durationMs === 'number' ? (
                                  <InfoPill label={`משך: ${row.durationMs}ms`} />
                                ) : null}
                                {row.completedAt ? (
                                  <InfoPill label={`הסתיים: ${formatDateTime(row.completedAt)}`} />
                                ) : null}
                                <InfoPill label={`מזהה פנימי: ${row.id}`} />
                              </div>
                            ) : null}

                            <button
                              type="button"
                              onClick={() => toggleRow(row.id)}
                              aria-expanded={isExpandedRow}
                              className="mt-2 rounded-xl border border-black/10 bg-white px-2.5 py-1 text-[11px] font-medium text-black/75 transition hover:bg-black/[0.03] focus:outline-none focus:ring-2 focus:ring-black/10"
                            >
                              {isExpandedRow ? 'הסתר פירוט מתקדם' : 'הצג פירוט מתקדם'}
                            </button>
                          </li>
                        );
                      })}
                      </ol>

                      {hiddenCount > 0 ? (
                        <div className="mt-2 rounded-xl border border-dashed border-black/15 bg-white/70 px-3 py-1.5 text-center text-xs text-black/60">
                          מוצגים {visibleRows.length} מתוך {group.rows.length} אירועים למשתמש זה.
                        </div>
                      ) : null}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Field({
  children,
  label,
  htmlFor,
}: {
  children: ReactNode;
  label: string;
  htmlFor: string;
}) {
  return (
    <label htmlFor={htmlFor} className="flex flex-col gap-2">
      <span className="text-xs font-medium text-black/55">{label}</span>
      {children}
    </label>
  );
}

function CompactFact({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[1.4rem] border border-black/10 bg-white/75 px-4 py-3">
      <div className="text-xs text-black/45">{label}</div>
      <div className="mt-1 text-sm font-medium text-brand-ink">{value}</div>
    </div>
  );
}

function StatCard({
  label,
  value,
  toneClass,
}: {
  label: string;
  value: string;
  toneClass: string;
}) {
  return (
    <article className="overflow-hidden rounded-[1.7rem] border border-black/10 bg-surface shadow-[0_12px_35px_rgba(25,19,15,0.05)]">
      <div className={`h-2 w-full ${toneClass}`} />
      <div className="p-5">
        <div className="text-sm text-black/60">{label}</div>
        <div className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-brand-ink">{value}</div>
      </div>
    </article>
  );
}

function TextPanel({
  title,
  tone,
  children,
}: {
  title: string;
  tone: 'neutral' | 'input' | 'output' | 'error';
  children: ReactNode;
}) {
  const className =
    tone === 'error'
      ? 'border border-rose-200 bg-rose-50'
      : tone === 'output'
        ? 'border border-emerald-200 bg-emerald-50/70'
        : tone === 'input'
          ? 'border border-sky-200 bg-sky-50/70'
        : 'border border-black/10 bg-black/[0.03]';

  return (
    <div className={`rounded-[1rem] px-3 py-2 ${className}`}>
      <div className="mb-1 text-[10px] font-medium text-black/50">{title}</div>
      <div className="max-h-44 overflow-auto">{children}</div>
    </div>
  );
}

function InfoPill({ label }: { label: string }) {
  return (
    <span className="inline-flex rounded-full border border-black/10 bg-white px-2 py-0.5 text-[11px] leading-4">
      {label}
    </span>
  );
}

function renderSourcePill(source: AdminUsageEntry['source']) {
  const className =
    source === 'production'
      ? 'bg-black text-white'
      : 'border border-black/10 bg-white text-black/70';

  return (
    <span className={`inline-flex w-fit rounded-full px-3 py-1 text-[11px] font-medium ${className}`}>
      {source === 'production' ? 'פרודקשן' : 'מקומי'}
    </span>
  );
}

function renderEventTypePill(actionInfo: ActionInfo) {
  const className = actionInfo.isRefine
    ? 'bg-[#ffd9c2] text-[#612100]'
    : 'bg-[#d7f9ff] text-[#00323a]';

  return (
    <span className={`inline-flex w-fit rounded-full px-3 py-1 text-[11px] font-medium ${className}`}>
      {actionInfo.eventTypeLabel}
    </span>
  );
}

function renderActionPill(actionInfo: ActionInfo) {
  return (
    <span className={`inline-flex w-fit rounded-full px-3 py-1 text-[11px] font-medium ${actionInfo.className}`}>
      {actionInfo.actionLabel}
    </span>
  );
}

function renderModelSourcePill(modelSource: AdminUsageEntry['modelSource']) {
  if (modelSource === 'api') {
    return (
      <span className="inline-flex w-fit rounded-full bg-violet-100 px-3 py-1 text-[11px] font-medium text-violet-900">
        מודל: API
      </span>
    );
  }

  if (modelSource === 'local') {
    return (
      <span className="inline-flex w-fit rounded-full bg-indigo-100 px-3 py-1 text-[11px] font-medium text-indigo-900">
        מודל: מקומי
      </span>
    );
  }

  return (
    <span className="inline-flex w-fit rounded-full bg-black/[0.05] px-3 py-1 text-[11px] font-medium text-black/75">
      מודל: לא זמין
    </span>
  );
}

function renderStatusPill(status: string) {
  const normalizedStatus = normalizeStatus(status);

  if (normalizedStatus === 'success') {
    return (
      <span className="inline-flex w-fit rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-medium text-emerald-900">
        הצליח
      </span>
    );
  }

  if (normalizedStatus === 'blocked') {
    return (
      <span className="inline-flex w-fit rounded-full bg-amber-100 px-3 py-1 text-[11px] font-medium text-amber-900">
        נחסם
      </span>
    );
  }

  if (normalizedStatus === 'pending') {
    return (
      <span className="inline-flex w-fit rounded-full bg-sky-100 px-3 py-1 text-[11px] font-medium text-sky-900">
        בתהליך
      </span>
    );
  }

  return (
    <span className="inline-flex w-fit rounded-full bg-rose-100 px-3 py-1 text-[11px] font-medium text-rose-900">
      נכשל
    </span>
  );
}

function renderMetaPill(label: string) {
  return (
    <span className="inline-flex w-fit rounded-full border border-black/10 bg-white px-2 py-0.5 text-[10px] text-black/65">
      {label}
    </span>
  );
}

function getEventContainerClass(actionInfo: ActionInfo, status: string) {
  const normalizedStatus = normalizeStatus(status);
  const actionToneClass = actionInfo.isRefine
    ? 'border-amber-200 bg-amber-50/40'
    : 'border-cyan-200 bg-cyan-50/40';

  if (normalizedStatus === 'success') {
    return `${actionToneClass} border-r-4 border-r-emerald-400`;
  }

  if (normalizedStatus === 'blocked') {
    return `${actionToneClass} border-r-4 border-r-amber-400`;
  }

  if (normalizedStatus === 'pending') {
    return `${actionToneClass} border-r-4 border-r-sky-400`;
  }

  return `${actionToneClass} border-r-4 border-r-rose-400`;
}

function normalizeAction(value: string | null) {
  if (typeof value !== 'string') {
    return 'generate';
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : 'generate';
}

function describeAction(value: string | null): ActionInfo {
  const normalized = normalizeAction(value);

  if (normalized === 'softer') {
    return {
      normalized,
      actionLabel: 'עדין יותר',
      eventTypeLabel: 'תיקון',
      isRefine: true,
      className: 'bg-amber-100 text-amber-900',
    };
  }

  if (normalized === 'sharper') {
    return {
      normalized,
      actionLabel: 'חד יותר',
      eventTypeLabel: 'תיקון',
      isRefine: true,
      className: 'bg-orange-100 text-orange-900',
    };
  }

  if (normalized === 'retry') {
    return {
      normalized,
      actionLabel: 'נסח מחדש',
      eventTypeLabel: 'תיקון',
      isRefine: true,
      className: 'bg-sky-100 text-sky-900',
    };
  }

  return {
    normalized,
    actionLabel: 'הודעה חדשה',
    eventTypeLabel: 'הודעה חדשה',
    isRefine: false,
    className: 'bg-black/[0.05] text-black/75',
  };
}

function normalizeStatus(status: string) {
  const normalized = status.trim().toLowerCase();

  if (normalized === 'success' || normalized === 'ok' || normalized === 'completed') {
    return 'success';
  }

  if (normalized === 'blocked') {
    return 'blocked';
  }

  if (normalized === 'pending' || normalized === 'started' || normalized === 'in_progress') {
    return 'pending';
  }

  return 'failed';
}

function buildUserGroups(rows: AdminUsageEntry[], sortOrder: SortOrder) {
  const grouped = new Map<string, AdminUsageEntry[]>();

  for (const row of rows) {
    const uid = normalizeUid(row.uid);

    const existing = grouped.get(uid);

    if (existing) {
      existing.push(row);
    } else {
      grouped.set(uid, [row]);
    }
  }

  const groups: UserGroup[] = [];

  for (const [uid, userRows] of grouped) {
    const firstRowByTime = userRows.reduce((currentFirst, candidate) =>
      safeTimestamp(candidate.createdAt) < safeTimestamp(currentFirst.createdAt)
        ? candidate
        : currentFirst,
    );
    const lastRowByTime = userRows.reduce((currentLast, candidate) =>
      safeTimestamp(candidate.createdAt) > safeTimestamp(currentLast.createdAt)
        ? candidate
        : currentLast,
    );

    let successCount = 0;
    let nonSuccessCount = 0;
    let newMessageCount = 0;
    let refineCount = 0;

    for (const row of userRows) {
      if (normalizeStatus(row.status) === 'success') {
        successCount += 1;
      } else {
        nonSuccessCount += 1;
      }

      if (describeAction(row.action).isRefine) {
        refineCount += 1;
      } else {
        newMessageCount += 1;
      }
    }

    const latestInitialMessages = userRows
      .filter((row) => describeAction(row.action).isRefine === false)
      .slice()
      .sort((left, right) => safeTimestamp(right.createdAt) - safeTimestamp(left.createdAt))
      .slice(0, 3)
      .map((row) => ({
        id: row.id,
        createdAt: row.createdAt,
        message: row.message,
        hasImage: row.hasImage,
        noReplyMode: row.noReplyMode,
        lastOutgoingMessage: row.lastOutgoingMessage,
      }));

    const sortedRows = userRows.slice().sort((left, right) => {
      const leftTime = safeTimestamp(left.createdAt);
      const rightTime = safeTimestamp(right.createdAt);
      return sortOrder === 'newest' ? rightTime - leftTime : leftTime - rightTime;
    });

    groups.push({
      uid,
      rows: sortedRows,
      latestInitialMessages,
      totalCount: userRows.length,
      successCount,
      nonSuccessCount,
      newMessageCount,
      refineCount,
      firstAt: firstRowByTime.createdAt,
      firstAtMs: safeTimestamp(firstRowByTime.createdAt),
      lastAt: lastRowByTime.createdAt,
      lastAtMs: safeTimestamp(lastRowByTime.createdAt),
    });
  }

  return groups.sort((left, right) => {
    if (sortOrder === 'newest') {
      return right.lastAtMs - left.lastAtMs;
    }

    return left.firstAtMs - right.firstAtMs;
  });
}

function normalizeUid(uid: string) {
  const normalized = uid.trim();
  return normalized.length > 0 ? normalized : 'unknown';
}

function buildSearchHaystack(row: AdminUsageEntry) {
  const actionInfo = describeAction(row.action);

  return [
    normalizeUid(row.uid),
    row.message || '',
    row.error || '',
    row.action,
    actionInfo.normalized,
    actionInfo.actionLabel,
    actionInfo.eventTypeLabel,
    row.context || '',
    row.tone || '',
    row.conversationBackground || '',
    row.lastOutgoingMessage || '',
    row.noReplyMode === true ? 'no_reply' : 'incoming',
    row.noReplyDurationValue ? String(row.noReplyDurationValue) : '',
    row.noReplyDurationUnit || '',
    row.sourceReply || '',
    row.intent || '',
    row.continuePreference || '',
    row.consumption || '',
    row.modelSource || '',
    ...row.replies,
  ]
    .join(' ')
    .toLowerCase();
}

function pickPrimaryRefineReply(replies: string[]) {
  for (const reply of replies) {
    if (typeof reply === 'string' && reply.trim().length > 0) {
      return reply;
    }
  }

  return null;
}

function toConsumptionLabel(consumption: AdminUsageEntry['consumption']) {
  if (consumption === 'unlimited') {
    return 'מנוי';
  }

  if (consumption === 'credits') {
    return 'קרדיטים';
  }

  if (consumption === 'initial_free') {
    return 'חינם התחלתי';
  }

  if (consumption === 'daily_free') {
    return 'חינם יומי';
  }

  return 'לא זמין';
}

function toDurationUnitLabel(value: string) {
  if (value === 'minutes') {
    return 'דקות';
  }

  if (value === 'hours') {
    return 'שעות';
  }

  if (value === 'days') {
    return 'ימים';
  }

  return value;
}

function safeTimestamp(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'לא ידוע' : dateFormatter.format(date);
}

function toCompactMessagePreview(
  message: string | null,
  hasImage: boolean,
  noReplyMode: boolean | null,
  lastOutgoingMessage: string | null,
) {
  if (noReplyMode && typeof lastOutgoingMessage === 'string' && lastOutgoingMessage.trim().length > 0) {
    return `לא ענו: ${lastOutgoingMessage.replace(/\s+/g, ' ').trim()}`;
  }

  if (typeof message === 'string' && message.trim().length > 0) {
    return message.replace(/\s+/g, ' ').trim();
  }

  if (hasImage) {
    return 'הודעה עם תמונה (ללא טקסט)';
  }

  return 'ללא טקסט';
}
