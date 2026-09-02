"use client";

import {
  Flame,
  Droplets,
  Leaf,
  Zap,
  Snowflake,
  Moon,
  Sparkles,
  Mountain,
  Wind,
  Sun,
} from "lucide-react";
import { monTypeOf } from "@/lib/mons";
import { cn } from "@/lib/utils";

const TYPE_ICONS = [Flame, Droplets, Leaf, Zap, Snowflake, Moon, Sparkles, Mountain, Wind, Sun];

/**
 * Cosmetic, deterministic "element type" chip (Ember, Tide, Leaf…).
 * Derived purely from the species name, so it matches everywhere the name goes.
 */
export function MonTypeChip({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const t = monTypeOf(name);
  const Icon = TYPE_ICONS[t.index];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-soft text-[12px] leading-none",
        className
      )}
      style={{
        color: t.color,
        borderColor: `${t.color}55`,
        backgroundColor: `${t.color}14`,
      }}
      title={`${t.label} type`}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {t.label}
    </span>
  );
}
