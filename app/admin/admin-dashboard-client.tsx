'use client';

import {
  startTransition,
  useDeferredValue,
  useId,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import {
  describeAction,
  normalizeStatus,
  pickPrimaryRefineReply,
  toCompactMessagePreview,
  toConsumptionLabel,
  toDurationUnitLabel,
  type ActionInfo,
  type NormalizedStatus,
} from '@/app/admin/dashboard-domain';
import type { AdminUsageEntry } from '@/app/admin/types';
import { normalizeAction, normalizeUid, safeTimestamp } from '@/app/admin/usage-normalizers';

type AdminDashboardClientProps = {
  rows: AdminUsageEntry[];
};

type SourceFilter = 'all' | AdminUsageEntry['source'];
type StatusFilter = 'all' | NormalizedStatus;
type IntegrityFilter = 'all' | 'invalid_schema';
type SortOrder = 'newest' | 'oldest';

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
  blockedCount: number;
  failedCount: number;
  pendingCount: number;
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
  { value: 'blocked', label: 'חסומים' },
  { value: 'failed', label: 'נכשלו' },
  { value: 'pending', label: 'בתהליך' },
];

const SORT_OPTIONS: Array<{ value: SortOrder; label: string }> = [
  { value: 'newest', label: 'מהחדש לישן (קודם פעילות אחרונה)' },
  { value: 'oldest', label: 'מהישן לחדש (קודם אירועים מוקדמים)' },
];

const USER_LIST_PAGE_SIZE = 40;
const TIMELINE_PAGE_SIZE = 50;
const focusRingBaseClass =
  'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#6ce8ff] focus-visible:ring-offset-2';
const warmSurfaceFocusClass = `${focusRingBaseClass} focus-visible:ring-offset-[#fff9ef]`;
const whiteSurfaceFocusClass = `${focusRingBaseClass} focus-visible:ring-offset-white`;
const darkSurfaceFocusClass = `${focusRingBaseClass} focus-visible:ring-offset-[#111111]`;
const stableScrollbarStyle = { scrollbarGutter: 'stable' } as const;
const filterGridStyle = {
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))',
} as const;
const filterSearchStyle = { gridColumn: 'span 2 / span 2' } as const;
const workbenchGridStyle = {
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
} as const;

