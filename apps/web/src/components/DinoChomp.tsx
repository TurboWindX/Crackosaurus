// A small decorative hero animation: a T-rex chomping a conveyor of password
// hashes, occasionally spitting out a cracked plaintext. Pure inline SVG + CSS
// (keyframes live in tailwind.config.ts) so it ships no binary assets. All
// motion is gated behind `motion-safe:` so it respects prefers-reduced-motion.
//
// Colours are intentionally the default Tailwind palette (slate/emerald/green)
// rather than the shadcn theme tokens: the web app's Tailwind build does not
// generate the unprefixed token utilities (e.g. `bg-card`), so relying on them
// would leave the centrepiece unstyled.

// Real, well-known hashes for flavour — MD5 of "password", the empty-string NT
// hash (31d6…), MD5 of "test"/"123456", etc. Decorative only.
const HASHES = [
  "8846f7eaee8fb117ad06bdd830b7586c",
  "31d6cfe0d16ae931b73c59d7e0c089c0",
  "5f4dcc3b5aa765d61d8327deb882cf99",
  "098f6bcd4621d373cade4e832627b4f6",
  "e10adc3949ba59abbe56e057f20f883e",
  "482c811da5d5b4bc6d497ffa98491e38",
  "25f9e794323b453885f5181f1b624d0b",
  "d8578edf8458ce06fbc5bb76a58c5ca4",
];

// Plaintexts that "pop" out as the dino cracks a hash.
const CRACKED = ["password", "hunter2", "P@ssw0rd!"];

// One scrolling row of hashes. Two copies of the list sit side by side inside
// the animated track so the -50% translate loops seamlessly. `speed` varies the
// duration per row for a parallax feel.
const HashRow = ({ speed, className }: { speed: number; className?: string }) => (
  <div className={`flex whitespace-nowrap ${className ?? ""}`} aria-hidden>
    <div
      className="flex shrink-0 motion-safe:animate-hash-flow"
      style={{ animationDuration: `${speed}s` }}
    >
      {[...HASHES, ...HASHES].map((h, i) => (
        <span
          key={i}
          className="px-4 font-mono text-xs tracking-tight text-emerald-400/50 sm:text-sm"
        >
          {h}
        </span>
      ))}
    </div>
  </div>
);

export const DinoChomp = ({
  className,
  bare = false,
  "aria-hidden": ariaHidden = false,
}: {
  className?: string;
  // Drop the card chrome (border/rounded/background) — for full-bleed
  // backdrop use where the component fills a larger container.
  bare?: boolean;
  // Hide from assistive tech entirely when used as pure decoration.
  "aria-hidden"?: boolean;
}) => {
  const chrome = bare
    ? ""
    : "rounded-xl border border-slate-700/50 bg-slate-900/40";

  const a11y = ariaHidden
    ? { "aria-hidden": true as const }
    : {
        role: "img",
        "aria-label":
          "A cartoon T-rex chomping a stream of password hashes and cracking them into plaintext.",
      };

  return (
    <div
      className={`relative isolate overflow-hidden ${chrome} ${className ?? ""}`}
      {...a11y}
    >
      {/* Incoming stream of hashes, flowing right-to-left into the jaws. Masked
          so glyphs fade out exactly where the mouth is (left) and where they
          enter (right), making them appear to be devoured. */}
      <div
        className="pointer-events-none absolute inset-0 flex flex-col justify-center gap-2 py-4"
        style={{
          maskImage:
            "linear-gradient(to right, transparent 8%, black 22%, black 92%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent 8%, black 22%, black 92%, transparent 100%)",
        }}
      >
        <HashRow speed={16} />
        <HashRow speed={11} className="opacity-80" />
        <HashRow speed={19} className="opacity-60" />
        <HashRow speed={13} className="opacity-70" />
      </div>

      {/* Cracked plaintext bubbles popping out above the dino's head. Three
          share one spot with staggered delays so a single bubble appears to
          cycle through words. Hidden entirely under reduced motion, replaced by
          a static chip. */}
      <div className="pointer-events-none absolute left-[14%] top-3 -translate-x-1/2">
        {CRACKED.map((word, i) => (
          <div
            key={word}
            className="absolute -translate-x-1/2 opacity-0 motion-safe:animate-crack-pop motion-reduce:hidden"
            style={{ animationDelay: `${i * 1.4}s` }}
          >
            <span className="rounded-full border border-green-400/50 bg-green-500/15 px-2 py-0.5 font-mono text-xs text-green-300 shadow-sm">
              {word}
            </span>
          </div>
        ))}
        <span className="hidden -translate-x-1/2 rounded-full border border-green-400/50 bg-green-500/15 px-2 py-0.5 font-mono text-xs text-green-300 motion-reduce:inline-block">
          {CRACKED[0]}
        </span>
      </div>

      {/* The dino. Head-on profile facing right; the lower jaw group animates. */}
      <svg
        viewBox="0 0 240 200"
        className="relative z-10 h-full w-40 drop-shadow-md motion-safe:animate-float-y sm:w-52"
        aria-hidden
      >
        <defs>
          <linearGradient id="dinoBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4ade80" />
            <stop offset="100%" stopColor="#15803d" />
          </linearGradient>
        </defs>

        {/* Dark throat behind the jaws, so hashes vanish into shadow. */}
        <path d="M112 84 L198 80 L198 104 L112 108 Z" fill="#052e16" />

        {/* Lower jaw — hinges at the rear of the mouth. */}
        <g
          className="motion-safe:animate-chomp"
          style={{ transformBox: "fill-box", transformOrigin: "8% 10%" }}
        >
          <path
            d="M74 96 C70 94 70 91 78 91 L190 89 C198 89 200 96 193 100 C160 113 110 117 84 111 C74 108 72 100 74 96 Z"
            fill="url(#dinoBody)"
            stroke="#14532d"
            strokeWidth="2"
          />
          {/* tongue */}
          <ellipse cx="104" cy="103" rx="16" ry="6" fill="#ef4444" />
          {/* lower teeth (point up) */}
          {[98, 118, 138, 158, 178].map((x) => (
            <polygon
              key={x}
              points={`${x - 4},93 ${x + 4},93 ${x},83`}
              fill="#f8fafc"
            />
          ))}
        </g>

        {/* Upper head — static, drawn on top so it caps the hinge cleanly. */}
        <g>
          <path
            d="M35 72 C33 50 56 34 92 36 C128 38 152 46 196 66 C205 70 205 81 196 85 L86 92 C64 94 40 104 35 120 C31 106 31 86 35 72 Z"
            fill="url(#dinoBody)"
            stroke="#14532d"
            strokeWidth="2"
          />
          {/* eye */}
          <circle cx="88" cy="64" r="8" fill="#f8fafc" />
          <circle cx="91" cy="64" r="4" fill="#0f172a" />
          {/* nostril */}
          <ellipse cx="186" cy="72" rx="3" ry="2" fill="#14532d" />
          {/* upper teeth (point down) */}
          {[108, 128, 148, 168].map((x) => (
            <polygon
              key={x}
              points={`${x - 4},87 ${x + 4},87 ${x},97`}
              fill="#f8fafc"
            />
          ))}
        </g>
      </svg>
    </div>
  );
};
