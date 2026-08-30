import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../lib/auth-context";
import { api, ApiError } from "../../../lib/api";
import { Button, Card, Field, Screen } from "../../../components/ui";
import { colors, spacing } from "../../../lib/theme";
import { format } from "date-fns";

type BookingDetail = {
  client: { name: string };
  service: { name: string };
  deliveryUrl: string | null;
  deliveryNote: string | null;
  deliveredAt: string | null;
};

export default function DeliveryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

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

  async function deliver() {
    if (!session || !url) return;
    setSaving(true);
    try {
      await api(`/api/mobile/bookings/${id}/deliver`, { method: "POST", token: session.token, body: { url, note: note || undefined } });
      await load();
    } catch (e) {
      Alert.alert("Couldn't mark delivered", e instanceof ApiError ? e.message : "Enter a valid URL.");
    } finally {
      setSaving(false);
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
        <Text style={{ fontSize: 20, fontWeight: "700", color: colors.ink }}>Delivery</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: colors.ink }}>{booking.client.name}</Text>
          <Text style={{ fontSize: 14, color: colors.inkSoft, marginTop: 2 }}>{booking.service.name}</Text>
        </Card>

        {booking.deliveryUrl ? (
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.sm }}>
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <Text style={{ color: colors.successText, fontWeight: "600", fontSize: 14 }}>
                Delivered{booking.deliveredAt ? ` · ${format(new Date(booking.deliveredAt), "MMM d, yyyy")}` : ""}
              </Text>
            </View>
            {booking.deliveryNote ? <Text style={{ fontSize: 14, color: colors.ink, marginBottom: spacing.md }}>{booking.deliveryNote}</Text> : null}
            <Pressable
              onPress={() => Linking.openURL(booking.deliveryUrl!)}
              style={({ pressed }) => [
                { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.paper, borderRadius: 10, padding: spacing.md },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Ionicons name="images" size={18} color={colors.accentText} />
              <Text numberOfLines={1} style={{ color: colors.accentText, fontWeight: "600", fontSize: 14, flex: 1 }}>
                {booking.deliveryUrl}
              </Text>
              <Ionicons name="open-outline" size={16} color={colors.accentText} />
            </Pressable>
          </Card>
        ) : (
          <Card>
            <Text style={{ fontSize: 14, color: colors.inkSoft, marginBottom: spacing.md }}>
              Paste the gallery link once photos are edited — Pixieset, Google Drive, Dropbox, whatever this studio actually uses.
            </Text>
            <Field label="Gallery URL" autoCapitalize="none" keyboardType="url" value={url} onChangeText={setUrl} placeholder="https://drive.google.com/..." />
            <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="32 edited photos, high-res + web" />
            <Button title="Mark as delivered" onPress={deliver} loading={saving} disabled={!url} />
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}