export default function AdminDashboardClient({ rows }: AdminDashboardClientProps) {
  const searchId = useId();
  const sourceId = useId();
  const statusId = useId();
  const actionId = useId();
  const sortId = useId();
  const usersListId = useId();
  const resultsStatusId = useId();

  const [search, setSearch] = useState('');
  const [source, setSource] = useState<SourceFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [action, setAction] = useState('all');
  const [integrityFilter, setIntegrityFilter] = useState<IntegrityFilter>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [selectedUserUid, setSelectedUserUid] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [visibleUsersLimit, setVisibleUsersLimit] = useState(USER_LIST_PAGE_SIZE);
  const [visibleEventsLimit, setVisibleEventsLimit] = useState(TIMELINE_PAGE_SIZE);

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
          if (normalizeStatus(row.status) !== status) {
            return false;
          }
        }

        if (action !== 'all' && normalizeAction(row.action) !== action) {
          return false;
        }

        if (integrityFilter === 'invalid_schema' && evaluateSchemaIntegrity(row).isSchemaValid) {
          return false;
        }

        if (!normalizedSearch) {
          return true;
        }

        return buildSearchHaystack(row).includes(normalizedSearch);
      }),
    [action, integrityFilter, normalizedSearch, rows, source, status],
  );

  const statusQuickCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      all: 0,
      success: 0,
      blocked: 0,
      failed: 0,
      pending: 0,
    };

    for (const row of rows) {
      if (source !== 'all' && row.source !== source) {
        continue;
      }

      if (action !== 'all' && normalizeAction(row.action) !== action) {
        continue;
      }

      if (integrityFilter === 'invalid_schema' && evaluateSchemaIntegrity(row).isSchemaValid) {
        continue;
      }

      if (normalizedSearch && !buildSearchHaystack(row).includes(normalizedSearch)) {
        continue;
      }

      counts.all += 1;
      counts[normalizeStatus(row.status)] += 1;
    }

    return counts;
  }, [action, integrityFilter, normalizedSearch, rows, source]);

  const hasActiveFilters =
    normalizedSearch.length > 0 ||
    source !== 'all' ||
    status !== 'all' ||
    action !== 'all' ||
    integrityFilter !== 'all' ||
    sortOrder !== 'newest';

  const groupedUsers = useMemo(
    () => buildUserGroups(filteredRows, sortOrder),
    [filteredRows, sortOrder],
  );

  const summary = useMemo(() => {
    const uniqueUsers = new Set<string>();
    const uniqueBlockedUsers = new Set<string>();
    const statusCounts: Record<NormalizedStatus, number> = {
      success: 0,
      blocked: 0,
      pending: 0,
      failed: 0,
    };
    let productionCount = 0;
    let localCount = 0;
    let retryCount = 0;
    let refineCount = 0;
    let newMessageCount = 0;
    let successRowsCount = 0;
    let validSchemaCount = 0;
    let invalidSchemaCount = 0;
    let missingIntentCount = 0;
    let invalidRepliesCount = 0;
    let emptyReplyItemsCount = 0;

    for (const row of filteredRows) {
      const normalizedUid = normalizeUid(row.uid);
      const normalizedStatus = normalizeStatus(row.status);
      const actionInfo = describeAction(row.action);
      const schemaIntegrity = evaluateSchemaIntegrity(row);
      uniqueUsers.add(normalizedUid);
      statusCounts[normalizedStatus] += 1;

      if (normalizedStatus === 'blocked') {
        uniqueBlockedUsers.add(normalizedUid);
      }

      if (row.source === 'production') {
        productionCount += 1;
      } else {
        localCount += 1;
      }

      if (actionInfo.isRefine) {
        refineCount += 1;
        if (actionInfo.normalized === 'retry') {
          retryCount += 1;
        }
      } else {
        newMessageCount += 1;
      }

      if (normalizedStatus === 'success') {
        successRowsCount += 1;

        if (schemaIntegrity.isSchemaValid) {
          validSchemaCount += 1;
        } else {
          invalidSchemaCount += 1;
        }

        if (!schemaIntegrity.hasIntent) {
          missingIntentCount += 1;
        }

        if (!schemaIntegrity.hasExactRepliesCount) {
          invalidRepliesCount += 1;
        }

        if (schemaIntegrity.hasExactRepliesCount && !schemaIntegrity.hasNonEmptyReplies) {
          emptyReplyItemsCount += 1;
        }
      }
    }

    return {
      uniqueUsersCount: uniqueUsers.size,
      uniqueBlockedUsersCount: uniqueBlockedUsers.size,
      statusCounts,
      productionCount,
      localCount,
      retryCount,
      retryRatio: refineCount > 0 ? retryCount / refineCount : 0,
      refineCount,
      newMessageCount,
      successRowsCount,
      validSchemaCount,
      invalidSchemaCount,
      missingIntentCount,
      invalidRepliesCount,
      emptyReplyItemsCount,
    };
  }, [filteredRows]);

  const presetBaseRows = useMemo(
    () =>
      rows.filter((row) => {
        if (source !== 'all' && row.source !== source) {
          return false;
        }

        if (!normalizedSearch) {
          return true;
        }

        return buildSearchHaystack(row).includes(normalizedSearch);
      }),
    [normalizedSearch, rows, source],
  );

  const presetSummary = useMemo(() => {
    let blockedCount = 0;
    let failedCount = 0;
    let retryCount = 0;
    let invalidSchemaCount = 0;

    for (const row of presetBaseRows) {
      const normalizedStatus = normalizeStatus(row.status);

      if (normalizedStatus === 'blocked') {
        blockedCount += 1;
      }

      if (normalizedStatus === 'failed') {
        failedCount += 1;
      }

      if (normalizeAction(row.action) === 'retry') {
        retryCount += 1;
      }

      if (normalizedStatus === 'success' && !evaluateSchemaIntegrity(row).isSchemaValid) {
        invalidSchemaCount += 1;
      }
    }

    return {
      blockedCount,
      failedCount,
      retryCount,
      invalidSchemaCount,
      totalCount: presetBaseRows.length,
    };
  }, [presetBaseRows]);

  const latestRow = useMemo(() => {
    let latest: AdminUsageEntry | null = null;

    for (const row of filteredRows) {
      if (!latest || row.createdAtMs > latest.createdAtMs) {
        latest = row;
      }
    }

    return latest;
  }, [filteredRows]);

  const liveStatusText = useMemo(() => {
    const searchStatus = normalizedSearch ? 'חיפוש פעיל' : 'ללא חיפוש';
    const sortStatus = sortOrder === 'newest' ? 'ממויין מחדש לישן' : 'ממויין מישן לחדש';
    return `עודכן לוח הבקרה: ${filteredRows.length} אירועים עבור ${groupedUsers.length} משתמשים. ${searchStatus}. ${sortStatus}.`;
  }, [filteredRows.length, groupedUsers.length, normalizedSearch, sortOrder]);

  const activeSelectedUserUid = useMemo(() => {
    if (groupedUsers.length === 0) {
      return null;
    }

    if (selectedUserUid) {
      const hasDirectMatch = groupedUsers.some((group) => group.uid === selectedUserUid);
      if (hasDirectMatch) {
        return selectedUserUid;
      }
    }

    return groupedUsers[0].uid;
  }, [groupedUsers, selectedUserUid]);

  const selectedGroup = useMemo(() => {
    if (!activeSelectedUserUid) {
      return null;
    }

    return groupedUsers.find((group) => group.uid === activeSelectedUserUid) ?? null;
  }, [activeSelectedUserUid, groupedUsers]);

  const visibleUserGroups = useMemo(
    () => groupedUsers.slice(0, visibleUsersLimit),
    [groupedUsers, visibleUsersLimit],
  );

  const hiddenUsersCount = Math.max(0, groupedUsers.length - visibleUserGroups.length);

  const visibleTimelineRows = useMemo(() => {
    if (!selectedGroup) {
      return [];
    }

    return selectedGroup.rows.slice(0, visibleEventsLimit);
  }, [selectedGroup, visibleEventsLimit]);

  const hiddenEventsCount = Math.max(
    0,
    (selectedGroup?.rows.length ?? 0) - visibleTimelineRows.length,
  );

  const selectedEvent = useMemo(() => {
    if (!selectedGroup || selectedGroup.rows.length === 0) {
      return null;
    }

    if (selectedEventId) {
      const directMatch = selectedGroup.rows.find((row) => row.id === selectedEventId);
      if (directMatch) {
        return directMatch;
      }
    }

    return selectedGroup.rows[0];
  }, [selectedEventId, selectedGroup]);

  const selectedUserIndex = useMemo(() => {
    if (!activeSelectedUserUid) {
      return -1;
    }

    return groupedUsers.findIndex((group) => group.uid === activeSelectedUserUid);
  }, [activeSelectedUserUid, groupedUsers]);

  const selectedEventIndex = useMemo(() => {
    if (!selectedGroup || !selectedEvent) {
      return -1;
    }

    return selectedGroup.rows.findIndex((row) => row.id === selectedEvent.id);
  }, [selectedEvent, selectedGroup]);

  const canMoveToPreviousUser = selectedUserIndex > 0;
  const canMoveToNextUser = selectedUserIndex >= 0 && selectedUserIndex < groupedUsers.length - 1;
  const canMoveToPreviousEvent = selectedEventIndex > 0;
  const canMoveToNextEvent =
    selectedEventIndex >= 0 &&
    Boolean(selectedGroup) &&
    selectedEventIndex < (selectedGroup?.rows.length ?? 0) - 1;

  function resetFilters() {
    setSearch('');
    startTransition(() => {
      setSource('all');
      setStatus('all');
      setAction('all');
      setIntegrityFilter('all');
      setSortOrder('newest');
    });
    setVisibleUsersLimit(USER_LIST_PAGE_SIZE);
    setVisibleEventsLimit(TIMELINE_PAGE_SIZE);
    setSelectedEventId(null);
  }

  function applySummaryShortcut(shortcut: 'all' | 'blocked' | 'failed' | 'retry' | 'schema_issues') {
    setSearch('');
    startTransition(() => {
      setSource('all');
      setSortOrder('newest');

      if (shortcut === 'all') {
        setStatus('all');
        setAction('all');
        setIntegrityFilter('all');
        return;
      }

      if (shortcut === 'blocked') {
        setStatus('blocked');
        setAction('all');
        setIntegrityFilter('all');
        return;
      }

      if (shortcut === 'failed') {
        setStatus('failed');
        setAction('all');
        setIntegrityFilter('all');
        return;
      }

      if (shortcut === 'retry') {
        setStatus('all');
        setAction('retry');
        setIntegrityFilter('all');
        return;
      }

      setStatus('success');
      setAction('all');
      setIntegrityFilter('invalid_schema');
    });
  }

  function selectUser(uid: string) {
    setSelectedUserUid(uid);
    setSelectedEventId(null);
    setVisibleEventsLimit(TIMELINE_PAGE_SIZE);
  }

  function selectEvent(eventId: string) {
    setSelectedEventId(eventId);
  }

  function moveUserSelection(direction: 1 | -1) {
    if (groupedUsers.length === 0) {
      return;
    }

    const fallbackIndex = direction === 1 ? -1 : groupedUsers.length;
    const currentIndex = selectedUserIndex >= 0 ? selectedUserIndex : fallbackIndex;
    const nextIndex = Math.max(0, Math.min(groupedUsers.length - 1, currentIndex + direction));

    if (nextIndex === currentIndex) {
      return;
    }

    const nextUser = groupedUsers[nextIndex];
    setSelectedUserUid(nextUser.uid);
    setSelectedEventId(null);
    setVisibleEventsLimit(TIMELINE_PAGE_SIZE);
    setVisibleUsersLimit((current) =>
      nextIndex + 1 > current ? current + USER_LIST_PAGE_SIZE : current,
    );
  }

  function moveEventSelection(direction: 1 | -1) {
    if (!selectedGroup || selectedGroup.rows.length === 0) {
      return;
    }

    const fallbackIndex = direction === 1 ? -1 : selectedGroup.rows.length;
    const currentIndex = selectedEventIndex >= 0 ? selectedEventIndex : fallbackIndex;
    const nextIndex = Math.max(0, Math.min(selectedGroup.rows.length - 1, currentIndex + direction));

    if (nextIndex === currentIndex) {
      return;
    }

    const nextEvent = selectedGroup.rows[nextIndex];
    setSelectedEventId(nextEvent.id);
    setVisibleEventsLimit((current) =>
      nextIndex + 1 > current ? current + TIMELINE_PAGE_SIZE : current,
    );
  }

  function jumpToBoundaryEvent(which: 'first' | 'last') {
    if (!selectedGroup || selectedGroup.rows.length === 0) {
      return;
    }

    const targetIndex = which === 'first' ? 0 : selectedGroup.rows.length - 1;
    const targetEvent = selectedGroup.rows[targetIndex];
    setSelectedEventId(targetEvent.id);
    setVisibleEventsLimit((current) =>
      targetIndex + 1 > current ? Math.max(current + TIMELINE_PAGE_SIZE, targetIndex + 1) : current,
    );
  }

  function handleDesktopNavigationKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveEventSelection(-1);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveEventSelection(1);
      return;
    }

    if (event.key === 'PageUp') {
      event.preventDefault();
      moveUserSelection(-1);
      return;
    }

    if (event.key === 'PageDown') {
      event.preventDefault();
      moveUserSelection(1);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      jumpToBoundaryEvent('first');
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      jumpToBoundaryEvent('last');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border border-black/10 bg-white/90 px-4 py-4 shadow-[0_14px_38px_rgba(25,19,15,0.06)] sm:px-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div>
            <p className="text-xs font-semibold tracking-[0.12em] text-brand">ניהול SayBack</p>
            <h1 className="mt-1 text-2xl font-semibold text-brand-ink sm:text-3xl">
              סקירת שימוש לפי משתמשים ואירועים
            </h1>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[360px]">
            <CompactFact
              label="רשומה אחרונה"
              value={latestRow ? formatDateTime(latestRow.createdAt) : 'אין נתונים'}
            />
            <CompactFact label="משתמשים בתצוגה" value={String(groupedUsers.length)} />
          </div>
        </div>
      </section>

      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="אירועים" value={String(filteredRows.length)} toneClass="bg-brand" />
        <StatCard label="הצלחות" value={String(summary.statusCounts.success)} toneClass="bg-emerald-500" />
        <StatCard label="חסומים" value={String(summary.statusCounts.blocked)} toneClass="bg-amber-400" />
        <StatCard label="נכשלו" value={String(summary.statusCounts.failed)} toneClass="bg-rose-500" />
        <StatCard label="משתמשים" value={String(summary.uniqueUsersCount)} toneClass="bg-sky-500" />
        <StatCard label="משתמשים חסומים" value={String(summary.uniqueBlockedUsersCount)} toneClass="bg-zinc-700" />
        <StatCard
          label="Retry מתיקונים"
          value={`${formatRatioPercent(summary.retryRatio)} (${summary.retryCount}/${summary.refineCount})`}
          toneClass="bg-violet-500"
        />
        <StatCard
          label="חריגות סכימה"
          value={`${summary.invalidSchemaCount}/${summary.successRowsCount}`}
          toneClass={summary.invalidSchemaCount > 0 ? 'bg-rose-600' : 'bg-emerald-600'}
        />
      </section>

      <section
        className="overflow-hidden rounded-2xl border border-black/10 bg-white/95 shadow-[0_18px_55px_rgba(25,19,15,0.07)]"
        tabIndex={0}
        onKeyDown={handleDesktopNavigationKeyDown}
      >
        <div className="sticky top-3 z-20 border-b border-black/10 bg-white/95 px-3 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/90 sm:px-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 className="text-base font-semibold text-brand-ink">מסננים וטריאז׳</h2>
              <p className="mt-0.5 text-xs text-black/55">
                {filteredRows.length} אירועים, {groupedUsers.length} משתמשים, {summary.invalidSchemaCount} חריגות סכימה
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <SummaryShortcutButton
                label={`הכול (${presetSummary.totalCount})`}
                active={status === 'all' && action === 'all' && integrityFilter === 'all'}
                onClick={() => applySummaryShortcut('all')}
              />
              <SummaryShortcutButton
                label={`חסומים (${presetSummary.blockedCount})`}
                active={status === 'blocked' && action === 'all' && integrityFilter === 'all'}
                onClick={() => applySummaryShortcut('blocked')}
                disabled={presetSummary.blockedCount === 0}
              />
              <SummaryShortcutButton
                label={`נכשלו (${presetSummary.failedCount})`}
                active={status === 'failed' && action === 'all' && integrityFilter === 'all'}
                onClick={() => applySummaryShortcut('failed')}
                disabled={presetSummary.failedCount === 0}
              />
              <SummaryShortcutButton
                label={`Retry (${presetSummary.retryCount})`}
                active={status === 'all' && action === 'retry' && integrityFilter === 'all'}
                onClick={() => applySummaryShortcut('retry')}
                disabled={presetSummary.retryCount === 0}
              />
              <SummaryShortcutButton
                label={`סכימה (${presetSummary.invalidSchemaCount})`}
                active={integrityFilter === 'invalid_schema'}
                onClick={() => applySummaryShortcut('schema_issues')}
                disabled={presetSummary.invalidSchemaCount === 0}
              />
            </div>
          </div>

          <div className="mt-3 grid gap-2" style={filterGridStyle}>
          <div style={filterSearchStyle}>
          <Field label="חיפוש חופשי" htmlFor={searchId}>
            <input
              id={searchId}
              type="search"
              dir="auto"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="חפש לפי UID, הודעה/הודעה אחרונה, רקע, תשובה, שגיאה, intent או sourceReply"
              className={`h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm text-black/85 outline-none transition focus:border-brand/40 ${whiteSurfaceFocusClass}`}
            />
          </Field>
          </div>
          <Field label="מקור" htmlFor={sourceId}>
            <select
              id={sourceId}
              value={source}
              onChange={(event) =>
                startTransition(() => setSource(event.target.value as SourceFilter))
              }
              className={`h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm text-black/85 outline-none transition focus:border-brand/40 ${whiteSurfaceFocusClass}`}
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
              className={`h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm text-black/85 outline-none transition focus:border-brand/40 ${whiteSurfaceFocusClass}`}
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
              className={`h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm text-black/85 outline-none transition focus:border-brand/40 ${whiteSurfaceFocusClass}`}
            >
              <option value="all">כל הפעולות</option>
              {availableActions.map((availableAction) => (
                <option key={availableAction} value={availableAction}>
                  {availableAction}
                </option>
              ))}
            </select>
          </Field>
          <Field label="מיון ציר זמן + סדר משתמשים" htmlFor={sortId}>
            <div className="flex gap-2">
              <select
                id={sortId}
                value={sortOrder}
                onChange={(event) =>
                  startTransition(() => setSortOrder(event.target.value as SortOrder))
                }
                className={`h-11 min-w-0 flex-1 rounded-xl border border-black/10 bg-white px-3 text-sm text-black/85 outline-none transition focus:border-brand/40 ${whiteSurfaceFocusClass}`}
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
                className={`h-11 rounded-xl border border-black/10 bg-black px-4 text-sm font-medium text-white transition hover:bg-black/85 ${darkSurfaceFocusClass}`}
              >
                איפוס
              </button>
            </div>
          </Field>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {STATUS_OPTIONS.map((option) => {
              const active = status === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => startTransition(() => setStatus(option.value))}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                    active
                      ? `${getStatusFilterChipTone(option.value)} border-transparent`
                      : 'border-black/10 bg-white text-black/75 hover:bg-black/[0.03]'
                  } ${whiteSurfaceFocusClass}`}
                >
                  <span>{option.label}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] leading-4 ${
                      active ? 'bg-black/10 text-current' : 'bg-black/[0.06] text-black/60'
                    }`}
                  >
                    {statusQuickCounts[option.value]}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {normalizedSearch ? (
              <ActiveFilterChip label={`חיפוש: "${deferredSearch.trim()}"`} onClear={() => setSearch('')} />
            ) : null}
            {source !== 'all' ? (
              <ActiveFilterChip
                label={`מקור: ${source === 'production' ? 'פרודקשן' : 'מקומי'}`}
                onClear={() => startTransition(() => setSource('all'))}
              />
            ) : null}
            {status !== 'all' ? (
              <ActiveFilterChip
                label={`סטטוס: ${labelForStatusFilter(status)}`}
                onClear={() => startTransition(() => setStatus('all'))}
              />
            ) : null}
            {action !== 'all' ? (
              <ActiveFilterChip
                label={`פעולה: ${describeAction(action).actionLabel}`}
                onClear={() => startTransition(() => setAction('all'))}
              />
            ) : null}
            {integrityFilter !== 'all' ? (
              <ActiveFilterChip
                label="תקינות: חריגות סכימה"
                onClear={() => startTransition(() => setIntegrityFilter('all'))}
              />
            ) : null}
            {sortOrder !== 'newest' ? (
              <ActiveFilterChip
                label={`מיון: ${SORT_OPTIONS.find((option) => option.value === sortOrder)?.label ?? sortOrder}`}
                onClear={() => startTransition(() => setSortOrder('newest'))}
              />
            ) : null}
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={resetFilters}
                className={`rounded-lg border border-black/10 bg-black px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-black/85 ${darkSurfaceFocusClass}`}
              >
                נקה הכול
              </button>
            ) : (
              <span className="text-xs text-black/50">אין מסננים פעילים.</span>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-black/55">
            <InfoPill label={`פרודקשן: ${summary.productionCount}`} />
            <InfoPill label={`מקומי: ${summary.localCount}`} />
            <InfoPill label={`בתהליך: ${summary.statusCounts.pending}`} />
            <InfoPill label={`intent חסר: ${summary.missingIntentCount}`} />
            <InfoPill label={`replies שגוי: ${summary.invalidRepliesCount}`} />
            <InfoPill label={`replies ריקים: ${summary.emptyReplyItemsCount}`} />
          </div>
          <p id={resultsStatusId} role="status" aria-live="polite" aria-atomic="true" className="sr-only">
            {liveStatusText}
          </p>
        </div>

        {groupedUsers.length === 0 ? (
          <div className="px-4 py-14 text-center sm:px-6">
            <div className="mx-auto max-w-md rounded-xl border border-dashed border-black/15 bg-white px-6 py-8">
              <p className="text-base font-medium text-brand-ink">לא נמצאו תוצאות</p>
              <p className="mt-2 text-sm leading-7 text-black/60">נסה לשנות את החיפוש או הסינון.</p>
            </div>
          </div>
        ) : (
          <div className="grid" style={workbenchGridStyle}>
            <aside className="border-b border-black/10 bg-[#fbfaf7] xl:border-b-0 xl:border-l">
              <PaneHeader
                title="משתמשים"
                meta={`מוצגים ${visibleUserGroups.length} מתוך ${groupedUsers.length}`}
              />
              <ul
                id={usersListId}
                className="max-h-[64vh] divide-y divide-black/10 overflow-y-auto overscroll-contain xl:max-h-none xl:h-[718px]"
                aria-label="רשימת משתמשים"
                aria-describedby={resultsStatusId}
                style={stableScrollbarStyle}
              >
                {visibleUserGroups.map((group) => {
                  const isSelected = selectedGroup?.uid === group.uid;
                  const latestMessage = group.latestInitialMessages[0] ?? null;

                  return (
                    <li key={group.uid}>
                      <button
                        type="button"
                        onClick={() => selectUser(group.uid)}
                        aria-pressed={isSelected}
                        className={`w-full px-3 py-3 text-right transition ${
                          isSelected
                            ? 'bg-black text-white'
                            : `bg-white text-black hover:bg-black/[0.03] ${whiteSurfaceFocusClass}`
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <code
                            className={`min-w-0 flex-1 break-all text-[12px] font-semibold ${
                              isSelected ? 'text-white' : 'text-brand-ink'
                            }`}
                            dir="auto"
                            style={{ unicodeBidi: 'plaintext' }}
                          >
                            {group.uid}
                          </code>
                          <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] ${isSelected ? 'bg-white/15 text-white' : 'bg-black/[0.06] text-black/65'}`}>
                            {group.totalCount}
                          </span>
                        </div>
                        <UserStatusBar selected={isSelected} group={group} />
                        <p
                          className={`mt-2 line-clamp-2 text-xs ${isSelected ? 'text-white/90' : 'text-black/70'}`}
                          dir="auto"
                          style={{ unicodeBidi: 'plaintext' }}
                        >
                          {latestMessage
                            ? toCompactMessagePreview(
                                latestMessage.message,
                                latestMessage.hasImage,
                                latestMessage.noReplyMode,
                                latestMessage.lastOutgoingMessage,
                              )
                            : 'אין הודעות חדשות להצגה'}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          <UserMetricPill selected={isSelected} label={`${group.newMessageCount} חדשות`} />
                          <UserMetricPill selected={isSelected} label={`${group.refineCount} תיקונים`} />
                          <UserMetricPill selected={isSelected} label={`${group.blockedCount} חסומים`} />
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {hiddenUsersCount > 0 ? (
                <div className="border-t border-black/10 bg-white px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setVisibleUsersLimit((current) => current + USER_LIST_PAGE_SIZE)}
                    className={`w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/75 transition hover:bg-black/[0.03] ${whiteSurfaceFocusClass}`}
                  >
                    הצג עוד משתמשים (+{Math.min(USER_LIST_PAGE_SIZE, hiddenUsersCount)})
                  </button>
                </div>
              ) : null}
            </aside>

            <section className="border-b border-black/10 bg-white xl:border-b-0 xl:border-l">
              <PaneHeader
                title="ציר אירועים"
                meta={
                  selectedGroup
                    ? `${visibleTimelineRows.length} מתוך ${selectedGroup.rows.length} אירועים`
                    : 'בחר משתמש'
                }
              />
              {selectedGroup ? (
                <>
                  <div className="border-b border-black/10 bg-white px-3 py-2">
                    <code
                      className="block break-all text-xs font-semibold text-brand-ink"
                      dir="auto"
                      style={{ unicodeBidi: 'plaintext' }}
                    >
                      {selectedGroup.uid}
                    </code>
                    <div className="mt-2 hidden flex-wrap gap-1.5 xl:flex">
                      <InfoPill
                        label={
                          selectedEventIndex >= 0
                            ? `אירוע ${selectedEventIndex + 1} מתוך ${selectedGroup.rows.length}`
                            : 'אין אירוע נבחר'
                        }
                      />
                      <InfoPill label="↑ ↓ אירועים · PgUp/PgDn משתמשים · Home/End קצוות" />
                    </div>
                  </div>
                  <ul
                    className="max-h-[66vh] divide-y divide-black/10 overflow-y-auto overscroll-contain xl:max-h-none xl:h-[660px]"
                    style={stableScrollbarStyle}
                  >
                    {visibleTimelineRows.map((row, index) => {
                      const actionInfo = describeAction(row.action);
                      const isSelectedEvent = selectedEvent?.id === row.id;
                      const outputPreview = actionInfo.isRefine
                        ? pickPrimaryRefineReply(row.replies) || row.sourceReply || 'ללא פלט'
                        : row.replies[0] || row.intent || 'ללא פלט';

                      return (
                        <li key={row.id}>
                          <button
                            type="button"
                            onClick={() => selectEvent(row.id)}
                            aria-pressed={isSelectedEvent}
                            className={`w-full px-3 py-3 text-right transition ${
                              isSelectedEvent
                                ? 'bg-[#161616] text-white'
                                : `bg-white text-black hover:bg-black/[0.03] ${whiteSurfaceFocusClass}`
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2 text-xs">
                                <span
                                  className={`rounded-md px-2 py-0.5 ${
                                    isSelectedEvent ? 'bg-white/15 text-white' : 'bg-black/[0.06] text-black/70'
                                  }`}
                                >
                                  #{index + 1}
                                </span>
                                <span className={isSelectedEvent ? 'text-white/80' : 'text-black/60'}>
                                  {formatDateTime(row.createdAt)}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {renderStatusPill(row.status)}
                                {renderActionPill(actionInfo)}
                              </div>
                            </div>
                            <p
                              className={`mt-2 line-clamp-2 text-xs ${isSelectedEvent ? 'text-white/90' : 'text-black/75'}`}
                              dir="auto"
                              style={{ unicodeBidi: 'plaintext' }}
                            >
                              נכנס: {toCompactMessagePreview(row.message, row.hasImage, row.noReplyMode, row.lastOutgoingMessage)}
                            </p>
                            <p
                              className={`mt-1 line-clamp-2 text-xs ${isSelectedEvent ? 'text-white/75' : 'text-black/60'}`}
                              dir="auto"
                              style={{ unicodeBidi: 'plaintext' }}
                            >
                              יצא: {outputPreview}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1">
                              {row.consumption ? (
                                <EventMetaChip selected={isSelectedEvent} label={toConsumptionLabel(row.consumption)} />
                              ) : null}
                              {typeof row.durationMs === 'number' ? (
                                <EventMetaChip selected={isSelectedEvent} label={`${row.durationMs}ms`} />
                              ) : null}
                              {row.noReplyMode ? <EventMetaChip selected={isSelectedEvent} label="ללא מענה" /> : null}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {hiddenEventsCount > 0 ? (
                    <div className="border-t border-black/10 bg-white px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setVisibleEventsLimit((current) => current + TIMELINE_PAGE_SIZE)}
                        className={`w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/75 transition hover:bg-black/[0.03] ${whiteSurfaceFocusClass}`}
                      >
                        הצג עוד אירועים (+{Math.min(TIMELINE_PAGE_SIZE, hiddenEventsCount)})
                      </button>
                    </div>
                  ) : null}
                </>
              ) : (
                <EmptyPane text="בחר משתמש מהרשימה כדי לטעון ציר אירועים." />
              )}
            </section>

            <section className="bg-[#fbfaf7]">
              <PaneHeader title="פרטי אירוע" meta={selectedEvent ? formatDateTime(selectedEvent.createdAt) : 'לא נבחר'} />
              {selectedEvent ? (
                <div
                  className="max-h-[72vh] space-y-3 overflow-y-auto overscroll-contain p-3 xl:max-h-none xl:h-[718px]"
                  style={stableScrollbarStyle}
                >
                  <div className="flex flex-wrap gap-2">
                    {renderSourcePill(selectedEvent.source)}
                    {renderModelSourcePill(selectedEvent.modelSource)}
                    {renderEventTypePill(describeAction(selectedEvent.action))}
                    {renderStatusPill(selectedEvent.status)}
                  </div>
                  <InfoGrid
                    items={[
                      ['מזהה', selectedEvent.id],
                      ['חיוב', selectedEvent.consumption ? toConsumptionLabel(selectedEvent.consumption) : 'לא זמין'],
                      ['משך', typeof selectedEvent.durationMs === 'number' ? `${selectedEvent.durationMs}ms` : 'לא זמין'],
                      ['הסתיים', selectedEvent.completedAt ? formatDateTime(selectedEvent.completedAt) : 'לא זמין'],
                    ]}
                  />
                  <TextPanel
                    title="מה נשלח"
                    tone="input"
                    panelId={`selected-input-${toDomToken(selectedEvent.id)}`}
                  >
                    <p
                      className="whitespace-pre-wrap break-words text-xs leading-5 text-black/80"
                      dir="auto"
                      style={{ unicodeBidi: 'plaintext' }}
                    >
                      {selectedEvent.noReplyMode
                        ? selectedEvent.lastOutgoingMessage || 'ללא טקסט'
                        : selectedEvent.message || 'ללא טקסט'}
                    </p>
                    {selectedEvent.conversationBackground ? (
                      <p
                        className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-black/70"
                        dir="auto"
                        style={{ unicodeBidi: 'plaintext' }}
                      >
                        רקע: {selectedEvent.conversationBackground}
                      </p>
                    ) : null}
                  </TextPanel>
                  <TextPanel
                    title="מה חזר"
                    tone="output"
                    panelId={`selected-output-${toDomToken(selectedEvent.id)}`}
                  >
                    <p
                      className="whitespace-pre-wrap break-words text-xs leading-5 text-black/80"
                      dir="auto"
                      style={{ unicodeBidi: 'plaintext' }}
                    >
                      intent: {selectedEvent.intent || 'לא התקבל'}
                    </p>
                    {selectedEvent.replies.length > 0 ? (
                      <ol className="mt-2 grid gap-1.5">
                        {selectedEvent.replies.map((reply, replyIndex) => (
                          <li
                            key={`${selectedEvent.id}-reply-${replyIndex}`}
                            className="rounded-lg border border-black/10 bg-white px-2 py-1.5"
                          >
                            <p
                              className="whitespace-pre-wrap break-words text-xs leading-5 text-black/80"
                              dir="auto"
                              style={{ unicodeBidi: 'plaintext' }}
                            >
                              {reply}
                            </p>
                          </li>
                        ))}
                      </ol>
                    ) : null}
                  </TextPanel>
                  {selectedEvent.sourceReply ? (
                    <TextPanel title="תשובת מקור לתיקון" tone="neutral">
                      <p
                        className="whitespace-pre-wrap break-words text-xs leading-5 text-black/75"
                        dir="auto"
                        style={{ unicodeBidi: 'plaintext' }}
                      >
                        {selectedEvent.sourceReply}
                      </p>
                    </TextPanel>
                  ) : null}
                  {selectedEvent.error ? (
                    <TextPanel
                      title="שגיאה"
                      tone="error"
                      panelId={`selected-error-${toDomToken(selectedEvent.id)}`}
                    >
                      <p
                        className="whitespace-pre-wrap break-words text-xs leading-5 text-rose-800"
                        dir="auto"
                        style={{ unicodeBidi: 'plaintext' }}
                      >
                        {selectedEvent.error}
                      </p>
                    </TextPanel>
                  ) : null}
                  {selectedEvent.noReplyMode && selectedEvent.noReplyDurationValue && selectedEvent.noReplyDurationUnit ? (
                    <InfoPill
                      label={`זמן ללא מענה: ${selectedEvent.noReplyDurationValue} ${toDurationUnitLabel(selectedEvent.noReplyDurationUnit)}`}
                    />
                  ) : null}
                </div>
              ) : (
                <EmptyPane text="בחר אירוע מהרשימה כדי לראות את כל הפרטים." />
              )}
            </section>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-black/10 bg-white px-3 py-2 text-xs text-black/55">
          <div className="flex flex-wrap gap-2">
            <InfoPill
              label={
                selectedUserIndex >= 0
                  ? `משתמש ${selectedUserIndex + 1} מתוך ${groupedUsers.length}`
                  : `משתמשים: ${groupedUsers.length}`
              }
            />
            <InfoPill label={normalizedSearch ? 'חיפוש פעיל' : 'ללא חיפוש'} />
          </div>
          <div className="hidden flex-wrap items-center gap-2 xl:flex">
            <DesktopNavButton
              label="משתמש קודם"
              onClick={() => moveUserSelection(-1)}
              disabled={!canMoveToPreviousUser}
            />
            <DesktopNavButton
              label="משתמש הבא"
              onClick={() => moveUserSelection(1)}
              disabled={!canMoveToNextUser}
            />
            <button
              type="button"
              onClick={() => moveEventSelection(-1)}
              disabled={!canMoveToPreviousEvent}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                !canMoveToPreviousEvent
                  ? 'cursor-not-allowed border-black/10 bg-white text-black/35'
                  : `border-black/10 bg-white text-black/80 hover:bg-black/[0.03] ${whiteSurfaceFocusClass}`
              }`}
            >
              אירוע קודם
            </button>
            <DesktopNavButton
              label="אירוע הבא"
              onClick={() => moveEventSelection(1)}
              disabled={!canMoveToNextEvent}
            />
          </div>
        </div>
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

function PaneHeader({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-3 border-b border-black/10 bg-white px-3 py-2">
      <h3 className="text-sm font-semibold text-brand-ink">{title}</h3>
      <span className="text-xs text-black/55">{meta}</span>
    </div>
  );
}

function EmptyPane({ text }: { text: string }) {
  return (
    <div className="flex min-h-[280px] items-center justify-center px-4 py-10 text-center text-sm text-black/60 xl:h-[718px]">
      <div className="rounded-xl border border-dashed border-black/15 bg-white px-5 py-4">{text}</div>
    </div>
  );
}

function InfoGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-lg border border-black/10 bg-white px-3 py-2">
          <dt className="text-[10px] font-medium text-black/45">{label}</dt>
          <dd
            className="mt-1 break-words text-xs font-medium text-black/75"
            dir="auto"
            style={{ unicodeBidi: 'plaintext' }}
          >
            {value}
          </dd>
        </div>
      ))}
    </dl>
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
    <article className="overflow-hidden rounded-xl border border-black/10 bg-white shadow-[0_8px_24px_rgba(25,19,15,0.04)]">
      <div className={`h-1 w-full ${toneClass}`} />
      <div className="px-4 py-3">
        <div className="text-xs text-black/55">{label}</div>
        <div className="mt-1 text-2xl font-semibold text-brand-ink">{value}</div>
      </div>
    </article>
  );
}

function SummaryShortcutButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      disabled={disabled}
      className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition ${whiteSurfaceFocusClass} ${
        active
          ? 'border-black bg-black text-white'
          : 'border-black/10 bg-white text-black/75 hover:bg-black/[0.03]'
      } ${disabled ? 'cursor-not-allowed opacity-50 hover:bg-white' : ''}`}
    >
      {label}
    </button>
  );
}

function DesktopNavButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
        disabled
          ? 'cursor-not-allowed border-black/10 bg-white text-black/35'
          : `border-black/10 bg-white text-black/80 hover:bg-black/[0.03] ${whiteSurfaceFocusClass}`
      }`}
    >
      {label}
    </button>
  );
}

function ActiveFilterChip({
  label,
  onClear,
}: {
  label: string;
  onClear: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClear}
      className={`inline-flex items-center gap-1 rounded-full border border-black/10 bg-white px-2 py-0.5 text-[11px] leading-4 text-black/75 transition hover:bg-black/[0.03] ${whiteSurfaceFocusClass}`}
    >
      <span>{label}</span>
      <span
        aria-hidden
        className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-black/[0.08] text-[10px] text-black/70"
      >
        ×
      </span>
      <span className="sr-only">הסר מסנן</span>
    </button>
  );
}

function UserMetricPill({
  label,
  selected,
}: {
  label: string;
  selected: boolean;
}) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] ${
        selected ? 'bg-white/15 text-white' : 'bg-black/[0.06] text-black/65'
      }`}
    >
      {label}
    </span>
  );
}

function UserStatusBar({
  selected,
  group,
}: {
  selected: boolean;
  group: UserGroup;
}) {
  const total = Math.max(1, group.totalCount);
  const segments = [
    { key: 'success', value: group.successCount, className: selected ? 'bg-emerald-300' : 'bg-emerald-500' },
    { key: 'blocked', value: group.blockedCount, className: selected ? 'bg-amber-300' : 'bg-amber-500' },
    { key: 'failed', value: group.failedCount, className: selected ? 'bg-rose-300' : 'bg-rose-500' },
    { key: 'pending', value: group.pendingCount, className: selected ? 'bg-sky-300' : 'bg-sky-500' },
  ].filter((segment) => segment.value > 0);

  if (segments.length === 0) {
    return (
      <div className={`mt-2 h-1.5 rounded-full ${selected ? 'bg-white/20' : 'bg-black/10'}`} />
    );
  }

  return (
    <div
      className={`mt-2 flex h-1.5 overflow-hidden rounded-full ${selected ? 'bg-white/20' : 'bg-black/10'}`}
      aria-hidden
    >
      {segments.map((segment) => (
        <span
          key={segment.key}
          className={segment.className}
          style={{ width: `${(segment.value / total) * 100}%` }}
        />
      ))}
    </div>
  );
}

function EventMetaChip({
  label,
  selected,
}: {
  label: string;
  selected: boolean;
}) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] ${
        selected ? 'bg-white/15 text-white/90' : 'bg-black/[0.06] text-black/65'
      }`}
    >
      {label}
    </span>
  );
}

