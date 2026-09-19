import type { K8sList } from "~/lib/types";

// --- K8s リソース量パース ---

export function parseCpu(val: string): number {
  if (val.endsWith("m")) {
    return parseInt(val.slice(0, -1), 10) / 1000;
  }
  if (val.endsWith("n")) {
    return parseInt(val.slice(0, -1), 10) / 1_000_000_000;
  }
  return parseFloat(val) || 0;
}

export function parseMemory(val: string): number {
  const units: Record<string, number> = {
    Ki: 1024,
    Mi: 1024 ** 2,
    Gi: 1024 ** 3,
    Ti: 1024 ** 4,
    K: 1000,
    M: 1000 ** 2,
    G: 1000 ** 3,
    T: 1000 ** 4,
  };
  for (const [suffix, multiplier] of Object.entries(units)) {
    if (val.endsWith(suffix)) {
      return parseFloat(val.slice(0, -suffix.length)) * multiplier;
    }
  }
  return parseFloat(val) || 0;
}

export function formatMemoryGiB(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
}

export function formatCpu(cores: number): string {
  if (cores < 0.01) return `${Math.round(cores * 1000)}m`;
  return cores.toFixed(2);
}

// --- K8s API 生型 ---

interface RawNode {
  metadata: { name: string; labels?: Record<string, string> };
  status: { allocatable?: { cpu?: string; memory?: string } };
}

interface RawPod {
  metadata: { name: string; namespace: string };
  spec: {
    nodeName?: string;
    containers: Array<{
      name?: string;
      resources?: { requests?: { cpu?: string; memory?: string } };
    }>;
  };
  status?: { phase?: string };
}

const NODEPOOL_LABEL = "karpenter.sh/nodepool";

// --- フェッチ ---

async function fetchNodes(
  baseUrl: string,
  signal?: AbortSignal,
): Promise<RawNode[]> {
  const res = await fetch(`${baseUrl}/api/v1/nodes`, { signal });
  if (!res.ok) throw new Error(`Nodes API error: ${res.status}`);
  const list = (await res.json()) as K8sList<RawNode>;
  return list.items;
}

async function fetchAllPods(
  baseUrl: string,
  signal?: AbortSignal,
): Promise<RawPod[]> {
  const res = await fetch(`${baseUrl}/api/v1/pods`, { signal });
  if (!res.ok) throw new Error(`Pods API error: ${res.status}`);
  const list = (await res.json()) as K8sList<RawPod>;
  return list.items.filter(
    (p) => p.status?.phase === "Running" || p.status?.phase === "Pending",
  );
}

// --- 公開型 ---

export interface NodeGroupSummary {
  group: string;
  nodeCount: number;
  allocCpu: number;
  requestedCpu: number;
  remainingCpu: number;
  cpuPercent: number;
  allocMemory: number;
  requestedMemory: number;
  remainingMemory: number;
  memoryPercent: number;
  /** metrics-server が利用可能な場合のみ設定 */
  actualCpu?: number;
  actualMemory?: number;
  actualCpuPercent?: number;
  actualMemoryPercent?: number;
}

export interface NodeDetail {
  name: string;
  group: string;
  allocCpu: number;
  requestedCpu: number;
  cpuPercent: number;
  allocMemory: number;
  requestedMemory: number;
  memoryPercent: number;
  podCount: number;
  /** metrics-server が利用可能な場合のみ設定 */
  actualCpu?: number;
  actualMemory?: number;
  actualCpuPercent?: number;
  actualMemoryPercent?: number;
}

export interface TopPod {
  name: string;
  namespace: string;
  nodeName: string;
  group: string;
  cpuRequest: number;
  memoryRequest: number;
  /** metrics-server が利用可能な場合のみ設定 */
  actualCpu?: number;
  actualMemory?: number;
}

export interface NoRequestPod {
  name: string;
  namespace: string;
  nodeName: string;
  /** CPU requests が未設定のコンテナ名一覧 */
  missingCpu: string[];
  /** Memory requests が未設定のコンテナ名一覧 */
  missingMemory: string[];
}

export interface ClusterResourcesResult {
  groups: NodeGroupSummary[];
  nodesByGroup: Record<string, NodeDetail[]>;
  topPods: TopPod[];
  noRequestPods: NoRequestPod[];
}

// --- メトリクス API ---

interface RawNodeMetrics {
  metadata: { name: string };
  usage: { cpu?: string; memory?: string };
}

