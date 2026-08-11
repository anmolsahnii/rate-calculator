export type PalletSpotEstimateSource = "dimensions" | "linear-feet" | "spots";

export type PalletSpotEstimate = {
  source: PalletSpotEstimateSource;
  skidCount: number;
  palletSpots: number;
  linearFeet: number;
  detail: string;
};

type PalletSpotEstimateOptions = {
  bareNumberAsLinearFeet?: boolean;
};

const MAX_PALLET_SPOTS = 60;
const STANDARD_PALLET_LENGTH_IN = 48;
const STANDARD_PALLET_WIDTH_IN = 40;
const LINEAR_FEET_PER_PALLET_SPOT = 2;

function roundTenths(value: number) {
  return Math.round(value * 10) / 10;
}

function roundUpHalf(value: number) {
  return Math.ceil((value - 1e-9) * 2) / 2;
}

export function clampPalletSpots(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.max(0.5, Math.min(MAX_PALLET_SPOTS, roundUpHalf(value)));
}

export function formatEstimateNumber(value: number) {
  const rounded = roundTenths(value);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function countFromText(input: string) {
  const countMatch = input.match(
    /\b(\d+(?:\.\d+)?)\s*(?:skids?|pallets?|pieces?|pcs)\b/i,
  );
  if (!countMatch) return 1;
  const count = Number(countMatch[1]);
  return Number.isFinite(count) && count > 0 ? Math.ceil(count) : 1;
}

function estimateFromDimensions(input: string): PalletSpotEstimate | null {
  const dimensionMatch = input.match(
    /\b(\d+(?:\.\d+)?)\s*(?:in(?:ches)?\.?|ft|feet|foot|")?\s*(?:[xX]|,)\s*(\d+(?:\.\d+)?)\s*(?:in(?:ches)?\.?|ft|feet|foot|")?(?:\s*(?:[xX]|,)\s*(\d+(?:\.\d+)?)\s*(?:in(?:ches)?\.?|ft|feet|foot|")?)?/i,
  );
  if (!dimensionMatch) return null;

  const first = Number(dimensionMatch[1]);
  const second = Number(dimensionMatch[2]);
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null;

  const multiplier = /\b(?:ft|feet|foot)\b/i.test(dimensionMatch[0]) ? 12 : 1;
  const lengthIn = first * multiplier;
  const widthIn = second * multiplier;
  const longSide = Math.max(lengthIn, widthIn);
  const shortSide = Math.min(lengthIn, widthIn);
  const skidCount = countFromText(input);
  const lengthSlots = Math.max(
    1,
    Math.ceil(longSide / STANDARD_PALLET_LENGTH_IN),
  );
  const widthSlots = Math.max(
    1,
    Math.ceil(shortSide / STANDARD_PALLET_WIDTH_IN),
  );
  const palletSpots = clampPalletSpots(skidCount * lengthSlots * widthSlots);
  const linearFeet = roundTenths(palletSpots * LINEAR_FEET_PER_PALLET_SPOT);

  return {
    source: "dimensions",
    skidCount,
    palletSpots,
    linearFeet,
    detail: `${skidCount} skid${skidCount === 1 ? "" : "s"} at ${formatEstimateNumber(lengthIn)} x ${formatEstimateNumber(widthIn)} in`,
  };
}

function estimateFromLinearFeet(input: string): PalletSpotEstimate | null {
  const feetMatch = input.match(
    /\b(\d+(?:\.\d+)?)\s*(?:linear\s*)?(?:ft|feet|foot)\b/i,
  );
  if (!feetMatch) return null;

  const requestedFeet = Number(feetMatch[1]);
  if (!Number.isFinite(requestedFeet) || requestedFeet <= 0) return null;

  const palletSpots = clampPalletSpots(
    requestedFeet / LINEAR_FEET_PER_PALLET_SPOT,
  );
  const linearFeet = roundTenths(palletSpots * LINEAR_FEET_PER_PALLET_SPOT);

  return {
    source: "linear-feet",
    skidCount: Math.ceil(palletSpots),
    palletSpots,
    linearFeet,
    detail: `${formatEstimateNumber(linearFeet)} linear ft`,
  };
}

function estimateFromBareLinearFeet(input: string): PalletSpotEstimate | null {
  const bareMatch = input.match(/^\s*(\d+(?:\.\d+)?)\s*$/);
  if (!bareMatch) return null;

  const requestedFeet = Number(bareMatch[1]);
  if (!Number.isFinite(requestedFeet) || requestedFeet <= 0) return null;

  const palletSpots = clampPalletSpots(
    requestedFeet / LINEAR_FEET_PER_PALLET_SPOT,
  );
  const linearFeet = roundTenths(palletSpots * LINEAR_FEET_PER_PALLET_SPOT);

  return {
    source: "linear-feet",
    skidCount: Math.ceil(palletSpots),
    palletSpots,
    linearFeet,
    detail: `${formatEstimateNumber(linearFeet)} linear ft`,
  };
}

function estimateFromSpots(input: string): PalletSpotEstimate | null {
  const spotMatch = input.match(
    /\b(\d+(?:\.\d+)?)\s*(?:pallet\s*spots?|spots?|skids?|pallets?)\b/i,
  );
  if (!spotMatch) return null;

  const palletSpots = clampPalletSpots(Number(spotMatch[1]));
  const linearFeet = roundTenths(palletSpots * LINEAR_FEET_PER_PALLET_SPOT);

  return {
    source: "spots",
    skidCount: Math.ceil(palletSpots),
    palletSpots,
    linearFeet,
    detail: `${formatEstimateNumber(palletSpots)} pallet spot${palletSpots === 1 ? "" : "s"}`,
  };
}

export function estimatePalletSpots(
  input: string,
  options: PalletSpotEstimateOptions = {},
): PalletSpotEstimate | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  return (
    estimateFromDimensions(trimmed) ??
    estimateFromLinearFeet(trimmed) ??
    (options.bareNumberAsLinearFeet
      ? estimateFromBareLinearFeet(trimmed)
      : null) ??
    estimateFromSpots(trimmed)
  );
}
