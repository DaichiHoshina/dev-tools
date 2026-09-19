import { useState, useEffect, useRef } from "hono/jsx/dom";
import { DEPLOY_SERVICES } from "~/lib/deploy-config";
import type { Project } from "~/lib/types";
import type {
  OverrideEnv,
  OverrideMap,
  OverrideEntry,
  ImageMap,
} from "~/lib/image-override-client";
import {
  setDeploymentImage,
  buildEcrImage,
  extractTag,
  getOverrides,
  saveOverride,
  removeOverride,
  fetchDeploymentImages,
  restartDeployment,
} from "~/lib/image-override-client";
import {
  getLatestTag,
  getLatestCommitShortHash,
  hasGitLabTokens,
  parseMRUrl,
  getMRDetail,
  extractTicketFromTitle,
} from "~/lib/gitlab-client";
import type { ToastType } from "~/components/shared/ToastStack";

/** TTL残り時間を計算。ttl_hours が 0 の場合は null（TTL無し） */
export function computeTtlRemaining(
  deployedAt: string,
  ttlHours: number,
): { label: string; expired: boolean } | null {
  if (!ttlHours) return null;
  const deployedMs = new Date(deployedAt).getTime();
  const expiresMs = deployedMs + ttlHours * 3600_000;
  const remainMs = expiresMs - Date.now();
  if (remainMs <= 0) return { label: "0h", expired: true };
  const h = Math.floor(remainMs / 3600_000);
  const m = Math.floor((remainMs % 3600_000) / 60_000);
  return { label: h > 0 ? `${h}h${m}m` : `${m}m`, expired: false };
}

/** サーバーから取得するデータ */
export interface FetchState {
  loading: boolean;
  error: string | null;
  images: ImageMap;
  overrides: OverrideMap;
}

/** MR URL 解決結果 */
export interface MRResolved {
  title: string;
  branch: string;
  mrUrl: string;
  ticket: string;
}

/** ユーザー操作に関する UI 状態 */
export interface UIState {
  tagInputs: Record<string, string>;
  busyKeys: Record<string, boolean>;
  fetchingLatest: Record<string, boolean>;
  restartingKeys: Record<string, boolean>;
  resolvingMR: Record<string, boolean>;
  mrResolved: Record<string, MRResolved | undefined>;
  bannerDismissed: boolean;
  localImages: ImageMap;
  localOverrides: OverrideMap | null;
}

type PendingFetch =
  | { ok: true; images: ImageMap; overrides: OverrideMap }
  | { ok: false };

export interface UseImageOverrideReturn {
  fs: FetchState;
  ui: UIState;
  setUI: (updater: (prev: UIState) => UIState) => void;
  hasGitLab: boolean;
  connectionError: boolean;
  currentImages: ImageMap;
  overrides: OverrideMap;
  overrideCount: number;
  triggerRef: { current: HTMLSpanElement | null };
  applyPending: () => void;
  handleRefresh: () => void;
  handleDeploy: (serviceKey: string) => Promise<void>;
  handleFetchLatest: (serviceKey: string) => Promise<void>;
  handleResolveMR: (serviceKey: string, url: string) => Promise<void>;
  handleRestartPods: (serviceKey: string) => Promise<void>;
  handleReset: (serviceKey: string) => Promise<void>;
  handleResetAll: () => Promise<void>;
}

