package deploy

// Config はグローバルオプション設定
type Config struct {
	DryRun  bool
	Force   bool
	NoSlack bool
}

// DeployPlanEntry はデプロイ計画の1エントリ
type DeployPlanEntry struct {
	Service   string
	Namespace string
	Tag       string
	MRUrl     string
	Author    string
	Ticket    string
}
