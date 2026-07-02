import {
  getUserByOnboardingToken,
  listAssignments,
  listUsers,
} from "@/lib/db/queries";
import { getDevActivity } from "@/lib/dev/github";
import { seesAllTasks } from "@/lib/visibility";
import { env } from "@/lib/env";
import { TeammateView } from "@/components/teammate-view";
import { FounderView } from "@/components/founder-view";

// A teammate's personal, no-login workspace. Middleware has already dropped the
// token into the sa_user_token cookie; here we resolve it to a user and render
// the shared board. An unknown token shows a friendly dead-end, not the board.
export const dynamic = "force-dynamic";

export default async function TeammatePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const user = await getUserByOnboardingToken(token);

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-5 py-24 text-center">
        <h1 className="font-serif text-xl font-semibold text-ink">
          This link isn&apos;t valid
        </h1>
        <p className="mt-2 text-sm text-muted">
          Ask your admin to send you a fresh personal link.
        </p>
      </div>
    );
  }

  const seesAll = seesAllTasks(user);
  const appUrl = env.APP_URL.replace(/\/$/, "");
  const botUsername = env.TELEGRAM_BOT_USERNAME || "";
  const [all, users] = await Promise.all([listAssignments(), listUsers()]);

  // Founders (Charan, Abhishek) get the full stat dashboard over the whole team.
  if (seesAll) {
    const dev = await getDevActivity(14);
    return (
      <FounderView
        user={user}
        assignments={all}
        users={users}
        dev={dev}
        appUrl={appUrl}
        botUsername={botUsername}
      />
    );
  }

  // Everyone else sees only their own tasks, on a board.
  const assignments = all.filter((a) => a.user_id === user.id);
  return (
    <TeammateView
      user={user}
      assignments={assignments}
      users={users}
      seesAll={seesAll}
      appUrl={appUrl}
      botUsername={botUsername}
    />
  );
}
