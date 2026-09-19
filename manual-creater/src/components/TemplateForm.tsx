import { useState, useMemo } from "react";
import { useParams } from "react-router";
import { Download, Copy, Check } from "lucide-react";
import { getTemplateById } from "../templates";
import { generateMarkdown } from "../lib/generator";
import { copyToClipboard, downloadAsFile } from "../lib/clipboard";
import { DynamicSectionRenderer } from "./DynamicSectionRenderer";
import {
  projects,
  generateRunCommand,
  type Env,
  type ProjectId,
} from "../data/services";

const PROJECT_IDS: ProjectId[] = ["project-a", "project-b"];
const ENVS: Env[] = ["dev", "tes", "prd"];

export function TemplateForm() {
  const { templateId } = useParams();
  const template = templateId ? getTemplateById(templateId) : undefined;
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    template?.sections.forEach((section) => {
      section.fields.forEach((field) => {
        if (field.defaultValue && typeof field.defaultValue === "string") {
          initial[field.id] = field.defaultValue;
        } else {
          initial[field.id] = "";
        }
      });
    });
    return initial;
  });
  const [copied, setCopied] = useState(false);

  const [projectId, setProjectId] = useState<ProjectId>("project-a");
  const [env, setEnv] = useState<Env>("dev");
  const [serviceName, setServiceName] = useState("");

  const showServiceSelector = template?.id === "temp-node-db-operation";

  const markdown = useMemo(
    () => (template ? generateMarkdown(template, values) : ""),
    [template, values],
  );

  const applyServiceValues = (pid: ProjectId, e: Env, sName: string) => {
    const project = projects[pid];
    const service = project.services.find((s) => s.name === sName);
    if (!service) return;
    const cluster = project.clusters[e];
    setValues((prev) => ({
      ...prev,
      environment: e,
      startup_command: generateRunCommand(service),
      connection_command: `kubectl exec -it temp-node --namespace=${service.namespace} -- sh`,
      cleanup_command: `kubectl delete pod temp-node --namespace=${service.namespace}`,
      namespace: service.namespace,
      cluster_name: cluster.clusterName,
      database_name: service.dbName,
      db_instance: cluster.dbHost,
    }));
  };

  const handleProjectChange = (pid: ProjectId) => {
    setProjectId(pid);
    setServiceName("");
  };

  const handleEnvChange = (e: Env) => {
    setEnv(e);
    if (serviceName) applyServiceValues(projectId, e, serviceName);
  };

  const handleServiceChange = (name: string) => {
    setServiceName(name);
    if (name) applyServiceValues(projectId, env, name);
  };

  const handleCopy = async () => {
    const success = await copyToClipboard(markdown);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    const title = values["title"] || template?.name || "manual";
    const filename = `${title.replace(/[/\\?%*:|"<>]/g, "_")}.md`;
    downloadAsFile(markdown, filename);
  };

  const handleFieldChange = (fieldId: string, value: string) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  if (!template) {
    return (
      <div className="text-muted-foreground">テンプレートが見つかりません</div>
    );
  }

  return (
    <div>
      <div className="mb-10">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {template.name}
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          {template.description}
        </p>
      </div>

      {/* セクション動的レンダリング */}
      {template.sections.map((section) => (
        <DynamicSectionRenderer
          key={section.id}
          section={section}
          values={values}
          onChange={handleFieldChange}
        />
      ))}

      {/* サービスセレクター（temp-node-db-operationのみ） */}
      {showServiceSelector && (
        <div className="rounded-xl border border-border bg-card p-8 mb-8">
          <h2 className="text-base font-semibold text-card-foreground mb-6">
            対象サービス
          </h2>
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                プロジェクト
              </label>
              <div className="flex gap-1 p-1 bg-accent/50 rounded-lg w-fit">
                {PROJECT_IDS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handleProjectChange(id)}
                    className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      projectId === id
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {projects[id].label}
                    <span className="ml-1.5 text-xs opacity-70">
                      {projects[id].description}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                環境
              </label>
              <div className="flex gap-1 p-1 bg-accent/50 rounded-lg w-fit">
                {ENVS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => handleEnvChange(e)}
                    className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      env === e
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                サービス
              </label>
              <select
                value={serviceName}
                onChange={(e) => handleServiceChange(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">選択してください</option>
                {projects[projectId].services.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name} ({s.displayName})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* 生成済み手順書 */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
          <h2 className="text-base font-semibold text-card-foreground">
            生成済み手順書
          </h2>
          <div className="flex gap-3">
            <button
              onClick={handleDownload}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
            >
              <Download className="h-4 w-4" />
              ダウンロード
            </button>
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4" />
                  コピーしました
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  コピー
                </>
              )}
            </button>
          </div>
        </div>
        <div className="p-6">
          <pre className="whitespace-pre-wrap text-sm text-card-foreground font-mono leading-relaxed">
            {markdown}
          </pre>
        </div>
      </div>
    </div>
  );
}
