export type EmailPayload = {
  subject: string;
  body: string;
  sender: string;
  url: string;
};

export type ParserProfile = {
  id: string;
  label: string;
};

export type ParsedQuote = {
  customer: string;
  customerDetected: boolean;
  originType: "warehouse" | "custom";
  warehouse: "mississauga" | "montreal";
  pickup: string;
  originDetected: boolean;
  destination: string;
  destinationDetected: boolean;
  pallets: number;
  palletsDetected: boolean;
  service: "ltl" | "straight" | "ftl";
  tailgate: boolean;
  inside: boolean;
  appointment: boolean;
  returns: boolean;
  dunnage: boolean;
  driverAssist: boolean;
  helpers: number;
};

type ParserData = {
  cities: string[];
  profiles: ParserProfile[];
};

const customerKeywords: Record<string, string[]> = {
  wheels18: ["18 wheels", "eighteen wheels"],
  canada: ["canada cartage"],
  ccls: ["ccls", "uniqlo supplies"],
  efl: ["efl global", "efl"],
  ameri: ["ameri-connect", "ameri connect"],
  gobolt: ["gobolt", "go bolt"],
  muji: ["muji"],
  nippon: ["nippon express", "nippon"],
  obibox: ["obibox"],
  uniqlo: ["uniqlo"],
  vessi: ["vessi"],
};

const numberWords: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

function normalized(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function displayCity(value: string) {
  return value
    .split(/\s+/)
    .map((part) =>
      ["st", "ste"].includes(part.toLowerCase())
        ? `${part[0].toUpperCase()}${part.slice(1).toLowerCase()}.`
        : `${part[0]?.toUpperCase() ?? ""}${part.slice(1).toLowerCase()}`,
    )
    .join(" ");
}

function cityFrom(fragment: string, cities: string[]) {
  const haystack = ` ${normalized(fragment)} `;
  const match = [...cities]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .find((city) => haystack.includes(` ${normalized(city)} `));
  return match ? displayCity(match) : "";
}

function labelValue(text: string, labels: string[]) {
  const expression = new RegExp(
    `(?:${labels.join("|")})\\s*(?:city|location|address)?\\s*(?:is\\s+|[:\\-]\\s*|\\s+)([^\\n\\r;]{2,100})`,
    "i",
  );
  return text.match(expression)?.[1] ?? "";
}

function detectCustomer(text: string, profiles: ParserProfile[]) {
  const source = normalized(text);
  for (const profile of profiles) {
    if (profile.id === "spot") continue;
    const keywords = customerKeywords[profile.id] ?? [profile.label];
    if (keywords.some((keyword) => source.includes(normalized(keyword)))) {
      return { id: profile.id, detected: true };
    }
  }
  return { id: "spot", detected: false };
}

function warehouseFor(city: string) {
  const key = normalized(city);
  if (
    ["montreal", "dorval", "lachine", "saint laurent", "st laurent"].some(
      (candidate) => key.includes(candidate),
    )
  ) {
    return "montreal" as const;
  }
  if (key.includes("mississauga")) return "mississauga" as const;
  return null;
}

function palletCount(value: string) {
  const wordValue = numberWords[value.toLowerCase()];
  const count = wordValue ?? Number(value);
  return Number.isFinite(count) && count > 0
    ? Math.min(12, Math.floor(count))
    : 0;
}

function detectPallets(text: string) {
  const countToken =
    String.raw`\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve`;
  const explicit =
    text.match(
      new RegExp(
        String.raw`\b(${countToken})\s*(?:skids?|pallets?|plts?)\b`,
        "i",
      ),
    ) ??
    text.match(
      new RegExp(
        String.raw`\b(?:skids?|pallets?|plts?)\s*[:#-]?\s*(${countToken})\b`,
        "i",
      ),
    );
  if (explicit) return palletCount(explicit[1]);

  if (
    /\b(?:single|one|1|a|an)\s+(?:standard\s+)?(?:skid|pallet|plt)\b/i.test(
      text,
    ) ||
    /\b(?:on|onto|with|as|is|it is|it's)\s+(?:a\s+|an\s+)?(?:standard\s+)?(?:skid|pallet|plt)\b/i.test(
      text,
    ) ||
    /\b(?:standard\s+)?(?:skid|pallet|plt)\b(?!\s*(?:counts?|dimensions?|dims?|spots?|positions?|jack|returns?|rates?|pricing|agreement))/i.test(
      text,
    )
  ) {
    return 1;
  }

  return 0;
}

export function parseQuoteEmail(
  payload: EmailPayload,
  data: ParserData,
): ParsedQuote {
  const messageText = `${payload.subject}\n${payload.body}`;
  const allText = `${payload.sender}\n${messageText}`;
  const pallets = detectPallets(messageText);

  const routeMatch = messageText.match(
    /\bfrom\s+([^\n\r;]{2,90}?)\s+\bto\s+([^\n\r;]{2,90}?)(?=[\n\r;.]|$)/i,
  );
  const originFragment =
    labelValue(messageText, ["pickup", "pick[ -]?up", "origin", "collect(?:ion)?"]) ||
    routeMatch?.[1] ||
    "";
  const destinationFragment =
    labelValue(messageText, [
      "destination",
      "deliver(?:y)?(?: to)?",
      "ship(?:ping)? to",
      "drop[ -]?off",
    ]) ||
    routeMatch?.[2] ||
    "";

  const originCity = cityFrom(originFragment, data.cities);
  const destinationCity = cityFrom(destinationFragment, data.cities);
  const detectedWarehouse = warehouseFor(originCity);
  const customer = detectCustomer(allText, data.profiles);
  const service = /\b(?:straight\s*truck|max(?:imum)?\s*5\s*ton|5[\s-]*ton)\b/i.test(
    messageText,
  )
    ? "straight"
    : /\b(?:ftl|full truck(?:load)?)\b/i.test(messageText)
      ? "ftl"
      : "ltl";
  const helperMatch = messageText.match(/\b(\d)\s*(?:helpers?|swampers?)\b/i);

  return {
    customer: customer.id,
    customerDetected: customer.detected,
    originType: detectedWarehouse || !originCity ? "warehouse" : "custom",
    warehouse: detectedWarehouse ?? "mississauga",
    pickup: detectedWarehouse ? "" : originCity,
    originDetected: Boolean(originCity),
    destination: destinationCity,
    destinationDetected: Boolean(destinationCity),
    pallets,
    palletsDetected: pallets > 0,
    service,
    tailgate: /\b(?:tailgate|liftgate|lift gate)\b/i.test(messageText),
    inside: /\binside delivery\b/i.test(messageText),
    appointment: /\bappointment\b/i.test(messageText),
    returns: /\b(?:pallet return|return pallets?)\b/i.test(messageText),
    dunnage: /\bdunnage(?: removal)?\b/i.test(messageText),
    driverAssist: /\bdriver'?s?\s+assist(?:ance)?\b/i.test(messageText),
    helpers: helperMatch ? Math.min(6, Number(helperMatch[1])) : 0,
  };
}
