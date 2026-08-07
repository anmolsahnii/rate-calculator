export type RatePrefill = {
  pickup: string;
  warehouse: "mississauga" | "montreal" | null;
  destination: string;
  customer: string | null;
  service: "ltl" | "straight" | "ftl" | null;
  pallets: number | null;
  helpers: number | null;
  market: 10 | 20 | 30 | null;
  tailgate: boolean;
  inside: boolean;
  appointment: boolean;
  returns: boolean;
  dunnage: boolean;
  driverAssist: boolean;
};

export function parseRatePrefill(
  search: string,
  validCustomers: string[],
): RatePrefill | null {
  const params = new URLSearchParams(search);
  if (![...params.keys()].length) return null;

  const warehouseParam = params.get("warehouse");
  const customerParam = params.get("customer");
  const serviceParam = params.get("service");
  const palletParam = Number(params.get("pallets"));
  const helperParam = Number(params.get("helpers"));
  const marketParam = Number(params.get("market"));
  const enabled = (name: string) =>
    ["1", "true", "yes"].includes(params.get(name)?.toLowerCase() ?? "");

  return {
    pickup: (params.get("pickup")?.trim() ?? "").slice(0, 100),
    warehouse:
      warehouseParam === "mississauga" || warehouseParam === "montreal"
        ? warehouseParam
        : null,
    destination: (params.get("destination")?.trim() ?? "").slice(0, 100),
    customer:
      customerParam && validCustomers.includes(customerParam)
        ? customerParam
        : null,
    service:
      serviceParam === "auto"
        ? "ltl"
        : serviceParam === "ltl" ||
            serviceParam === "straight" ||
            serviceParam === "ftl"
          ? serviceParam
          : null,
    pallets:
      Number.isFinite(palletParam) && palletParam >= 1
        ? Math.min(12, Math.floor(palletParam))
        : null,
    helpers:
      Number.isFinite(helperParam) && helperParam >= 0
        ? Math.min(6, Math.floor(helperParam))
        : null,
    market: [10, 20, 30].includes(marketParam)
      ? (marketParam as 10 | 20 | 30)
      : null,
    tailgate: enabled("tailgate"),
    inside: enabled("inside"),
    appointment: enabled("appointment"),
    returns: enabled("returns"),
    dunnage: enabled("dunnage"),
    driverAssist: enabled("driverAssist"),
  };
}
