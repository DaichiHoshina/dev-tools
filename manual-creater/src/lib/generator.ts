import type {
  FormValues,
  Template,
} from "../types/template";

export function generateMarkdown(
  template: Template,
  values: FormValues,
): string {
  let output = template.outputTemplate;

  // subtype 条件ブロックの削除（ブロック内容をそのまま出力）
  const subtypeRegex =
    /\{\{#if-subtype:(\w[\w-]*)\}\}([\s\S]*?)\{\{\/if-subtype:\1\}\}/g;
  output = output.replace(
    subtypeRegex,
    (_match, _subtype: string, block: string) => {
      return block; // 常にブロック内容を出力
    },
  );

  // repeatable セクションの展開（1回のみデフォルト値で出力）
  const repeatRegex = /\{\{#repeat:(\w+)\}\}([\s\S]*?)\{\{\/repeat:\1\}\}/g;
  output = output.replace(
    repeatRegex,
    (_match, _sectionId: string, block: string) => {
      // デフォルト値でブロックを1回のみ展開
      return replaceVariables(block, {});
    },
  );

  // checklist の展開（valuesになければsectionsのdefaultValueを使用）
  const checklistRegex = /\{\{#checklist:(\w+)\}\}/g;
  output = output.replace(checklistRegex, (_match, fieldId: string) => {
    let value = values[fieldId];
    if (!value || (typeof value === "string" && !value.trim())) {
      const field = template.sections
        .flatMap((s) => s.fields)
        .find((f) => f.id === fieldId);
      if (field?.defaultValue && typeof field.defaultValue === "string") {
        value = field.defaultValue;
      }
    }
    if (typeof value === "string" && value) {
      return value
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => `- [ ] ${line.trim()}`)
        .join("\n");
    }
    return "";
  });

  // 通常の変数置換（title, date, ticketのみ置換）
  output = replaceVariables(output, values);

  // 未置換の変数を日本語プレースホルダーに変換
  output = convertToJapanesePlaceholders(output);

  // 空行の正規化
  output = output.replace(/\n{3,}/g, "\n\n");

  return output.trim();
}

function replaceVariables(text: string, values: FormValues): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = values[key];
    if (value === undefined || value === null) return "";
    if (typeof value === "boolean") return value ? "はい" : "いいえ";
    if (Array.isArray(value)) return value.join(", ");
    return String(value);
  });
}

/**
 * 未置換の変数を日本語プレースホルダーに変換
 */
function convertToJapanesePlaceholders(text: string): string {
  const placeholderMap: Record<string, string> = {
    // 共通
    environment: "[環境]",
    author: "[作業者]",
    reviewer: "[確認者]",
    investigator: "[調査者]",
    responder: "[対応者]",
    notes: "[備考]",
    verification_items: "[確認項目]",

    // デプロイ系
    service_name: "[サービス名]",
    version: "[バージョン]",
    migration: "[migration有無]",
    branch: "[ブランチ]",
    helm_mr_url: "[helm MR URL]",
    notify_start_done: "[完了時刻]",
    notify_start_note: "[連絡内容]",
    maintenance_on_done: "[完了時刻]",
    maintenance_on_items: "[確認項目]",
    healthman_stop_done: "[完了時刻]",
    healthman_stop_items: "[確認項目]",
    helm_merge_done: "[完了時刻]",
    helm_merge_items: "[確認項目]",
    db_migration_done: "[完了時刻]",
    db_migration_steps: "[マイグレーション手順]",
    db_migration_items: "[確認項目]",
    argocd_deploy_done: "[完了時刻]",
    argocd_deploy_steps: "[デプロイ手順]",
    argocd_deploy_order: "[デプロイ順序]",
    argocd_deploy_items: "[確認項目]",
    maintenance_off_done: "[完了時刻]",
    maintenance_off_items: "[確認項目]",
    verification_point: "[確認観点]",
    verification_store: "[確認ストア]",
    verification_steps: "[手順]",
    verification_result: "[確認結果]",
    verification_operator: "[作業者/確認者]",
    verification_evidence: "[証跡]",
    release_note_done: "[完了時刻]",
    release_note_items: "[確認項目]",
    release_note_url: "[リリースノートURL]",
    announcement_done: "[完了時刻]",
    announcement_items: "[確認項目]",
    healthman_start_done: "[完了時刻]",
    healthman_start_items: "[確認項目]",
    notify_end_done: "[完了時刻]",
    notify_end_note: "[連絡内容]",
    rollback_steps: "[切り戻し手順]",
    rollback_criteria: "[切り戻し判断基準]",
    steps: "[作業手順]",

    // ログ調査
    symptom: "[発生事象]",
    occurrence_time: "[発生日時]",
    affected_service: "[影響サービス]",
    log_query: "[ログクエリ]",
    error_pattern: "[エラーパターン]",
    frequency: "[発生頻度]",
    root_cause: "[推定原因]",
    related_logs: "[関連ログ]",
    correlation: "[相関関係]",
    immediate_action: "[即時対応]",
    permanent_fix: "[恒久対応]",
    monitoring: "[監視項目]",
    prevention: "[再発防止策]",
    followup_items: "[残タスク]",

    // エラー対応
    error_code: "[エラーコード]",
    severity: "[重要度]",
    error_message: "[エラーメッセージ]",
    error_condition: "[発生条件]",
    check_command: "[確認コマンド]",
    diagnosis_items: "[診断チェック項目]",
    step_name: "[ステップ名]",
    step_command: "[実行コマンド]",
    step_description: "[手順説明]",
    expected_result: "[期待される結果]",
    verification_command: "[確認コマンド]",
    escalation_criteria: "[エスカレーション基準]",
    escalation_to: "[エスカレーション先]",
    known_issues: "[既知の問題]",
  };

  return text.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    return placeholderMap[key] || `[${key}]`;
  });
}


