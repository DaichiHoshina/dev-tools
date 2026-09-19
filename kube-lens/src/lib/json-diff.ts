export interface DiffLine {
  type: "add" | "remove" | "same";
  line: string;
}

/**
 * 2つのJSON文字列を比較し、unified diff形式の行リストを返す。
 * JSON.parse → pretty print → 行ごとの簡易LCS diffで差分計算。
 */
export function computeJsonDiff(
  liveJson: string,
  targetJson: string,
): DiffLine[] {
  const liveLines = prettify(liveJson);
  const targetLines = prettify(targetJson);

  if (liveLines.length === 0 && targetLines.length === 0) return [];

  return lcs(liveLines, targetLines);
}

function prettify(json: string): string[] {
  try {
    const obj = JSON.parse(json);
    return JSON.stringify(obj, null, 2).split("\n");
  } catch {
    // パース失敗時は生文字列をそのまま行分割
    return json.split("\n");
  }
}

/**
 * 簡易LCS (Longest Common Subsequence) diff。
 * oldLines を基準に、newLines との差分を計算する。
 */
function lcs(oldLines: string[], newLines: string[]): DiffLine[] {
  const m = oldLines.length;
  const n = newLines.length;

  // LCSテーブル構築
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // バックトラックでdiff生成
  const result: DiffLine[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.push({ type: "same", line: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: "add", line: newLines[j - 1] });
      j--;
    } else {
      result.push({ type: "remove", line: oldLines[i - 1] });
      i--;
    }
  }

  return result.reverse();
}
