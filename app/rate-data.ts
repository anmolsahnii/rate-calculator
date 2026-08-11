export type CustomerId =
  | "spot"
  | "wheels18"
  | "canada"
  | "ccls"
  | "efl"
  | "ameri"
  | "gobolt"
  | "muji"
  | "nippon"
  | "obibox"
  | "uniqlo"
  | "vessi";

export type WarehouseId = "mississauga" | "montreal";
export type ServiceChoice = "ltl" | "straight" | "ftl";
export type ServiceMode = ServiceChoice;
export type FuelMode = "add" | "included";

export type RateCard = {
  label: string;
  effective: string;
  sourceLabel: string;
  fuelMode: FuelMode;
  preferredFsc?: number;
  ltl?: Record<number, number[]>;
  ftl?: number[];
  local?: number[];
  halton?: number[];
  gta?: number[];
};

export const customerProfiles: Array<{
  id: CustomerId;
  label: string;
  hint: string;
}> = [
  {
    id: "spot",
    label: "Spot",
    hint: "2026 Ontario LTL, Max 5 Ton, Montreal LTL and generic FTL rates.",
  },
  {
    id: "wheels18",
    label: "18 Wheels",
    hint: "Mississauga outbound skid table for Nova Scotia, Winnipeg, Saskatoon, Calgary-Edmonton, and Vancouver.",
  },
  {
    id: "canada",
    label: "Canada Cartage",
    hint: "Customer-specific Canada Cartage pallet agreement.",
  },
  {
    id: "ccls",
    label: "CCLS / Uniqlo supplies",
    hint: "CCLS supply and Quebec store-delivery pallet tables.",
  },
  {
    id: "efl",
    label: "EFL Global",
    hint: "EFL Global 2026 pallet agreement.",
  },
  {
    id: "ameri",
    label: "Ameri-Connect",
    hint: "Ameri-Connect 2026 pallet agreement.",
  },
  {
    id: "gobolt",
    label: "GoBolt",
    hint: "GoBolt contracted Montreal pallet rates with fuel included.",
  },
  {
    id: "muji",
    label: "Muji",
    hint: "Muji 2026 zone table with contracted fuel treatment included.",
  },
  {
    id: "nippon",
    label: "Nippon Express",
    hint: "Nippon pallet tariff with fuel included.",
  },
  {
    id: "obibox",
    label: "Obibox",
    hint: "Obibox GTA pallet tariff and contract FSC.",
  },
  {
    id: "uniqlo",
    label: "Uniqlo",
    hint: "Active 2026 Uniqlo store-delivery pallet tables.",
  },
  {
    id: "vessi",
    label: "Vessi",
    hint: "Vessi GTA and Vancouver 2026 pallet tables.",
  },
];

export const ontarioZones: Record<number, string[]> = {
  1: [
    "vaughan",
    "toronto",
    "scarborough",
    "north york",
    "mississauga",
    "etobicoke",
    "brampton",
    "woodbridge",
    "concord",
  ],
  2: [
    "oakville",
    "milton",
    "georgetown",
    "burlington",
    "bolton",
    "caledon",
    "halton hills",
  ],
  3: [
    "pickering",
    "oshawa",
    "orangeville",
    "newmarket",
    "markham",
    "hamilton",
    "aurora",
    "richmond hill",
    "whitby",
  ],
  4: [
    "kitchener",
    "guelph",
    "cookstown",
    "cambridge",
    "barrie",
    "waterloo",
    "paris",
  ],
  5: ["london", "woodstock", "peterborough"],
  6: ["ottawa", "nepean"],
};

export const spotOntarioZones: Record<number, string[]> = {
  1: [
    "vaughan",
    "toronto",
    "scarborough",
    "north york",
    "mississauga",
    "etobicoke",
    "brampton",
  ],
  2: ["oakville", "milton", "georgetown", "burlington", "bolton", "caledon"],
  3: [
    "pickering",
    "oshawa",
    "orangeville",
    "newmarket",
    "markham",
    "hamilton",
    "aurora",
    "richmond hill",
    "whitby",
  ],
  4: [
    "kitchener",
    "guelph",
    "cookstown",
    "cambridge",
    "barrie",
    "waterloo",
    "simcoe",
  ],
  5: ["ottawa"],
  6: ["niagara", "st catharines"],
};

