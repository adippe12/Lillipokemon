import type { Metadata } from "next";
import { StatsClient } from "./client";

export const metadata: Metadata = {
  title: "Dex stats — LILLIPEDEX",
  description:
    "LILLIPEDEX in numbers: species discovered over time, chat spots per day and the community totals — updated live.",
};

export default function StatsPage() {
  return <StatsClient />;
}
