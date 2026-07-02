import { env } from "@/lib/env";

// The Dev lane. Reads commit activity from the product repo (GITHUB_REPO only,
// nothing else) so the dashboard shows what the developers shipped without
// anyone typing a status. Read-only.

export interface DevAuthor {
  name: string;
  commits: number;
  lastAt: string;
  recent: { message: string; at: string; url: string }[];
}

export interface DevActivity {
  connected: boolean;
  repo: string;
  days: number;
  total: number;
  authors: DevAuthor[];
}

export async function getDevActivity(days = 7): Promise<DevActivity> {
  const repo = env.GITHUB_REPO;
  const base: DevActivity = { connected: false, repo, days, total: 0, authors: [] };
  if (!env.GITHUB_TOKEN) return base;

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/commits?since=${since}&per_page=100`,
      {
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
        },
        cache: "no-store",
      }
    );
    if (!res.ok) return { ...base, connected: true };

    const commits = (await res.json()) as Array<{
      html_url?: string;
      commit?: { message?: string; author?: { name?: string; date?: string } };
      author?: { login?: string };
    }>;

    const byAuthor = new Map<string, DevAuthor>();
    for (const c of commits) {
      const name = c.commit?.author?.name ?? c.author?.login ?? "unknown";
      const at = c.commit?.author?.date ?? "";
      const message = (c.commit?.message ?? "").split("\n")[0];
      const a =
        byAuthor.get(name) ?? { name, commits: 0, lastAt: at, recent: [] };
      a.commits++;
      if (at > a.lastAt) a.lastAt = at;
      // Commits come newest-first, so the first few we see are the latest.
      if (a.recent.length < 5) a.recent.push({ message, at, url: c.html_url ?? "" });
      byAuthor.set(name, a);
    }

    const authors = [...byAuthor.values()].sort((x, y) => y.commits - x.commits);
    return { connected: true, repo, days, total: commits.length, authors };
  } catch {
    return { ...base, connected: true };
  }
}
