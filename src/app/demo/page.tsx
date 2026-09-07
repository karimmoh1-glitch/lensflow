import { redirect } from "next/navigation";

/** The scripted demo workspace belonged to the old product. Try the real thing instead. */
export default function DemoPage() {
  redirect("/signup");
}
