import { useState, useEffect, useRef } from "hono/jsx/dom";
import type { TopLevelGroup, MRState, GitLabUser } from "~/lib/types";
import { searchUsers } from "~/lib/gitlab-client";

interface SearchFormProps {
  username: string;
  onUsernameChange: (v: string) => void;
  groups: TopLevelGroup[];
  selectedGroupIds: number[];
  onGroupToggle: (id: number) => void;
  onSelectAllGroups: () => void;
  state: MRState;
  onStateChange: (s: MRState) => void;
  onSearch: () => void;
  loading: boolean;
}

const STATE_OPTIONS: { value: MRState; label: string }[] = [
  { value: "opened", label: "Opened" },
  { value: "merged", label: "Merged" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
];

export function SearchForm({
  username,
  onUsernameChange,
  groups,
  selectedGroupIds,
  onGroupToggle,
  onSelectAllGroups,
  state,
  onStateChange,
  onSearch,
  loading,
}: SearchFormProps) {
  const [suggestions, setSuggestions] = useState<GitLabUser[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const allSelected =
    groups.length > 0 && groups.every((g) => selectedGroupIds.includes(g.id));

  // サジェスト変更時にactiveIndexをリセット
  useEffect(() => {
    setActiveIndex(-1);
  }, [suggestions]);

  // ユーザー入力時にデバウンスで候補を検索
  const handleInput = (value: string) => {
    onUsernameChange(value);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const users = await searchUsers(value.trim());
        setSuggestions(users);
        setShowSuggestions(users.length > 0);
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  };

  const handleSelectUser = (user: GitLabUser) => {
    onUsernameChange(user.username);
    setShowSuggestions(false);
    setSuggestions([]);
    setActiveIndex(-1);
  };

  // クリック外で候補を閉じる
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev: number) =>
          prev < suggestions.length - 1 ? prev + 1 : 0,
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev: number) =>
          prev > 0 ? prev - 1 : suggestions.length - 1,
        );
        return;
      }
      if (e.key === "Enter" && activeIndex >= 0) {
        e.preventDefault();
        handleSelectUser(suggestions[activeIndex]);
        return;
      }
    }
    if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    setShowSuggestions(false);
    if (username.trim() && selectedGroupIds.length > 0 && !loading) {
      onSearch();
    }
  };

  return (
    <form class="search-form" onSubmit={handleSubmit}>
      {/* ユーザー名 */}
      <div class="form-row">
        <label class="form-label" htmlFor="username-input">
          <i class="fas fa-user" aria-hidden="true" />
          ユーザー名
        </label>
        <div class="relative w-full max-w-md" ref={containerRef}>
          <div class="relative">
            <input
              id="username-input"
              type="text"
              class="input input-bordered w-full"
              style="height: 36px; font-size: 14px;"
              placeholder="名前またはユーザー名で検索"
              value={username}
              onInput={(e: Event) =>
                handleInput((e.target as HTMLInputElement).value)
              }
              onFocus={() => {
                if (suggestions.length > 0) setShowSuggestions(true);
              }}
              onKeyDown={handleKeyDown}
              role="combobox"
              aria-expanded={showSuggestions && suggestions.length > 0}
              aria-autocomplete="list"
              aria-controls="user-suggestions"
              autoComplete="off"
            />
            {searching && (
              <span
                class="loading loading-spinner loading-xs absolute right-3 top-1/2 -translate-y-1/2"
                style="color: var(--text-subtle)"
                aria-hidden="true"
              />
            )}
          </div>
          {showSuggestions && suggestions.length > 0 && (
            <div
              id="user-suggestions"
              class="suggestions-dropdown"
              role="listbox"
            >
              {suggestions.map((user, index) => (
                <button
                  key={user.id}
                  type="button"
                  class={`suggestion-item ${index === activeIndex ? "suggestion-item-active" : ""}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  onClick={() => handleSelectUser(user)}
                >
                  <img
                    src={user.avatar_url}
                    alt=""
                    class="w-6 h-6 rounded-full shrink-0"
                  />
                  <div class="flex flex-col min-w-0">
                    <span
                      class="text-sm truncate"
                      style="color: var(--text-heading)"
                    >
                      {user.name}
                    </span>
                    <span
                      class="text-xs truncate"
                      style="color: var(--text-muted)"
                    >
                      @{user.username}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* グループ選択 */}
      <div class="form-row">
        <label class="form-label">
          <i class="fas fa-layer-group" aria-hidden="true" />
          グループ
        </label>
        <div
          class="flex flex-wrap gap-2 items-center"
          role="group"
          aria-label="グループ選択"
        >
          <button
            type="button"
            class={`btn btn-sm ${allSelected ? "btn-primary" : "btn-outline"}`}
            onClick={onSelectAllGroups}
          >
            ALL
          </button>
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              class={`btn btn-sm ${selectedGroupIds.includes(g.id) ? "btn-primary" : "btn-outline"}`}
              onClick={() => onGroupToggle(g.id)}
            >
              {g.name}
            </button>
          ))}
        </div>
      </div>

      {/* 状態フィルタ */}
      <div class="form-row">
        <label class="form-label">
          <i class="fas fa-filter" aria-hidden="true" />
          状態
        </label>
        <div class="flex gap-1" role="group" aria-label="MR状態フィルタ">
          {STATE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              class={`btn btn-sm ${state === opt.value ? "btn-primary" : "btn-outline"}`}
              onClick={() => onStateChange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 検索ボタン + 更新ボタン */}
      <div class="form-row">
        <div class="form-label" />
        <div class="flex gap-2">
          <button
            type="submit"
            class="btn btn-primary btn-sm gap-2"
            disabled={
              loading || !username.trim() || selectedGroupIds.length === 0
            }
          >
            {loading ? (
              <>
                <span
                  class="loading loading-spinner loading-xs"
                  aria-hidden="true"
                />
                検索中...
              </>
            ) : (
              <>
                <i class="fas fa-search" aria-hidden="true" />
                検索
              </>
            )}
          </button>
          <button
            type="button"
            class="btn btn-ghost btn-sm gap-2"
            onClick={onSearch}
            disabled={
              loading || !username.trim() || selectedGroupIds.length === 0
            }
            title="最新の情報に更新"
            aria-label="最新の情報に更新"
          >
            <i
              class={`fas fa-sync-alt ${loading ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            更新
          </button>
        </div>
      </div>
    </form>
  );
}
