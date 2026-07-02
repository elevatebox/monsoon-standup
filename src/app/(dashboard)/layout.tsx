import Link from "next/link";
import { LogoutButton } from "@/components/logout";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="mx-auto flex max-w-6xl gap-8 px-5 py-8">
        <aside className="hidden w-44 shrink-0 md:block">
          <div className="sticky top-8">
            <Link
              href="/dashboard"
              className="block font-serif text-xl font-semibold tracking-tight"
            >
              Monsoon
            </Link>
            <nav className="mt-6 flex flex-col gap-1 text-sm">
              <NavLink href="/dashboard" label="Dashboard" />
              <NavLink href="/board" label="Board" />
              <NavLink href="/tasks/new" label="New task" />
              <NavLink href="/team" label="Team" />
            </nav>
            <div className="mt-10">
              <LogoutButton />
            </div>
          </div>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-lg px-3 py-2 text-muted hover:bg-surface hover:text-ink"
    >
      {label}
    </Link>
  );
}
