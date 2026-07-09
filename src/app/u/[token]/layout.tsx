import { Chrome } from "@/components/chrome";

// A teammate's personal space: same sidebar as the admin dashboard, but every
// link stays under their own /u/<token> URL.
export default async function TeammateLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <Chrome base={`/u/${token}`}>{children}</Chrome>;
}
