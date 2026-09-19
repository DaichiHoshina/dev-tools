import {
  GitLabAPI,
  type GitLabCommit,
  type ServiceConfig,
} from "../api/gitlab";
import {
  BranchComparisonStorage,
  type BranchComparisonCache,
} from "../storage";
import { CONFIG } from "../config";

export interface MergeRequestInfo {
  title: string;
  iid: number;
  url: string;
}

export interface ServiceBranchStatus {
  serviceName: string;
  aheadCount: number;
  error?: string;
  mrs?: MergeRequestInfo[];
}

export interface BranchComparisonResult {
  totalAhead: number;
  services: ServiceBranchStatus[];
}

/**
 * 差分コミットからMR情報を抽出
 * GitLabマージコミットの "See merge request group/project!123" パターンを検出
 */
function extractMrsFromCommits(
  commits: GitLabCommit[],
  baseUrl: string,
  projectPath: string,
): MergeRequestInfo[] {
  const mrs: MergeRequestInfo[] = [];
  const seen = new Set<number>();

  for (const commit of commits) {
    const match = commit.message.match(/See merge request .*!(\d+)/);
    if (match) {
      const iid = parseInt(match[1], 10);
      if (!seen.has(iid)) {
        seen.add(iid);
        // マージコミットのtitleから "Merge branch 'xxx' into 'yyy'" を除去してMRタイトルを推定
        const title = commit.title.startsWith("Merge branch ")
          ? commit.message
              .split("\n")
              .find(
                (l) =>
                  l.trim() &&
                  !l.startsWith("Merge branch ") &&
                  !l.startsWith("See merge request"),
              )
              ?.trim() || commit.title
          : commit.title;
        mrs.push({
          title,
          iid,
          url: `${baseUrl}/${projectPath}/-/merge_requests/${iid}`,
        });
      }
    }
  }

  return mrs;
}

export class BranchComparisonService {
  private api: GitLabAPI;
  private pollInterval: number;
  private intervalId: number | null = null;
  private serviceConfig: ServiceConfig | null = null;

  constructor(api: GitLabAPI) {
    this.api = api;
    this.pollInterval = CONFIG.UI.MR_POLL_INTERVAL;
  }

  /**
   * サービス設定をセット
   */
  setServiceConfig(config: ServiceConfig): void {
    this.serviceConfig = config;
  }

  /**
   * ポーリング開始
   */
  startPolling(callback: (result: BranchComparisonResult) => void): void {
    // 初回チェック
    this.checkAllBranches(callback);

    // 定期チェック
    this.intervalId = window.setInterval(() => {
      this.checkAllBranches(callback);
    }, this.pollInterval);
  }

  /**
   * ポーリング停止
   */
  stopPolling(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * 全サービスのブランチ差分チェック
   */
  private async checkAllBranches(
    callback: (result: BranchComparisonResult) => void,
  ): Promise<void> {
    console.log("[BranchComparison] checkAllBranches開始");

    if (!this.serviceConfig) {
      console.log("[BranchComparison] serviceConfigなし、キャッシュを使用");
      // サービス設定がなければキャッシュから取得
      const cache = BranchComparisonStorage.get();
      if (cache) {
        callback({
          totalAhead: cache.aheadCount,
          services: cache.services || [],
        });
      }
      return;
    }

    const services = Object.entries(this.serviceConfig.services);
    console.log(`[BranchComparison] ${services.length}サービスをチェック`);
    const results: ServiceBranchStatus[] = [];

    // 並列でチェック（main/master両方を試す）
    await Promise.all(
      services.map(async ([serviceName, config]) => {
        const projectPath = `${config.app_repo}`;

        // main と master の両方を試す
        for (const mainBranch of ["main", "master"]) {
          try {
            console.log(
              `[BranchComparison] ${serviceName}: ${projectPath} release..${mainBranch}`,
            );
            const comparison = await this.api.compareBranches(
              projectPath,
              "release",
              mainBranch,
            );

            const aheadCount = comparison.commits.length;
            console.log(
              `[BranchComparison] ${serviceName}: ${aheadCount}コミット先行`,
            );

            // 差分コミットからMR情報を抽出
            const mrs =
              aheadCount > 0
                ? extractMrsFromCommits(
                    comparison.commits,
                    CONFIG.GITLAB.BASE_URL,
                    projectPath,
                  )
                : [];

            if (mrs.length > 0) {
              console.log(
                `[BranchComparison] ${serviceName}: ${mrs.length}件のMR検出`,
              );
            }

            results.push({ serviceName, aheadCount, mrs });
            return; // 成功したらループを抜ける
          } catch (error) {
            console.log(
              `[BranchComparison] ${serviceName}: ${mainBranch}失敗`,
              error,
            );
            // このブランチ名では失敗、次を試す
          }
        }

        // 両方失敗した場合
        console.debug(
          `${serviceName}: ブランチ比較スキップ（release/main/master不在）`,
        );
        results.push({
          serviceName,
          aheadCount: 0,
          error: "branch not found",
          mrs: [],
        });
      }),
    );

    // mainがreleaseより進んでいるサービスをカウント
    const aheadServices = results.filter((r) => r.aheadCount > 0);
    const totalAhead = aheadServices.length;

    console.log(
      `[BranchComparison] 結果: ${totalAhead}サービスが先行`,
      aheadServices,
    );

    // キャッシュに保存（全サービスの結果を保存）
    const cache: BranchComparisonCache = {
      aheadCount: totalAhead,
      lastChecked: new Date().toISOString(),
      services: results,
    };
    BranchComparisonStorage.save(cache);

    // 全サービスの結果をコールバックに渡す（差分なしサービスも含む）
    callback({ totalAhead, services: results });
  }
}
