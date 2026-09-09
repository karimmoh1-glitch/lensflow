import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { Link, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../lib/auth-context";
import { describeError } from "../lib/api";
import { Button, Field, Screen } from "../components/ui";
import { radius, spacing, type, useTheme } from "../lib/theme";

/**
 * Sign up and the first questions, in one flow — the same answers the web's /start asks
 * for, saved by the same server code, so the dashboard is personalized whichever way
 * someone joins. Three short steps; nothing is required beyond the account itself.
 */
const USER_TYPES = [["freelancer", "Freelancer"], ["business_owner", "Business owner"], ["consultant", "Consultant"], ["creator", "Creator"], ["service_provider", "Service provider"], ["other", "Other"]] as const;
const WORK = [["photography", "Photography"], ["consulting", "Consulting"], ["home_services", "Home services"], ["beauty_wellness", "Beauty / wellness"], ["coaching", "Coaching"], ["design", "Design"], ["real_estate", "Real estate"], ["other", "Other"]] as const;
const STATUS = [["business", "Yes, I run a business"], ["team", "Yes, with a team"], ["solo", "I'm solo"], ["personal", "Just personal organization"]] as const;
const CHANNELS = [["email", "Email"], ["instagram", "Instagram"], ["whatsapp", "WhatsApp"], ["sms", "SMS"], ["website", "Website"]] as const;
const PAINS = [["messages", "Keeping up with messages"], ["follow_ups", "Missing follow-ups"], ["scheduling", "Scheduling"], ["bookings", "Managing bookings"], ["customer_info", "Customer details everywhere"]] as const;

function Options({ items, value, onChange, multi }: { items: readonly (readonly [string, string])[]; value: string[]; onChange: (v: string[]) => void; multi?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: spacing.sm }} accessibilityRole={multi ? undefined : "radiogroup"}>
      {items.map(([k, label]) => {
        const on = value.includes(k);
        return (
          <Pressable key={k} onPress={() => onChange(multi ? (on ? value.filter((x) => x !== k) : [...value, k]) : [k])} accessibilityRole={multi ? "checkbox" : "radio"} accessibilityState={{ checked: on }} accessibilityLabel={label} style={({ pressed }) => [{ minHeight: 48, borderRadius: radius.md, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: on ? c.accentSoft : c.card, borderWidth: 1, borderColor: on ? c.accent : c.border }, pressed && { opacity: 0.8 }]}>
            <Ionicons name={on ? (multi ? "checkbox" : "radio-button-on") : multi ? "square-outline" : "radio-button-off"} size={20} color={on ? c.accentText : c.inkFaint} />
            <Text style={{ ...type.bodyMedium, color: c.ink, flex: 1 }}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function SignupScreen() {
  const { signup } = useAuth();
  const { c } = useTheme();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [userType, setUserType] = useState<string[]>([]); const [work, setWork] = useState<string[]>([]); const [status, setStatus] = useState<string[]>([]);
  const [channels, setChannels] = useState<string[]>([]); const [pains, setPains] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null); const [pending, setPending] = useState(false);

  async function finish() {
    setError(null); setPending(true);
    try {
      const answers = userType[0] && work[0] && status[0] ? { userType: userType[0], workCategory: work[0], businessStatus: status[0], channels, painPoints: pains, desiredFeatures: ["inbox", "people"], currentTools: [], bookings: "sometimes", teamUsage: status[0] === "team" ? "regularly" : "no" } : undefined;
      await signup({ name: name.trim(), email: email.trim().toLowerCase(), password, answers });
      router.replace("/(tabs)/today");
    } catch (e) { setError(describeError(e)); setStep(0); }
    finally { setPending(false); }
  }
  const accountOk = name.trim().length > 0 && /\S+@\S+\.\S+/.test(email) && password.length >= 8;
  const titles = ["Create your account", "What do you do?", "How do people reach you?"];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen>
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: spacing.xl, paddingTop: spacing.xxl * 2 }} keyboardShouldPersistTaps="handled">
          <Text style={{ ...type.micro, color: c.inkFaint, textTransform: "uppercase", marginBottom: spacing.sm }}>Step {step + 1} of 3</Text>
          <Text accessibilityRole="header" style={{ ...type.title, color: c.ink, marginBottom: spacing.lg }}>{titles[step]}</Text>
          {step === 0 && (
            <>
              <Field label="Your name" value={name} onChangeText={setName} placeholder="Alex Rivera" autoComplete="name" textContentType="name" />
              <Field label="Email" autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" value={email} onChangeText={setEmail} placeholder="you@studio.com" />
              <Field label="Password" secureTextEntry textContentType="newPassword" value={password} onChangeText={setPassword} placeholder="At least 8 characters" hint="Your workspace is named after you; rename it any time in Settings." />
            </>
          )}
          {step === 1 && (
            <View style={{ gap: spacing.lg }}>
              <View><Text style={{ ...type.section, color: c.ink, marginBottom: spacing.sm }}>I'm a…</Text><Options items={USER_TYPES} value={userType} onChange={setUserType} /></View>
              <View><Text style={{ ...type.section, color: c.ink, marginBottom: spacing.sm }}>My work</Text><Options items={WORK} value={work} onChange={setWork} /></View>
              <View><Text style={{ ...type.section, color: c.ink, marginBottom: spacing.sm }}>Is this for a business?</Text><Options items={STATUS} value={status} onChange={setStatus} /></View>
            </View>
          )}
          {step === 2 && (
            <View style={{ gap: spacing.lg }}>
              <View><Text style={{ ...type.section, color: c.ink, marginBottom: spacing.sm }}>Channels you use</Text><Options items={CHANNELS} value={channels} onChange={setChannels} multi /></View>
              <View><Text style={{ ...type.section, color: c.ink, marginBottom: spacing.sm }}>What's hardest right now?</Text><Options items={PAINS} value={pains} onChange={setPains} multi /></View>
            </View>
          )}
          {error ? <Text accessibilityLiveRegion="polite" style={{ color: c.dangerText, fontSize: 14, marginVertical: spacing.md }}>{error}</Text> : null}
          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.xl }}>
            {step > 0 && <Button title="Back" variant="secondary" onPress={() => setStep(step - 1)} />}
            {step < 2 ? <Button title="Continue" onPress={() => setStep(step + 1)} disabled={step === 0 ? !accountOk : false} style={{ flex: 1 }} /> : <Button title="Create my workspace" onPress={finish} loading={pending} style={{ flex: 1 }} />}
          </View>
          {step > 0 && step < 2 && <Pressable onPress={() => setStep(2)} accessibilityRole="button" style={{ alignSelf: "center", minHeight: 44, justifyContent: "center", marginTop: spacing.sm }}><Text style={{ color: c.inkSoft, fontSize: 14 }}>Skip for now</Text></Pressable>}
          <View style={{ flexDirection: "row", justifyContent: "center", marginTop: spacing.lg, gap: 4, alignItems: "center", minHeight: 44 }}>
            <Text style={{ color: c.inkSoft, fontSize: 14 }}>Already have an account?</Text>
            <Link href="/login" replace accessibilityRole="link"><Text style={{ color: c.accentText, fontSize: 14, fontWeight: "700" }}>Sign in</Text></Link>
          </View>
        </ScrollView>
      </Screen>
    </KeyboardAvoidingView>
  );
}
