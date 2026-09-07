import { formatDistanceToNowStrict } from "date-fns";

/**
 * The Instagram connection in detail: which account, what Meta granted, whether the webhook
 * subscription actually took, and when the 60-day token is due for its automatic refresh.
 * Read straight from the row the callback wrote — no value here is a guess, and none of it
 * is a credential.
 */
export type InstagramManageModel = {
  username: string | null;
  accountType: string | null;
  scopes: string[];
  webhooksSubscribed: boolean;
  tokenExpiresAt: Date | null;
  lastSyncedAt: Date | null;
};

const SCOPE_LABEL: Record<string, string> = {
  instagram_business_basic: "Read the account's basic profile",
  instagram_business_manage_messages: "Read and send direct messages",
};

export function InstagramManage({ model }: { model: InstagramManageModel }) {
  const canMessage = model.scopes.includes("instagram_business_manage_messages");
  return (
    <div className="space-y-3 text-xs">
      <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1.5">
        <dt className="text-ink/60">Account</dt>
        <dd className="text-ink/80 min-w-0 break-words">{model.username ? `@${model.username.replace(/^@/, "")}` : "—"}</dd>
        <dt className="text-ink/60">Type</dt>
        <dd className="text-ink/80">{model.accountType ? model.accountType.toLowerCase().replace(/_/g, " ") : "not reported by Meta"}</dd>
        <dt className="text-ink/60">Webhooks</dt>
        <dd className={model.webhooksSubscribed ? "text-success-text" : "text-warning-text"}>
          {model.webhooksSubscribed ? "Subscribed — new DMs arrive here" : "Not subscribed — reconnect to retry"}
        </dd>
        {model.lastSyncedAt && (
          <>
            <dt className="text-ink/60">Last sync</dt>
            <dd className="text-ink/80">{formatDistanceToNowStrict(model.lastSyncedAt)} ago</dd>
          </>
        )}
        <dt className="text-ink/60">Access</dt>
        <dd className="text-ink/80">
          {model.tokenExpiresAt
            ? model.tokenExpiresAt.getTime() > Date.now()
              ? `Valid for another ${formatDistanceToNowStrict(model.tokenExpiresAt)}; Daythread renews it automatically before it lapses`
              : `Expired ${formatDistanceToNowStrict(model.tokenExpiresAt)} ago — reconnect`
            : "No expiry reported by Meta"}
        </dd>
      </dl>

      <div>
        <p className="font-semibold text-ink/70 mb-1.5">What you granted</p>
        <ul className="space-y-1">
          {(model.scopes.length ? model.scopes : ["instagram_business_basic"]).map((s) => (
            <li key={s} className="flex gap-2">
              <span aria-hidden className="text-success-text">✓</span>
              <span className="text-ink/70">{SCOPE_LABEL[s] ?? s}</span>
            </li>
          ))}
        </ul>
        {!canMessage && (
          <p className="mt-2 rounded-xl border border-warning/30 bg-warning-soft/40 px-3 py-2 text-[11px] text-ink/75 leading-relaxed">
            The messaging permission isn&rsquo;t among what Meta granted, so replies cannot be sent from here. Reconnect and approve everything Instagram asks for.
          </p>
        )}
      </div>

      <p className="text-[11px] text-ink/60 leading-relaxed">
        Disconnecting stops Meta delivering this account&rsquo;s events to Daythread and erases the stored credential. Instagram has no third-party revocation endpoint, so you can also remove Daythread under Instagram → Settings → Website permissions. Your conversations and customers stay either way.
      </p>
    </div>
  );
}
