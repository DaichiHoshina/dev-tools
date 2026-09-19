package argocd

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"

	"github.com/user/dev-tools/kube-deploy/internal/config"
	"github.com/user/dev-tools/kube-deploy/internal/kube"
	"github.com/user/dev-tools/kube-deploy/internal/ui"
)

func argoCDURL(path string) string {
	return fmt.Sprintf("http://127.0.0.1:%d%s", config.ArgoCDLocalPort, path)
}

func getToken() (string, error) {
	password, err := kube.GetArgoCDAdminPassword()
	if err != nil {
		return "", err
	}
	body, err := json.Marshal(map[string]string{
		"username": "admin",
		"password": password,
	})
	if err != nil {
		return "", err
	}
	resp, err := http.Post(argoCDURL("/api/v1/session"), "application/json", bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("ArgoCD ログイン失敗: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	var result struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", fmt.Errorf("ArgoCD トークン取得失敗")
	}
	return result.Token, nil
}

// Sync は ArgoCD の指定サービス（省略時は全サービス）を sync する
func Sync(target string) error {
	if err := kube.EnsureContext(); err != nil {
		return err
	}
	ui.Header("ArgoCD Sync")

	cleanup, err := kube.PortForwardArgoCD()
	if err != nil {
		return err
	}
	defer cleanup()

	token, err := getToken()
	if err != nil {
		return err
	}

	failed := false
	for _, svc := range config.ListServices() {
		if target != "" && svc != target {
			continue
		}
		appName := config.AppPrefix() + "-" + svc
		req, _ := http.NewRequest("POST",
			argoCDURL("/api/v1/applications/"+appName+"/sync"),
			bytes.NewReader([]byte("{}")))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")

		resp, err := http.DefaultClient.Do(req)
		if err != nil || resp.StatusCode != 200 {
			statusCode := 0
			if resp != nil {
				statusCode = resp.StatusCode
				io.Copy(io.Discard, resp.Body)
				resp.Body.Close()
			}
			ui.Error(fmt.Sprintf("%s (HTTP %d)", svc, statusCode))
			failed = true
		} else {
			io.Copy(io.Discard, resp.Body)
			resp.Body.Close()
			ui.Success(svc)
		}
	}

	if failed {
		ui.Warn("一部の sync に失敗しました")
	} else {
		ui.Success("sync 完了")
	}
	return nil
}

// Restart は指定サービス（省略時は全サービス）の Pod を再起動する
func Restart(target string) error {
	if err := kube.EnsureContext(); err != nil {
		return err
	}
	ui.Header("Pod 再起動")

	failed := false
	svcs := config.ListServices()
	for _, svc := range svcs {
		if target != "" && svc != target {
			continue
		}
		ns := config.ServiceNamespace[svc]
		if err := kube.RolloutRestart(svc, ns); err != nil {
			ui.Error(ns + "/" + svc)
			failed = true
		} else {
			ui.Success(ns + "/" + svc)
		}
	}

	if failed {
		ui.Warn("一部の再起動に失敗しました")
		return nil
	}

	ui.Header("Rollout 待機")
	for _, svc := range svcs {
		if target != "" && svc != target {
			continue
		}
		ns := config.ServiceNamespace[svc]
		if err := kube.WaitRollout(svc, ns); err != nil {
			ui.Warn(ns + "/" + svc + " (timeout)")
		} else {
			ui.Success(ns + "/" + svc)
		}
	}
	ui.Success("再起動完了")
	return nil
}

// Status は ArgoCD Application + Pod の状態を表示する
func Status() {
	ui.Header("ArgoCD Application Status")
	appsOutput := kube.GetApplications()
	if appsOutput != "" {
		// 全アプリを表示（APP_PREFIXでフィルタリング）
		lines := strings.Split(appsOutput, "\n")
		prefix := config.AppPrefix()
		filterRe := regexp.MustCompile(`NAME|` + regexp.QuoteMeta(prefix))
		excludeRe := regexp.MustCompile(`^$`)
		for _, line := range lines {
			if filterRe.MatchString(line) && !excludeRe.MatchString(line) {
				fmt.Println(line)
			}
		}
	}

	ui.Header("Pod Status")
	fmt.Printf("  \033[1m%-40s %-10s %s\033[0m\n", "SERVICE", "READY", "IMAGE TAG")
	fmt.Printf("  %-40s %-10s %s\n", "---", "---", "---")
	for _, svc := range config.ListServices() {
		ns := config.ServiceNamespace[svc]
		ready, imageTag := kube.GetDeploymentInfo(svc, ns)
		fmt.Printf("  %-40s %-10s %s\n", ns+"/"+svc, ready, imageTag)
	}
}