function TextPanel({
  title,
  tone,
  panelId,
  children,
}: {
  title: string;
  tone: 'neutral' | 'input' | 'output' | 'error';
  panelId?: string;
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
      <div
        id={panelId}
        tabIndex={0}
        dir="auto"
        aria-label={`תוכן ${title}`}
        className={`max-h-44 overflow-y-scroll overscroll-contain rounded-md pr-1 ${warmSurfaceFocusClass}`}
        style={{ unicodeBidi: 'plaintext', scrollbarGutter: 'stable' }}
      >
        {children}
      </div>
    </div>
  );
}

function InfoPill({ label }: { label: string }) {
  return (
    <span
      dir="auto"
      style={{ unicodeBidi: 'plaintext' }}
      className="inline-flex rounded-full border border-black/10 bg-white px-2 py-0.5 text-[11px] leading-4"
    >
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

function labelForStatusFilter(value: StatusFilter) {
  const match = STATUS_OPTIONS.find((option) => option.value === value);
  return match ? match.label : value;
}

function getStatusFilterChipTone(value: StatusFilter) {
  if (value === 'success') {
    return 'bg-emerald-100 text-emerald-900';
  }

  if (value === 'blocked') {
    return 'bg-amber-100 text-amber-900';
  }

  if (value === 'failed') {
    return 'bg-rose-100 text-rose-900';
  }

  if (value === 'pending') {
    return 'bg-sky-100 text-sky-900';
  }

  return 'bg-black text-white';
}

function evaluateSchemaIntegrity(row: AdminUsageEntry) {
  const normalizedStatus = normalizeStatus(row.status);
  const hasIntent = typeof row.intent === 'string' && row.intent.trim().length > 0;
  const hasExactRepliesCount = row.replies.length === 3;
  const hasNonEmptyReplies =
    hasExactRepliesCount &&
    row.replies.every((reply) => typeof reply === 'string' && reply.trim().length > 0);

  if (normalizedStatus !== 'success') {
    return {
      hasIntent,
      hasExactRepliesCount,
      hasNonEmptyReplies,
      isSchemaValid: true,
    };
  }

  return {
    hasIntent,
    hasExactRepliesCount,
    hasNonEmptyReplies,
    isSchemaValid: hasIntent && hasExactRepliesCount && hasNonEmptyReplies,
  };
}

function formatRatioPercent(value: number) {
  return `${Math.round(value * 100)}%`;
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
    let blockedCount = 0;
    let failedCount = 0;
    let pendingCount = 0;
    let newMessageCount = 0;
    let refineCount = 0;

    for (const row of userRows) {
      const normalizedStatus = normalizeStatus(row.status);

      if (normalizedStatus === 'success') {
        successCount += 1;
      } else if (normalizedStatus === 'blocked') {
        blockedCount += 1;
      } else if (normalizedStatus === 'pending') {
        pendingCount += 1;
      } else {
        failedCount += 1;
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
      blockedCount,
      failedCount,
      pendingCount,
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

function toDomToken(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  return normalized.length > 0 ? normalized : 'entry';
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'לא ידוע' : dateFormatter.format(date);
}
