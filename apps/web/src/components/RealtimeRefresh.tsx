"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

/** Rafraîchit les données serveur quand prospects, brouillons, validations, missions, journal ou messages changent. */
export function RealtimeRefresh({ tables = ["prospect_ventures", "drafts", "approvals", "missions", "actions", "messages"] }: { tables?: string[] }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = supabaseBrowser();
    let channel = supabase.channel("gyna-refresh");
    for (const table of tables) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => router.refresh(), 600);
      });
    }
    channel.subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [router, tables.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
