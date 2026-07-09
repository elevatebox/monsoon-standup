import { User } from "@/lib/db/types";

// Everyone on the team gets the full founder view: the whole board, create
// task, add teammate. Add a `sees_all` boolean column on users and set it to
// false if you ever want to give someone a restricted own-tasks-only view.
export function seesAllTasks(user: User): boolean {
  return (user as { sees_all?: boolean }).sees_all !== false;
}
