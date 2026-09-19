import type { FC } from "hono/jsx";
import { Layout } from "../components/layout/Layout";

export const PrdPage: FC = () => {
  return (
    <Layout title="PRD MR作成">
      {/* エラー/警告表示エリア */}
      <div id="alert-container"></div>

      {/* サービス一覧 */}
      <div class="card-modern">
        <div class="table-wrap">
          <table class="table" id="services-table">
            <thead>
              <tr>
                <th style="width: 40px;" scope="col">
                  <label class="cursor-pointer">
                    <input
                      type="checkbox"
                      class="checkbox checkbox-xs"
                      id="check-all"
                    />
                  </label>
                </th>
                <th style="width: 40px;" scope="col">
                  <span class="sr-only">ステータス</span>
                </th>
                <th scope="col">サービス名</th>
                <th scope="col" style="width: 140px;">
                  新規タグ
                </th>
                <th scope="col" style="width: 130px;">
                  PRDバージョン
                </th>
                <th scope="col" style="width: 100px;">
                  差分
                </th>
              </tr>
            </thead>
            <tbody id="services-tbody">{/* 動的に生成 */}</tbody>
          </table>
        </div>
        <div
          class="flex items-center justify-end gap-3 mt-3 px-4 pb-3"
          id="batch-action-container"
        >
          <button
            class="btn btn-error btn-sm gap-1"
            id="batch-cancel-btn"
            style="display: none;"
          >
            <i class="fas fa-stop text-[10px]"></i>キャンセル
          </button>
          <button
            class="btn btn-primary btn-sm gap-1.5"
            id="batch-promote-btn"
            disabled
          >
            <i class="fas fa-arrow-up text-[10px]"></i>MR作成 (
            <span id="batch-count">0</span>件)
          </button>
        </div>
      </div>

      {/* MR作成詳細 */}
      <div class="deploy-details-grid mt-6" id="deploy-details-container"></div>
    </Layout>
  );
};
