"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function NotesPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard/tasks");
  }, [router]);

  return (
    <div className="rounded-2xl border border-border bg-white p-6 text-sm text-muted">
      Redirecting to Tasks & Projects...
    </div>
  );
}