export const spotGtaPickupOrigins = [
  "vaughan",
  "toronto",
  "scarborough",
  "north york",
  "mississauga",
  "etobicoke",
  "brampton",
  "oakville",
  "milton",
  "georgetown",
  "burlington",
  "bolton",
  "caledon",
  "pickering",
  "oshawa",
  "newmarket",
  "markham",
  "aurora",
  "richmond hill",
  "whitby",
];

export const ftlZones: Record<number, string[]> = {
  1: [
    "mississauga",
    "etobicoke",
    "brampton",
    "halton hills",
    "toronto premium outlets",
  ],
  2: [
    "oakville",
    "toronto",
    "georgetown",
    "bolton",
    "vaughan",
    "scarborough",
    "north york",
    "concord",
    "woodbridge",
  ],
  3: [
    "pickering",
    "oshawa",
    "orangeville",
    "newmarket",
    "markham",
    "burlington",
    "richmond hill",
    "milton",
    "hamilton",
  ],
  4: [
    "kitchener",
    "guelph",
    "cookstown",
    "cambridge",
    "barrie",
    "waterloo",
    "paris",
  ],
  5: ["london", "niagara", "niagara-on-the-lake", "st catharines"],
  6: ["kingston", "belleville"],
  7: ["ottawa", "nepean"],
  8: [
    "montreal",
    "dorval",
    "lachine",
    "saint-laurent",
    "saint laurent",
    "brossard",
    "laval",
  ],
  9: ["quebec", "quebec city", "levis"],
};

export const ftlLtlFuelDestinations = new Set([
  "mississauga",
  "etobicoke",
  "brampton",
  "halton hills",
  "toronto premium outlets",
  "oakville",
  "pickering",
  "toronto",
  "oshawa",
  "georgetown",
  "orangeville",
  "bolton",
  "newmarket",
  "vaughan",
  "markham",
  "scarborough",
  "burlington",
  "north york",
  "richmond hill",
  "milton",
]);

export const montrealLocal = [
  "ahuntsic",
  "anjou",
  "atwater",
  "auteuil",
  "baie-d'urfe",
  "beaconsfield",
  "bordeaux",
  "boucherville",
  "brossard",
  "candiac",
  "cartierville",
  "chomedey",
  "cote st-luc",
  "dollard-des-ormeaux",
  "dorval",
  "duvernay",
  "fabreville",
  "greenfield park",
  "hampstead",
  "ile-bizard",
  "kirkland",
  "la prairie",
  "lachine",
  "lasalle",
  "laval",
  "longueuil",
  "montreal",
  "montreal-est",
  "montreal-nord",
  "montreal-ouest",
  "mont-royal",
  "outremont",
  "pierrefonds",
  "pointe-claire",
  "saint-laurent",
  "st-laurent",
  "st-hubert",
  "st-lambert",
  "st-leonard",
  "verdun",
  "westmount",
  "varennes",
  "saint-eustache",
  "ste-eustache",
];

export const montrealExterior = [
  "beloeil",
  "blainville",
  "boisbriand",
  "carignan",
  "chambly",
  "delson",
  "iberville",
  "kahnawake",
  "lachenaie",
  "lorraine",
  "marieville",
  "mascouche",
  "mcmasterville",
  "mirabel",
  "mont-st-hilaire",
  "otterburn park",
  "richelieu",
  "rosemere",
  "st-hyacinthe",
  "saint-hyacinthe",
  "st-jean-sur-richelieu",
  "terrebonne",
  "ste-therese",
  "saint-jerome",
  "st-jerome",
];

const genericLtl = {
  1: [52, 70, 88, 106, 124, 142, 154, 160, 166, 172, 178],
  2: [80, 104, 118, 130, 144, 162, 168, 174, 180, 188, 200],
  3: [106, 130, 142, 148, 168, 186, 198, 210, 216, 222, 234],
  4: [106, 130, 142, 148, 168, 186, 198, 210, 216, 222, 234],
  5: [116.6, 143, 156.2, 162.8, 184.8, 204.6, 217.8, 231, 237.6, 244.2, 257.4],
  6: [150, 221, 290, 359, 428, 498, 567, 636, 756, 788, 1248],
};

