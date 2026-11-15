/**
 * Major airports, roughly ordered by passenger traffic. Used to pick which
 * airports to query when the user zooms into a region: aviationstack can't
 * filter by coordinates, but it can filter by departure airport.
 */
export const HUB_RANKING = [
  "ATL", "DXB", "DFW", "LHR", "HND", "DEN", "IST", "LAX", "ORD", "DEL",
  "CDG", "JFK", "CAN", "AMS", "FRA", "PVG", "MAD", "SIN", "ICN", "BKK",
  "CGK", "LAS", "CLT", "MCO", "MIA", "SFO", "SEA", "PHX", "EWR", "IAH",
  "DOH", "KUL", "MEX", "BOM", "HKG", "SZX", "CTU", "PEK", "PKX", "KMG",
  "SHA", "XIY", "CKG", "HGH", "NRT", "SYD", "MEL", "BNE", "YYZ", "YVR",
  "GRU", "BOG", "LIM", "SCL", "MUC", "FCO", "BCN", "LGW", "ZRH", "VIE",
  "CPH", "OSL", "ARN", "HEL", "DUB", "LIS", "ATH", "WAW", "PRG", "BRU",
  "MAN", "SVO", "DME", "LED", "JED", "RUH", "AUH", "CAI", "ADD", "JNB",
  "NBO", "LOS", "CMN", "BLR", "MAA", "HYD", "CCU", "MNL", "TPE", "KIX",
  "CTS", "FUK", "SGN", "HAN", "CEB", "DPS", "AKL", "PER", "BOS", "MSP",
  "DTW", "PHL", "BWI", "SLC", "SAN", "TPA", "YUL", "EZE", "GIG", "PTY",
  "CUN", "SJU", "HNL", "ANC", "KHI", "LHE", "DAC", "CMB", "KTM", "TAS",
  "ALA", "BAH", "MCT", "KWI", "TLV", "AMM", "BEY", "ACC", "DSS", "ABJ",
  "DAR", "CPT", "DUR", "MRU", "TNR", "LAD", "ALG", "TUN", "RAK", "AGP",
  "PMI", "NCE", "MXP", "VCE", "NAP", "MRS", "LYS", "GVA", "HAM", "DUS",
  "BER", "STR", "EDI", "BHX", "BUD", "OTP", "SOF", "BEG", "KBP", "MSQ",
  "RIX", "VNO", "TLL", "KEF", "AYT", "ESB", "SAW", "TBS", "GYD", "EVN",
];
