import { EmptyPanel } from "@/components/Notices";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-3xl px-6 pt-16">
      <EmptyPanel title="Off the radar" message="The page you're looking for doesn't exist." />
    </div>
  );
}
