// X Country Filter — country detection from public profile data
// Everything runs locally. No data leaves the browser.

const DEFAULTS = {
  enabled: true,
  countries: ["IN"],            // ISO 3166-1 alpha-2 codes to hide
  regions: [],                  // region tokens to hide (e.g. "SOUTH_ASIA")
  hideFollowing: true,          // hide even if we follow the author
  debug: true,                  // keep a local debug log (for tuning)
};

// Regions X may report in "Account based in" when it can't narrow to a country.
// Tokens are uppercase-with-underscores (NOT ISO codes, no collision with
// e.g. SA = Saudi Arabia).
const REGION_NAMES = {
  "south asia": "SOUTH_ASIA",
  "southeast asia": "SOUTHEAST_ASIA",
  "east asia": "EAST_ASIA",
  "central asia": "CENTRAL_ASIA",
  "middle east": "MIDDLE_EAST",
  "latin america": "LATIN_AMERICA",
  "caribbean": "CARIBBEAN",
  "sub-saharan africa": "SUB_SAHARAN_AFRICA",
  "sub saharan africa": "SUB_SAHARAN_AFRICA",
  "europe": "EUROPE",
  "north america": "NORTH_AMERICA",
  "oceania": "OCEANIA",
};

// Members per region (for display/debug only — hiding is by exact token).
const REGION_MEMBERS = {
  "SOUTH_ASIA": ["IN", "PK", "BD", "NP", "BT", "LK", "MV", "AF"],
  "SOUTHEAST_ASIA": ["ID", "PH", "VN", "TH", "MY", "SG", "LA", "KH", "MM", "BN", "TL"],
  "EAST_ASIA": ["CN", "HK", "TW", "JP", "KR", "KP", "MN"],
  "CENTRAL_ASIA": ["KZ", "UZ", "KG", "TJ", "TM"],
  "MIDDLE_EAST": ["SA", "AE", "QA", "KW", "BH", "OM", "YE", "JO", "LB", "SY", "IQ", "IR", "IL", "PS"],
  "LATIN_AMERICA": ["MX", "BR", "AR", "CO", "CL", "PE", "VE", "EC", "BO", "PY", "UY", "GT", "HN", "NI", "CR", "PA", "SV", "CU", "DO", "PR"],
  "CARIBBEAN": ["CU", "DO", "HT", "JM", "TT", "PR", "BS", "BB"],
  "SUB_SAHARAN_AFRICA": ["NG", "ZA", "KE", "ET", "GH", "TZ", "UG", "CD", "CM", "CI", "SN", "AO", "MZ", "ZW", "ZM", "RW", "BW", "NA", "MW", "ML", "NE", "TD", "BF", "GN", "BJ", "TG", "SL", "LR", "MU", "MG", "DJ", "ER", "CF", "GA", "GQ", "CG", "SO"],
  "EUROPE": ["GB", "IE", "FR", "DE", "ES", "PT", "IT", "NL", "BE", "CH", "AT", "SE", "NO", "DK", "FI", "IS", "GR", "RO", "BG", "HU", "CZ", "SK", "SI", "HR", "RS", "BA", "AL", "MK", "ME", "EE", "LV", "LT", "MD", "LU", "MT", "CY", "MC", "AD", "SM", "UA", "BY", "PL"],
  "NORTH_AMERICA": ["US", "CA", "MX"],
  "OCEANIA": ["AU", "NZ", "FJ", "PG", "WS"],
};

