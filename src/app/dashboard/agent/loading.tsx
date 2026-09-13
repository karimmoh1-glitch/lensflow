import { ListSkeleton } from "@/components/skeletons";

export default function Loading() {
  return <ListSkeleton label="Loading the assistant" rows={4} action={false} />;
}
