import { useState, useEffect, useRef } from "hono/jsx/dom";
import type { MergeRequest, MRState, TopLevelGroup } from "~/lib/types";
import {
  fetchGroups,
  fetchGroupMRs,
  fetchMRDetails,
} from "~/lib/gitlab-client";
import {
  aggregateGroups,
  saveSelectedGroups,
  loadSelectedGroups,
} from "~/lib/groups";
import { Header } from "~/components/Header";
import { SearchForm } from "~/components/SearchForm";
import { MRList } from "~/components/MRList";

const USERNAME_STORAGE_KEY = "gitlab-grep-username";

export function App() {
  const [username, setUsername] = useState(() => {
    return localStorage.getItem(USERNAME_STORAGE_KEY) ?? "";
  });
  const [state, setState] = useState<MRState>("opened");
  const [groups, setGroups] = useState<TopLevelGroup[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
  const [results, setResults] = useState<MergeRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [groupsLoading, setGroupsLoading] = useState(true);

  // Hono JSX workaround: useRef for pending state updates
  const resultsRef = useRef<MergeRequest[]>([]);
  const triggerRef = useRef<HTMLSpanElement>(null);

  const applyPendingResults = () => {
    setResults([...(resultsRef.current ?? [])]);
  };

  // グループ一覧を初回取得
  useEffect(() => {
    const load = async () => {
      try {
        const allGroups = await fetchGroups();
        const topGroups = aggregateGroups(allGroups);
        setGroups(topGroups);

        // 保存済みの選択を復元、なければ全選択
        const saved = loadSelectedGroups();
        if (saved && saved.length > 0) {
          setSelectedGroupIds(saved);
        } else {
          setSelectedGroupIds(topGroups.map((g) => g.id));
        }
      } catch (err) {
        console.error("Failed to fetch groups:", err);
      } finally {
        setGroupsLoading(false);
      }
    };
    load();
  }, []);

  const handleUsernameChange = (v: string) => {
    setUsername(v);
    localStorage.setItem(USERNAME_STORAGE_KEY, v);
  };

  const handleGroupToggle = (id: number) => {
    setSelectedGroupIds((prev: number[]) => {
      const next = prev.includes(id)
        ? prev.filter((gId: number) => gId !== id)
        : [...prev, id];
      saveSelectedGroups(next);
      return next;
    });
  };

  const handleSelectAllGroups = () => {
    const allIds = groups.map((g) => g.id);
    const allSelected = groups.every((g) => selectedGroupIds.includes(g.id));
    const next = allSelected ? [] : allIds;
    setSelectedGroupIds(next);
    saveSelectedGroups(next);
  };

  const handleSearch = async () => {
    if (!username.trim() || selectedGroupIds.length === 0) return;

    setLoading(true);
    setSearched(true);
    setResults([]);
    resultsRef.current = [];

    try {
      // 選択されたグループごとに並列でMR取得
      const mrPromises = selectedGroupIds.map((gId) =>
        fetchGroupMRs(gId, username.trim(), state).catch(
          () => [] as MergeRequest[],
        ),
      );
      const mrArrays = await Promise.all(mrPromises);
      const allMRs = mrArrays.flat();

      // 重複除去（同じMRが複数グループに属する場合）
      const uniqueMap = new Map<number, MergeRequest>();
      for (const mr of allMRs) {
        uniqueMap.set(mr.id, mr);
      }
      const uniqueMRs = Array.from(uniqueMap.values()).sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );

      resultsRef.current = uniqueMRs;
      setResults(uniqueMRs);

      // パイプライン・乖離数を並列取得（バックグラウンド）
      const detailPromises = uniqueMRs.map(async (mr) => {
        try {
          const details = await fetchMRDetails(mr.project_id, mr.iid);
          return { mrId: mr.id, ...details };
        } catch {
          return {
            mrId: mr.id,
            pipeline: null,
            diverged_commits_count: 0,
            approval: null,
            labels: [] as string[],
          };
        }
      });

      // 取得できたものから順次反映
      for (const promise of detailPromises) {
        const { mrId, pipeline, diverged_commits_count, approval, labels } =
          await promise;
        const idx = resultsRef.current.findIndex((m) => m.id === mrId);
        if (idx !== -1) {
          resultsRef.current[idx] = {
            ...resultsRef.current[idx],
            pipeline,
            diverged_commits_count,
            approval,
            ...(labels.length > 0 ? { labels } : {}),
          };
        }
      }
      // 全詳細取得後に一括反映
      triggerRef.current?.click();
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleMRDetailsUpdate = (
    mrId: number,
    pipeline: MergeRequest["pipeline"],
    diverged_commits_count: number,
    approval: MergeRequest["approval"],
    labels?: string[],
  ) => {
    resultsRef.current = (resultsRef.current ?? []).map((m) =>
      m.id === mrId
        ? {
            ...m,
            pipeline,
            diverged_commits_count,
            approval,
            ...(labels ? { labels } : {}),
          }
        : m,
    );
    triggerRef.current?.click();
  };

  return (
    <div class="min-h-screen flex flex-col">
      <Header />

      {/* Hidden trigger for Hono JSX state update workaround */}
      <span
        ref={triggerRef}
        onClick={applyPendingResults}
        style="display:none"
      />

      <main class="flex-1 py-8 animate-fade-in">
        <div class="max-w-4xl mx-auto px-6">
          {groupsLoading ? (
            <div class="flex flex-col items-center justify-center py-16 gap-3">
              <span class="loading loading-spinner loading-lg text-primary" />
              <span style="color: var(--text-muted)">
                グループを読み込み中...
              </span>
            </div>
          ) : (
            <>
              <SearchForm
                username={username}
                onUsernameChange={handleUsernameChange}
                groups={groups}
                selectedGroupIds={selectedGroupIds}
                onGroupToggle={handleGroupToggle}
                onSelectAllGroups={handleSelectAllGroups}
                state={state}
                onStateChange={setState}
                onSearch={handleSearch}
                loading={loading}
              />

              <MRList
                results={results}
                loading={loading}
                searched={searched}
                onMRDetailsUpdate={handleMRDetailsUpdate}
              />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
