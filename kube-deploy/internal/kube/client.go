package kube

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"
	"time"

	"github.com/user/dev-tools/kube-deploy/internal/config"
	"github.com/user/dev-tools/kube-deploy/internal/ui"
)

// Annotation keys
const (
	AnnotationDeployedBy = "kube-deploy/deployed-by"
	AnnotationTicket     = "kube-deploy/ticket"
	AnnotationMRUrl      = "kube-deploy/mr-url"
	AnnotationTag        = "kube-deploy/tag"
)

// DeployAnnotation holds kube-deploy metadata on a Deployment
type DeployAnnotation struct {
	DeployedBy string
	Ticket     string
	MRUrl      string
	Tag        string
}

// HasAnnotation returns true if annotation data is present
func (a DeployAnnotation) HasAnnotation() bool {
	return a.DeployedBy != "" || a.Ticket != "" || a.Tag != ""
}

// EnsureContext は kubectl context が有効な dev 環境かチェックする
func EnsureContext() error {
	out, err := exec.Command("kubectl", "config", "current-context").Output()
	if err != nil {
		ui.Info("切り替え: kubectl config use-context " + config.KubeContexts[0])
		return fmt.Errorf("kubectl context が取得できません")
	}
	current := strings.TrimSpace(string(out))
	for _, valid := range config.KubeContexts {
		if current == valid {
			return nil
		}
	}
	ui.Error("現在の context: " + current)
	ui.Error("期待する context: " + strings.Join(config.KubeContexts, " または "))
	return fmt.Errorf("kubectl context が違います")
}

// SetDeploymentImage は Deployment のイメージを変更する
func SetDeploymentImage(svc, ns, fullImage string) error {
	cmd := exec.Command("kubectl", "set", "image",
		"deployment/"+svc, svc+"="+fullImage,
		"-n", ns)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("%s", strings.TrimSpace(stderr.String()))
	}
	return nil
}

// GetCurrentImageTag は Deployment の現在のイメージタグを取得する
func GetCurrentImageTag(svc, ns string) (string, error) {
	out, err := exec.Command("kubectl", "get", "deployment", svc,
		"-n", ns,
		"-o", "jsonpath={.spec.template.spec.containers[0].image}").Output()
	if err != nil {
		return "", err
	}
	image := strings.TrimSpace(string(out))
	if idx := strings.LastIndex(image, ":"); idx >= 0 {
		return image[idx+1:], nil
	}
	return image, nil
}

// WaitRollout は rollout status を待機する
func WaitRollout(svc, ns string) error {
	return exec.Command("kubectl", "rollout", "status",
		"deployment/"+svc,
		"-n", ns,
		"--timeout="+config.RolloutTimeout).Run()
}

// RolloutRestart は Pod を再起動する
func RolloutRestart(svc, ns string) error {
	return exec.Command("kubectl", "rollout", "restart",
		"deploy/"+svc, "-n", ns).Run()
}

// SetAnnotations は Deployment に kube-deploy annotation を設定する
func SetAnnotations(svc, ns string, ann DeployAnnotation) error {
	args := []string{"annotate", "deployment/" + svc, "-n", ns, "--overwrite",
		AnnotationDeployedBy + "=" + ann.DeployedBy,
		AnnotationTicket + "=" + ann.Ticket,
		AnnotationMRUrl + "=" + ann.MRUrl,
		AnnotationTag + "=" + ann.Tag,
	}
	cmd := exec.Command("kubectl", args...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("annotation設定失敗: %s", strings.TrimSpace(stderr.String()))
	}
	return nil
}

// GetAnnotations は Deployment から kube-deploy annotation を読み取る
func GetAnnotations(svc, ns string) (DeployAnnotation, error) {
	out, err := exec.Command("kubectl", "get", "deployment", svc,
		"-n", ns,
		"-o", "jsonpath={.metadata.annotations}").Output()
	if err != nil {
		return DeployAnnotation{}, err
	}
	if len(out) == 0 {
		return DeployAnnotation{}, nil
	}
	var annotations map[string]string
	if err := json.Unmarshal(out, &annotations); err != nil {
		return DeployAnnotation{}, nil
	}
	return DeployAnnotation{
		DeployedBy: annotations[AnnotationDeployedBy],
		Ticket:     annotations[AnnotationTicket],
		MRUrl:      annotations[AnnotationMRUrl],
		Tag:        annotations[AnnotationTag],
	}, nil
}

