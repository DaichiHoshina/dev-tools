// K8sコンポーネント カテゴリ定義
export type Category =
  | "control-plane"
  | "node"
  | "api-objects"
  | "advanced"
  | "network"
  | "observability"
  | "platform-tools";

export interface KubectlCommand {
  description: string;
  command: string;
}

export interface TroubleshootingItem {
  problem: string;
  solution: string;
}

export interface K8sComponent {
  id: string;
  name: string;
  category: Category;
  icon: string;
  color: string;
  description: string;
  points: string[];
  relatedComponents: string[];
  kubeLensLink?: string;
  kubectlCommands: KubectlCommand[];
  troubleshooting: TroubleshootingItem[];
}

export interface CategoryInfo {
  id: Category;
  label: string;
  description: string;
  icon: string;
  color: string;
}

export const CATEGORIES: CategoryInfo[] = [
  {
    id: "control-plane",
    label: "Control Plane",
    description: "クラスターを管理する司令塔",
    icon: "fa-brain",
    color: "#8b5cf6",
  },
  {
    id: "node",
    label: "Node",
    description: "実際にコンテナが動く実行部隊",
    icon: "fa-server",
    color: "#3b82f6",
  },
  {
    id: "api-objects",
    label: "API Objects",
    description: "アプリ開発者が最も関わるリソース",
    icon: "fa-cubes",
    color: "#10b981",
  },
  {
    id: "advanced",
    label: "Advanced Resources",
    description: "スケーリングや運用制御のリソース",
    icon: "fa-sliders",
    color: "#f59e0b",
  },
  {
    id: "network",
    label: "Network & Service Mesh",
    description: "Pod間通信とサービスメッシュ",
    icon: "fa-network-wired",
    color: "#ec4899",
  },
  {
    id: "observability",
    label: "Observability",
    description: "メトリクス・ログ・トレースの観測系",
    icon: "fa-chart-line",
    color: "#06b6d4",
  },
  {
    id: "platform-tools",
    label: "Platform Tools",
    description: "自環境固有のプラットフォームツール",
    icon: "fa-toolbox",
    color: "#f97316",
  },
];

