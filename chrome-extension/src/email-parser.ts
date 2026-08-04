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
  helpers: number;
};

type ParserData = {
  cities: string[];
  profiles: ParserProfile[];
};

const customerKeywords: Record<string, string[]> = {
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

export function parseQuoteEmail(
  payload: EmailPayload,
  data: ParserData,
): ParsedQuote {
  const messageText = `${payload.subject}\n${payload.body}`;
  const allText = `${payload.sender}\n${messageText}`;
  const palletMatch =
    messageText.match(/\b(\d{1,2})\s*(?:skids?|pallets?|plts?)\b/i) ??
    messageText.match(/\b(?:skids?|pallets?|plts?)\s*[:#-]?\s*(\d{1,2})\b/i);
  const pallets = palletMatch ? Math.min(12, Number(palletMatch[1])) : 0;

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
    helpers: helperMatch ? Math.min(6, Number(helperMatch[1])) : 0,
  };
}
