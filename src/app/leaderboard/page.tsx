import type { Metadata } from "next";
import { LeaderboardClient } from "./client";

export const metadata: Metadata = {
  title: "Leaderboards — LILLIPEDEX",
  description:
    "The chat legends of LILLIPEDEX: top spotters, top discoverers, top researchers and the most beloved mons — live from lillimon_'s chat.",
};

export default function LeaderboardPage() {
  return <LeaderboardClient />;
}
