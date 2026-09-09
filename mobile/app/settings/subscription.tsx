import { Linking, RefreshControl, ScrollView, Text } from "react-native";
import { useAuth } from "../../lib/auth-context";
import { useResource } from "../../lib/cache";
import { Badge, Button, Card, ErrorState, Header, Note, Screen, Skeleton } from "../../components/ui";
import { spacing, type, useTheme } from "../../lib/theme";

type Data = { plan: string; planName: string; billingStatus: string | null; comped: boolean; trialEligible: boolean; trialEndsAt: string | null; currentPeriodEnd: string | null; limits: { seats: number | null; automations: number | null }; canManage: boolean; manageUrl: string };

/** Where the workspace stands with billing. Changing plans happens on the web, on Stripe's own pages. */
export default function SubscriptionScreen() {
  const { session } = useAuth();
  const { c } = useTheme();
  const r = useResource<Data>("subscription", "/api/mobile/subscription", session?.token);
  const d = r.data;
  const status = d?.comped ? "Complimentary" : d?.billingStatus === "ACTIVE" ? "Active" : d?.billingStatus === "TRIALING" ? "Trial" : d?.billingStatus === "PAST_DUE" ? "Payment overdue" : d?.billingStatus === "CANCELED" ? "Canceled" : d?.plan === "FREE" ? "Free" : d?.billingStatus ?? "";
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
          {d.billingStatus === "PAST_DUE" && <Note tone="warning">A payment didn't go through. Everything keeps working while you update the card on the web.</Note>}
          {d.canManage ? <Button title={d.plan === "FREE" ? (d.trialEligible ? "Start a free trial on the web" : "See plans on the web") : "Manage billing on the web"} onPress={() => Linking.openURL(d.manageUrl)} icon="open-outline" /> : <Note>The workspace owner manages the subscription.</Note>}
          <Text style={{ ...type.small, color: c.inkFaint }}>Billing runs on Stripe's own pages; nothing about your card is stored or entered here.</Text>
        </ScrollView>
      )}
    </Screen>
  );
}
