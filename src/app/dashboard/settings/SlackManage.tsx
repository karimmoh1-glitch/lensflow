"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { useToast } from "@/components/Toaster";
import { listSlackChannelsAction, selectSlackChannel } from "@/app/actions/connect";

export type SlackManageModel = { teamName: string | null; channelName: string | null; lastPostAt: string | null; lastPostError: string | null };

/** Pick the channel Daythread posts to. The list is Slack's own, the choice is verified by a real post. */
export function SlackManage({ model }: { model: SlackManageModel }) {
  const [channels, setChannels] = useState<Array<{ id: string; name: string; isMember: boolean }> | null>(null);
  const [current, setCurrent] = useState<string>("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  useEffect(() => {
    let live = true;
    listSlackChannelsAction().then((r) => {
      if (!live) return;
      if (r.error) setLoadError(r.error);
      setChannels(r.channels);
      setCurrent(r.current ?? "");
    });
    return () => { live = false; };
  }, []);
  const save = () => start(async () => {
    const r = await selectSlackChannel(current);
    if (r.error) return toast({ tone: "signal", title: "Couldn't set the channel", body: r.error });
    toast({ tone: "outcome", title: `Posting to #${r.channelName}`, body: "A first message was posted so you can see it works." });
    router.refresh();
  });
  return (
    <div className="space-y-4 text-sm">
      <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-[13px]">
        <dt className="text-ink/60">Workspace</dt><dd className="text-ink">{model.teamName ?? "—"}</dd>
        <dt className="text-ink/60">Channel</dt><dd className="text-ink">{model.channelName ? `#${model.channelName}` : "Not chosen yet"}</dd>
        <dt className="text-ink/60">Last post</dt><dd className="text-ink">{model.lastPostAt ? new Date(model.lastPostAt).toLocaleString() : "—"}</dd>
      </dl>
      {model.lastPostError && <p className="text-[12px] text-warning-text">{model.lastPostError === "channel" ? "The channel is gone or the app was removed from it. Choose another." : model.lastPostError === "auth" ? "Slack revoked the app's access. Reconnect Slack." : "The last post was refused. Try another channel or reconnect."}</p>}
      <div>
        <label htmlFor="slack-channel" className="block text-[11px] font-bold uppercase tracking-[0.12em] text-ink/65 mb-1.5">Post to</label>
        {loadError ? <p className="text-[12px] text-warning-text">{loadError}</p> : channels === null ? <p className="text-[12px] text-ink/60">Loading channels…</p> : channels.length === 0 ? <p className="text-[12px] text-ink/60">No public channels the app can see. Create one in Slack, then reopen this.</p> : (
          <select id="slack-channel" value={current} onChange={(e) => setCurrent(e.target.value)} className="w-full h-10 rounded-xl border border-border bg-white px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/40">
            <option value="">Choose a channel</option>
            {channels.map((c) => <option key={c.id} value={c.id}>#{c.name}{c.isMember ? "" : " (app will join)"}</option>)}
          </select>
        )}
      </div>
      <p className="text-[12px] text-ink/65">Daythread posts who wrote or booked and when, with a link back. It never posts what a customer said.</p>
      <Button size="sm" onClick={save} disabled={!current} loading={pending} loadingLabel="Saving">Save channel</Button>
    </div>
  );
}
