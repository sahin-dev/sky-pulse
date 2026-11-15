import { Cloud, Droplets, Eye, Gauge, PlaneLanding, PlaneTakeoff, Thermometer, Wind } from "lucide-react";
import clsx from "clsx";
import { formatAgo } from "@/lib/time";
import type { AirportWeather, Metar } from "@/lib/types";

/* ------------------------------ decoding ------------------------------ */

const CATEGORY: Record<NonNullable<Metar["category"]>, { label: string; cls: string; help: string }> = {
  VFR: { label: "VFR", cls: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/30", help: "Visual flight rules — good visibility and high or no clouds." },
  MVFR: { label: "MVFR", cls: "bg-sky-400/10 text-sky-300 ring-sky-400/30", help: "Marginal VFR — ceiling 1,000–3,000 ft or visibility 5–8 km." },
  IFR: { label: "IFR", cls: "bg-rose-400/10 text-rose-300 ring-rose-400/30", help: "Instrument flight rules — ceiling 500–1,000 ft or visibility 1.6–5 km." },
  LIFR: { label: "LIFR", cls: "bg-fuchsia-400/10 text-fuchsia-300 ring-fuchsia-400/30", help: "Low IFR — ceiling below 500 ft or visibility under 1.6 km." },
};

const COVER: Record<string, string> = {
  FEW: "Few",
  SCT: "Scattered",
  BKN: "Broken",
  OVC: "Overcast",
  VV: "Obscured",
  CLR: "Clear",
  SKC: "Clear",
  NSC: "No significant cloud",
  NCD: "No cloud",
  CAVOK: "Clear (CAVOK)",
};

const WX: Record<string, string> = {
  DZ: "drizzle", RA: "rain", SN: "snow", SG: "snow grains", PL: "ice pellets", GR: "hail", GS: "small hail",
  BR: "mist", FG: "fog", FU: "smoke", VA: "volcanic ash", DU: "dust", SA: "sand", HZ: "haze",
  SQ: "squalls", FC: "funnel cloud", SS: "sandstorm", DS: "duststorm", PO: "dust whirls", UP: "unknown precipitation",
};
/** Descriptors used on their own (e.g. "VCSH" = showers nearby, "TS" = thunderstorm). */
const DESCRIPTOR_ALONE: Record<string, string> = { TS: "thunderstorm", SH: "showers" };
const DESCRIPTOR: Record<string, string> = {
  TS: "thunderstorm", SH: "showers of", FZ: "freezing", BL: "blowing", DR: "drifting", MI: "shallow", BC: "patches of", PR: "partial",
};

/** "-RA BR" → "Light rain, mist"; "+TSRA" → "Heavy thunderstorm rain"; "VCSH" → "Showers nearby". */
export function decodeWeather(wx: string | null): string | null {
  if (!wx) return null;
  const parts = wx.split(/\s+/).map((token) => {
    let t = token;
    let intensity = "";
    let nearby = false;
    if (t.startsWith("-")) [intensity, t] = ["light ", t.slice(1)];
    else if (t.startsWith("+")) [intensity, t] = ["heavy ", t.slice(1)];
    if (t.startsWith("VC")) [nearby, t] = [true, t.slice(2)];
    const words: string[] = [];
    for (let i = 0; i + 2 <= t.length; i += 2) {
      const code = t.slice(i, i + 2);
      const last = i + 2 >= t.length;
      words.push((last && DESCRIPTOR_ALONE[code]) || DESCRIPTOR[code] || WX[code] || code);
    }
    const phrase = `${intensity}${words.join(" ")}`.trim();
    return nearby ? `${phrase} nearby` : phrase;
  });
  const text = parts.filter(Boolean).join(", ");
  return text ? text[0].toUpperCase() + text.slice(1) : null;
}

function cloudSummary(m: Metar): string {
  if (!m.clouds.length) {
    // An empty layer list can mean several different things — the raw report says which.
    if (/\bCAVOK\b/.test(m.raw)) return "Clear (CAVOK)";
    if (/\bNSC\b/.test(m.raw)) return "No significant cloud";
    if (/\b(SKC|CLR|NCD)\b/.test(m.raw)) return "Clear";
    return "No cloud reported";
  }
  return m.clouds
    .map((c) => (c.baseFt != null ? `${COVER[c.cover] ?? c.cover} ${c.baseFt.toLocaleString("en-US")} ft` : (COVER[c.cover] ?? c.cover)))
    .join(" · ");
}

function windText(m: Metar): string {
  if (m.windSpeed == null) return "—";
  if (m.windSpeed === 0) return "Calm";
  const dir = m.windDirection === "variable" ? "Variable" : m.windDirection != null ? `${String(m.windDirection).padStart(3, "0")}°` : "";
  return `${dir} ${m.windSpeed} kt${m.windGust ? `, gusts ${m.windGust}` : ""}`.trim();
}

/* ------------------------------ components ------------------------------ */

function Fact({ icon: Icon, label, value }: { icon: typeof Wind; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white/[0.03] p-3">
      <div className="flex items-center gap-1.5 text-[11px] tracking-wider text-slate-500 uppercase">
        <Icon className="size-3.5" /> {label}
      </div>
      <div className="mt-1 text-sm text-white">{value}</div>
    </div>
  );
}

function WindArrow({ direction }: { direction: number }) {
  // METAR gives where the wind comes FROM; draw the arrow pointing where it blows TO.
  return (
    <svg viewBox="0 0 24 24" className="inline size-4 text-sky-300" style={{ transform: `rotate(${direction + 180}deg)` }} aria-hidden>
      <path d="M12 3v18M12 3l-5 6M12 3l5 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Station({ kind, iata, city, weather, now }: { kind: "dep" | "arr"; iata: string; city: string; weather: AirportWeather | null; now: number }) {
  const m = weather?.metar ?? null;
  const cat = m?.category ? CATEGORY[m.category] : null;
  const Icon = kind === "dep" ? PlaneTakeoff : PlaneLanding;
  return (
    <div className="rounded-3xl bg-white/[0.02] p-5 ring-1 ring-white/[0.06]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs tracking-widest text-slate-400 uppercase">
            <Icon className={clsx("size-3.5", kind === "dep" ? "text-sky-300" : "text-violet-300")} />
            {kind === "dep" ? "Departure" : "Arrival"} · {iata}
          </div>
          <div className="mt-1 text-lg font-medium text-white">{city || iata}</div>
        </div>
        {cat && (
          <span title={cat.help} className={clsx("rounded-full px-2.5 py-1 font-mono text-xs font-semibold ring-1 ring-inset", cat.cls)}>
            {cat.label}
          </span>
        )}
      </div>

      {m ? (
        <>
          <div className="mt-4 flex items-end gap-3">
            <span className="font-display text-4xl font-semibold text-white">{m.temperature != null ? `${Math.round(m.temperature)}°` : "—"}</span>
            <span className="pb-1 text-sm text-slate-400">{decodeWeather(m.weather) ?? (m.clouds.length ? COVER[m.clouds[0].cover] ?? "Clouds" : "Fair")}</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Fact
              icon={Wind}
              label="Wind"
              value={
                <span className="inline-flex items-center gap-1.5">
                  {typeof m.windDirection === "number" && (m.windSpeed ?? 0) > 0 && <WindArrow direction={m.windDirection} />}
                  {windText(m)}
                </span>
              }
            />
            <Fact
              icon={Eye}
              label="Visibility"
              value={m.visibilityKm != null ? `${m.visibilityAtLeast ? "≥ " : ""}${m.visibilityKm} km` : "—"}
            />
            <Fact icon={Cloud} label="Clouds" value={cloudSummary(m)} />
            <Fact
              icon={Gauge}
              label="Pressure"
              value={m.pressureHpa != null ? `${m.pressureHpa} hPa` : "—"}
            />
            <Fact icon={Droplets} label="Dew point" value={m.dewpoint != null ? `${Math.round(m.dewpoint)}°C` : "—"} />
            <Fact icon={Thermometer} label="Observed" value={formatAgo(now - m.observed)} />
          </div>
          <p className="mt-3 rounded-xl bg-black/20 px-3 py-2 font-mono text-[11px] leading-relaxed break-words text-slate-400">{m.raw}</p>
        </>
      ) : (
        <p className="mt-4 text-sm text-slate-500">No current weather report for this airport.</p>
      )}

      {weather?.taf && (
        <details className="group mt-2">
          <summary className="cursor-pointer text-xs text-sky-300 select-none hover:text-sky-200">Forecast (TAF)</summary>
          <p className="mt-2 rounded-xl bg-black/20 px-3 py-2 font-mono text-[11px] leading-relaxed break-words text-slate-400">{weather.taf.raw}</p>
        </details>
      )}
    </div>
  );
}

export function WeatherPanel({
  departure,
  arrival,
  now,
}: {
  departure: { iata: string; city: string; weather: AirportWeather | null };
  arrival: { iata: string; city: string; weather: AirportWeather | null };
  now: number;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Station kind="dep" iata={departure.iata} city={departure.city} weather={departure.weather} now={now} />
      <Station kind="arr" iata={arrival.iata} city={arrival.city} weather={arrival.weather} now={now} />
    </div>
  );
}
