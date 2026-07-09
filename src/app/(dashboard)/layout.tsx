import { Chrome } from "@/components/chrome";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Chrome>{children}</Chrome>;
}
