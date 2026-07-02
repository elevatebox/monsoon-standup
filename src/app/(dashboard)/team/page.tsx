import { listUsers } from "@/lib/db/queries";
import { env } from "@/lib/env";
import { TeamManager } from "@/components/team-manager";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const users = await listUsers();
  const botUsername = env.TELEGRAM_BOT_USERNAME || "";
  const appUrl = env.APP_URL.replace(/\/$/, "");
  return (
    <div className="max-w-2xl">
      <p className="eyebrow mb-1">People</p>
      <h1 className="mb-2 font-serif text-2xl font-semibold tracking-tight">Team</h1>
      <p className="mb-6 max-w-xl text-sm text-muted">
        Add each teammate and choose how the agent reaches them. Telegram is free
        and instant but needs a one-time Start (send them their connect link).
        Email needs no setup on their side, just an address. Auto uses Telegram
        when it is linked, otherwise email.
      </p>
      <TeamManager
        initialUsers={users}
        botUsername={botUsername}
        appUrl={appUrl}
      />
    </div>
  );
}
