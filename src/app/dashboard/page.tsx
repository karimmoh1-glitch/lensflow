import { redirect } from "next/navigation";

/** The product is the inbox. */
export default function DashboardIndex() {
  redirect("/dashboard/inbox");
}