const COUNTRY_NAMES = {
  "india": "IN", "pakistan": "PK", "bangladesh": "BD", "sri lanka": "LK",
  "nepal": "NP", "bhutan": "BT", "maldives": "MV", "myanmar": "MM",
  "china": "CN", "hong kong": "HK", "taiwan": "TW", "japan": "JP",
  "south korea": "KR", "north korea": "KP", "mongolia": "MN",
  "indonesia": "ID", "philippines": "PH", "vietnam": "VN", "thailand": "TH",
  "malaysia": "MY", "singapore": "SG", "laos": "LA", "cambodia": "KH",
  "brunei": "BN", "timor-leste": "TL", "afghanistan": "AF", "iran": "IR",
  "iraq": "IQ", "saudi arabia": "SA", "united arab emirates": "AE",
  "uae": "AE", "qatar": "QA", "kuwait": "KW", "bahrain": "BH",
  "oman": "OM", "yemen": "YE", "jordan": "JO", "lebanon": "LB",
  "syria": "SY", "israel": "IL", "palestine": "PS", "turkey": "TR",
  "azerbaijan": "AZ", "georgia": "GE", "armenia": "AM",
  "russia": "RU", "ukraine": "UA", "belarus": "BY", "poland": "PL",
  "germany": "DE", "france": "FR", "united kingdom": "GB", "uk": "GB",
  "england": "GB", "scotland": "GB", "wales": "GB", "ireland": "IE",
  "spain": "ES", "portugal": "PT", "italy": "IT", "netherlands": "NL",
  "belgium": "BE", "switzerland": "CH", "austria": "AT", "sweden": "SE",
  "norway": "NO", "denmark": "DK", "finland": "FI", "iceland": "IS",
  "greece": "GR", "romania": "RO", "bulgaria": "BG", "hungary": "HU",
  "czech republic": "CZ", "czechia": "CZ", "slovakia": "SK",
  "slovenia": "SI", "croatia": "HR", "serbia": "RS", "bosnia": "BA",
  "albania": "AL", "north macedonia": "MK", "montenegro": "ME",
  "estonia": "EE", "latvia": "LV", "lithuania": "LT", "moldova": "MD",
  "luxembourg": "LU", "malta": "MT", "cyprus": "CY", "monaco": "MC",
  "andorra": "AD", "san marino": "SM",
  "egypt": "EG", "nigeria": "NG", "south africa": "ZA", "kenya": "KE",
  "ethiopia": "ET", "ghana": "GH", "tanzania": "TZ", "uganda": "UG",
  "algeria": "DZ", "morocco": "MA", "tunisia": "TN", "libya": "LY",
  "sudan": "SD", "south sudan": "SS", "somali": "SO", "somalia": "SO",
  "congo": "CD", "democratic republic of the congo": "CD",
  "cameroon": "CM", "ivory coast": "CI", "cote d'ivoire": "CI",
  "senegal": "SN", "angola": "AO", "mozambique": "MZ", "zimbabwe": "ZW",
  "zambia": "ZM", "rwanda": "RW", "botswana": "BW", "namibia": "NA",
  "malawi": "MW", "mali": "ML", "niger": "NE", "chad": "TD",
  "burkina faso": "BF", "guinea": "GN", "benin": "BJ", "togo": "TG",
  "sierra leone": "SL", "liberia": "LR", "mauritius": "MU",
  "madagascar": "MG", "mozambique": "MZ", "djibouti": "DJ",
  "eritrea": "ER", "central african republic": "CF", "gabon": "GA",
  "equatorial guinea": "GQ", "republic of the congo": "CG",
  "usa": "US", "united states": "US", "united states of america": "US",
  "america": "US", "canada": "CA", "mexico": "MX",
  "brazil": "BR", "argentina": "AR", "colombia": "CO", "chile": "CL",
  "peru": "PE", "venezuela": "VE", "ecuador": "EC", "bolivia": "BO",
  "paraguay": "PY", "uruguay": "UY", "guatemala": "GT", "honduras": "HN",
  "nicaragua": "NI", "costa rica": "CR", "panama": "PA", "el salvador": "SV",
  "cuba": "CU", "dominican republic": "DO", "haiti": "HT", "jamaica": "JM",
  "puerto rico": "PR", "trinidad": "TT", "guyana": "GY", "suriname": "SR",
  "belize": "BZ", "australia": "AU", "new zealand": "NZ",
  "fiji": "FJ", "papua new guinea": "PG", "samoa": "WS",
  "kazakhstan": "KZ", "uzbekistan": "UZ", "kyrgyzstan": "KG",
  "tajikistan": "TJ", "turkmenistan": "TM", "mongolia": "MN",
};

