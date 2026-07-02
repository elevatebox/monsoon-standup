"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (res.ok) {
      router.push(params.get("next") || "/dashboard");
      router.refresh();
    } else {
      setError("That password is not right. Try again.");
    }
  }

  return (
    <div className="w-full max-w-sm">
      <p className="eyebrow mb-2">Monsoon</p>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-ink">
        Sign in
      </h1>
      <input
        type="password"
        value={password}
        autoFocus
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="Password"
        className="w-full rounded-xl border border-hair bg-surface px-4 py-3 text-ink outline-none focus:border-accent"
      />
      {error && <p className="mt-2 text-sm text-block">{error}</p>}
      <button
        onClick={submit}
        disabled={loading || !password}
        className="mt-4 w-full rounded-xl bg-accent px-4 py-3 font-medium text-white disabled:opacity-50"
      >
        {loading ? "Checking..." : "Continue"}
      </button>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-4">
      <Suspense fallback={<div className="text-sm text-muted">Loading...</div>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
