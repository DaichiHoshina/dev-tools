# kube-deploy

Kubernetesのdev/tes環境でDeploymentイメージをチケット番号でオーバーライドするCLI。

Go版（バイナリ）とBash版の2種類があります。

---

## 構成

```
kube-deploy/
├── cmd/kube-deploy/       Go版メインコマンド
├── internal/              Go版ライブラリ
├── bash/                  Bash版
│   ├── kube-deploy.sh     Bash版メインスクリプト
│   ├── lib/               共通ライブラリ
│   ├── cronjob/           TTLリセットCronJob
│   └── install.sh         Bash版インストーラー
├── cronjob/               Go版TTLリセットCronJob
├── install.sh             Go版インストーラー
└── kube-deploy.sh         Go版シェルラッパー（Bash実装）
```

---

## 前提条件

| ツール | 補足 |
|--------|------|
| Go 1.22+ | Go版ビルドに必要 |
| kubectl | kubernetesクラスター接続 |
| glab | GitLab CLI |
| aws cli | ECRアクセス用 |
| jq | JSON処理用 |

---

## インストール

### Go版

```bash
./install.sh
```

Go buildして `/usr/local/bin/kube-deploy` に配置される。

### Bash版

```bash
./bash/install.sh
```

`/usr/local/bin/kube-deploy` へのシンボリックリンクを作成する。

---

## 設定（環境変数）

| 環境変数 | 説明 | デフォルト |
|----------|------|-----------|
| `KUBE_DEPLOY_ECR_REGISTRY` | ECRレジストリURL | `123456789012.dkr.ecr.ap-northeast-1.amazonaws.com` |
| `KUBE_DEPLOY_KUBE_CONTEXT` | kubectlコンテキスト名（Bash版） | `my-dev-context` |
| `KUBE_DEPLOY_KUBE_CONTEXTS` | kubectlコンテキスト名（Go版、カンマ区切り） | `my-dev-context` |
| `KUBE_DEPLOY_GITLAB_HOST` | GitLabホスト名 | `gitlab.example.com` |
| `KUBE_DEPLOY_GITLAB_GROUP` | GitLabグループパス（URLエンコード済み） | `myorg%2Fapplication` |
| `KUBE_DEPLOY_APP_PREFIX` | ArgoCDアプリ名プレフィックス | `myapp-dev` |
| `KUBE_DEPLOY_CONFIGMAP_NAME` | ConfigMap名 | `kube-deploy-image-overrides` |
| `KUBE_DEPLOY_SLACK_WEBHOOK_URL` | Slack Webhook URL（任意） | なし |

サービスマッピング（サービス名→namespace、ECRリポジトリ、GitLabプロジェクト）は各configファイルに記述:

- **Go版**: `internal/config/services.go`
- **Bash版**: `bash/lib/config.sh`

---

## コマンド一覧

| コマンド | 説明 |
|---------|------|
| `kube-deploy TICKET-123` | チケット番号のMRからイメージをデプロイ |
| `kube-deploy set <service> --tag <tag>` | 手動でサービスのイメージタグを指定 |
| `kube-deploy update` | 自分のデプロイを最新コミットに更新 |
| `kube-deploy diff` | latestとの差分を表示 |
| `kube-deploy status` | オーバーライド / ArgoCD / Pod 状態を表示 |
| `kube-deploy reset TICKET-123` | チケット指定でリセット |
| `kube-deploy reset --mine` | 自分のデプロイをリセット |
| `kube-deploy sync [service]` | ArgoCD sync |
| `kube-deploy restart [service]` | Pod再起動 |

### グローバルオプション

| オプション | 説明 |
|-----------|------|
| `--dry-run` | 実際には変更しない（確認用） |
| `--force` | 競合を無視してデプロイ |
| `--ttl <時間>` | TTL設定（デフォルト: 24時間） |

---

## 仕組み

1. ConfigMap `kube-deploy-image-overrides` でオーバーライド情報を管理
2. チケット番号から glab API で関連MRを自動検索
3. パイプラインのビルドステータスを確認後にデプロイ
4. TTL超過エントリはCronJobで自動リセット

### TTLリセットCronJobの適用

**Go版:**
```bash
kubectl apply -f cronjob/kube-deploy-ttl-reset.yaml
```

**Bash版:**
```bash
kubectl apply -f bash/cronjob/kube-deploy-ttl-reset.yaml
```

CronJobのYAML内にある `ECR_REGISTRY` の値を実際の値に変更してから適用してください。
