import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { addDays, format, isSameDay } from "date-fns";
import { radius, spacing, type, useTheme } from "../lib/theme";
import { Button } from "./ui";

/** Pick a day, then one of the open slots the server returns for it. Used to book from a thread and to reschedule. */
export function SlotPicker({ load, onPick, busy, confirmLabel }: { load: (date: string) => Promise<Array<{ start: string; end: string }>>; onPick: (startISO: string) => void; busy: boolean; confirmLabel: string }) {
  const { c } = useTheme();
  const [day, setDay] = useState(addDays(new Date(), 1));
  const [slots, setSlots] = useState<Array<{ start: string; end: string }> | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const days = Array.from({ length: 21 }, (_, i) => addDays(new Date(), i + 1));
  useEffect(() => {
    let live = true; setSlots(null); setPicked(null); setError(null);
    load(format(day, "yyyy-MM-dd")).then((s) => { if (live) setSlots(s); }).catch((e) => { if (live) { setSlots([]); setError(e instanceof Error ? e.message : "Couldn't read that day."); } });
    return () => { live = false; };
  }, [day, load]);
  return (
    <View style={{ gap: spacing.sm }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6, alignItems: "flex-start" }} accessibilityRole="tablist">
        {days.map((d) => { const on = isSameDay(d, day); return (
          <Pressable key={d.toISOString()} onPress={() => setDay(d)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={format(d, "EEEE, MMMM d")} style={{ width: 52, minHeight: 56, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: on ? c.ink : c.card, borderWidth: 1, borderColor: on ? c.ink : c.border }}>
            <Text style={{ ...type.micro, color: on ? c.paper : c.inkFaint }}>{format(d, "EEE").toUpperCase()}</Text>
            <Text style={{ ...type.section, color: on ? c.paper : c.ink }}>{format(d, "d")}</Text>
          </Pressable>); })}
      </ScrollView>
      {slots === null ? <Text style={{ ...type.small, color: c.inkFaint }}>Checking {format(day, "EEEE")}…</Text> : error ? <Text style={{ ...type.small, color: c.warningText }}>{error}</Text> : slots.length === 0 ? <Text style={{ ...type.small, color: c.inkSoft }}>Nothing open on {format(day, "EEEE, MMMM d")}. Try another day.</Text> : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }} accessibilityRole="radiogroup">
          {slots.map((s) => { const on = picked === s.start; return (
            <Pressable key={s.start} onPress={() => setPicked(s.start)} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={format(new Date(s.start), "h:mm a")} style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: radius.full, justifyContent: "center", backgroundColor: on ? c.accentSoft : c.card, borderWidth: 1, borderColor: on ? c.accent : c.borderStrong }}>
              <Text style={{ ...type.bodyMedium, color: on ? c.accentText : c.ink }}>{format(new Date(s.start), "h:mm a")}</Text>
            </Pressable>); })}
        </View>
      )}
      {picked && <Button title={`${confirmLabel} · ${format(new Date(picked), "EEE, MMM d, h:mm a")}`} variant="accent" loading={busy} onPress={() => onPick(picked)} />}
    </View>
  );
}