// Indian cities/states — the big one per Jorge's use case
const INDIA_HINTS = [
  "mumbai", "bombay", "delhi", "new delhi", "bengaluru", "bangalore", "chennai",
  "madras", "hyderabad", "kolkata", "calcutta", "pune", "ahmedabad", "jaipur",
  "lucknow", "kanpur", "nagpur", "indore", "bhopal", "patna", "varanasi",
  "surat", "vadodara", "ludhiana", "amritsar", "chandigarh", "gurgaon",
  "noida", "ghaziabad", "faridabad", "kochi", "cochin", "thiruvananthapuram",
  "kozhikode", "madurai", "coimbatore", "visakhapatnam", "vijayawada",
  "raipur", "ranchi", "jamshedpur", "guwahati", "shillong", "imphal",
  "agartala", "aizawl", "itanagar", "dimapur", "kohima", "gangtok",
  "dehradun", "haridwar", "rishikesh", "shimla", "dharamshala", "srinagar",
  "jammu", "leh", "goa", "panaji", "mysuru", "mysore", "hubli", "belgaum",
  "mangaluru", "mangalore", "udupi", "tirupati", "nellore", "kakinada",
  "guntur", "warangal", "aurangabad", "nashik", "solapur", "kolhapur",
  "akola", "amravati", "jabalpur", "gwalior", "ujjain", "jhansi", "agra",
  "prayagraj", "allahabad", "gorakhpur", "bareilly", "aligarh", "meerut",
  "moradabad", "bikaner", "jodhpur", "udaipur", "ajmer", "kota", "alwar",
  "hisar", "rohtak", "panipat", "karnal", "ambala", "patiala", "bathinda",
  "jalandhar", "hoshiarpur", "abohar", "bhatinda", "siliguri", "durgapur",
  "asansol", "bhilai", "dhanbad", "bokaro", "cuttack", "bhubaneswar",
  "rourkela", "sambalpur", "maharashtra", "karnataka", "tamil nadu",
  "telangana", "andhra pradesh", "kerala", "west bengal", "bihar",
  "uttar pradesh", "rajasthan", "gujarat", "madhya pradesh", "odisha",
  "assam", "punjab", "haryana", "himachal pradesh", "uttarakhand",
  "jharkhand", "chhattisgarh", "manipur", "meghalaya", "nagaland",
  "mizoram", "tripura", "arunachal pradesh", "sikkim", "jammu and kashmir",
  "ladakh", "andaman", "lakshadweep", "puducherry", "pondicherry", "bharat",
];

// Other-country city hints (common on X)
const CITY_HINTS = {
  "karachi": "PK", "lahore": "PK", "islamabad": "PK", "rawalpindi": "PK",
  "faisalabad": "PK", "multan": "PK", "peshawar": "PK", "quetta": "PK",
  "sindh": "PK", "punjab pakistan": "PK", "dhaka": "BD", "chittagong": "BD",
  "khulna": "BD", "sylhet": "BD", "rajshahi": "BD", "bangladesh": "BD",
  "kathmandu": "NP", "pokhara": "NP", "colombo": "LK", "kandy": "LK",
  "jakarta": "ID", "surabaya": "ID", "bandung": "ID", "medan": "ID",
  "manila": "PH", "quezon city": "PH", "cebu": "PH", "davao": "PH",
  "ho chi minh": "VN", "hanoi": "VN", "da nang": "VN",
  "bangkok": "TH", "chiang mai": "TH", "kuala lumpur": "MY", "penang": "MY",
  "beijing": "CN", "shanghai": "CN", "shenzhen": "CN", "guangzhou": "CN",
  "chengdu": "CN", "hangzhou": "CN", "wuhan": "CN", "hong kong": "HK",
  "taipei": "TW", "tokyo": "JP", "osaka": "JP", "kyoto": "JP", "seoul": "KR",
  "busan": "KR", "istanbul": "TR", "ankara": "TR", "izmir": "TR",
  "cairo": "EG", "alexandria": "EG", "lagos": "NG", "abuja": "NG",
  "kano": "NG", "ibadan": "NG", "nairobi": "KE", "mombasa": "KE",
  "accra": "GH", "johannesburg": "ZA", "cape town": "ZA", "durban": "ZA",
  "addis ababa": "ET", "dar es salaam": "TZ", "kampala": "UG",
  "moscow": "RU", "saint petersburg": "RU", "kyiv": "UA", "kiev": "UA",
  "lviv": "UA", "warsaw": "PL", "krakow": "PL", "berlin": "DE",
  "munich": "DE", "hamburg": "DE", "frankfurt": "DE", "paris": "FR",
  "lyon": "FR", "marseille": "FR", "london": "GB", "manchester": "GB",
  "birmingham": "GB", "liverpool": "GB", "leeds": "GB", "glasgow": "GB",
  "edinburgh": "GB", "madrid": "ES", "barcelona": "ES", "valencia": "ES",
  "seville": "ES", "rome": "IT", "milan": "IT", "naples": "IT", "turin": "IT",
  "amsterdam": "NL", "rotterdam": "NL", "brussels": "BE", "zurich": "CH",
  "geneva": "CH", "vienna": "AT", "stockholm": "SE", "oslo": "NO",
  "copenhagen": "DK", "helsinki": "FI", "dublin": "IE", "lisbon": "PT",
  "athens": "GR", "bucharest": "RO", "sofia": "BG", "prague": "CZ",
  "budapest": "HU", "belgrade": "RS", "zagreb": "HR", "mexico city": "MX",
  "guadalajara": "MX", "monterrey": "MX", "tijuana": "MX",
  "sao paulo": "BR", "rio de janeiro": "BR", "brasilia": "BR",
  "salvador": "BR", "fortaleza": "BR", "belo horizonte": "BR",
  "buenos aires": "AR", "cordoba": "AR", "rosario": "AR", "santiago": "CL",
  "bogota": "CO", "medellin": "CO", "cali": "CO", "lima": "PE", "quito": "EC",
  "guayaquil": "EC", "caracas": "VE", "la paz": "BO", "santa cruz": "BO",
  "montevideo": "UY", "asuncion": "PY", "new york": "US", "los angeles": "US",
  "chicago": "US", "houston": "US", "miami": "US", "san francisco": "US",
  "seattle": "US", "boston": "US", "dallas": "US", "austin": "US",
  "atlanta": "US", "phoenix": "US", "philadelphia": "US", "denver": "US",
  "san diego": "US", "portland": "US", "las vegas": "US", "detroit": "US",
  "minneapolis": "US", "toronto": "CA", "vancouver": "CA", "montreal": "CA",
  "calgary": "CA", "ottawa": "CA", "edmonton": "CA", "sydney": "AU",
  "melbourne": "AU", "brisbane": "AU", "perth": "AU", "adelaide": "AU",
  "auckland": "NZ", "wellington": "NZ", "tel aviv": "IL", "jerusalem": "IL",
  "dubai": "AE", "abu dhabi": "AE", "doha": "QA", "riyadh": "SA",
  "jeddah": "SA", "kuwait": "KW", "manama": "BH", "muscat": "OM",
  "tehran": "IR", "mashhad": "IR", "baghdad": "IQ", "amman": "JO",
  "beirut": "LB", "damascus": "SY", "sana'a": "YE", "sanaa": "YE",
  "kabul": "AF", "tbilisi": "GE", "baku": "AZ", "yerevan": "AM",
  "almaty": "KZ", "astana": "KZ", "tashkent": "UZ", "minsk": "BY",
  "singapore": "SG", "casablanca": "MA", "rabat": "MA", "algiers": "DZ",
  "tunis": "TN", "tripoli": "LY", "khartoum": "SD",
};

