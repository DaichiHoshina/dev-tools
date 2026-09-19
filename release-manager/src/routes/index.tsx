import type { FC } from "hono/jsx";
import { Layout } from "../components/layout/Layout";

export const IndexPage: FC = () => {
  return (
    <Layout title="デプロイ">
      {/* エラー/警告表示エリア */}
      <div id="alert-container"></div>

      {/* MRタイトル設定 */}
      <div class="flex items-center gap-3 mb-4">
        <label for="mr-title-template" class="text-xs font-medium text-secondary whitespace-nowrap">
          MRタイトル
        </label>
        <input
          type="text"
          id="mr-title-template"
          class="input input-bordered input-sm flex-1 font-mono text-sm"
          placeholder={"[TES] Release {service} {tag}"}
        />
        <span class="text-[10px] text-base-content/40 whitespace-nowrap">
          {"{service}"} {"{tag}"}
        </span>
      </div>

      {/* サービス一覧 */}
      <div class="card-modern">
        <div class="table-wrap">
          <table class="table" id="services-table">
            <thead class="sr-only">
              <tr>
                <th style="width: 50px;" scope="col">
                  <span class="sr-only">ステータス</span>
                </th>
                <th scope="col">サービス名</th>
                <th scope="col">バージョン</th>
                <th scope="col" style="width: 200px;">
                  操作
                </th>
              </tr>
            </thead>
            <tbody id="services-tbody">{/* 動的に生成 */}</tbody>
          </table>
        </div>
      </div>

      {/* デプロイ詳細 */}
      <div class="deploy-details-grid mt-6" id="deploy-details-container"></div>
    </Layout>
  );
};