export function useImageOverride(
  project: Project,
  env: OverrideEnv,
  onToast: (message: string, type: ToastType) => void,
): UseImageOverrideReturn {
  // ── Fetch state（Hono workaround 必須）──────────────────────────────
  const [fs, setFs] = useState<FetchState>({
    loading: true,
    error: null,
    images: {},
    overrides: {},
  });

  const pendingRef = useRef<PendingFetch | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  /** K8s データの click handler */
  const applyPending = () => {
    const p = pendingRef.current;
    if (!p) return;
    pendingRef.current = null;
    if (p.ok) {
      setFs({
        loading: false,
        error: null,
        images: p.images,
        overrides: p.overrides,
      });
    } else {
      setFs((prev) => ({ ...prev, loading: false, error: "connection" }));
    }
  };

  const doFetch = () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timerId = setTimeout(() => controller.abort(), 10_000);

    Promise.all([
      fetchDeploymentImages(project, env, controller.signal),
      getOverrides(project, env, controller.signal),
    ])
      .then(([imgs, ovr]) => {
        clearTimeout(timerId);
        if (controller.signal.aborted) return;
        pendingRef.current =
          imgs === null
            ? { ok: false }
            : { ok: true, images: imgs, overrides: ovr };
        triggerRef.current?.click();
      })
      .catch(() => {
        clearTimeout(timerId);
        if (controller.signal.aborted) return;
        pendingRef.current = { ok: false };
        triggerRef.current?.click();
      });
  };

  useEffect(() => {
    doFetch();
    const id = setInterval(doFetch, 30_000);
    return () => {
      clearInterval(id);
      abortRef.current?.abort();
    };
  }, [env]);

  // ── UI state（DOM イベント経由なので通常の useState で OK）──────────
  const [ui, setUI] = useState<UIState>({
    tagInputs: {},
    busyKeys: {},
    fetchingLatest: {},
    restartingKeys: {},
    resolvingMR: {},
    mrResolved: {},
    bannerDismissed:
      localStorage.getItem("kube-lens-deploy-banner-dismissed") === "1",
    localImages: {},
    localOverrides: null,
  });

  // ── 派生値 ─────────────────────────────────────────────────────────
  const hasGitLab = hasGitLabTokens();
  const connectionError = fs.error !== null && !fs.loading;
  const currentImages: ImageMap = { ...fs.images, ...ui.localImages };
  const overrides: OverrideMap = ui.localOverrides ?? fs.overrides;
  const overrideCount = Object.keys(overrides).length;

  // ── ハンドラ ───────────────────────────────────────────────────────
  const handleRefresh = () => {
    setFs({ loading: true, error: null, images: {}, overrides: {} });
    doFetch();
  };

  const handleDeploy = async (serviceKey: string) => {
    const svc = DEPLOY_SERVICES.find((s) => s.key === serviceKey);
    if (!svc) return;
    const tag = ui.tagInputs[serviceKey]?.trim();
    if (!tag) {
      onToast("タグを入力してください", "error");
      return;
    }

    setUI((prev) => ({
      ...prev,
      busyKeys: { ...prev.busyKeys, [serviceKey]: true },
    }));
    try {
      const newImage = buildEcrImage(svc.ecrPath, tag);
      // 既存overrideのoriginal_tagを保持、なければ現在のタグを保存
      const existingOverride = overrides[svc.name];
      let originalTag: string;
      if (
        existingOverride?.original_tag &&
        existingOverride.original_tag !== "unknown"
      ) {
        originalTag = existingOverride.original_tag;
      } else {
        const current = extractTag(currentImages[svc.key] ?? "");
        if (current !== "unknown") {
          originalTag = current;
        } else {
          originalTag = env === "dev" ? "latest" : "unknown";
        }
      }

      const mrInfo = ui.mrResolved[serviceKey];
      const mrUrl = mrInfo?.mrUrl ?? "";
      const ticket = mrInfo?.ticket ?? "";

      await setDeploymentImage(project, env, svc.namespace, svc.name, newImage);
      await saveOverride({
        project,
        env,
        serviceName: svc.name,
        namespace: svc.namespace,
        ecrRepo: svc.ecrPath,
        originalTag,
        overrideTag: tag,
        mrUrl,
        ticket,
      });

      const now = new Date().toISOString();
      const newEntry: OverrideEntry = {
        ticket,
        namespace: svc.namespace,
        ecr_repo: svc.ecrPath,
        original_tag: originalTag,
        override_tag: tag,
        deployed_by: "kube-lens",
        run_by: "kube-lens",
        deployed_at: now,
        ttl_hours: 0,
        mr_url: mrUrl,
      };

      setUI((prev) => ({
        ...prev,
        localImages: { ...prev.localImages, [svc.key]: newImage },
        localOverrides: {
          ...(prev.localOverrides ?? fs.overrides),
          [svc.name]: newEntry,
        },
        tagInputs: { ...prev.tagInputs, [serviceKey]: "" },
        busyKeys: { ...prev.busyKeys, [serviceKey]: false },
      }));
      onToast(`${svc.label} を ${tag} でデプロイしました`, "success");
    } catch (e) {
      setUI((prev) => ({
        ...prev,
        busyKeys: { ...prev.busyKeys, [serviceKey]: false },
      }));
      onToast(
        e instanceof Error ? e.message : `${svc.label}: デプロイ失敗`,
        "error",
      );
    }
  };

  const handleFetchLatest = async (serviceKey: string) => {
    const svc = DEPLOY_SERVICES.find((s) => s.key === serviceKey);
    if (!svc) return;

    setUI((prev) => ({
      ...prev,
      fetchingLatest: { ...prev.fetchingLatest, [serviceKey]: true },
    }));
    try {
      let tag: string | null = null;
      if (env === "dev") {
        const sha = await getLatestCommitShortHash(svc.appRepo, "main");
        tag = sha ? `dev-${sha}` : null;
      } else {
        const gitTag = await getLatestTag(svc.appRepo);
        if (gitTag) {
          tag = `prd-${gitTag}`;
        } else {
          // v タグがないリポジトリは release ブランチの SHA で dev- タグにフォールバック
          const sha = await getLatestCommitShortHash(svc.appRepo, "release");
          tag = sha ? `dev-${sha}` : null;
        }
      }
      if (!tag) {
        setUI((prev) => ({
          ...prev,
          fetchingLatest: { ...prev.fetchingLatest, [serviceKey]: false },
        }));
        onToast(`${svc.label}: タグ取得失敗（GitLabトークンを確認）`, "error");
        return;
      }
      setUI((prev) => ({
        ...prev,
        tagInputs: { ...prev.tagInputs, [serviceKey]: tag },
        fetchingLatest: { ...prev.fetchingLatest, [serviceKey]: false },
      }));
      onToast(`${svc.label}: 最新タグ ${tag} を取得しました`, "success");
    } catch (e) {
      setUI((prev) => ({
        ...prev,
        fetchingLatest: { ...prev.fetchingLatest, [serviceKey]: false },
      }));
      onToast(
        e instanceof Error ? e.message : `${svc.label}: 取得失敗`,
        "error",
      );
    }
  };

  /** MR URL を解決してタグ入力欄にセットする */
  const handleResolveMR = async (serviceKey: string, url: string) => {
    const svc = DEPLOY_SERVICES.find((s) => s.key === serviceKey);
    if (!svc) return;

    const parsed = parseMRUrl(url);
    if (!parsed) {
      onToast("MR URL のパースに失敗しました", "error");
      return;
    }

    setUI((prev) => ({
      ...prev,
      resolvingMR: { ...prev.resolvingMR, [serviceKey]: true },
    }));

    try {
      const mr = await getMRDetail(parsed.projectPath, parsed.mrIid);
      const sha = await getLatestCommitShortHash(svc.appRepo, mr.sourceBranch);
      if (!sha) {
        onToast(
          `${svc.label}: ブランチ ${mr.sourceBranch} のコミット取得失敗`,
          "error",
        );
        setUI((prev) => ({
          ...prev,
          resolvingMR: { ...prev.resolvingMR, [serviceKey]: false },
        }));
        return;
      }

      const tag = `dev-${sha}`;
      const ticket = extractTicketFromTitle(mr.title);

      setUI((prev) => ({
        ...prev,
        tagInputs: { ...prev.tagInputs, [serviceKey]: tag },
        resolvingMR: { ...prev.resolvingMR, [serviceKey]: false },
        mrResolved: {
          ...prev.mrResolved,
          [serviceKey]: {
            title: mr.title,
            branch: mr.sourceBranch,
            mrUrl: mr.webUrl,
            ticket,
          },
        },
      }));
      onToast(`${svc.label}: MR "${mr.title}" → ${tag}`, "success");
    } catch (e) {
      setUI((prev) => ({
        ...prev,
        resolvingMR: { ...prev.resolvingMR, [serviceKey]: false },
      }));
      onToast(
        e instanceof Error ? e.message : `${svc.label}: MR解決失敗`,
        "error",
      );
    }
  };

  /** サービスの復元先イメージを解決（ConfigMap の original_tag → GitLab fallback） */
  const resolveResetImage = async (
    svc: (typeof DEPLOY_SERVICES)[number],
    entry: OverrideEntry,
  ): Promise<string> => {
    if (entry.original_tag && entry.original_tag !== "unknown") {
      return buildEcrImage(svc.ecrPath, entry.original_tag);
    }
    if (env === "dev") {
      return buildEcrImage(svc.ecrPath, "latest");
    }
    // TES: original_tagが無効な場合、GitLab→releaseブランチSHAの順でフォールバック
    const gitTag = await getLatestTag(svc.appRepo);
    if (gitTag) return buildEcrImage(svc.ecrPath, `prd-${gitTag}`);
    const sha = await getLatestCommitShortHash(svc.appRepo, "release");
    if (sha) return buildEcrImage(svc.ecrPath, `dev-${sha}`);
    return buildEcrImage(svc.ecrPath, entry.original_tag);
  };

  const handleRestartPods = async (serviceKey: string) => {
    const svc = DEPLOY_SERVICES.find((s) => s.key === serviceKey);
    if (!svc) return;

    setUI((prev) => ({
      ...prev,
      restartingKeys: { ...prev.restartingKeys, [serviceKey]: true },
    }));
    try {
      await restartDeployment(project, env, svc.namespace, svc.name);
      onToast(`${svc.label} のPodを再起動しました`, "success");
      doFetch();
    } catch (e) {
      onToast(
        e instanceof Error ? e.message : `${svc.label}: 再起動失敗`,
        "error",
      );
    } finally {
      setUI((prev) => ({
        ...prev,
        restartingKeys: { ...prev.restartingKeys, [serviceKey]: false },
      }));
    }
  };

  const handleReset = async (serviceKey: string) => {
    const svc = DEPLOY_SERVICES.find((s) => s.key === serviceKey);
    if (!svc) return;
    const override = overrides[svc.name];
    if (!override) return;

    setUI((prev) => ({
      ...prev,
      busyKeys: { ...prev.busyKeys, [serviceKey]: true },
    }));
    try {
      const resetImage = await resolveResetImage(svc, override);
      await setDeploymentImage(
        project,
        env,
        svc.namespace,
        svc.name,
        resetImage,
      );
      await removeOverride(project, env, svc.name);

      setUI((prev) => {
        const nextOverrides = { ...(prev.localOverrides ?? fs.overrides) };
        delete nextOverrides[svc.name];
        return {
          ...prev,
          localImages: {
            ...prev.localImages,
            [svc.key]: resetImage,
          },
          localOverrides: nextOverrides,
          busyKeys: { ...prev.busyKeys, [serviceKey]: false },
        };
      });
      onToast(`${svc.label} をリセットしました`, "success");
    } catch (e) {
      setUI((prev) => ({
        ...prev,
        busyKeys: { ...prev.busyKeys, [serviceKey]: false },
      }));
      onToast(
        e instanceof Error ? e.message : `${svc.label}: リセット失敗`,
        "error",
      );
    }
  };

  const handleResetAll = async () => {
    const entries = Object.entries(overrides);
    if (entries.length === 0) return;

    setUI((prev) => {
      const busyKeys = { ...prev.busyKeys };
      for (const [name] of entries) {
        const svc = DEPLOY_SERVICES.find((s) => s.name === name);
        if (svc) busyKeys[svc.key] = true;
      }
      return { ...prev, busyKeys };
    });

    const results: {
      svc: (typeof DEPLOY_SERVICES)[number];
      resetImage: string;
      ok: boolean;
    }[] = [];
    for (const [name, entry] of entries) {
      const svc = DEPLOY_SERVICES.find((s) => s.name === name);
      if (!svc) continue;
      try {
        const resetImage = await resolveResetImage(svc, entry);
        await setDeploymentImage(
          project,
          env,
          svc.namespace,
          svc.name,
          resetImage,
        );
        await removeOverride(project, env, svc.name);
        results.push({ svc, resetImage, ok: true });
      } catch {
        results.push({ svc, resetImage: "", ok: false });
      }
    }

    setUI((prev) => {
      const nextOverrides = { ...(prev.localOverrides ?? fs.overrides) };
      const nextImages = { ...prev.localImages };
      const nextBusy = { ...prev.busyKeys };
      for (const { svc, resetImage, ok } of results) {
        nextBusy[svc.key] = false;
        if (ok) {
          nextImages[svc.key] = resetImage;
          delete nextOverrides[svc.name];
        }
      }
      return {
        ...prev,
        localImages: nextImages,
        localOverrides: nextOverrides,
        busyKeys: nextBusy,
      };
    });

    const succeeded = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;
    if (failed === 0) {
      onToast(`${succeeded} 件のオーバーライドをリセットしました`, "success");
    } else {
      onToast(`${succeeded} 件リセット成功、${failed} 件失敗`, "error");
    }
  };

  return {
    fs,
    ui,
    setUI,
    hasGitLab,
    connectionError,
    currentImages,
    overrides,
    overrideCount,
    triggerRef,
    applyPending,
    handleRefresh,
    handleDeploy,
    handleFetchLatest,
    handleResolveMR,
    handleRestartPods,
    handleReset,
    handleResetAll,
  };
}
