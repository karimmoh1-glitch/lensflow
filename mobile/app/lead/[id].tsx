import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../lib/auth-context";
import { api, ApiError } from "../../lib/api";
import { Badge, Button, Card, Screen, SectionLabel } from "../../components/ui";
import { colors, spacing } from "../../lib/theme";
import { addDays, format, isSameDay } from "date-fns";

type LeadDetail = {
  id: string;
  clientId: string;
  clientName: string;
  status: string;
  intent: string;
  score: number;
  scoreReasons: string[];
  service: { id: string; name: string; priceCents: number; durationMins: number } | null;
  requestedDateText: string | null;
  messages: { id: string; direction: "INBOUND" | "OUTBOUND"; body: string; createdAt: string }[];
};

type Slot = { start: string; end: string };

const NEXT_DAYS = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i + 1));

export default function LeadDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [booking, setBooking] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    const result = await api<LeadDetail>(`/api/mobile/leads/${id}`, { token: session.token });
    setLead(result);
  }, [session, id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function pickDay(day: Date) {
    if (!session) return;
    setSelectedDay(day);
    setSlots(null);
    setLoadingSlots(true);
    try {
      const result = await api<{ slots: Slot[] }>(`/api/mobile/leads/${id}/availability?date=${format(day, "yyyy-MM-dd")}`, {
        token: session.token,
      });
      setSlots(result.slots);
    } catch (e) {
      Alert.alert("Couldn't load availability", e instanceof ApiError ? e.message : "Try again.");
    } finally {
      setLoadingSlots(false);
    }
  }

  async function bookSlot(slot: Slot) {
    if (!session) return;
    setBooking(true);
    try {
      const result = await api<{ bookingId: string }>(`/api/mobile/leads/${id}/book`, {
        method: "POST",
        token: session.token,
        body: { startISO: slot.start },
      });
      router.replace(`/booking/${result.bookingId}?justBooked=1`);
    } catch (e) {
      Alert.alert("Couldn't create booking", e instanceof ApiError ? e.message : "Try again.");
    } finally {
      setBooking(false);
    }
  }

  if (!lead) {
    return (
      <Screen style={{ alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.ink} />
      </Screen>
    );
  }

  const lastInbound = lead.messages.filter((m) => m.direction === "INBOUND").slice(-1)[0];

  return (
    <Screen>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.xxl, paddingBottom: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text style={{ fontSize: 20, fontWeight: "700", color: colors.ink }}>{lead.clientName}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
        <Card style={{ marginBottom: spacing.md }}>
          <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm }}>
            <Badge tone={lead.intent === "HIGH" ? "accent" : lead.intent === "MEDIUM" ? "info" : "neutral"}>
              {lead.intent.charAt(0) + lead.intent.slice(1).toLowerCase()} intent
            </Badge>
            <Badge tone="neutral">Score {lead.score}</Badge>
          </View>
          {lead.service ? (
            <Text style={{ fontSize: 15, color: colors.ink, fontWeight: "600" }}>
              {lead.service.name} · ${(lead.service.priceCents / 100).toFixed(0)}
            </Text>
          ) : null}
          {lead.requestedDateText ? <Text style={{ fontSize: 13, color: colors.inkSoft, marginTop: 2 }}>Requested: {lead.requestedDateText}</Text> : null}
          {lastInbound ? (
            <View style={{ marginTop: spacing.md, backgroundColor: colors.paper, borderRadius: 10, padding: spacing.md }}>
              <Text style={{ fontSize: 14, color: colors.ink, lineHeight: 20 }}>&ldquo;{lastInbound.body}&rdquo;</Text>
            </View>
          ) : null}
        </Card>

        {lead.status === "BOOKED" ? (
          <Card>
            <Text style={{ color: colors.inkSoft, fontSize: 14 }}>This lead already has a booking.</Text>
          </Card>
        ) : !checkingAvailability ? (
          <Button title="Check Availability" onPress={() => setCheckingAvailability(true)} disabled={!lead.service} />
        ) : (
          <View>
            <SectionLabel>Pick a day</SectionLabel>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.lg }}>
              {NEXT_DAYS.map((day) => {
                const active = selectedDay && isSameDay(day, selectedDay);
                return (
                  <Pressable
                    key={day.toISOString()}
                    onPress={() => pickDay(day)}
                    style={{
                      width: 60,
                      alignItems: "center",
                      paddingVertical: 10,
                      borderRadius: 12,
                      marginRight: 8,
                      backgroundColor: active ? colors.ink : colors.white,
                      borderWidth: 1,
                      borderColor: active ? colors.ink : colors.border,
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: "600", color: active ? "rgba(255,255,255,0.7)" : colors.inkFaint }}>
                      {format(day, "EEE")}
                    </Text>
                    <Text style={{ fontSize: 17, fontWeight: "700", color: active ? colors.white : colors.ink, marginTop: 2 }}>
                      {format(day, "d")}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {loadingSlots ? (
              <ActivityIndicator color={colors.ink} />
            ) : slots ? (
              slots.length === 0 ? (
                <Text style={{ color: colors.inkSoft, fontSize: 14 }}>No open slots this day.</Text>
              ) : (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {slots.map((slot) => (
                    <Pressable
                      key={slot.start}
                      disabled={booking}
                      onPress={() => bookSlot(slot)}
                      style={({ pressed }) => [
                        {
                          paddingVertical: 10,
                          paddingHorizontal: 14,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: colors.border,
                          backgroundColor: colors.white,
                        },
                        pressed && { backgroundColor: colors.accentSoft, borderColor: colors.accent },
                      ]}
                    >
                      <Text style={{ fontSize: 14, fontWeight: "600", color: colors.ink }}>{format(new Date(slot.start), "h:mm a")}</Text>
                    </Pressable>
                  ))}
                </View>
              )
            ) : null}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
