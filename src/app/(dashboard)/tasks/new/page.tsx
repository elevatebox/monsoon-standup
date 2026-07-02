import { listUsers } from "@/lib/db/queries";
import { NewTaskForm } from "@/components/new-task-form";

export const dynamic = "force-dynamic";

export default async function NewTaskPage() {
  const users = await listUsers();
  return (
    <div className="max-w-xl">
      <p className="eyebrow mb-1">Create</p>
      <h1 className="mb-6 font-serif text-2xl font-semibold tracking-tight">New task</h1>
      <NewTaskForm users={users} creatorName="Charan" />
    </div>
  );
}