export const K8S_COMPONENTS: K8sComponent[] = [
  // ===== Control Plane =====
  {
    id: "api-server",
    name: "kube-apiserver",
    category: "control-plane",
    icon: "fa-door-open",
    color: "#8b5cf6",
    description:
      "Kubernetesクラスターへの唯一の入口。REST APIを提供し、kubectlやCIツールからのすべてのリクエストを受け付ける。認証・認可・バリデーションを担当する中核コンポーネント。",
    points: [
      "クラスターへのすべての通信はkube-apiserverを経由する",
      "認証・認可・アドミッションコントロールを処理",
      "etcdへの読み書きを仲介する唯一のコンポーネント",
      "水平スケールが可能（複数レプリカで冗長化）",
      "REST APIとwatchメカニズムでリソース変更をストリーミング通知",
    ],
    relatedComponents: ["etcd", "scheduler", "controller-manager"],
    kubectlCommands: [
      {
        description: "クラスター情報の表示",
        command: "kubectl cluster-info",
      },
      {
        description: "APIリソース一覧の表示",
        command: "kubectl api-resources",
      },
      {
        description: "ヘルスチェック",
        command: "kubectl get --raw /healthz",
      },
    ],
    troubleshooting: [
      {
        problem: "kubectlで接続エラーが発生する",
        solution:
          "証明書の有効期限・kubeconfig内のエンドポイントポート（6443）を確認する",
      },
      {
        problem: "APIレスポンスが遅い",
        solution:
          "etcdのディスクI/O負荷を確認し、etcdのパフォーマンスを改善する",
      },
    ],
  },
  {
    id: "etcd",
    name: "etcd",
    category: "control-plane",
    icon: "fa-database",
    color: "#8b5cf6",
    description:
      "クラスターの全状態を保存する分散KVストア。Pod・Service・Secretなどあらゆるリソースの定義はここに永続化される。etcdが壊れるとクラスター全体が機能停止するため、バックアップが必須。",
    points: [
      "クラスターの「真実の源（Source of Truth）」として機能",
      "Raftアルゴリズムによる分散合意で強整合性を保証",
      "kube-apiserverのみがetcdに直接アクセスする",
      "定期的なスナップショットバックアップが必須",
      "高スループットなSSDストレージを推奨",
    ],
    relatedComponents: ["api-server"],
    kubectlCommands: [
      {
        description: "etcdエンドポイントの表示",
        command: "kubectl get endpoints -n kube-system etcd",
      },
      {
        description: "etcdヘルスチェック",
        command:
          "kubectl exec etcd-<node> -n kube-system -- etcdctl endpoint health",
      },
    ],
    troubleshooting: [
      {
        problem: "etcdのリーダー選出が失敗する",
        solution: "ディスクI/O遅延を確認し、ストレージのスループットを改善する",
      },
      {
        problem: "etcd DBが肥大化している",
        solution: "etcdctl defragを実行してcompactionを行いDBサイズを削減する",
      },
    ],
  },
  {
    id: "scheduler",
    name: "kube-scheduler",
    category: "control-plane",
    icon: "fa-diagram-project",
    color: "#8b5cf6",
    description:
      "新規Podをどのノードに配置するか決定するコンポーネント。CPU・メモリの空き容量、Affinity/Anti-Affinity、Taint/Tolerationなどを考慮して最適なノードを選択する。",
    points: [
      "FilteringフェーズとScoringフェーズの2段階でノードを選定",
      "ResourceRequests・Limitsを考慮してリソース不足ノードを除外",
      "NodeAffinity・PodAffinityで配置ルールを細かく指定可能",
      "TaintのついたNodeへはToleration必須",
      "カスタムスケジューラーへの差し替えも可能",
    ],
    relatedComponents: ["api-server", "kubelet"],
    kubectlCommands: [
      {
        description: "スケジューリング失敗イベントの確認",
        command: "kubectl get events --field-selector reason=FailedScheduling",
      },
      {
        description: "PodのスケジューリングイベントをDescribeで確認",
        command: "kubectl describe pod <pod-name> | grep -A5 Events",
      },
    ],
    troubleshooting: [
      {
        problem: "PodがPendingのままスケジュールされない",
        solution:
          "リソース不足・Taint設定・Affinityルールをdescribe podのEventsで確認する",
      },
      {
        problem: "Podが特定のNodeに偏ってスケジュールされる",
        solution:
          "topologySpreadConstraintsやPodAntiAffinityを設定して分散配置を強制する",
      },
    ],
  },
  {
    id: "controller-manager",
    name: "kube-controller-manager",
    category: "control-plane",
    icon: "fa-rotate",
    color: "#8b5cf6",
    description:
      "クラスターを理想状態に維持する各種コントローラーの集合体。ReplicaSet・Node・Endpoint・Namespace・ServiceAccountなど多数のコントローラーが単一プロセスとして動作する。",
    points: [
      "ReplicaSetControllerがPod数を常に理想数に保つ",
      "NodeControllerがノードの死活監視を担当",
      "EndpointControllerがServiceとPodの紐付けを更新",
      "各コントローラーはwatchループでリソース変更を検知",
      "制御ループの原則：observe→diff→act",
    ],
    relatedComponents: ["api-server", "etcd"],
    kubectlCommands: [
      {
        description: "コンポーネントの状態確認",
        command: "kubectl get componentstatuses",
      },
      {
        description: "controller-managerのログ確認",
        command:
          "kubectl logs -n kube-system kube-controller-manager-<node-name>",
      },
    ],
    troubleshooting: [
      {
        problem: "ReplicaSetのPod数が理想値と一致しない",
        solution:
          "controller-managerのログを確認し、エラーや権限問題がないかチェックする",
      },
      {
        problem: "NodeがいつまでもNotReadyのまま",
        solution:
          "nodeControllerのeviction-timeoutやnode-monitor-grace-period設定を確認する",
      },
    ],
  },

  // ===== Node =====
  {
    id: "kubelet",
    name: "kubelet",
    category: "node",
    icon: "fa-microchip",
    color: "#3b82f6",
    description:
      "各ノードで動作するエージェント。kube-apiserverからPod定義を受け取り、containerdへコンテナ起動を指示する。ヘルスチェックを実行しノードとPodのステータスをapiserverに報告する。",
    points: [
      "各ノードに1つだけ存在するDaemonプロセス",
      "PodSpecを受け取りcontainerdへコンテナ起動を指示",
      "LivenessProbe・ReadinessProbeを実行してコンテナ健全性を監視",
      "ノードのCPU・メモリ使用量をapiserverに定期報告",
      "Evictionポリシーでリソース不足時にPodを強制退去",
    ],
    relatedComponents: ["api-server", "containerd", "kube-proxy"],
    kubeLensLink: "#/cluster",
    kubectlCommands: [
      {
        description: "ノード一覧とIPアドレスの表示",
        command: "kubectl get nodes -o wide",
      },
      {
        description: "ノード詳細とリソース状況の表示",
        command: "kubectl describe node <node-name>",
      },
      {
        description: "ノードのCPU・メモリ使用量表示",
        command: "kubectl top node",
      },
    ],
    troubleshooting: [
      {
        problem: "ノードがNotReadyになる",
        solution:
          "ノード上でjournalctl -u kubeletを実行しkubeletのエラーログを確認する",
      },
      {
        problem: "Podが起動できずEvictedになる",
        solution:
          "kubeletのeviction設定（disk/memoryのthreshold）を確認し、リソースを解放する",
      },
    ],
  },
  {
    id: "containerd",
    name: "containerd",
    category: "node",
    icon: "fa-box",
    color: "#3b82f6",
    description:
      "CRI（Container Runtime Interface）に準拠したコンテナランタイム。Dockerの内部実装から独立した軽量ランタイムで、K8s 1.24以降のデフォルト。kubeletの指示を受けてコンテナを実際に起動・停止する。",
    points: [
      "Docker非推奨化後のK8s標準コンテナランタイム",
      "OCI準拠のコンテナイメージを実行",
      "crictlコマンドでcontainerd上のコンテナを直接操作可能",
      "イメージのpull・キャッシュ管理も担当",
      "CNIプラグインと連携してネットワークを設定",
    ],
    relatedComponents: ["kubelet"],
    kubectlCommands: [
      {
        description: "各ノードのコンテナランタイムバージョン確認",
        command:
          "kubectl get nodes -o jsonpath='{.items[*].status.nodeInfo.containerRuntimeVersion}'",
      },
      {
        description: "crictl でコンテナ一覧を表示（ノード上で実行）",
        command: "crictl ps",
      },
    ],
    troubleshooting: [
      {
        problem: "ImagePullBackOffが発生する",
        solution:
          "レジストリのURL・認証情報（ImagePullSecret）・ネットワーク疎通を確認する",
      },
      {
        problem: "コンテナが起動直後に停止する",
        solution:
          "crictl logs <container-id>でコンテナのstderrログを確認し起動エラーを特定する",
      },
    ],
  },
  {
    id: "kube-proxy",
    name: "kube-proxy",
    category: "node",
    icon: "fa-shuffle",
    color: "#3b82f6",
    description:
      "各ノードで動作するネットワークプロキシ。ServiceのClusterIPへのトラフィックを実際のPodへルーティングするiptables/IPVSルールを管理する。ServiceのロードバランシングをOS層で実現する。",
    points: [
      "各ノードにDaemonSetとして1つ配置",
      "kube-apiserverのService/Endpoints変更を監視して即時ルール更新",
      "iptablesモード（デフォルト）とIPVSモードを選択可能",
      "IPVSモードは大規模クラスターで高パフォーマンス",
      "ClusterIP・NodePort・LoadBalancerタイプのServiceを処理",
    ],
    relatedComponents: ["api-server", "service"],
    kubeLensLink: "#/network",
    kubectlCommands: [
      {
        description: "kube-proxy Podの状態確認",
        command: "kubectl get pods -n kube-system -l k8s-app=kube-proxy",
      },
      {
        description: "kube-proxyのログ確認",
        command: "kubectl logs -n kube-system <kube-proxy-pod-name>",
      },
    ],
    troubleshooting: [
      {
        problem: "Service経由でPodに接続できない",
        solution:
          "kube-proxy Podが正常稼働しているか確認し、iptablesルールが正しく設定されているか検証する",
      },
      {
        problem:
          "大規模クラスターでiptablesルールが過多になりパフォーマンスが低下する",
        solution:
          "kube-proxyのmodeをIPVSに切り替えてO(1)のルックアップを実現する",
      },
    ],
  },

  // ===== API Objects =====
  {
    id: "pod",
    name: "Pod",
    category: "api-objects",
    icon: "fa-circle-dot",
    color: "#10b981",
    description:
      "Kubernetesの最小デプロイ単位。1つ以上のコンテナをまとめたグループで、同一ネットワーク空間とストレージを共有する。通常は直接作成せずDeploymentなど上位リソース経由で管理する。",
    points: [
      "1つ以上のコンテナをまとめた最小のスケジューリング単位",
      "Pod内コンテナはlocalhostで相互通信可能",
      "Podに固有のIPアドレスが1つ割り当てられる",
      "Podは一時的な存在で再起動すると新しいIPになる",
      "InitContainerでメインコンテナ起動前の初期化処理が可能",
    ],
    relatedComponents: ["deployment", "replicaset", "service", "kubelet"],
    kubeLensLink: "#/pods",
    kubectlCommands: [
      {
        description: "Pod一覧の表示",
        command: "kubectl get pods",
      },
      {
        description: "Pod詳細の表示",
        command: "kubectl describe pod <pod-name>",
      },
      {
        description: "Podのログ表示",
        command: "kubectl logs <pod-name>",
      },
    ],
    troubleshooting: [
      {
        problem: "CrashLoopBackOffが発生する",
        solution:
          "kubectl logs --previous <pod-name>で前回クラッシュ時のログを確認し起動エラーを特定する",
      },
      {
        problem: "OOMKilledでコンテナが強制終了する",
        solution:
          "アプリケーションのメモリ使用量を計測しresources.limits.memoryを適切な値に引き上げる",
      },
    ],
  },
  {
    id: "deployment",
    name: "Deployment",
    category: "api-objects",
    icon: "fa-rocket",
    color: "#10b981",
    description:
      "Podのライフサイクルを管理する上位リソース。ReplicaSetを自動作成してPod数を維持し、ローリングアップデートやロールバックを宣言的に実行する。ステートレスアプリの標準的なデプロイ方法。",
    points: [
      "ReplicaSetを管理しPodの台数を常に理想値に保つ",
      "ローリングアップデートでゼロダウンタイムデプロイを実現",
      "旧バージョンのReplicaSetを保持してロールバックが可能",
      "maxUnavailableとmaxSurgeでアップデート戦略を細かく制御",
      "HPAと連携してPod数を自動スケール",
    ],
    relatedComponents: ["replicaset", "pod", "hpa"],
    kubeLensLink: "#/deployments",
    kubectlCommands: [
      {
        description: "Deployment一覧の表示",
        command: "kubectl get deployments",
      },
      {
        description: "ロールアウト状況の確認",
        command: "kubectl rollout status deployment/<name>",
      },
      {
        description: "前のバージョンへのロールバック",
        command: "kubectl rollout undo deployment/<name>",
      },
    ],
    troubleshooting: [
      {
        problem: "ローリングアップデートが途中で停止する",
        solution:
          "maxUnavailable・maxSurgeの設定を確認し、新Podの起動失敗原因をdescribeで調査する",
      },
      {
        problem: "指定したイメージでPodが起動しない",
        solution:
          "kubectl describe deploymentでイメージ名・タグが正しいか確認しImagePullを調査する",
      },
    ],
  },
  {
    id: "replicaset",
    name: "ReplicaSet",
    category: "api-objects",
    icon: "fa-clone",
    color: "#10b981",
    description:
      "指定したレプリカ数のPodを常に維持するリソース。Deploymentが自動的に作成・管理するため通常は直接操作しない。ロールアウト履歴として旧バージョンのReplicaSetも保持される。",
    points: [
      "labelSelectorで管理対象のPodを識別",
      "Podが削除または異常終了すると自動的に補充",
      "Deploymentによって自動管理されるため直接操作は非推奨",
      "revisionHistoryLimitで保持する旧ReplicaSetの数を制御",
      "ロールバック時は旧ReplicaSetのreplicas数を変更して切り替え",
    ],
    relatedComponents: ["deployment", "pod"],
    kubectlCommands: [
      {
        description: "ReplicaSet一覧の表示",
        command: "kubectl get replicaset",
      },
      {
        description: "ReplicaSet詳細の表示",
        command: "kubectl describe rs <name>",
      },
    ],
    troubleshooting: [
      {
        problem: "古いReplicaSetが大量に残存している",
        solution:
          "DeploymentのrevisionHistoryLimitを小さい値（3程度）に設定してリビジョン履歴を削減する",
      },
      {
        problem: "レプリカ数の収束が遅い",
        solution:
          "controller-managerのログを確認しコントローラーが正常稼働しているか確認する",
      },
    ],
  },
  {
    id: "service",
    name: "Service",
    category: "api-objects",
    icon: "fa-plug",
    color: "#10b981",
    description:
      "Podへの安定したアクセス入口を提供するリソース。PodのIPは変化するが、Serviceの安定したIPやDNS名でアクセスできる。ClusterIP・NodePort・LoadBalancer・Headlessの4タイプがある。",
    points: [
      "labelSelectorで対象Podを選定しEndpointsを自動更新",
      "ClusterIPタイプはクラスター内部からのみアクセス可能",
      "NodePortタイプはノードの特定ポートで外部公開",
      "LoadBalancerタイプはクラウドのロードバランサーを自動プロビジョニング",
      "HeadlessタイプはDNSで直接Pod IPを返す（StatefulSet向け）",
    ],
    relatedComponents: ["pod", "kube-proxy", "ingress"],
    kubeLensLink: "#/network",
    kubectlCommands: [
      {
        description: "Service一覧の表示",
        command: "kubectl get svc",
      },
      {
        description: "Service詳細の表示",
        command: "kubectl describe svc <name>",
      },
      {
        description: "Endpointsの確認",
        command: "kubectl get endpoints <name>",
      },
    ],
    troubleshooting: [
      {
        problem: "EndpointsがEmptyでServiceからPodに転送されない",
        solution:
          "ServiceのselectorとPodのlabelsが一致しているか確認し、Podが正常稼働しているか確認する",
      },
      {
        problem: "LoadBalancerタイプで外部IPが割り当てられない",
        solution:
          "クラウドプロバイダーのLBコントローラーが動作しているか確認し、サービスのannotationsを確認する",
      },
    ],
  },
  {
    id: "ingress",
    name: "Ingress",
    category: "api-objects",
    icon: "fa-arrow-right-to-bracket",
    color: "#10b981",
    description:
      "HTTPSレベルでの外部アクセスを制御するリソース。ホスト名・パスベースのルーティング、TLS終端を実現する。IngressControllerが必要で、環境によってNGINX・Traefik・ALBなどを利用する。",
    points: [
      "ホスト名とパスに基づいてバックエンドServiceへルーティング",
      "TLS終端を担当してHTTPS通信を処理",
      "1つのLBで複数サービスへのルーティングが可能",
      "現在はGateway APIへの移行が推奨される",
      "IngressClassで複数のIngressControllerを使い分け可能",
    ],
    relatedComponents: ["service", "pod"],
    kubeLensLink: "#/network",
    kubectlCommands: [
      {
        description: "Ingress一覧の表示",
        command: "kubectl get ingress",
      },
      {
        description: "Ingress詳細の表示",
        command: "kubectl describe ingress <name>",
      },
    ],
    troubleshooting: [
      {
        problem: "Ingressへのリクエストが404になる",
        solution:
          "バックエンドのService名・ポートが正しいか確認し、Podが正常稼働しているか確認する",
      },
      {
        problem: "TLS接続でERR_CERT_AUTHORITYエラーが発生する",
        solution:
          "tls.secretNameで指定したSecretにtls.crtとtls.keyが正しく格納されているか確認する",
      },
    ],
  },
  {
    id: "configmap",
    name: "ConfigMap",
    category: "api-objects",
    icon: "fa-file-lines",
    color: "#10b981",
    description:
      "設定値を保存するリソース。環境変数・設定ファイルとしてPodにマウントできる。コードと設定を分離することで、同じイメージを異なる環境（dev/stg/prd）で利用できる。",
    points: [
      "Key-Value形式またはファイル形式で設定値を保存",
      "環境変数（env/envFrom）としてPodにインジェクション可能",
      "Volumeとしてマウントしてファイルとして参照可能",
      "1MBまでのデータを格納可能",
      "更新後はVolumeマウントの場合は自動反映、envの場合はPod再起動が必要",
    ],
    relatedComponents: ["pod", "deployment"],
    kubeLensLink: "#/configmaps",
    kubectlCommands: [
      {
        description: "ConfigMap一覧の表示",
        command: "kubectl get configmap",
      },
      {
        description: "ConfigMap詳細の表示",
        command: "kubectl describe configmap <name>",
      },
      {
        description: "ConfigMapのYAML出力",
        command: "kubectl get configmap <name> -o yaml",
      },
    ],
    troubleshooting: [
      {
        problem: "ConfigMapを更新してもアプリケーションに反映されない",
        solution:
          "envから参照している場合はPodの再起動が必要。Volumeマウントの場合はkubeletの同期周期（デフォルト1分）を待つ",
      },
      {
        problem: "コンテナ起動時にファイルが見つからない",
        solution:
          "volumeMountsのmountPathとConfigMapのキー名が正しいか確認する",
      },
    ],
  },
  {
    id: "secret",
    name: "Secret",
    category: "api-objects",
    icon: "fa-key",
    color: "#10b981",
    description:
      "パスワード・APIキー・TLS証明書などの機密情報を保存するリソース。値はBase64エンコードされるが暗号化ではない。本番環境ではExternalSecretsやVaultと組み合わせて安全に管理する。",
    points: [
      "機密情報をPodの定義から分離して管理",
      "Base64エンコードされるが暗号化ではないため別途保護が必要",
      "Opaque・TLS・DockerConfigJsonなどのタイプがある",
      "ServiceAccount TokenはSecretとして自動生成される",
      "KMS連携でetcd上のデータを暗号化可能（Encryption at Rest）",
    ],
    relatedComponents: ["pod", "deployment", "external-secrets"],
    kubectlCommands: [
      {
        description: "Secret一覧の表示",
        command: "kubectl get secrets",
      },
      {
        description: "Secret詳細の表示",
        command: "kubectl describe secret <name>",
      },
      {
        description: "Secretのdata部分を取得",
        command: "kubectl get secret <name> -o jsonpath='{.data}'",
      },
    ],
    troubleshooting: [
      {
        problem: "Secretを参照するPodが起動しない",
        solution:
          "Secretが同じNamespaceに存在するか確認し、envFrom/secretKeyRefの参照名が正しいか確認する",
      },
      {
        problem: "設定した値と異なる値が使われている",
        solution:
          "Base64デコードして実際の値を確認する（echo '<value>' | base64 -d）",
      },
    ],
  },
  {
    id: "namespace",
    name: "Namespace",
    category: "api-objects",
    icon: "fa-folder-open",
    color: "#10b981",
    description:
      "クラスター内を論理的に分割するリソース。dev/stg/prdなど環境別や、チーム別にリソースを隔離できる。ResourceQuotaと組み合わせてリソース使用量を制限することも可能。",
    points: [
      "Pod・Service・Deployment等のほとんどのリソースがNamespaceスコープ",
      "Node・PersistentVolumeはNamespaceに属さないクラスタースコープリソース",
      "ResourceQuotaでNamespace単位のリソース上限を設定可能",
      "NetworkPolicyでNamespace間の通信を制御可能",
      "kube-system・kube-publicはシステム用の予約Namespace",
    ],
    relatedComponents: ["pod", "service", "configmap", "secret"],
    kubectlCommands: [
      {
        description: "Namespace一覧の表示",
        command: "kubectl get namespaces",
      },
      {
        description: "特定Namespace内の全リソース表示",
        command: "kubectl get all -n <namespace>",
      },
    ],
    troubleshooting: [
      {
        problem: "他のNamespaceのリソースが見えない・操作できない",
        solution:
          "-n <namespace>フラグを指定するか--all-namespaces(-A)フラグで全Namespaceを対象にする",
      },
      {
        problem: "NamespaceがTerminatingから進まない",
        solution:
          "kubectl get namespace <name> -o jsonpath='{.spec.finalizers}'でfinalizersを確認し手動削除する",
      },
    ],
  },

  // ===== Advanced Resources =====
  {
    id: "hpa",
    name: "HorizontalPodAutoscaler",
    category: "advanced",
    icon: "fa-arrows-left-right",
    color: "#f59e0b",
    description:
      "CPU・メモリ使用率やカスタムメトリクスに基づいてPod数を自動増減するリソース。トラフィック増加時に自動スケールアウトし、低負荷時にスケールインしてコストを最適化する。",
    points: [
      "metrics-serverまたはPrometheusのメトリクスを基にスケール判断",
      "minReplicas・maxReplicasでスケール範囲を制限",
      "stabilizationWindowでスケールイン時の過剰反応を抑制",
      "CPUとメモリ以外にカスタムメトリクス・外部メトリクスも利用可能",
      "Deploymentと組み合わせて使用するのが基本",
    ],
    relatedComponents: ["deployment", "pod"],
    kubectlCommands: [
      {
        description: "HPA一覧の表示",
        command: "kubectl get hpa",
      },
      {
        description: "HPA詳細とスケール状況の確認",
        command: "kubectl describe hpa <name>",
      },
      {
        description: "Pod毎のリソース使用量確認",
        command: "kubectl top pods",
      },
    ],
    troubleshooting: [
      {
        problem: "HPAがスケールしない・Unknownになる",
        solution:
          "metrics-serverが正常稼働しているか確認し、Pod側にresources.requestsが設定されているか確認する",
      },
      {
        problem: "頻繁にスケールイン・アウトを繰り返す（Flapping）",
        solution:
          "behavior.scaleDown.stabilizationWindowSecondsを長めに設定してスケールインの安定化を図る",
      },
    ],
  },
  {
    id: "pdb",
    name: "PodDisruptionBudget",
    category: "advanced",
    icon: "fa-shield-halved",
    color: "#f59e0b",
    description:
      "ノードのメンテナンスやアップグレード時にPodが同時に削除される数を制限するリソース。minAvailableまたはmaxUnavailableで常に稼働させるべきPod数を指定し可用性を担保する。",
    points: [
      "Voluntary Disruption（意図的な停止）の最大数を制御",
      "minAvailableで常に稼働するPodの最小数を指定",
      "maxUnavailableで同時に停止できるPodの最大数を指定",
      "kubectl drainやEviction APIはPDBを尊重して安全に実行",
      "本番環境では必ず設定してメンテナンス時の可用性を確保",
    ],
    relatedComponents: ["deployment", "pod"],
    kubectlCommands: [
      {
        description: "PDB一覧の表示",
        command: "kubectl get pdb",
      },
      {
        description: "PDB詳細の表示",
        command: "kubectl describe pdb <name>",
      },
    ],
    troubleshooting: [
      {
        problem: "kubectl drainが失敗してノードをドレインできない",
        solution:
          "PDBのminAvailable制約でEvictionが拒否されている。PodのreplicasとPDB設定の整合性を確認する",
      },
      {
        problem: "PDBが厳しすぎてアップグレードが進まない",
        solution:
          "minAvailable/maxUnavailableの値を見直し、ローリングアップデート中も制約を満たせる値に調整する",
      },
    ],
  },
  {
    id: "taint-toleration",
    name: "Taint / Toleration",
    category: "advanced",
    icon: "fa-ban",
    color: "#f59e0b",
    description:
      "特定のノードへのPod配置を制御する仕組み。ノードにTaintを付与するとTolerationのないPodは配置されない。GPUノードや特定用途ノードへの配置制御、NotReadyノードからのPod退去に利用される。",
    points: [
      "Taintはノードに付与するラベルで配置を拒否する",
      "Tolerationはその拒否を許容するPod側の設定",
      "NoSchedule・PreferNoSchedule・NoExecuteの3エフェクトがある",
      "NoExecuteは既存Podも退去させる最も強いエフェクト",
      "NodeAffinityと組み合わせてより細かい配置制御が可能",
    ],
    relatedComponents: ["scheduler", "pod", "kubelet"],
    kubectlCommands: [
      {
        description: "ノードのTaint情報を確認",
        command: "kubectl describe node <node-name> | grep Taints",
      },
      {
        description: "ノードにTaintを付与",
        command: "kubectl taint nodes <node-name> key=value:NoSchedule",
      },
    ],
    troubleshooting: [
      {
        problem: "Podが特定のノードに配置されずPendingになる",
        solution:
          "describe nodeでノードのTaintを確認し、PodにTolerationが正しく設定されているか確認する",
      },
      {
        problem: "全ノードにTaintがありどのPodも配置されない",
        solution:
          "各PodのToleration設定を確認し、DaemonSetには必要なTolerationが付与されているか確認する",
      },
    ],
  },

  // ===== Network & Service Mesh =====
  {
    id: "calico",
    name: "Calico",
    category: "network",
    icon: "fa-spider",
    color: "#ec4899",
    description:
      "CNI（Container Network Interface）プラグイン。Pod間通信のネットワークを構築し、IPアドレスの割り当てを管理する。NetworkPolicyリソースを実装してPod間通信を制御する機能も提供する。",
    points: [
      "各PodにIPアドレスを割り当てるIPAM機能を提供",
      "BGPによるルーティングでオーバーレイネットワーク不要の高性能構成が可能",
      "KubernetesのNetworkPolicyを実装してL3/L4の通信制御",
      "IPIPまたはVXLANモードでオーバーレイネットワークも構築可能",
      "eBPFデータプレーンでkube-proxyを置き換えることも可能",
    ],
    relatedComponents: ["kube-proxy", "pod", "istio"],
    kubectlCommands: [
      {
        description: "Calicoのコンポーネント確認",
        command: "kubectl get pods -n calico-system",
      },
      {
        description: "全NamespaceのNetworkPolicy確認",
        command: "kubectl get networkpolicy --all-namespaces",
      },
    ],
    troubleshooting: [
      {
        problem: "Pod間の通信が突然できなくなった",
        solution:
          "NetworkPolicyの設定を確認し、意図しないDeny設定がないかを調査する",
      },
      {
        problem: "PodへのIPアドレス割り当てが失敗する",
        solution:
          "CalicoのIPPoolのCIDR範囲が枯渇していないか確認しIPPoolを追加または拡張する",
      },
    ],
  },
  {
    id: "istio",
    name: "Istio",
    category: "network",
    icon: "fa-bezier-curve",
    color: "#ec4899",
    description:
      "サービスメッシュのコントロールプレーン。Envoyサイドカーをデータプレーンとして各Podに注入し、トラフィック管理・mTLS・カナリアリリース・分散トレースを実現する。",
    points: [
      "istiodがコントロールプレーンとしてEnvoyサイドカーの設定を配布",
      "mTLSによりPod間通信を自動的に暗号化・認証",
      "VirtualServiceとDestinationRuleでトラフィックを細かく制御",
      "カナリアリリース・A/Bテストのトラフィック分割が可能",
      "分散トレース（Jaeger/Zipkin連携）でリクエストフローを可視化",
    ],
    relatedComponents: ["envoy", "pod", "service"],
    kubectlCommands: [
      {
        description: "Istioコンポーネントの確認",
        command: "kubectl get pods -n istio-system",
      },
      {
        description: "Istio設定の問題分析",
        command: "istioctl analyze",
      },
      {
        description: "Envoyプロキシの同期状態確認",
        command: "istioctl proxy-status",
      },
    ],
    troubleshooting: [
      {
        problem: "Podへのサイドカー自動インジェクションが行われない",
        solution:
          "Namespaceにistio-injection=enabledラベルが付与されているか、またはPodにsidecar.istio.io/injectアノテーションがあるか確認する",
      },
      {
        problem: "mTLS通信でPeerAuthenticationエラーが発生する",
        solution:
          "PeerAuthenticationリソースのMTLSモード（STRICT/PERMISSIVE）を確認し、クライアント側のDestinationRule設定と一致させる",
      },
    ],
  },
  {
    id: "envoy",
    name: "Envoy Sidecar",
    category: "network",
    icon: "fa-arrows-spin",
    color: "#ec4899",
    description:
      "IstioのデータプレーンとしてPodの横に配置されるプロキシコンテナ。すべてのインバウンド・アウトバウンドトラフィックを仲介し、mTLS・リトライ・サーキットブレーカー・分散トレースを透過的に実現する。",
    points: [
      "Podに自動インジェクトされるサイドカーコンテナとして動作",
      "L4/L7レベルでトラフィックをインターセプト",
      "mTLSによる相互認証・暗号化を自動処理",
      "リトライ・タイムアウト・サーキットブレーカーをアプリに代わって実装",
      "Zipkin/Jaeger向けのトレーシングヘッダーを自動付与",
    ],
    relatedComponents: ["istio", "pod", "service"],
    kubectlCommands: [
      {
        description: "Envoyのクラスター設定確認",
        command: "istioctl proxy-config cluster <pod-name>",
      },
      {
        description: "Envoyのルーティング設定確認",
        command: "istioctl proxy-config route <pod-name>",
      },
      {
        description: "Envoyサイドカーのログ確認",
        command: "kubectl logs <pod-name> -c istio-proxy",
      },
    ],
    troubleshooting: [
      {
        problem: "Envoyが503エラーを返す",
        solution:
          "istioctl proxy-config clusterでupstreamの設定を確認し、バックエンドServiceのEndpointsが存在するか確認する",
      },
      {
        problem: "サイドカー経由のレイテンシが増加する",
        solution:
          "Envoyコンテナのリソース上限を確認し、VirtualServiceのタイムアウト設定を見直す",
      },
    ],
  },

  // ===== Observability =====
  {
    id: "prometheus",
    name: "Prometheus",
    category: "observability",
    icon: "fa-fire",
    color: "#06b6d4",
    description:
      "Pull型のメトリクス収集システム。PodのHTTPエンドポイントからメトリクスをスクレイプし時系列DBに蓄積する。PromQLで柔軟な集計・アラートルール設定が可能。K8s監視の標準ツール。",
    points: [
      "ServiceMonitor・PodMonitorリソースでスクレイプ対象を宣言的に管理",
      "PromQLで時系列データの集計・演算が可能",
      "AlertManagerと連携してSlack・PagerDuty等に通知",
      "HPAのカスタムメトリクスソースとしても利用可能",
      "Federation・Remote Writeで大規模・長期保存に対応",
    ],
    relatedComponents: ["grafana", "hpa", "pod"],
    kubectlCommands: [
      {
        description: "Prometheus Podの確認",
        command: "kubectl get pods -n monitoring -l app=prometheus",
      },
      {
        description: "Prometheusへのポートフォワード",
        command: "kubectl port-forward -n monitoring svc/prometheus 9090:9090",
      },
    ],
    troubleshooting: [
      {
        problem: "特定Podのメトリクスが取得できない",
        solution:
          "ServiceMonitorのselectorとService/Podのlabels一致を確認し、/metricsエンドポイントにアクセスできるか確認する",
      },
      {
        problem: "Prometheusのストレージが不足してデータが欠損する",
        solution:
          "retentionTimeとretentionSizeを設定し、PersistentVolumeの容量を増やす",
      },
    ],
  },
  {
    id: "grafana",
    name: "Grafana",
    category: "observability",
    icon: "fa-chart-bar",
    color: "#06b6d4",
    description:
      "メトリクスの可視化ダッシュボードツール。Prometheusをデータソースとして接続し、CPU・メモリ・レイテンシ等をリアルタイムでグラフ表示する。アラートのSlack通知設定も可能。",
    points: [
      "Prometheus・Elasticsearch等複数のデータソースに対応",
      "ダッシュボードはJSONで管理しGitOpsで運用可能",
      "アラートルールを設定してSlack・PagerDuty等に通知",
      "Kubernetes向けの充実したコミュニティダッシュボードが利用可能",
      "LGTM Stack（Loki+Grafana+Tempo+Mimir）で統合観測基盤を構築",
    ],
    relatedComponents: ["prometheus"],
    kubectlCommands: [
      {
        description: "Grafana Podの確認",
        command:
          "kubectl get pods -n monitoring -l app.kubernetes.io/name=grafana",
      },
      {
        description: "Grafanaへのポートフォワード",
        command: "kubectl port-forward -n monitoring svc/grafana 3000:3000",
      },
    ],
    troubleshooting: [
      {
        problem: "ダッシュボードのグラフが空白になる",
        solution:
          "データソース設定でPrometheusへの接続を確認し、Test & Saveで疎通を検証する",
      },
      {
        problem: "グラフにデータが表示されない時間帯がある",
        solution:
          "PromQLクエリが正しいか確認し、Prometheusの時間範囲とGrafanaのTime Rangeが一致しているか確認する",
      },
    ],
  },
  {
    id: "opentelemetry",
    name: "OpenTelemetry",
    category: "observability",
    icon: "fa-satellite-dish",
    color: "#06b6d4",
    description:
      "分散トレース・メトリクス・ログを収集するオブザーバビリティフレームワーク。アプリケーションの処理フローをリクエスト単位で追跡し、複数マイクロサービスにまたがる遅延箇所を特定できる。",
    points: [
      "トレース・メトリクス・ログの3シグナルを統合的に収集",
      "OTel Collectorが収集・変換・転送のパイプラインを処理",
      "Jaeger・Zipkin・Datadog等の複数バックエンドに送信可能",
      "自動計装（Auto-instrumentation）でコード変更不要でトレース収集",
      "W3C TraceContextでマイクロサービス間のトレースIDを伝播",
    ],
    relatedComponents: ["istio", "envoy", "prometheus"],
    kubectlCommands: [
      {
        description: "OpenTelemetry Collectorの確認",
        command:
          "kubectl get pods -n observability -l app=opentelemetry-collector",
      },
    ],
    troubleshooting: [
      {
        problem: "Jaegerにトレースが表示されない",
        solution:
          "OTel CollectorのInstrumentationリソースを確認し、対象Namespaceにアノテーションが正しく設定されているか確認する",
      },
      {
        problem: "大量のトレースでCollectorがOOMになる",
        solution:
          "Collectorのサンプリングレート（tailsamplingprocessor）を調整してトレースデータ量を削減する",
      },
    ],
  },

  // ===== Platform Tools =====
  {
    id: "argocd",
    name: "Argo CD",
    category: "platform-tools",
    icon: "fa-code-branch",
    color: "#f97316",
    description:
      "GitOps CDツール。GitリポジトリのマニフェストとK8sクラスターの状態を常に同期させる。変更はGit経由で行いArgo CDが自動適用するため、デプロイの履歴・ロールバックが容易になる。",
    points: [
      "GitリポジトリをSingle Source of Truthとして扱うGitOps原則",
      "自動同期（Auto-Sync）でGitの変更を即時クラスターに反映",
      "Kustomize・Helm・Jsonnetのテンプレートに対応",
      "ApplicationSetでマルチクラスター・マルチ環境デプロイを管理",
      "WebUIでデプロイ状況・リソースツリーを視覚的に確認可能",
    ],
    relatedComponents: ["deployment", "pod"],
    kubeLensLink: "#/argocd",
    kubectlCommands: [
      {
        description: "Argo CDアプリケーション一覧の表示",
        command: "kubectl get applications -n argocd",
      },
      {
        description: "アプリケーション一覧の表示（argocd CLI）",
        command: "argocd app list",
      },
      {
        description: "アプリケーションの手動同期",
        command: "argocd app sync <app-name>",
      },
    ],
    troubleshooting: [
      {
        problem: "Syncが失敗してApplicationがDegradedになる",
        solution:
          "argocd app diffで差分を確認し、マニフェストのバリデーションエラーやRBACの権限不足を調査する",
      },
      {
        problem: "GitのマニフェストとクラスターがOutOfSyncのまま",
        solution:
          "auto-sync設定を確認し、PruneやSelfHealオプションが有効になっているか確認する",
      },
    ],
  },
  {
    id: "external-secrets",
    name: "External Secrets Operator",
    category: "platform-tools",
    icon: "fa-lock",
    color: "#f97316",
    description:
      "AWS Secrets Manager・GCP Secret Manager等の外部シークレットストアからK8s Secretを自動生成するオペレーター。シークレットをGitに含めずに安全に管理し、自動ローテーションにも対応する。",
    points: [
      "ExternalSecretリソースで外部ストアとK8s Secretのマッピングを定義",
      "SecretStoreリソースで外部シークレットストアへの接続設定を管理",
      "refreshIntervalで定期的に最新値を取得してSecretを更新",
      "AWS SM・GCP SM・HashiCorp Vault・Azure KVに対応",
      "シークレットをGitに含める必要がなくなりセキュリティを向上",
    ],
    relatedComponents: ["secret", "pod"],
    kubectlCommands: [
      {
        description: "全NamespaceのExternalSecret確認",
        command: "kubectl get externalsecrets --all-namespaces",
      },
      {
        description: "ExternalSecret詳細の確認",
        command: "kubectl describe externalsecret <name>",
      },
    ],
    troubleshooting: [
      {
        problem: "ExternalSecretのSyncが失敗する",
        solution:
          "kubectl describe externalsecretでStatusのConditionsを確認し、外部ストアへの接続エラーを特定する",
      },
      {
        problem: "IAM権限エラーでSecretが取得できない",
        solution:
          "ServiceAccountに紐づくIAMロールのポリシーを確認し、IRSA（IAM Roles for Service Accounts）の設定を検証する",
      },
    ],
  },
  {
    id: "cert-manager",
    name: "cert-manager",
    category: "platform-tools",
    icon: "fa-certificate",
    color: "#f97316",
    description:
      "TLS証明書の自動発行・更新を管理するオペレーター。Let's Encrypt等のACME準拠CAと連携し、IngressのTLS証明書を自動プロビジョニングする。CertificateとIssuerリソースで宣言的に管理できる。",
    points: [
      "CertificateリソースでTLS証明書の発行を宣言的に管理",
      "ClusterIssuer/IssuerリソースでCAとの接続設定を管理",
      "証明書の期限切れ前に自動更新を実行",
      "Let's Encrypt（ACME）・Vault・自己署名CAに対応",
      "Ingressアノテーション経由で証明書を自動発行する機能あり",
    ],
    relatedComponents: ["ingress", "secret"],
    kubectlCommands: [
      {
        description: "全NamespaceのCertificate確認",
        command: "kubectl get certificates --all-namespaces",
      },
      {
        description: "Issuer一覧の確認",
        command: "kubectl get issuers",
      },
      {
        description: "Certificate詳細の確認",
        command: "kubectl describe certificate <name>",
      },
    ],
    troubleshooting: [
      {
        problem: "Certificateが発行されずNotReadyのまま",
        solution:
          "CertificateRequestとOrderリソースのステータスを確認し、ACMEのDNS/HTTPチャレンジが成功しているか確認する",
      },
      {
        problem: "証明書の自動更新が行われず期限切れになる",
        solution:
          "cert-manager Podのログを確認し、renewBeforeの設定（デフォルト30日前）とIssuerの設定が正しいか確認する",
      },
    ],
  },
  {
    id: "gitlab-runner",
    name: "GitLab Runner",
    category: "platform-tools",
    icon: "fa-play",
    color: "#f97316",
    description:
      "GitLab CI/CDのパイプラインジョブをK8s上で実行するエージェント。ジョブごとにPodを起動してCI処理を実行し、完了後にPodを削除するKubernetes Executorを使用する。",
    points: [
      "Kubernetes ExecutorでジョブをPodとして動的に起動・削除",
      "ジョブの並列度はconcurrentで制御",
      "ジョブ用のPodにはhelpersサイドカーが自動アタッチ",
      "Dockerイメージのビルドにはkaniko等のセキュアな方式を推奨",
      "RunnerのtagsでJobとRunnerのマッチングを制御",
    ],
    relatedComponents: ["pod", "deployment"],
    kubectlCommands: [
      {
        description: "GitLab Runner Podの確認",
        command: "kubectl get pods -n gitlab-runner",
      },
      {
        description: "Runner Podのログ確認",
        command: "kubectl logs -n gitlab-runner <runner-pod-name>",
      },
    ],
    troubleshooting: [
      {
        problem: "CIジョブがPendingのまま開始されない",
        solution:
          "Runner PodがRunningか確認し、ジョブ用Podを起動するためのリソース（CPU/メモリ）が不足していないか確認する",
      },
      {
        problem: "CIジョブが失敗してエラーが不明瞭",
        solution:
          "Runner PodのログとジョブPodのログを確認し、認証情報・NetworkPolicy・リソース制限を調査する",
      },
    ],
  },
];
