import { ListSkeleton } from "@/components/skeletons";

export default function Loading() {
  return <ListSkeleton label="Loading payments" rows={5} action={false} />;
}
