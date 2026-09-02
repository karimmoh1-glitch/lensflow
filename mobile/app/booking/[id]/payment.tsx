import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../lib/auth-context";
import { api, ApiError } from "../../../lib/api";
import { Badge, Button, Card, Row, Screen, SectionLabel } from "../../../components/ui";
import { colors, spacing } from "../../../lib/theme";

type Payment = { id: string; purpose: string; method: string; amountCents: number; status: string; reference: string | null };
type BookingDetail = {
  totalCents: number;
  depositCents: number;
  paidCents: number;
  remainingCents: number;
  payments: Payment[];
};

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function PaymentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    const result = await api<BookingDetail>(`/api/mobile/bookings/${id}`, { token: session.token });
    setBooking(result);
  }, [session, id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function markReceived(paymentId: string) {
    if (!session) return;
    setConfirming(paymentId);
    try {
      await api(`/api/mobile/payments/${paymentId}/confirm`, { method: "POST", token: session.token });
      await load();
    } catch (e) {
      Alert.alert("Couldn't confirm payment", e instanceof ApiError ? e.message : "Try again.");
    } finally {
      setConfirming(null);
    }
  }

  if (!booking) {
    return (
      <Screen style={{ alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.ink} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.xxl, paddingBottom: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text style={{ fontSize: 20, fontWeight: "700", color: colors.ink }}>Payment</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
        <Card style={{ marginBottom: spacing.lg }}>
          <Row style={{ marginBottom: spacing.sm }}>
            <Text style={{ color: colors.inkSoft, fontSize: 14 }}>Total</Text>
            <Text style={{ fontWeight: "600", fontSize: 14, color: colors.ink }}>{money(booking.totalCents)}</Text>
          </Row>
          <Row style={{ marginBottom: spacing.sm }}>
            <Text style={{ color: colors.inkSoft, fontSize: 14 }}>Paid</Text>
            <Text style={{ fontWeight: "600", fontSize: 14, color: colors.success }}>{money(booking.paidCents)}</Text>
          </Row>
          <Row>
            <Text style={{ color: colors.inkSoft, fontSize: 14 }}>Remaining</Text>
            <Text style={{ fontWeight: "700", fontSize: 15, color: booking.remainingCents > 0 ? colors.warning : colors.success }}>
              {money(booking.remainingCents)}
            </Text>
          </Row>
        </Card>

        <SectionLabel>Payment history</SectionLabel>
        {booking.payments.length === 0 ? (
          <Text style={{ color: colors.inkSoft, fontSize: 14 }}>No payments recorded yet.</Text>
        ) : (
          booking.payments.map((p) => (
            <Card key={p.id} style={{ marginBottom: spacing.sm }}>
              <Row>
                <View>
                  <Text style={{ fontSize: 15, fontWeight: "600", color: colors.ink, textTransform: "capitalize" }}>
                    {p.purpose.toLowerCase()} · {p.method.toLowerCase().replace("_", " ")}
                  </Text>
                  {p.reference ? <Text style={{ fontSize: 12, color: colors.inkFaint, marginTop: 2 }}>Ref {p.reference}</Text> : null}
                  <Text style={{ fontSize: 15, fontWeight: "700", color: colors.ink, marginTop: 4 }}>{money(p.amountCents)}</Text>
                </View>
                <Badge tone={p.status === "PAID" ? "success" : p.status === "FAILED" ? "danger" : "warning"}>
                  {p.status.replace("_", " ").toLowerCase()}
                </Badge>
              </Row>
              {p.status === "AWAITING_CONFIRMATION" && (
                <Button
                  title="Mark as received"
                  variant="secondary"
                  loading={confirming === p.id}
                  onPress={() => markReceived(p.id)}
                  style={{ marginTop: spacing.md }}
                />
              )}
            </Card>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}
