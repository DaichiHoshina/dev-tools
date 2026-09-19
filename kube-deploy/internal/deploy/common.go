package deploy

import (
	"errors"
	"fmt"

	"github.com/user/dev-tools/kube-deploy/internal/config"
	"github.com/user/dev-tools/kube-deploy/internal/ecr"
	"github.com/user/dev-tools/kube-deploy/internal/kube"
	"github.com/user/dev-tools/kube-deploy/internal/ui"
)

// ErrSilent はUI側でエラーメッセージ出力済みの場合に返すセンチネルエラー
var ErrSilent = errors.New("silent error")

// checkPipelineDeployable はパイプラインステータスに基づいてデプロイ可否を判定する
func checkPipelineDeployable(svc, status, pipelineURL string) bool {
	switch status {
	case "success":
		return true
	case "running", "pending", "created", "preparing", "waiting_for_resource":
		ui.Error(fmt.Sprintf("%s: CI実行中（%s）— ビルド完了を待ってください", svc, status))
		if pipelineURL != "" {
			ui.Info("  パイプライン: " + pipelineURL)
		}
		return false
	case "failed":
		ui.Error(svc + ": CI失敗 — デプロイできません")
		if pipelineURL != "" {
			ui.Info("  パイプライン: " + pipelineURL)
		}
		return false
	case "canceled":
		ui.Warn(svc + ": CIキャンセル済 — デプロイできません")
		return false
	default:
		ui.Warn(svc + ": パイプライン情報なし — デプロイを試行します")
		return true
	}
}

// resetSingleService は1つのサービスを latest に戻し、annotation を削除する
func resetSingleService(d Deps, cfg Config, svc string) error {
	ns := config.ServiceNamespace[svc]
	ecrRepo := config.ServiceECRRepo[svc]
	fullImage := ecr.MakeFullImage(ecrRepo, "latest")

	if cfg.DryRun {
		ui.Info(fmt.Sprintf("[DRY-RUN] %s: kubectl set image → latest", svc))
		return nil
	}

	ui.Info(fmt.Sprintf("%s: イメージを latest に戻しています...", svc))
	if err := d.KubeSetDeploymentImage(svc, ns, fullImage); err != nil {
		return fmt.Errorf("%s: リセット失敗: %w", svc, err)
	}
	if err := d.KubeRemoveAnnotations(svc, ns); err != nil {
		ui.Warn(fmt.Sprintf("%s: annotation削除失敗: %v", svc, err))
	}
	ui.Success(svc + ": リセット完了")
	return nil
}

// setAnnotation はデプロイ後に annotation を設定するヘルパー
func setAnnotation(d Deps, svc, ns, ticket, tag, mrURL, deployedBy string) {
	if err := d.KubeSetAnnotations(svc, ns, kube.DeployAnnotation{
		DeployedBy: deployedBy,
		Ticket:     ticket,
		MRUrl:      mrURL,
		Tag:        tag,
	}); err != nil {
		ui.Warn(fmt.Sprintf("%s: annotation設定失敗: %v", svc, err))
	}
}

// checkConflict は既存の annotation を確認し、警告する
func checkConflict(d Deps, svc string) {
	ns := config.ServiceNamespace[svc]
	ann, err := d.KubeGetAnnotations(svc, ns)
	if err != nil || !ann.HasAnnotation() {
		return
	}
	ui.Warn(fmt.Sprintf("%s: 現在 %s が %s でオーバーライド中",
		svc, ann.DeployedBy, ann.Ticket))
}
