import type { Metadata } from "next";
import { TWITCH_CHANNEL } from "@/lib/mons";
import { MonSprite } from "@/components/mon-sprite";
import { spriteBubbleBg } from "@/lib/sprite-bubble";
import {
  ArrowLeft,
  BookOpen,
  ExternalLink,
  FlaskConical,
  Heart,
  Image as ImageIcon,
  MessageCircle,
  PenLine,
  Radio,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Info — LILLIPEDEX",
  description:
    "How the live LILLIPEDEX works: how mons are born from Twitch chat, how to add research and artwork, and how every submission stays safe.",
};

const STEPS = [
  {
    icon: <MessageCircle className="h-5 w-5 text-primary" />,
    title: "Type it in chat",
    body: `Drop any word ending in "mon" into #${TWITCH_CHANNEL}'s chat: crazymon, latemon, luckymon… the sillier the better! The classic mons — sillymon, eepymon and sleepymon — work too.`,
  },
  {
    icon: <Radio className="h-5 w-5 text-pokedex-cyan" />,
    title: "The listener catches it",
    body: "A tiny 24/7 cloud listener reads every single message, even when nobody has this site open. If the site IS open you also get live toasts, a music-box chime and a little confetti party.",
  },
  {
    icon: <Sparkles className="h-5 w-5 text-pokedex-yellow" />,
    title: "The species is born",
    body: "A brand-new entry appears with the next free dex number and its own procedurally generated look. Your chat nickname is saved forever as the discoverer — proof that this mon is yours.",
  },
  {
    icon: <Heart className="h-5 w-5 text-primary" />,
    title: "It grows with every mention",
    body: "Each future mention bumps the mon's spotted counter, so the most beloved creatures climb the popularity chart inside their entry. Chat literally raises these mons together.",
  },
];

const FAQ = [
  {
    q: "Can I invent my own mon?",
    a: `Yes! Just type it in ${TWITCH_CHANNEL}'s chat: if the word ends in "mon" and isn't reserved, it becomes a brand-new species on the spot. Keep it friendly — rude words are filtered out.`,
  },
  {
    q: "Why didn't my word become a mon?",
    a: 'Most likely it is a reserved everyday word that just happens to end in "mon" — like lemon, salmon, demon, common, summon, cinnamon or pokemon — or it contains a filtered word. Try a sillier name!',
  },
  {
    q: "Do I need the site open to discover mons?",
    a: "No — the 24/7 listener catches everything and the dex keeps growing on its own. Opening the site just lets you enjoy the live celebrations: toasts, sounds, confetti and the CHAT BUZZ ticker.",
  },
  {
    q: "How do I get credit for research?",
    a: "When you propose a description or artwork, type the nickname you want to be credited under (up to 30 characters). It is saved with your submission and shown on the entry once the team approves it.",
  },
];

function SectionCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="candy-card p-6 sm:p-8">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary">
          {icon}
        </span>
        <h2 className="font-display text-lg font-extrabold text-foreground sm:text-xl">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function InfoPage() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* ---------- header ---------- */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 shadow-[0_2px_18px_rgba(240,107,168,0.07)] backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <a
            href="/"
            className="flex items-center gap-2.5 rounded-full transition hover:opacity-90"
            aria-label="LILLIPEDEX home"
          >
            <span className="flex items-end gap-1" aria-hidden>
              <Heart className="h-4 w-4 text-primary" fill="currentColor" />
              <Heart className="h-3 w-3 text-[#b9a7f2]" fill="currentColor" />
              <Heart className="h-2.5 w-2.5 text-[#7fd8be]" fill="currentColor" />
            </span>
            <h1 className="font-display text-lg font-extrabold tracking-wide text-foreground sm:text-xl">
              LILLI<span className="text-primary">PEDEX</span>
            </h1>
          </a>
          <a
            href="/"
            className="font-soft flex shrink-0 items-center gap-2 rounded-full border border-primary/25 bg-card px-4 py-1.5 text-sm font-bold text-foreground shadow-[0_2px_8px_rgba(240,107,168,0.08)] transition hover:border-primary/50 hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            back to the dex
          </a>
        </div>
      </header>

      {/* ---------- main ---------- */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-16">
        {/* intro */}
        <div className="cloud-panel relative mb-6 rounded-3xl px-5 py-6 sm:px-8 sm:py-8">
          <span className="bubble bubble-pink bob" style={{ width: 64, height: 64, top: -18, right: 40 }} aria-hidden />
          <span className="bubble bubble-mint bob" style={{ width: 40, height: 40, bottom: 16, left: -10, animationDelay: "1.4s" }} aria-hidden />
          <div className="relative z-10">
            <p className="font-soft flex items-center gap-1.5 text-sm font-bold text-primary">
              <BookOpen className="h-4 w-4" aria-hidden />
              the story of this little encyclopedia
            </p>
            <h2 className="font-display mt-2 text-2xl font-extrabold leading-snug text-foreground sm:text-3xl">
              A dex that <span className="text-primary">chat builds together</span>
            </h2>
            <p className="font-soft mt-3 text-base leading-relaxed font-semibold text-muted-foreground">
              LILLIPEDEX listens to twitch.tv/{TWITCH_CHANNEL}&apos;s chat and turns every creature-word
              into a real species — with its own dex number, auto-generated look and a spotted counter
              that grows with every mention. Nobody draws the list alone: discoveries, names and
              research all come from the community, one message at a time.
            </p>
            <div className="mt-4 flex items-end gap-4" aria-hidden>
              {["crazymon", "latemon", "luckymon"].map((w, i) => (
                <div
                  key={w}
                  className="floaty flex h-14 w-14 items-center justify-center rounded-full border-2 border-white shadow-[0_4px_10px_rgba(240,107,168,0.12)]"
                  style={{ background: spriteBubbleBg(w, w), animationDelay: `${i * 300}ms` }}
                >
                  <MonSprite name={w} seed={w} size={46} />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {/* how a mon is born */}
          <SectionCard icon={<Sparkles className="h-5 w-5 text-primary" />} title="How a mon is born">
            <ol className="space-y-4">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex items-start gap-3.5">
                  <span className="font-display flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-extrabold text-primary">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-soft flex flex-wrap items-center gap-2 text-[15px] font-extrabold text-foreground">
                      {s.title}
                      <span className="text-muted-foreground/70" aria-hidden>
                        {s.icon}
                      </span>
                    </h3>
                    <p className="font-soft mt-1 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </SectionCard>

          {/* community research */}
          <SectionCard icon={<FlaskConical className="h-5 w-5 text-pokedex-yellow" />} title="Make it yours: community research">
            <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
              <p className="font-soft font-semibold">
                Every entry is a little canvas. Open any mon in the dex and become its researcher:
              </p>
              <ul className="space-y-2.5">
                <li className="flex items-start gap-2.5">
                  <PenLine className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <span className="font-soft font-semibold">
                    <strong className="text-foreground">Write its story</strong> — propose a description up
                    to 280 characters: habits, mood, favourite snack, lore. Be creative!
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <ImageIcon className="mt-0.5 h-4 w-4 shrink-0 text-pokedex-cyan" aria-hidden />
                  <span className="font-soft font-semibold">
                    <strong className="text-foreground">Draw its portrait</strong> — upload artwork
                    (PNG, JPG, WebP or GIF, up to 2MB) and it becomes the official entry picture.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Heart className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <span className="font-soft font-semibold">
                    <strong className="text-foreground">Get credited</strong> — pick the nickname shown
                    next to your contribution once it is approved. You can research any mon, even one
                    discovered by someone else: adoption is love.
                  </span>
                </li>
              </ul>
            </div>
          </SectionCard>

          {/* safety */}
          <SectionCard icon={<ShieldCheck className="h-5 w-5 text-pokedex-cyan" />} title="Safe &amp; sound">
            <p className="font-soft text-sm leading-relaxed font-semibold text-muted-foreground">
              The dex is a friendly place, and it stays that way. Every proposal passes a word filter and
              lands in a review queue — nothing is published until the channel team approves it. Uploaded
              images are size- and type-checked, and they stay private until approved. Everyday words that
              merely end in &ldquo;mon&rdquo; (lemon, salmon, demon, pokemon…) are reserved and never become
              species, and unkind words are filtered out before they can hurt anyone. When in doubt, the
              team can gently rename or remove an entry.
            </p>
          </SectionCard>

          {/* faq */}
          <SectionCard icon={<MessageCircle className="h-5 w-5 text-[#8a6fd1]" />} title="Little questions">
            <div className="space-y-3">
              {FAQ.map((f) => (
                <details
                  key={f.q}
                  className="group rounded-2xl border border-border bg-secondary/50 px-4 py-3 transition-colors open:bg-secondary/80"
                >
                  <summary className="font-soft cursor-pointer list-none text-[15px] font-extrabold text-foreground [&::-webkit-details-marker]:hidden">
                    <span className="mr-2 inline-block text-primary transition-transform group-open:rotate-90" aria-hidden>
                      ›
                    </span>
                    {f.q}
                  </summary>
                  <p className="font-soft mt-2 pl-5 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
                </details>
              ))}
            </div>
          </SectionCard>

          {/* back to dex */}
          <div className="flex flex-col items-center gap-3 pt-2">
            <a
              href="/"
              className="font-soft flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-[0_6px_18px_rgba(240,107,168,0.35)] transition hover:bg-[#d5518d]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              back to the dex — say hi to the mons!
            </a>
            <a
              href={`https://twitch.tv/${TWITCH_CHANNEL}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-soft flex items-center gap-1.5 text-sm font-bold text-muted-foreground transition hover:text-primary"
            >
              visit twitch.tv/{TWITCH_CHANNEL} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          </div>
        </div>
      </main>

      {/* ---------- footer ---------- */}
      <footer className="mt-auto border-t border-border/70 bg-white/60">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 text-center">
          <p className="font-soft text-sm font-semibold text-muted-foreground">
            LILLIPEDEX — made with <Heart className="inline h-3.5 w-3.5 text-primary" fill="currentColor" /> for
            the {TWITCH_CHANNEL} community
          </p>
        </div>
      </footer>
    </div>
  );
}
