import { Logo } from "./Logo";

const SOURCES: { label: string; links: { name: string; href: string; note?: string }[] }[] = [
  {
    label: "Live positions",
    links: [
      { name: "The OpenSky Network", href: "https://opensky-network.org" },
      { name: "adsb.lol", href: "https://adsb.lol", note: "ODbL" },
    ],
  },
  { label: "Routes, airlines & aircraft", links: [{ name: "VRS standing data", href: "https://github.com/vradarserver/standing-data" }] },
  { label: "Weather", links: [{ name: "aviationweather.gov", href: "https://aviationweather.gov/data/api/" }] },
  {
    label: "Airports",
    links: [
      { name: "OurAirports", href: "https://ourairports.com/data/" },
      { name: "OpenFlights", href: "https://openflights.org/data" },
    ],
  },
  { label: "Schedules (optional)", links: [{ name: "aviationstack", href: "https://aviationstack.com" }] },
];

export function Footer() {
  return (
    <footer className="mt-24 border-t border-white/[0.06]">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-10 text-sm text-slate-400 lg:flex-row">
        <Logo />
        <p className="max-w-3xl text-center lg:text-right">
          {SOURCES.map((s, i) => (
            <span key={s.label}>
              {i > 0 && " · "}
              {s.label}:{" "}
              {s.links.map((l, j) => (
                <span key={l.name}>
                  {j > 0 && ", "}
                  <a href={l.href} target="_blank" rel="noreferrer" className="text-sky-300 hover:text-sky-200">
                    {l.name}
                  </a>
                  {l.note && ` (${l.note})`}
                </span>
              ))}
            </span>
          ))}
          {" · "}Map © Esri, OpenStreetMap
        </p>
      </div>
    </footer>
  );
}