const nlsLtl = {
  1: [43, 58, 73, 88, 103, 118, 128, 133, 138, 143, 148],
  2: [67, 87, 98, 108, 120, 135, 140, 145, 150, 157, 167],
  3: [88, 108, 118, 123, 140, 155, 165, 175, 180, 185, 195],
  4: [88, 108, 118, 123, 140, 155, 165, 175, 180, 185, 195],
  5: [119, 175, 230, 285, 340, 395, 450, 505, 600, 625, 750],
  6: [142.8, 210, 276, 342, 408, 474, 540, 606, 720, 750, 900],
};

const nipponLtl = {
  1: [79.7865, 107.619, 135.4515, 163.284, 191.1165, 218.949, 237.504, 246.7815, 256.059, 265.3365, 274.614],
  2: [124.3185, 161.4285, 181.839, 200.394, 222.66, 250.4925, 259.77, 269.0475, 278.325, 291.3135, 309.8685],
  3: [163.284, 200.394, 218.949, 228.2265, 259.77, 287.6025, 306.1575, 324.7125, 333.99, 343.2675, 361.8225],
  4: [163.284, 200.394, 218.949, 228.2265, 259.77, 287.6025, 306.1575, 324.7125, 333.99, 343.2675, 361.8225],
  5: [220.8045, 324.7125, 426.765, 528.8175, 630.87, 732.9225, 834.975, 937.0275, 1113.3, 1159.6875, 1391.625],
  6: [264.9654, 389.655, 512.118, 634.581, 757.044, 879.507, 1001.97, 1124.433, 1335.96, 1391.625, 1669.95],
};

export const rateCards: Record<CustomerId, RateCard> = {
  spot: {
    label: "Spot",
    effective: "January 1, 2026",
    sourceLabel: "2026 Rate Agreement Ver 2.0",
    ltl: nlsLtl,
    ftl: [250, 300, 400, 450, 550, 650, 800, 850, 1800],
    fuelMode: "add",
  },
  wheels18: {
    label: "18 Wheels",
    effective: "2026",
    sourceLabel: "18 Wheels outbound Mississauga rate card",
    fuelMode: "included",
  },
  canada: {
    label: "Canada Cartage",
    effective: "January 1, 2026",
    sourceLabel: "Canada Cartage LTL Rate Card",
    local: [51.6, 69.6, 87.6, 105.6, 123.6, 141.6, 153.6, 159.6, 165.6, 171.6, 177.6],
    halton: [80.4, 104.4, 117.6, 129.6, 144, 162, 168, 174, 180, 188.4, 200.4],
    fuelMode: "add",
  },
  ccls: {
    label: "CCLS / Uniqlo supplies",
    effective: "August 21, 2025 to August 20, 2026",
    sourceLabel: "CCLS Uniqlo Supplies Rate Card",
    fuelMode: "add",
  },
  efl: {
    label: "EFL Global",
    effective: "June 1, 2026",
    sourceLabel: "EFL Global Generic Rate Card 2026",
    ltl: genericLtl,
    ftl: [250, 300, 400, 450, 550, 650, 800, 850, 1600],
    fuelMode: "add",
  },
  ameri: {
    label: "Ameri-Connect",
    effective: "April 14, 2026",
    sourceLabel: "Ameri-Connect Generic Rate Card 2026",
    ltl: genericLtl,
    ftl: [200, 250, 300, 400, 450, 650, 800, 850, 1700],
    fuelMode: "add",
  },
  gobolt: {
    label: "GoBolt",
    effective: "July 28, 2026",
    sourceLabel: "GoBolt Pallet Rate",
    fuelMode: "included",
  },
  muji: {
    label: "Muji",
    effective: "January 1, 2026",
    sourceLabel: "Muji LTL Rate Card 2026",
    ltl: nipponLtl,
    fuelMode: "included",
  },
  nippon: {
    label: "Nippon Express",
    effective: "January 1, 2026",
    sourceLabel: "Nippon Express Rate Card with Fuel",
    ltl: nipponLtl,
    fuelMode: "included",
  },
  obibox: {
    label: "Obibox",
    effective: "November 12, 2025",
    sourceLabel: "Obibox Generic Rate Card",
    gta: [88, 108, 118, 123, 140],
    fuelMode: "add",
    preferredFsc: 20,
  },
  uniqlo: {
    label: "Uniqlo",
    effective: "2026",
    sourceLabel: "Uniqlo New Store Delivery Rate 2026",
    fuelMode: "add",
  },
  vessi: {
    label: "Vessi",
    effective: "January 1, 2026",
    sourceLabel: "Vessi Rate Card 2026",
    fuelMode: "included",
  },
};