/** Node実使用量をmetrics-serverから取得。未インストール時はnullを返す */
export async function fetchNodeMetrics(
  baseUrl: string,
  signal?: AbortSignal,
): Promise<Map<string, { cpu: number; memory: number }> | null> {
  try {
    const res = await fetch(`${baseUrl}/apis/metrics.k8s.io/v1beta1/nodes`, {
      signal,
    });
    if (!res.ok) return null; // 404 = metrics-server 未インストール
    const list = (await res.json()) as K8sList<RawNodeMetrics>;
    const map = new Map<string, { cpu: number; memory: number }>();
    for (const item of list.items) {
      map.set(item.metadata.name, {
        cpu: parseCpu(item.usage.cpu ?? "0"),
        memory: parseMemory(item.usage.memory ?? "0"),
      });
    }
    return map;
  } catch {
    return null;
  }
}

// --- Pod メトリクス API ---

interface RawPodMetrics {
  metadata: { name: string; namespace: string };
  containers: Array<{ name: string; usage: { cpu?: string; memory?: string } }>;
}

/** Pod実使用量をmetrics-serverから取得。未インストール時はnullを返す */
async function fetchPodMetrics(
  baseUrl: string,
  signal?: AbortSignal,
): Promise<Map<string, { cpu: number; memory: number }> | null> {
  try {
    const res = await fetch(`${baseUrl}/apis/metrics.k8s.io/v1beta1/pods`, {
      signal,
    });
    if (!res.ok) return null;
    const list = (await res.json()) as K8sList<RawPodMetrics>;
    const map = new Map<string, { cpu: number; memory: number }>();
    for (const item of list.items) {
      let cpu = 0;
      let mem = 0;
      for (const c of item.containers) {
        cpu += parseCpu(c.usage.cpu ?? "0");
        mem += parseMemory(c.usage.memory ?? "0");
      }
      map.set(`${item.metadata.namespace}/${item.metadata.name}`, {
        cpu,
        memory: mem,
      });
    }
    return map;
  } catch {
    return null;
  }
}

// --- 集計 ---