// RemoveAnnotations は Deployment から kube-deploy annotation を削除する
func RemoveAnnotations(svc, ns string) error {
	args := []string{"annotate", "deployment/" + svc, "-n", ns,
		AnnotationDeployedBy + "-",
		AnnotationTicket + "-",
		AnnotationMRUrl + "-",
		AnnotationTag + "-",
	}
	cmd := exec.Command("kubectl", args...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("annotation削除失敗: %s", strings.TrimSpace(stderr.String()))
	}
	return nil
}

// GetApplications は ArgoCD Applications の状態テキストを返す
func GetApplications() string {
	out, err := exec.Command("kubectl", "get", "applications",
		"-n", config.ArgoCDNS,
		"-o", "custom-columns=NAME:.metadata.name,SYNC:.status.sync.status,HEALTH:.status.health.status").Output()
	if err != nil {
		return ""
	}
	return string(out)
}

// GetDeploymentInfo は Deployment の readyReplicas と imageTag を返す
func GetDeploymentInfo(svc, ns string) (ready, imageTag string) {
	readyOut, err := exec.Command("kubectl", "get", "deploy", svc,
		"-n", ns,
		"-o", "jsonpath={.status.readyReplicas}/{.status.replicas}").Output()
	if err != nil {
		ready = "?/?"
	} else {
		ready = strings.TrimSpace(string(readyOut))
		if ready == "" {
			ready = "0/?"
		}
	}

	imgOut, err := exec.Command("kubectl", "get", "deploy", svc,
		"-n", ns,
		"-o", "jsonpath={.spec.template.spec.containers[0].image}").Output()
	if err != nil {
		imageTag = "?"
	} else {
		img := strings.TrimSpace(string(imgOut))
		if idx := strings.LastIndex(img, ":"); idx >= 0 {
			imageTag = img[idx+1:]
		} else {
			imageTag = img
		}
	}
	return
}

// GetArgoCDAdminPassword は ArgoCD の admin パスワードを取得する
func GetArgoCDAdminPassword() (string, error) {
	out, err := exec.Command("kubectl", "-n", config.ArgoCDNS,
		"get", "secret", "argocd-initial-admin-secret",
		"-o", "jsonpath={.data.password}").Output()
	if err != nil {
		return "", fmt.Errorf("ArgoCD パスワード取得失敗: %w", err)
	}
	decoded, err := base64.StdEncoding.DecodeString(strings.TrimSpace(string(out)))
	if err != nil {
		return "", fmt.Errorf("base64 デコード失敗: %w", err)
	}
	return string(decoded), nil
}

// PortForwardArgoCD は ArgoCD サーバーへの port-forward を開始し、停止関数を返す
func PortForwardArgoCD() (func(), error) {
	exec.Command("bash", "-c",
		fmt.Sprintf("lsof -ti :%d | xargs kill 2>/dev/null; true", config.ArgoCDLocalPort)).Run()

	cmd := exec.Command("kubectl", "port-forward",
		"svc/argocd-server",
		"-n", config.ArgoCDNS,
		fmt.Sprintf("%d:80", config.ArgoCDLocalPort))
	cmd.Stdout = nil
	cmd.Stderr = nil
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("ArgoCD port-forward 開始失敗: %w", err)
	}

	time.Sleep(3 * time.Second)

	checkCmd := exec.Command("curl", "-sf", "-o", "/dev/null",
		fmt.Sprintf("http://127.0.0.1:%d", config.ArgoCDLocalPort))
	if err := checkCmd.Run(); err != nil {
		cmd.Process.Kill()
		return nil, fmt.Errorf("ArgoCD port-forward に失敗しました")
	}

	return func() {
		if cmd.Process != nil {
			cmd.Process.Kill()
		}
	}, nil
}