export const montrealCard = {
  local: [121, 222, 321, 412, 495, 576, 658, 728, 792, 830, 902, 1010],
  exterior: [143, 262, 378, 484, 570, 666, 756, 840, 900, 940, 1001, 1080],
  gta: [155, 235, 315, 395, 475, 525, 575, 625, 675, 725],
  ottawa: [135, 195, 255, 315, 375, 415, 455, 495, 535, 575],
  gtaFtl: 900,
  ottawaFtl: 750,
};

export const straightTruckMax5Ton = [148, 167, 195, 195, 750, 900];

export const palletLaneCards: Partial<
  Record<CustomerId, Record<string, number[]>>
> = {
  wheels18: {
    "nova scotia": [350, 450, 600, 750, 900, 1100, 1200],
    winnipeg: [350, 450, 600, 750, 900, 1100, 1200],
    saskatoon: [400, 600, 800, 1000, 1300, 1500, 1700],
    "calgary edmonton": [400, 600, 800, 1000, 1300, 1500, 1700],
    vancouver: [450, 650, 850, 1100, 1400, 1700, 2100],
  },
  uniqlo: {
    kitchener: [106, 130, 142, 148, 168, 186, 198, 210, 216, 222, 234, 234],
    niagara: [143, 210, 276, 342, 408, 474, 540, 606, 720, 750, 900, 400],
    "niagara-on-the-lake": [143, 210, 276, 342, 408, 474, 540, 606, 720, 750, 900, 400],
    "st catharines": [143, 210, 276, 342, 408, 474, 540, 606, 720, 750, 900, 400],
  },
  ccls: {
    ottawa: [48.1, 56, 84, 112, 130, 156, 182, 208, 234, 240, 264, 288],
    montreal: [52.91, 61.6, 92.4, 123.2, 143, 171.6, 200.2, 228.8, 257.4, 264, 290.4, 316.8],
    "quebec city": [63.49, 74, 111, 148, 171.5, 205.8, 240.1, 274.4, 308.7, 317, 348.7, 380.4],
  },
  vessi: {
    metrotown: [492, 934, 1306, 1748, 2190, 2632, 3074, 3516, 3958, 4400, 4842, 5284],
    richmond: [492, 934, 1306, 1748, 2190, 2632, 3074, 3516, 3958, 4400, 4842, 5284],
    aerostream: [465, 904, 1286, 1728, 2170, 2612, 3054, 3496, 3938, 4380, 4822, 5264],
  },
};

export const vessiReturnLaneCards: Record<string, number[]> = {
  metrotown: [492, 934, 1306, 1748, 2190, 2632, 3074, 3516, 3958, 4400, 4842, 5284],
  richmond: [492, 934, 1306, 1748, 2190, 2632, 3074, 3516, 3958, 4400, 4842, 5284],
  aerostream: [465, 835, 1236, 1678, 2120, 2542, 3004, 3426, 3789, 4330, 4792, 5214],
};

export const cclsQuebecZones: Record<number, string[]> = {
  1: [
    "brossard",
    "lasalle",
    "montreal",
    "repentigny",
    "longueuil",
    "st-bruno",
    "laval",
    "pointe-claire",
    "mont-royal",
    "st-laurent",
    "terrebonne",
  ],
  2: [
    "st-jerome",
    "rosemere",
    "drummondville",
    "beloeil",
    "st-jean",
    "st-hyacinthe",
    "riviere-du-loup",
  ],
  3: [
    "quebec city",
    "levis",
    "gatineau",
    "shawinigan",
    "sherbrooke",
    "joliette",
    "granby",
    "victoriaville",
    "trois-rivieres",
  ],
  4: ["chicoutimi", "st-georges", "rimouski"],
};