export async function fetchClusterResources(
  baseUrl: string,
  signal?: AbortSignal,
): Promise<ClusterResourcesResult> {
  const [rawNodes, rawPods, nodeMetrics, podMetrics] = await Promise.all([
    fetchNodes(baseUrl, signal),
    fetchAllPods(baseUrl, signal),
    fetchNodeMetrics(baseUrl, signal),
    fetchPodMetrics(baseUrl, signal),
  ]);

  // ノード名 → グループ名
  const nodeToGroup = new Map<string, string>();
  // ノード名 → allocatable
  const nodeAlloc = new Map<
    string,
    { cpu: number; mem: number; group: string }
  >();

  for (const node of rawNodes) {
    const group = node.metadata.labels?.[NODEPOOL_LABEL] ?? "(ungrouped)";
    nodeToGroup.set(node.metadata.name, group);
    nodeAlloc.set(node.metadata.name, {
      cpu: parseCpu(node.status.allocatable?.cpu ?? "0"),
      mem: parseMemory(node.status.allocatable?.memory ?? "0"),
      group,
    });
  }

  // ノード別の requests 集計 + Pod 数
  const nodeReqs = new Map<
    string,
    { cpu: number; mem: number; podCount: number }
  >();
  // Pod 別 requests（ランキング用）
  const podResources: TopPod[] = [];
  // Request未設定Pod
  const noRequestPods: NoRequestPod[] = [];

  for (const pod of rawPods) {
    const nodeName = pod.spec.nodeName;
    if (!nodeName) continue;
    const group = nodeToGroup.get(nodeName);
    if (!group) continue;

    let nr = nodeReqs.get(nodeName);
    if (!nr) {
      nr = { cpu: 0, mem: 0, podCount: 0 };
      nodeReqs.set(nodeName, nr);
    }
    nr.podCount++;

    let podCpu = 0;
    let podMem = 0;
    const missingCpu: string[] = [];
    const missingMemory: string[] = [];
    for (const c of pod.spec.containers) {
      const hasCpuReq = !!c.resources?.requests?.cpu;
      const hasMemReq = !!c.resources?.requests?.memory;
      if (!hasCpuReq) missingCpu.push(c.name ?? "unnamed");
      if (!hasMemReq) missingMemory.push(c.name ?? "unnamed");
      podCpu += parseCpu(c.resources?.requests?.cpu ?? "0");
      podMem += parseMemory(c.resources?.requests?.memory ?? "0");
    }
    nr.cpu += podCpu;
    nr.mem += podMem;

    if (missingCpu.length > 0 || missingMemory.length > 0) {
      noRequestPods.push({
        name: pod.metadata.name,
        namespace: pod.metadata.namespace,
        nodeName,
        missingCpu,
        missingMemory,
      });
    }

    const podKey = `${pod.metadata.namespace}/${pod.metadata.name}`;
    const pm = podMetrics?.get(podKey);
    podResources.push({
      name: pod.metadata.name,
      namespace: pod.metadata.namespace,
      nodeName,
      group,
      cpuRequest: podCpu,
      memoryRequest: podMem,
      actualCpu: pm?.cpu,
      actualMemory: pm?.memory,
    });
  }

  // ノード個別詳細
  const nodes: NodeDetail[] = [];
  for (const [name, alloc] of nodeAlloc) {
    const req = nodeReqs.get(name) ?? { cpu: 0, mem: 0, podCount: 0 };
    const actual = nodeMetrics?.get(name);
    nodes.push({
      name,
      group: alloc.group,
      allocCpu: alloc.cpu,
      requestedCpu: req.cpu,
      cpuPercent: alloc.cpu > 0 ? (req.cpu / alloc.cpu) * 100 : 0,
      allocMemory: alloc.mem,
      requestedMemory: req.mem,
      memoryPercent: alloc.mem > 0 ? (req.mem / alloc.mem) * 100 : 0,
      podCount: req.podCount,
      actualCpu: actual?.cpu,
      actualMemory: actual?.memory,
      actualCpuPercent:
        actual && alloc.cpu > 0 ? (actual.cpu / alloc.cpu) * 100 : undefined,
      actualMemoryPercent:
        actual && alloc.mem > 0 ? (actual.memory / alloc.mem) * 100 : undefined,
    });
  }

  // グループ集計
  const groupMap = new Map<
    string,
    {
      nodeCount: number;
      allocCpu: number;
      allocMem: number;
      reqCpu: number;
      reqMem: number;
      actualCpu: number;
      actualMem: number;
      hasActual: boolean;
    }
  >();
  for (const nd of nodes) {
    let g = groupMap.get(nd.group);
    if (!g) {
      g = {
        nodeCount: 0,
        allocCpu: 0,
        allocMem: 0,
        reqCpu: 0,
        reqMem: 0,
        actualCpu: 0,
        actualMem: 0,
        hasActual: false,
      };
      groupMap.set(nd.group, g);
    }
    g.nodeCount++;
    g.allocCpu += nd.allocCpu;
    g.allocMem += nd.allocMemory;
    g.reqCpu += nd.requestedCpu;
    g.reqMem += nd.requestedMemory;
    if (nd.actualCpu !== undefined) {
      g.actualCpu += nd.actualCpu;
      g.actualMem += nd.actualMemory ?? 0;
      g.hasActual = true;
    }
  }

  const groups: NodeGroupSummary[] = [];
  for (const [group, g] of groupMap) {
    groups.push({
      group,
      nodeCount: g.nodeCount,
      allocCpu: g.allocCpu,
      requestedCpu: g.reqCpu,
      remainingCpu: Math.max(0, g.allocCpu - g.reqCpu),
      cpuPercent: g.allocCpu > 0 ? (g.reqCpu / g.allocCpu) * 100 : 0,
      allocMemory: g.allocMem,
      requestedMemory: g.reqMem,
      remainingMemory: Math.max(0, g.allocMem - g.reqMem),
      memoryPercent: g.allocMem > 0 ? (g.reqMem / g.allocMem) * 100 : 0,
      ...(g.hasActual && {
        actualCpu: g.actualCpu,
        actualMemory: g.actualMem,
        actualCpuPercent:
          g.allocCpu > 0 ? (g.actualCpu / g.allocCpu) * 100 : undefined,
        actualMemoryPercent:
          g.allocMem > 0 ? (g.actualMem / g.allocMem) * 100 : undefined,
      }),
    });
  }
  groups.sort((a, b) => b.cpuPercent - a.cpuPercent);

  // ノードをグループ別に事前分類（CPU%降順ソート済み）
  const nodesByGroup: Record<string, NodeDetail[]> = {};
  for (const nd of nodes) {
    (nodesByGroup[nd.group] ??= []).push(nd);
  }
  for (const arr of Object.values(nodesByGroup)) {
    arr.sort((a, b) => b.cpuPercent - a.cpuPercent);
  }

  // Top Pods: CPU降順で上位15件
  podResources.sort((a, b) => b.cpuRequest - a.cpuRequest);
  const topPods = podResources.slice(0, 15);

  return { groups, nodesByGroup, topPods, noRequestPods };
}
