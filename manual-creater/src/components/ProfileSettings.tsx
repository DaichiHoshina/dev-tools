import { useState, useEffect } from "react";
import { Check } from "lucide-react";
import { loadProfile, saveProfile, type UserProfile } from "../lib/storage";

const inputClass =
  "w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors";

export function ProfileSettings() {
  const [profile, setProfile] = useState<UserProfile>(loadProfile);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setProfile(loadProfile());
  }, []);

  const handleSave = () => {
    saveProfile(profile);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <div className="mb-10">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          プロフィール設定
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          テンプレート入力時に自動的に埋められます
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-8 space-y-6 max-w-lg">
        <div className="space-y-2">
          <label
            htmlFor="author"
            className="text-sm font-medium text-foreground"
          >
            作業者名
          </label>
          <input
            id="author"
            type="text"
            className={inputClass}
            placeholder="例: 山田太郎"
            value={profile.author}
            onChange={(e) => setProfile({ ...profile, author: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="env" className="text-sm font-medium text-foreground">
            デフォルト環境
          </label>
          <select
            id="env"
            className={inputClass}
            value={profile.defaultEnvironment}
            onChange={(e) =>
              setProfile({ ...profile, defaultEnvironment: e.target.value })
            }
          >
            <option value="">選択してください</option>
            <option value="dev">dev</option>
            <option value="tes">tes</option>
            <option value="prd">prd</option>
          </select>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="prefix"
            className="text-sm font-medium text-foreground"
          >
            チケットプレフィックス
          </label>
          <input
            id="prefix"
            type="text"
            className={inputClass}
            placeholder="例: TICKET-"
            value={profile.ticketPrefix}
            onChange={(e) =>
              setProfile({ ...profile, ticketPrefix: e.target.value })
            }
          />
          <p className="text-xs text-muted-foreground">
            チケット番号欄に自動補完されます
          </p>
        </div>

        <button
          onClick={handleSave}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          {saved ? (
            <>
              <Check className="h-4 w-4" />
              保存しました
            </>
          ) : (
            "保存"
          )}
        </button>
      </div>
    </div>
  );
}