export const cclsQuebecRates: Record<number, number[]> = {
  1: [80, 118, 156, 190, 217, 238],
  2: [97, 135, 173, 207, 234, 255],
  3: [119, 175, 232, 290, 347, 398],
  4: [549, 682, 795, 880, 965, 965],
};

export const cityAliases: Record<string, string> = {
  "mississauga warehouse": "mississauga",
  missisauga: "mississauga",
  missiaga: "mississauga",
  mississaga: "mississauga",
  misissauga: "mississauga",
  bramption: "brampton",
  tornto: "toronto",
  torronto: "toronto",
  scarboro: "scarborough",
  "northyork": "north york",
  richmonhill: "richmond hill",
  richmondhill: "richmond hill",
  "yonge soudan": "toronto",
  "yonge and soudan": "toronto",
  leaside: "toronto",
  "front bathurst": "toronto",
  "front and bathurst": "toronto",
  "dupont christie": "toronto",
  "dupont and christie": "toronto",
  "sugar wharf": "toronto",
  harbourfront: "toronto",
  aukland: "etobicoke",
  "port credit": "mississauga",
  barrhaven: "ottawa",
  rideau: "ottawa",
  britannia: "ottawa",
  metcalfe: "ottawa",
  "blue heron": "ottawa",
  "place dorleans": "ottawa",
  "place d'orleans": "ottawa",
  orleans: "ottawa",
  "stittsville": "ottawa",
  masonville: "london",
  beaverbrook: "london",
  "farm boy wellington": "london",
  "king weber": "waterloo",
  "king and weber": "waterloo",
  fairway: "kitchener",
  kitchner: "kitchener",
  "stone road": "guelph",
  concord: "vaughan",
  woodbridge: "vaughan",
  nepean: "ottawa",
  ottowa: "ottawa",
  montreeal: "montreal",
  montreall: "montreal",
  "montreal qc": "montreal",
  "montreal pq": "montreal",
  "mtl": "montreal",
  brosard: "brossard",
  "la salle": "lasalle",
  "st laurent": "saint-laurent",
  "saint laurent": "saint-laurent",
  "st-laurent": "saint-laurent",
  "new market": "newmarket",
  "st bruno": "saint-bruno",
  "st-bruno": "saint-bruno",
  "saint bruno": "saint-bruno",
  quebec: "quebec city",
  "trois rivieres": "trois-rivieres",
  "riviere du loup": "riviere-du-loup",
  "niagara falls": "niagara",
  "niagara on the lake": "niagara-on-the-lake",
  notl: "niagara-on-the-lake",
  "st catherine": "st catharines",
  "st. catherine": "st catharines",
  "saint catherine": "st catharines",
  "st. catharines": "st catharines",
  ns: "nova scotia",
  "nova scotia": "nova scotia",
  halifax: "nova scotia",
  "calgary-edmonton": "calgary edmonton",
  "calgary edmontn": "calgary edmonton",
  "calgary-edmontn": "calgary edmonton",
  calgary: "calgary edmonton",
  edmonton: "calgary edmonton",
};

const destinationDisplayNames: Record<string, string> = {
  "nova scotia": "Nova Scotia",
};

export const destinationSuggestions = Array.from(
  new Set([
    "Montreal Local",
    "Montreal Exterior",
    ...Object.values(spotOntarioZones).flat(),
    ...Object.values(ontarioZones).flat(),
    ...Object.values(ftlZones).flat(),
    ...montrealLocal,
    ...montrealExterior,
    ...Object.values(palletLaneCards).flatMap((card) => Object.keys(card)),
    ...Object.values(cclsQuebecZones).flat(),
  ].map((destination) => destinationDisplayNames[destination] ?? destination)),
).sort((a, b) => a.localeCompare(b));
