import { ListSkeleton } from "@/components/skeletons";

export default function Loading() {
  return <ListSkeleton label="Loading automations" rows={4} />;
}
