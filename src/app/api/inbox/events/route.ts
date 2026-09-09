import { requireBusiness } from "@/lib/auth";
import { getInboxVersion, watchInboxVersion } from "@/server/inboxSignal";

/**
 * Server-sent events for the signed-in workspace: emits `version` whenever a message is
 * written or its delivery state changes. Cookie session only (the browser's EventSource
 * cannot set headers). Each stream lives under the platform's function limit and ends
 * cleanly; the browser reconnects on its own, and a `retry` hint keeps that gentle.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const STREAM_MS = 45_000;
const CHECK_MS = 2_500;

export async function GET(req: Request) {
  const ctx = await requireBusiness();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  const businessId = ctx.business.id;
  const url = new URL(req.url);
  const known = Number(url.searchParams.get("since"));
  const from = Number.isFinite(known) && known >= 0 ? known : await getInboxVersion(businessId);
  const encoder = new TextEncoder();
  const abort = new AbortController();
  req.signal?.addEventListener("abort", () => abort.abort());

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (s: string) => { try { controller.enqueue(encoder.encode(s)); } catch { abort.abort(); } };
      send(`retry: 1500\n`);
      send(`event: hello\ndata: ${from}\n\n`);
      // If the client is behind already, say so immediately.
      const current = await getInboxVersion(businessId);
      if (current !== from) send(`event: version\ndata: ${current}\n\n`);
      const heartbeat = setInterval(() => send(`: keep-alive\n\n`), 15_000);
      try {
        for await (const v of watchInboxVersion(businessId, { everyMs: CHECK_MS, maxMs: STREAM_MS, from: current, signal: abort.signal })) {
          send(`event: version\ndata: ${v}\n\n`);
        }
      } finally {
        clearInterval(heartbeat);
        try { controller.close(); } catch { /* already closed */ }
      }
    },
    cancel() { abort.abort(); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
