import type { K8sClient } from "~/lib/k8s-client";
import type { K8sConfig } from "~/lib/types";
import { ConnectionSettings } from "~/components/settings/ConnectionSettings";

interface Props {
  client: K8sClient;
  onConfigSave: (config: K8sConfig) => void;
}

export function SettingsPage({ client, onConfigSave }: Props) {
  return (
    <div>
      <div class="page-header">
        <h1 class="page-title">設定</h1>
      </div>
      <ConnectionSettings
        config={client.config}
        client={client}
        onSave={onConfigSave}
      />
    </div>
  );
}
