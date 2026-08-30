import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../lib/auth-context";
import { api } from "../../../lib/api";
import { Badge, Card, Screen } from "../../../components/ui";
import { colors, spacing } from "../../../lib/theme";
import { format } from "date-fns";

type BookingDetail = {
  id: string;
  status: string;
  startAt: string;
  client: { name: string };
  service: { name: string };
  totalCents: number;
  depositCents: number;
  paidCents: number;
  remainingCents: number;
  payments: { status: string }[];
  deliveryUrl: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  INQUIRY: "Inquiry",
  BOOKED: "Booked",
  DEPOSIT_PAID: "Deposit paid",
  CONFIRMED: "Confirmed",
  QUESTIONNAIRE_COMPLETE: "Questionnaire complete",
  UPCOMING: "Upcoming",
  COMPLETED: "Completed",
  BALANCE_PAID: "Balance paid",
  FOLLOWED_UP: "Followed up",
  CANCELED: "Canceled",
};

function money(cents: number) {
  return `$${(cents / 100).toFixed(0)}`;
}

export default function BookingHubScreen() {
  const { id, justBooked } = useLocalSearchParams<{ id: string; justBooked?: string }>();
  const { session } = useAuth();
  const [booking, setBooking] = useState<BookingDetail | null>(null);

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

  if (!booking) {
    return (
      <Screen style={{ alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.ink} />
      </Screen>
    );
  }

  const paymentPending = booking.payments.some((p) => p.status === "AWAITING_CONFIRMATION");

  return (
    <Screen>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.xxl, paddingBottom: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <Pressable onPress={() => router.replace("/home")} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text style={{ fontSize: 20, fontWeight: "700", color: colors.ink }}>Booking</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
        {justBooked === "1" && (
          <Card style={{ marginBottom: spacing.md, backgroundColor: colors.successSoft, borderColor: colors.success }}>
            <Text style={{ color: colors.successText, fontWeight: "700", fontSize: 15 }}>Booking confirmed ✓</Text>
            <Text style={{ color: colors.successText, fontSize: 13, marginTop: 2 }}>
              {booking.client.name} is on the calendar for {format(new Date(booking.startAt), "EEEE, MMM d 'at' h:mm a")}.
            </Text>
          </Card>
        )}

        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={{ fontSize: 18, fontWeight: "700", color: colors.ink }}>{booking.client.name}</Text>
          <Text style={{ fontSize: 14, color: colors.inkSoft, marginTop: 2 }}>{booking.service.name}</Text>
          <Text style={{ fontSize: 14, color: colors.inkSoft, marginTop: 2 }}>{format(new Date(booking.startAt), "EEEE, MMMM d · h:mm a")}</Text>
        </Card>

        <NavRow
          icon="card-outline"
          title="Payment"
          subtitle={`${money(booking.paidCents)} of ${money(booking.totalCents)} collected`}
          badge={paymentPending ? { tone: "warning", label: "Awaiting" } : { tone: "success", label: "Paid" }}
          onPress={() => router.push(`/booking/${id}/payment`)}
        />
        <NavRow
          icon="briefcase-outline"
          title="Project"
          subtitle={STATUS_LABEL[booking.status] ?? booking.status}
          badge={{ tone: "info", label: STATUS_LABEL[booking.status] ?? booking.status }}
          onPress={() => router.push(`/booking/${id}/project`)}
        />
        <NavRow
          icon="images-outline"
          title="Delivery"
          subtitle={booking.deliveryUrl ? "Gallery delivered" : "Not delivered yet"}
          badge={booking.deliveryUrl ? { tone: "success", label: "Delivered" } : { tone: "neutral", label: "Pending" }}
          onPress={() => router.push(`/booking/${id}/delivery`)}
        />
      </ScrollView>
    </Screen>
  );
}

function NavRow({
  icon,
  title,
  subtitle,
  badge,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  badge: { tone: "success" | "warning" | "info" | "neutral"; label: string };
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
      <Card style={{ marginBottom: spacing.sm, flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.paper, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name={icon} size={19} color={colors.ink} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: colors.ink }}>{title}</Text>
          <Text style={{ fontSize: 13, color: colors.inkSoft, marginTop: 1 }}>{subtitle}</Text>
        </View>
        <Badge tone={badge.tone}>{badge.label}</Badge>
        <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
      </Card>
    </Pressable>
  );
}
