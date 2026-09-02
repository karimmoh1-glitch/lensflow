import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../lib/auth-context";
import { api, ApiError } from "../../../lib/api";
import { Button, Card, Screen, SectionLabel } from "../../../components/ui";
import { colors, spacing } from "../../../lib/theme";

type BookingDetail = { status: string; client: { name: string }; service: { name: string } };

const PIPELINE: { status: string; label: string }[] = [
  { status: "INQUIRY", label: "Inquiry" },
  { status: "BOOKED", label: "Booked" },
  { status: "DEPOSIT_PAID", label: "Deposit paid" },
  { status: "CONFIRMED", label: "Confirmed" },
  { status: "UPCOMING", label: "Upcoming" },
  { status: "COMPLETED", label: "Completed" },
  { status: "BALANCE_PAID", label: "Balance paid" },
];

export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [advancing, setAdvancing] = useState(false);

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

  const currentIndex = booking ? PIPELINE.findIndex((s) => s.status === booking.status) : -1;
  const nextStage = currentIndex >= 0 && currentIndex < PIPELINE.length - 1 ? PIPELINE[currentIndex + 1] : null;

  async function advance() {
    if (!session || !nextStage) return;
    setAdvancing(true);
    try {
      await api(`/api/mobile/bookings/${id}/advance`, { method: "POST", token: session.token, body: { status: nextStage.status } });
      await load();
    } catch (e) {
      Alert.alert("Couldn't update project", e instanceof ApiError ? e.message : "Try again.");
    } finally {
      setAdvancing(false);
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
        <Text style={{ fontSize: 20, fontWeight: "700", color: colors.ink }}>Project</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: colors.ink }}>{booking.client.name}</Text>
          <Text style={{ fontSize: 14, color: colors.inkSoft, marginTop: 2 }}>{booking.service.name}</Text>
        </Card>

        <SectionLabel>Pipeline</SectionLabel>
        <Card>
          {PIPELINE.map((step, i) => {
            const done = currentIndex >= 0 && i <= currentIndex;
            const isLast = i === PIPELINE.length - 1;
            return (
              <View key={step.status} style={{ flexDirection: "row", alignItems: "flex-start" }}>
                <View style={{ alignItems: "center", width: 24 }}>
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      backgroundColor: done ? colors.ink : colors.border,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {done && <Ionicons name="checkmark" size={13} color={colors.white} />}
                  </View>
                  {!isLast && <View style={{ width: 2, flex: 1, minHeight: 20, backgroundColor: done ? colors.ink : colors.border }} />}
                </View>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: done ? "600" : "400",
                    color: done ? colors.ink : colors.inkFaint,
                    marginLeft: spacing.sm,
                    marginBottom: isLast ? 0 : spacing.md,
                  }}
                >
                  {step.label}
                </Text>
              </View>
            );
          })}
        </Card>

        {nextStage && (
          <Button title={`Advance to "${nextStage.label}"`} onPress={advance} loading={advancing} style={{ marginTop: spacing.lg }} variant="secondary" />
        )}
      </ScrollView>
    </Screen>
  );
}
