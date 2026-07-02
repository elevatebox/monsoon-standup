import { User } from "@/lib/db/types";

// Who sees the WHOLE team's tasks (founders/admins). Everyone else sees only
// their own tasks on their board. Kept as a simple name list so there is no
// visible "founder/co-founder" label on anyone; a `sees_all` column overrides
// it if you ever add one.
const SEES_ALL_NAMES = ["Charan", "Abhishek"];

export function seesAllTasks(user: User): boolean {
  return (
    (user as { sees_all?: boolean }).sees_all === true ||
    SEES_ALL_NAMES.includes(user.name)
  );
}