function guessCountryFromText(text) {
  if (!text) return null;
  const t = " " + text.toLowerCase() + " ";

  // region match first (e.g. "based in South Asia")
  for (const [name, token] of Object.entries(REGION_NAMES)) {
    if (t.includes(" " + name + " ") || t.includes(name + ",") || t.startsWith(name + " ") || t.trim() === name) {
      return token;
    }
  }

  // exact country-name match second
  for (const [name, code] of Object.entries(COUNTRY_NAMES)) {
    if (t.includes(" " + name + " ") || t.includes(name + ",") || t.startsWith(name)) {
      return code;
    }
  }
  // India hints (city/state level)
  for (const hint of INDIA_HINTS) {
    if (t.includes(hint)) return "IN";
  }
  // other cities
  for (const [city, code] of Object.entries(CITY_HINTS)) {
    if (t.includes(city)) return code;
  }
  return null;
}

function extractFromJsonText(jsonText) {
  const found = {};
  const cc = jsonText.match(/"country_code"\s*:\s*"([A-Z]{2})"/);
  if (cc) found.country_code = cc[1].toUpperCase();

  const loc = jsonText.match(/"location"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (loc) found.location = loc[1].replace(/\\u0026/g, "&").replace(/\\"/g, '"').replace(/\\\\/g, "\\");

  const based = jsonText.match(/"based_in"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (based) found.based_in = based[1];

  const country = jsonText.match(/"country"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (country && !/^[A-Z]{2}$/.test(country[1])) found.country = country[1];

  return found;
}

function detectCountry(found) {
  // priority: explicit country_code > based_in > country > location
  if (found.country_code) return { code: found.country_code, method: "country_code" };
  if (found.based_in) {
    const c = guessCountryFromText(found.based_in);
    if (c) return { code: c, method: "based_in" };
  }
  if (found.country) {
    const c = guessCountryFromText(found.country);
    if (c) return { code: c, method: "country" };
  }
  if (found.location) {
    const c = guessCountryFromText(found.location);
    if (c) return { code: c, method: "location" };
  }
  return null;
}
