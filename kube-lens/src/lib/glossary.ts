/** K8s用語 → 初心者向け説明 */
export const K8S_GLOSSARY: Record<string, string> = {
  Pod: "アプリが動いている最小単位。1つのPodに1つ以上のコンテナが入っています",
  Deployment:
    "Podを管理する仕組み。「このアプリを3つ動かす」のような設定を担当します",
  Namespace:
    "リソースをグループ分けする仕組み。チームやサービスごとに分けて管理します",
  Replica: "Podのコピー数。Ready/Desiredが一致していれば正常です",
  Node: "Podが実行されるサーバー（物理/仮想マシン）",
  CrashLoopBackOff:
    "コンテナが起動→クラッシュを繰り返している状態。ログを確認してください",
  RollingUpdate: "古いPodを1つずつ新しいPodに置き換える更新方式",
  Recreate: "全Podを一度停止してから新しいPodを作る更新方式",
  Event: "クラスタ内のリソースに起きた出来事の記録",
  Restart: "コンテナが異常終了して再起動された回数。多いほど不安定です",
  Container: "アプリの実行環境。Dockerイメージから作られます",
  Running: "正常に動作中の状態",
  Pending: "起動待ちの状態。リソース不足やイメージ取得中の可能性があります",
  Failed: "異常終了した状態。ログを確認してください",
  Ready: "トラフィックを受け付けられる状態",
  Warning: "問題の兆候を示すイベント。放置すると障害につながる可能性があります",
  Normal: "正常な動作を記録したイベント",
  Strategy: "Deploymentの更新方式（RollingUpdate / Recreate）",
  Label: "リソースに付けるタグ。検索やグループ化に使います",
  Unhealthy:
    "ヘルスチェック（Readiness/Liveness Probe）に失敗した状態。起動直後は一時的に発生します",
  Pulled: "コンテナイメージをレジストリからダウンロードしたイベント",
  Scheduled: "PodがNodeに割り当てられたイベント",
  BackOff:
    "コンテナの再起動を待機している状態。連続失敗時に待ち時間が徐々に延びます",
  FailedScheduling:
    "Podを配置できるNodeが見つからない状態。リソース不足の可能性があります",
  Killing: "コンテナの停止処理。デプロイ更新やスケールダウン時に発生します",
  ScalingReplicaSet:
    "Deploymentがレプリカ数を調整している状態。通常のスケーリング操作です",
  ArgoCD:
    "Kubernetes 向けの継続的デリバリーツール。GitリポジトリをK8sクラスタに自動同期します",
  Synced: "ArgoCDのアプリがGitリポジトリと一致している状態",
  OutOfSync: "ArgoCDのアプリがGitリポジトリと差異がある状態。Syncが必要です",
  Healthy: "アプリが正常に動作している状態",
  Degraded: "アプリが期待通りに動作していない状態。調査が必要です",
  Progressing: "アプリのデプロイや更新が進行中の状態",
  Allocatable:
    "ノードがPodに割り当てられるリソースの上限。OS予約分を除いた実質的な容量です",
  Requests:
    "Podが「最低限これだけ欲しい」と宣言したリソース量。スケジューリングの判断基準になります",
  NodePool:
    "Karpenterが管理するノードのグループ。用途別（app/batch/system等）に分けて運用します",
  CPUPercent:
    "Requests合計 ÷ Allocatable合計。80%超は新しいPodが載らなくなるリスクがあります",
  MemoryPercent:
    "メモリのRequests合計 ÷ Allocatable合計。メモリ不足はOOMKillの原因になります",
  ConfigMap:
    "設定ファイルや環境変数をKey-Value形式で管理するリソース。コードを変えずに設定だけ切り替えられます",
  Secret:
    "パスワードやAPIキーなどの機密情報をBase64エンコードで保持するリソース。ConfigMapの機密版です",
  Ingress:
    "クラスタ外部からのHTTP/HTTPSトラフィックをサービスにルーティングするリソース。ドメイン名やパスで振り分けます",
  TLS: "通信の暗号化（HTTPS）設定。Ingress に TLS が設定されていればHTTPS対応済みです",
  PVC: "PersistentVolumeClaim。Podがストレージを要求する宣言です。容量・アクセスモードを指定します",
  StorageClass:
    "ストレージの種類を定義するリソース。EBSやEFSなどプロビジョナーと回収ポリシーを設定します",
  ResourceQuota:
    "Namespaceごとのリソース使用量上限。CPU・メモリ・Pod数などを制限してリソースの使い過ぎを防ぎます",
  LimitRange:
    "個々のPod/コンテナのリソース上限・下限を設定するリソース。ResourceQuotaが全体の枠、LimitRangeが個別の枠です",
  Bound: "PVCがストレージボリュームに正常に紐付いている状態",
  AccessMode:
    "ストレージへのアクセス方法。ReadWriteOnce(単一Node)、ReadOnlyMany(複数Node読取)、ReadWriteMany(複数Node読書)があります",
  ReclaimPolicy:
    "PVC削除時のボリュームの扱い。Delete=自動削除、Retain=手動で残す",
};
