package ui

import (
	"bufio"
	"fmt"
	"os"
	"strings"
)

const (
	colorRed    = "\033[0;31m"
	colorGreen  = "\033[0;32m"
	colorYellow = "\033[1;33m"
	colorBlue   = "\033[0;34m"
	colorCyan   = "\033[0;36m"
	colorBold   = "\033[1m"
	colorReset  = "\033[0m"
)

func Info(msg string) {
	fmt.Printf("%s[INFO]%s %s\n", colorBlue, colorReset, msg)
}

func Success(msg string) {
	fmt.Printf("%s[OK]%s %s\n", colorGreen, colorReset, msg)
}

func Warn(msg string) {
	fmt.Fprintf(os.Stderr, "%s[WARN]%s %s\n", colorYellow, colorReset, msg)
}

func Error(msg string) {
	fmt.Fprintf(os.Stderr, "%s[ERROR]%s %s\n", colorRed, colorReset, msg)
}

// Confirm は y/N 確認プロンプトを表示し、ユーザーの応答を返す
func Confirm(message string) bool {
	fmt.Printf("%s%s (y/N): %s", colorYellow, message, colorReset)
	scanner := bufio.NewScanner(os.Stdin)
	if scanner.Scan() {
		reply := strings.TrimSpace(scanner.Text())
		return reply == "y" || reply == "Y"
	}
	return false
}

// Header はセクションヘッダーを表示する
func Header(title string) {
	fmt.Printf("\n%s━━━ %s ━━━%s\n", colorCyan, title, colorReset)
}

// Bold はテキストを太字フォーマットで返す
func Bold(text string) string {
	return colorBold + text + colorReset
}
