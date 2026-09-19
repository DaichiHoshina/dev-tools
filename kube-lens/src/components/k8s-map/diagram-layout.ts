import type { Category } from "~/data/k8s-components";

/** 親→子の所有/依存チェーン */
export interface FlowChain {
  ids: string[];
}

export interface DiagramLayer {
  id: string;
  label: string;
  categoryId: Category;
  /** 序列チェーン（親→子の矢印付き） */
  chains?: FlowChain[];
  /** チェーンに属さない独立コンポーネント */
  standaloneIds?: string[];
  /** フラットグリッド（chains未定義時のフォールバック） */
  componentIds: string[][];
  color: string;
  icon: string;
}

export interface SideGroup {
  id: string;
  label: string;
  categoryId: Category;
  /** 序列チェーン（親→子の矢印付き） */
  chains?: FlowChain[];
  /** チェーンに属さない独立コンポーネント */
  standaloneIds?: string[];
  /** フラットリスト（chains未定義時のフォールバック） */
  componentIds: string[];
  color: string;
  icon: string;
}

/** 中央カラム: メインフロー（上から下へ） */
export const MAIN_LAYERS: DiagramLayer[] = [
  {
    id: "control-plane",
    label: "Control Plane",
    categoryId: "control-plane",
    chains: [{ ids: ["api-server", "etcd"] }],
    standaloneIds: ["scheduler", "controller-manager"],
    componentIds: [
      ["api-server", "etcd"],
      ["scheduler", "controller-manager"],
    ],
    color: "#8b5cf6",
    icon: "fa-brain",
  },
  {
    id: "node",
    label: "Node",
    categoryId: "node",
    chains: [{ ids: ["kubelet", "containerd"] }],
    standaloneIds: ["kube-proxy"],
    componentIds: [["kubelet", "containerd", "kube-proxy"]],
    color: "#3b82f6",
    icon: "fa-server",
  },
  {
    id: "api-objects",
    label: "API Objects",
    categoryId: "api-objects",
    chains: [
      { ids: ["deployment", "replicaset", "pod"] },
      { ids: ["ingress", "service"] },
    ],
    standaloneIds: ["configmap", "secret", "namespace"],
    componentIds: [
      ["pod", "deployment", "replicaset", "service"],
      ["ingress", "configmap", "secret", "namespace"],
    ],
    color: "#10b981",
    icon: "fa-cubes",
  },
  {
    id: "advanced",
    label: "Advanced",
    categoryId: "advanced",
    componentIds: [["hpa", "pdb", "taint-toleration"]],
    color: "#f59e0b",
    icon: "fa-sliders",
  },
];

/** 左カラム: Network */
export const LEFT_SIDE: SideGroup = {
  id: "network",
  label: "Network",
  categoryId: "network",
  chains: [{ ids: ["istio", "envoy"] }],
  standaloneIds: ["calico"],
  componentIds: ["calico", "istio", "envoy"],
  color: "#ec4899",
  icon: "fa-network-wired",
};

/** 右カラム: Observability + Platform Tools */
export const RIGHT_SIDES: SideGroup[] = [
  {
    id: "observability",
    label: "Observability",
    categoryId: "observability",
    chains: [{ ids: ["prometheus", "grafana"] }],
    standaloneIds: ["opentelemetry"],
    componentIds: ["prometheus", "grafana", "opentelemetry"],
    color: "#06b6d4",
    icon: "fa-chart-line",
  },
  {
    id: "platform-tools",
    label: "Platform Tools",
    categoryId: "platform-tools",
    componentIds: [
      "argocd",
      "external-secrets",
      "cert-manager",
      "gitlab-runner",
    ],
    color: "#f97316",
    icon: "fa-toolbox",
  },
];

/** エントリーポイント: ユーザー/CI */
export const ENTRY_POINT = {
  label: "User / CI Pipeline",
  icon: "fa-user",
  color: "var(--text-subtle)",
};

// ============================================================
// コンポーネント別アイコンURL（CDN経由）
// - K8sリソース: kubernetes/community 公式アイコン
// - CNCFツール: simple-icons CDN
// - URLなし: Font Awesome にフォールバック
// ============================================================
const K8S_RES =
  "https://cdn.jsdelivr.net/gh/kubernetes/community@master/icons/svg/resources/unlabeled";

export const COMPONENT_ICON_URLS: Record<string, string> = {
  // K8s Resources (公式アイコン)
  pod: `${K8S_RES}/pod.svg`,
  deployment: `${K8S_RES}/deploy.svg`,
  replicaset: `${K8S_RES}/rs.svg`,
  service: `${K8S_RES}/svc.svg`,
  ingress: `${K8S_RES}/ing.svg`,
  configmap: `${K8S_RES}/cm.svg`,
  secret: `${K8S_RES}/secret.svg`,
  namespace: `${K8S_RES}/ns.svg`,
  hpa: `${K8S_RES}/hpa.svg`,
  pdb: `${K8S_RES}/pdb.svg`,

  // CNCF / Infrastructure (simple-icons CDN)
  etcd: "https://cdn.simpleicons.org/etcd/419EDA",
  containerd: "https://cdn.simpleicons.org/containerd/575757",
  prometheus: "https://cdn.simpleicons.org/prometheus/E6522C",
  grafana: "https://cdn.simpleicons.org/grafana/F46800",
  istio: "https://cdn.simpleicons.org/istio/466BB0",
  envoy: "https://cdn.simpleicons.org/envoyproxy/AC6199",
  opentelemetry: "https://cdn.simpleicons.org/opentelemetry/F5A800",
  argocd: "https://cdn.simpleicons.org/argo/EF7B4D",
  "gitlab-runner": "https://cdn.simpleicons.org/gitlab/FC6D26",
};
