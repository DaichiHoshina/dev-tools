package ecr

import (
	"fmt"
	"os/exec"

	"github.com/user/dev-tools/kube-deploy/internal/config"
)

// CheckAWSAuth は AWS 認証が有効かどうかを確認する（ベストエフォート）
func CheckAWSAuth() error {
	if err := exec.Command("aws", "sts", "get-caller-identity").Run(); err != nil {
		return fmt.Errorf("AWS credentials が無効です。aws sso login で認証してください")
	}
	return nil
}

// ImageExists は ECR にイメージが存在するか確認する
func ImageExists(repo, tag string) bool {
	err := exec.Command("aws", "ecr", "describe-images",
		"--repository-name", repo,
		"--image-ids", "imageTag="+tag,
		"--region", "ap-northeast-1",
		"--output", "json").Run()
	return err == nil
}

// MakeImageTag はコミット SHA からイメージタグを生成する
func MakeImageTag(sha string) string {
	return "dev-" + sha
}

// MakeFullImage は ECR リポジトリ名とタグからフル URI を生成する
func MakeFullImage(repo, tag string) string {
	return fmt.Sprintf("%s/%s:%s", config.ECRRegistry(), repo, tag)
}
