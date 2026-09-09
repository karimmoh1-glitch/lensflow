import { useState } from "react";
import { Alert, Linking, RefreshControl, ScrollView, Text, View } from "react-native";
import { useAuth } from "../../lib/auth-context";
import { api, describeError } from "../../lib/api";
import { useResource } from "../../lib/cache";
import { Badge, Button, Card, Chip, ErrorState, Header, Note, Screen, Skeleton } from "../../components/ui";
import { spacing, type, useTheme } from "../../lib/theme";

type Data = { plan: string; planName: string; billingStatus: string | null; comped: boolean; trialEligible: boolean; trialEndsAt: string | null; currentPeriodEnd: string | null; limits: { seats: number | null; automations: number | null }; canManage: boolean; manageUrl: string };
const PLANS: Array<{ key: "PRO" | "BUSINESS"; name: string; monthly: string; yearly: string; blurb: string }> = [
  { key: "PRO", name: "Pro", monthly: "$29/mo", yearly: "$290/yr", blurb: "AI drafts and summaries, the assistant, every channel, automations, a text number, 5 seats." },
  { key: "BUSINESS", name: "Business", monthly: "$79/mo", yearly: "$790/yr", blurb: "Everything in Pro with 10 seats and unlimited automations." },
];

/** Your plan, from the record Stripe's webhook wrote. Upgrading and managing billing open Stripe's own pages in the browser; nothing about a card touches the app. */
export default function SubscriptionScreen() {
  const { session } = useAuth();
  const { c } = useTheme();
  const r = useResource<Data>("subscription", "/api/mobile/subscription", session?.token);
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [busy, setBusy] = useState<string | null>(null);
  const d = r.data;
  const status = d?.comped ? "Complimentary" : d?.billingStatus === "ACTIVE" ? "Active" : d?.billingStatus === "TRIALING" ? "Trial" : d?.billingStatus === "PAST_DUE" ? "Payment overdue" : d?.billingStatus === "CANCELED" ? "Canceled" : d?.plan === "FREE" ? "Free" : d?.billingStatus ?? "";
  async function go(body: Record<string, unknown>, key: string) {
    if (!session) return;
    setBusy(key);
    try { const res = await api<{ url?: string | null; changed?: boolean }>("/api/mobile/billing", { method: "POST", body, token: session.token }); if (res.changed) { await r.reload(); Alert.alert("Plan changed", "Your subscription was updated in place."); } else if (res.url) await Linking.openURL(res.url); }
    catch (e) { Alert.alert("Not available", describeError(e)); }
    finally { setBusy(null); }
  }
  return (
    <Screen>
      <Header back title="Subscription" />
      {r.loading && !d ? <Skeleton lines={3} /> : !d ? <ErrorState message={r.error ?? "Couldn't load your plan."} onRetry={r.reload} /> : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }} refreshControl={<RefreshControl refreshing={r.refreshing} onRefresh={r.refresh} tintColor={c.ink} />}>
          <Card>
            <Text style={{ ...type.micro, color: c.inkFaint, textTransform: "uppercase" }}>Your plan</Text>
            <Text style={{ ...type.title, color: c.ink, marginTop: 4 }}>{d.planName}</Text>
            <Badge tone={d.billingStatus === "PAST_DUE" ? "warning" : d.comped || d.billingStatus === "ACTIVE" || d.billingStatus === "TRIALING" ? "success" : "neutral"}>{status}</Badge>
            {d.trialEndsAt && d.billingStatus === "TRIALING" && <Text style={{ ...type.small, color: c.inkSoft, marginTop: 8 }}>Trial ends {new Date(d.trialEndsAt).toLocaleDateString()}.</Text>}
            {d.currentPeriodEnd && d.billingStatus === "ACTIVE" && <Text style={{ ...type.small, color: c.inkSoft, marginTop: 8 }}>Renews {new Date(d.currentPeriodEnd).toLocaleDateString()}.</Text>}
            <Text style={{ ...type.small, color: c.inkSoft, marginTop: 8 }}>{d.limits.seats ? `${d.limits.seats} seats` : "Unlimited seats"} · {d.limits.automations ? `${d.limits.automations} automations` : "unlimited automations"}</Text>
          </Card>
          {d.billingStatus === "PAST_DUE" && <Note tone="warning">A payment didn't go through. Everything keeps working while you update the card.</Note>}
          {d.canManage ? (
            <>
              {(d.billingStatus === "ACTIVE" || d.billingStatus === "TRIALING" || d.billingStatus === "PAST_DUE") && !d.comped && <Button title="Manage billing" icon="open-outline" loading={busy === "portal"} onPress={() => go({ kind: "portal" }, "portal")} />}
              {!d.comped && (
                <>
                  <View style={{ flexDirection: "row", gap: 6 }}><Chip label="Monthly" active={interval === "month"} onPress={() => setInterval("month")} /><Chip label="Yearly" active={interval === "year"} onPress={() => setInterval("year")} /></View>
                  {PLANS.filter((p) => p.key !== d.plan).map((p) => (
                    <Card key={p.key}>
                      <Text style={{ ...type.section, color: c.ink }}>{p.name} <Text style={{ ...type.small, color: c.inkSoft }}>{interval === "month" ? p.monthly : p.yearly}</Text></Text>
                      <Text style={{ ...type.small, color: c.inkSoft, marginTop: 4, lineHeight: 18 }}>{p.blurb}</Text>
                      <Button small variant="accent" style={{ marginTop: 10, alignSelf: "flex-start" }} title={d.plan === "FREE" && d.trialEligible ? `Start a 7-day trial of ${p.name}` : d.plan === "FREE" ? `Choose ${p.name}` : d.plan === "PRO" && p.key === "BUSINESS" ? "Upgrade to Business" : "Switch to Pro"} loading={busy === p.key} onPress={() => go({ kind: "checkout", plan: p.key, interval, trial: d.plan === "FREE" && d.trialEligible }, p.key)} />
                      {d.plan === "FREE" && d.trialEligible && <Text style={{ ...type.small, color: c.inkFaint, marginTop: 6 }}>Card required; the first charge and its date are shown before you confirm on Stripe's page.</Text>}
                    </Card>
                  ))}
                </>
              )}
              {d.comped && <Note tone="success">This workspace has complimentary access. Nothing to pay.</Note>}
            </>
          ) : <Note>The workspace owner manages the subscription.</Note>}
          <Text style={{ ...type.small, color: c.inkFaint }}>Billing runs on Stripe's own pages; nothing about your card is stored or entered here.</Text>
        </ScrollView>
      )}
    </Screen>
  );
}
