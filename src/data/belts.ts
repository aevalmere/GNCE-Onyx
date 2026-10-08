// Timing belt catalog for /belt. Two profiles, the two FTC actually runs:
// GT2 at 2 mm pitch and HTD at 5 mm pitch. One row per belt a team can order,
// with the maker's own part number and a link to the page it was read from.
//
// Read on 7 October 2026. A row is in only if a product page or the maker's
// catalog listing showed it; nothing below is pattern-completed. Every source
// row gave its tooth count, and its pitch length either printed beside it or
// following from teeth x pitch by the profile's definition; the merge
// asserted pitchLength = teeth x pitch on all 1,289 rows. Each builder below
// rebuilds the part number and URL from the tooth count, and the merge
// asserted that too, against the row as it was read.
//
// Sources, by maker:
//   goBILDA (54)    gobilda.com/2mm-gt2-timing-belts/ and /5mm-htd-timing-belts/.
//                   GT2 is 6 mm wide only, HTD 5 mm is 9 mm only. Every page
//                   fetched and its part number found on it. One slug in the
//                   listing (the 320 mm HTD) 404s and is replaced by the one
//                   the category page links.
//   ServoCity (54)  The same goBILDA belts on servocity.com's own pages, read
//                   from the raw page HTML; every page fetched and checked.
//   AndyMark (81)   HTD 5 mm only, 9 and 15 mm, read from the variant data of
//                   andymark.com's two belt pages. The 15 mm page mixes
//                   AndyMark, Gates, SDS and generic belts; one SKU is kept
//                   per tooth count, AndyMark's own first. No GT2 2 mm.
//   WCP (103)       HTD 5 mm, 9 and 15 mm, from wcproducts.com's catalog
//                   listing; each page fetched and its part number found.
//                   Standard belts only: the rubber-coated and double-sided
//                   ones repeat the same sizes. WCP's GT2 is 3 mm only.
//   McMaster (56)   GT2 ("2MGT", 6 mm) from mcmaster.com/products/pggt-timing-belts/,
//                   HTD 5 mm from the per-length pages (only 400, 450, 475,
//                   535, 565, 670 and 890 mm were reached, so this list is
//                   partial). The pages render by script, so rows were read
//                   through a text extractor, and the GT2 table was re-read
//                   independently; the two reads agree on all 46 rows.
//   B&B (934)       bbman.com, every 2P and 5M SKU from 100 to 1500 mm in
//                   6, 9 and 15 mm, each read from its own product page. B&B
//                   calls its 2 mm belt "2P" (Powerhouse); its pages
//                   cross-reference Gates 2MGT and York 2GT, which is the
//                   basis for filing it as GT2. Its 5M is labelled HTD. Two
//                   SKUs whose own page fields disagreed were dropped.
//   SDP/SI (6)      shop.sdp-si.com answers fetchers with 403, so these are
//                   the six whose search listings stated pitch length and
//                   width. Rows decoded from the part-number pattern alone
//                   were left out.
//   Misumi (1)      One 6 mm 2GT belt whose page loads with its part number
//                   on it; the length is the circumference in the part
//                   number, per Misumi's catalog (us.misumi-ec.com/pdf/fa/2012/p1_1215.pdf).
//   REV Robotics    None: REV sells GT2 at 3 mm, RT25 and round belt only.
//   Gates           None: no public catalog with orderable part numbers.
//
// Widths outside 6 to 15 mm and lengths past 1500 mm were left out.

export type Profile = 'GT2-2mm' | 'HTD-5mm';

export interface Belt {
  maker: string;
  profile: Profile;
  teeth: number;
  /** Belt width, mm. */
  width: number;
  part: string;
  url: string;
}

export interface Maker { id: string; name: string; short: string; home: string }

export const CATALOG_DATE = '2026-10-07';

// Display order: the FTC vendors first, then the industrial catalogs.
export const MAKERS: Maker[] = [
  { id: 'gobilda', name: 'goBILDA', short: 'goBILDA', home: 'https://www.gobilda.com/timing-belts-pulleys/' },
  { id: 'servocity', name: 'ServoCity', short: 'ServoCity', home: 'https://www.servocity.com/' },
  { id: 'andymark', name: 'AndyMark', short: 'AndyMark', home: 'https://www.andymark.com/' },
  { id: 'wcp', name: 'West Coast Products', short: 'WCP', home: 'https://wcproducts.com/' },
  { id: 'mcmaster', name: 'McMaster-Carr', short: 'McMaster', home: 'https://www.mcmaster.com/' },
  { id: 'bb', name: 'B&B Manufacturing', short: 'B&B', home: 'https://www.bbman.com/' },
  { id: 'sdp', name: 'SDP/SI', short: 'SDP/SI', home: 'https://shop.sdp-si.com/' },
  { id: 'misumi', name: 'Misumi', short: 'Misumi', home: 'https://us.misumi-ec.com/' },
];

export interface Preset { label: string; profile: Profile; pitch: number; width: number; pulleys: number[] }

// goBILDA's two belt systems. The pulleys are the drive pulleys goBILDA
// sells and offers in its own belt calculator: GT2 20T (8 mm REX, 6 mm and
// 1/8 in bores), 30T and 40T (8 mm REX), 60T (14 mm hub mount); HTD 16T
// (6 mm D, 8 mm REX), 24T (8 mm REX, 14 mm hub mount) and 48T (14 mm hub
// mount). The 8T HTD idler is not a drive pulley and is not offered.
export const PRESETS: Record<string, Preset> = {
  gt2: { label: 'goBILDA GT2 (2 mm)', profile: 'GT2-2mm', pitch: 2, width: 6, pulleys: [20, 30, 40, 60] },
  htd5: { label: 'goBILDA HTD 5 mm', profile: 'HTD-5mm', pitch: 5, width: 9, pulleys: [16, 24, 48] },
};

// Pitch line differential: how far the pitch line sits outside the pulley's
// tooth tips, so OD = PD - 2 x PLD. GT2 2 mm is 0.254 mm (Misumi's 2GT table,
// the PDF above). HTD 5 mm is 0.57 mm: a 16T 5M pulley is listed at 25.46 mm
// pitch and 24.32 mm tip diameter (Ondrives P16-5M-25F), which is Gates'
// 0.0225 in. Used only for the tip clearance readout.
export const PLD: Record<Profile, number> = { 'GT2-2mm': 0.254, 'HTD-5mm': 0.57 };

export const BELTS: Belt[] = [];
const PITCH: Record<Profile, number> = { 'GT2-2mm': 2, 'HTD-5mm': 5 };
const len = (p: Profile, t: number) => t * PITCH[p];
const pad4 = (n: number) => String(n).padStart(4, '0');
const add = (maker: string, profile: Profile, width: number, teeth: number, part: string, url: string) => {
  BELTS.push({ maker, profile, teeth, width, part, url });
};
const gbPart = (p: Profile, t: number) => (p === 'GT2-2mm' ? '3423-0006-' : '3412-0009-') + pad4(len(p, t));
const goBILDA = (p: Profile, w: number, rows: [number, string][]) =>
  rows.forEach(([t, s]) => add('gobilda', p, w, t, gbPart(p, t), `https://www.gobilda.com/${s}/`));
const servoCity = (p: Profile, w: number, rows: [number, string][]) =>
  rows.forEach(([t, s]) => add('servocity', p, w, t, gbPart(p, t), `https://www.servocity.com/${s}/`));
const andyMark = (p: Profile, w: number, url: string, rows: [number, string][]) =>
  rows.forEach(([t, part]) => add('andymark', p, w, t, part, url));
const wcp = (p: Profile, w: number, rows: [number, string][]) =>
  rows.forEach(([t, part]) => add('wcp', p, w, t, part, `https://wcproducts.com/products/${part.toLowerCase()}`));
const mcMaster = (p: Profile, w: number, rows: [number, string][]) =>
  rows.forEach(([t, part]) => add('mcmaster', p, w, t, part, `https://www.mcmaster.com/${part.toLowerCase()}/`));
const bAndB = (p: Profile, w: number, teeth: number[]) =>
  teeth.forEach((t) => {
    const part = `${len(p, t)}-${p === 'GT2-2mm' ? '2P' : '5M'}-${String(w).padStart(2, '0')}`;
    add('bb', p, w, t, part, `https://www.bbman.com/catalog/product/${part.toLowerCase()}`);
  });
const sdpSi = (p: Profile, w: number, rows: [number, string][]) =>
  rows.forEach(([t, part]) => add('sdp', p, w, t, part, `https://shop.sdp-si.com/${part.toLowerCase().replace(/ /g, '-')}.html`));
const misumi = (p: Profile, w: number, rows: [number, string, string][]) =>
  rows.forEach(([t, part, url]) => add('misumi', p, w, t, part, url));

/** Rows per maker, for the catalog checkboxes and the sources line. */
export const makerCounts = () => {
  const c: Record<string, number> = {};
  for (const b of BELTS) c[b.maker] = (c[b.maker] ?? 0) + 1;
  return c;
};

// goBILDA: [teeth, page slug]. Part = series-width-pitch length.
goBILDA("GT2-2mm", 6, [[44, "2mm-pitch-gt2-timing-belt-6mm-width-88mm-pitch-length-44-tooth"], [68, "2mm-pitch-gt2-timing-belt-6mm-width-136mm-pitch-length-68-tooth"], [92, "2mm-pitch-gt2-timing-belt-6mm-width-184mm-pitch-length-92-tooth"], [108, "2mm-pitch-gt2-timing-belt-6mm-width-216mm-pitch-length-108-tooth"], [116, "2mm-pitch-gt2-timing-belt-6mm-width-232mm-pitch-length-116-tooth"], [132, "2mm-pitch-gt2-timing-belt-6mm-width-264mm-pitch-length-132-tooth"], [140, "2mm-pitch-gt2-timing-belt-6mm-width-280mm-pitch-length-140-tooth"], [156, "2mm-pitch-gt2-timing-belt-6mm-width-312mm-pitch-length-156-tooth"], [164, "2mm-pitch-gt2-timing-belt-6mm-width-328mm-pitch-length-164-tooth"], [180, "2mm-pitch-gt2-timing-belt-6mm-width-360mm-pitch-length-180-tooth"], [188, "2mm-pitch-gt2-timing-belt-6mm-width-376mm-pitch-length-188-tooth"], [204, "2mm-pitch-gt2-timing-belt-6mm-width-408mm-pitch-length-204-tooth"], [209, "2mm-pitch-gt2-timing-belt-6mm-width-418mm-pitch-length-209-tooth"], [212, "2mm-pitch-gt2-timing-belt-6mm-width-424mm-pitch-length-212-tooth"], [228, "2mm-pitch-gt2-timing-belt-6mm-width-456mm-pitch-length-228-tooth"], [233, "2mm-pitch-gt2-timing-belt-6mm-width-466mm-pitch-length-233-tooth"], [236, "2mm-pitch-gt2-timing-belt-6mm-width-472mm-pitch-length-236-tooth"], [252, "2mm-pitch-gt2-timing-belt-6mm-width-504mm-pitch-length-252-tooth"], [257, "2mm-pitch-gt2-timing-belt-6mm-width-514mm-pitch-length-257-tooth"], [276, "2mm-pitch-gt2-timing-belt-6mm-width-552mm-pitch-length-276-tooth"], [300, "2mm-pitch-gt2-timing-belt-6mm-width-600mm-pitch-length-300-tooth"], [324, "2mm-pitch-gt2-timing-belt-6mm-width-648mm-pitch-length-324-tooth"]]);
goBILDA("HTD-5mm", 9, [[43, "5mm-pitch-htd-timing-belt-9mm-width-215mm-pitch-length-43-tooth"], [45, "5mm-pitch-htd-timing-belt-9mm-width-225mm-pitch-length-45-tooth"], [49, "3412-series-5mm-htd-pitch-timing-belt-9mm-width-245mm-pitch-length-49-tooth"], [53, "3412-series-5mm-htd-pitch-timing-belt-9mm-width-265mm-pitch-length-53-tooth"], [55, "3412-series-5mm-htd-pitch-timing-belt-9mm-width-275mm-pitch-length-55-tooth"], [59, "5mm-pitch-htd-timing-belt-9mm-width-295mm-pitch-length-59-tooth"], [63, "3412-series-5mm-htd-pitch-timing-belt-9mm-width-315mm-pitch-length-63-tooth"], [64, "3412-series-5mm-htd-pitch-timing-belt-9mm-width-320mm-pitch-length-64-tooth"], [68, "5mm-pitch-htd-timing-belt-9mm-width-340mm-pitch-length-68-tooth"], [72, "5mm-pitch-htd-timing-belt-9mm-width-360mm-pitch-length-72-tooth"], [74, "5mm-pitch-htd-timing-belt-9mm-width-370mm-pitch-length-74-tooth"], [76, "5mm-pitch-htd-timing-belt-9mm-width-380mm-pitch-length-76-tooth"], [78, "5mm-pitch-htd-timing-belt-9mm-width-390mm-pitch-length-78-tooth"], [82, "5mm-pitch-htd-timing-belt-9mm-width-410mm-pitch-length-82-tooth"], [84, "5mm-pitch-htd-timing-belt-9mm-width-420mm-pitch-length-84-tooth"], [85, "5mm-pitch-htd-timing-belt-9mm-width-425mm-pitch-length-85-tooth"], [89, "3412-series-5mm-htd-pitch-timing-belt-9mm-width-445mm-pitch-length-89-tooth"], [92, "3412-series-5mm-htd-pitch-timing-belt-9mm-width-460mm-pitch-length-92-tooth"], [94, "3412-series-5mm-htd-pitch-timing-belt-9mm-width-470mm-pitch-length-94-tooth"], [97, "5mm-pitch-htd-timing-belt-9mm-width-485mm-pitch-length-97-tooth"], [101, "5mm-pitch-htd-timing-belt-9mm-width-505mm-pitch-length-101-tooth"], [104, "5mm-pitch-htd-timing-belt-9mm-width-520mm-pitch-length-104-tooth"], [107, "3412-series-5mm-htd-pitch-timing-belt-9mm-width-535mm-pitch-length-107-tooth"], [112, "3412-series-5mm-htd-pitch-timing-belt-9mm-width-560mm-pitch-length-112-tooth"], [116, "5mm-pitch-htd-timing-belt-9mm-width-580mm-pitch-length-116-tooth"], [120, "5mm-pitch-htd-timing-belt-9mm-width-600mm-pitch-length-120-tooth"], [130, "5mm-pitch-htd-timing-belt-9mm-width-650mm-pitch-length-130-tooth"], [140, "5mm-pitch-htd-timing-belt-9mm-width-700mm-pitch-length-140-tooth"], [149, "5mm-pitch-htd-timing-belt-9mm-width-745mm-pitch-length-149-tooth"], [160, "3412-series-5mm-htd-pitch-timing-belt-9mm-width-800mm-pitch-length-160-tooth"], [168, "3412-series-5mm-htd-pitch-timing-belt-9mm-width-840mm-pitch-length-168-tooth"], [178, "5mm-pitch-htd-timing-belt-9mm-width-890mm-pitch-length-178-tooth"]]);
// ServoCity sells the same goBILDA belts on its own pages.
servoCity("GT2-2mm", 6, [[44, "2mm-pitch-gt2-timing-belt-6mm-width-88mm-pitch-length-44-tooth"], [68, "2mm-pitch-gt2-timing-belt-6mm-width-136mm-pitch-length-68-tooth"], [92, "2mm-pitch-gt2-timing-belt-6mm-width-184mm-pitch-length-92-tooth"], [108, "2mm-pitch-gt2-timing-belt-6mm-width-216mm-pitch-length-108-tooth"], [116, "2mm-pitch-gt2-timing-belt-6mm-width-232mm-pitch-length-116-tooth"], [132, "2mm-pitch-gt2-timing-belt-6mm-width-264mm-pitch-length-132-tooth"], [140, "2mm-pitch-gt2-timing-belt-6mm-width-280mm-pitch-length-140-tooth"], [156, "2mm-pitch-gt2-timing-belt-6mm-width-312mm-pitch-length-156-tooth"], [164, "2mm-pitch-gt2-timing-belt-6mm-width-328mm-pitch-length-164-tooth"], [180, "2mm-pitch-gt2-timing-belt-6mm-width-360mm-pitch-length-180-tooth"], [188, "2mm-pitch-gt2-timing-belt-6mm-width-376mm-pitch-length-188-tooth"], [204, "2mm-pitch-gt2-timing-belt-6mm-width-408mm-pitch-length-204-tooth"], [209, "2mm-pitch-gt2-timing-belt-6mm-width-418mm-pitch-length-209-tooth"], [212, "2mm-pitch-gt2-timing-belt-6mm-width-424mm-pitch-length-212-tooth"], [228, "2mm-pitch-gt2-timing-belt-6mm-width-456mm-pitch-length-228-tooth"], [233, "2mm-pitch-gt2-timing-belt-6mm-width-466mm-pitch-length-233-tooth"], [236, "2mm-pitch-gt2-timing-belt-6mm-width-472mm-pitch-length-236-tooth"], [252, "2mm-pitch-gt2-timing-belt-6mm-width-504mm-pitch-length-252-tooth"], [257, "2mm-pitch-gt2-timing-belt-6mm-width-514mm-pitch-length-257-tooth"], [276, "2mm-pitch-gt2-timing-belt-6mm-width-552mm-pitch-length-276-tooth"], [300, "2mm-pitch-gt2-timing-belt-6mm-width-600mm-pitch-length-300-tooth"], [324, "2mm-pitch-gt2-timing-belt-6mm-width-648mm-pitch-length-324-tooth"]]);
servoCity("HTD-5mm", 9, [[43, "3412-series-5mm-htd-pitch-timing-belt-9mm-width-215mm-pitch-length-43-tooth"], [45, "3412-series-5mm-htd-pitch-timing-belt-9mm-width-225mm-pitch-length-45-tooth"], [49, "3412-series-5mm-htd-pitch-timing-belt-9mm-width-245mm-pitch-length-49-tooth"], [53, "3412-series-5mm-htd-pitch-timing-belt-9mm-width-265mm-pitch-length-53-tooth"], [55, "3412-series-5mm-htd-pitch-timing-belt-9mm-width-275mm-pitch-length-55-tooth"], [59, "3412-series-5mm-htd-pitch-timing-belt-9mm-width-295mm-pitch-length-59-tooth"], [63, "3412-series-5mm-htd-pitch-timing-belt-9mm-width-315mm-pitch-length-63-tooth"], [64, "3412-series-5mm-htd-pitch-timing-belt-9mm-width-320mm-pitch-length-64-tooth"], [68, "3412-series-5mm-htd-pitch-timing-belt-9mm-width-340mm-pitch-length-68-tooth"], [72, "3412-series-5mm-htd-pitch-timing-belt-9mm-width-360mm-pitch-length-72-tooth"], [74, "3412-series-5mm-htd-pitch-timing-belt-9mm-width-370mm-pitch-length-74-tooth"], [76, "3412-series-5mm-htd-pitch-timing-belt-9mm-width-380mm-pitch-length-76-tooth"], [78, "3412-series-5mm-htd-pitch-timing-belt-9mm-width-390mm-pitch-length-78-tooth"], [82, "3412-series-5mm-htd-pitch-timing-belt-9mm-width-410mm-pitch-length-82-tooth"], [84, "3412-series-5mm-htd-pitch-timing-belt-9mm-width-420mm-pitch-length-84-tooth"], [85, "3412-series-5mm-htd-pitch-timing-belt-9mm-width-425mm-pitch-length-85-tooth"], [89, "3412-series-5mm-htd-pitch-timing-belt-9mm-width-445mm-pitch-length-89-tooth"], [92, "3412-series-5mm-htd-pitch-timing-belt-9mm-width-460mm-pitch-length-92-tooth"], [94, "3412-series-5mm-htd-pitch-timing-belt-9mm-width-470mm-pitch-length-94-tooth"], [97, "3412-series-5mm-htd-pitch-timing-belt-9mm-width-485mm-pitch-length-97-tooth"], [101, "3412-series-5mm-htd-pitch-timing-belt-9mm-width-505mm-pitch-length-101-tooth"], [104, "3412-series-5mm-htd-pitch-timing-belt-9mm-width-520mm-pitch-length-104-tooth"], [107, "3412-series-5mm-htd-pitch-timing-belt-9mm-width-535mm-pitch-length-107-tooth"], [112, "3412-series-5mm-htd-pitch-timing-belt-9mm-width-560mm-pitch-length-112-tooth"], [116, "3412-series-5mm-htd-pitch-timing-belt-9mm-width-580mm-pitch-length-116-tooth"], [120, "3412-series-5mm-htd-pitch-timing-belt-9mm-width-600mm-pitch-length-120-tooth"], [130, "3412-series-5mm-htd-pitch-timing-belt-9mm-width-650mm-pitch-length-130-tooth"], [140, "3412-series-5mm-htd-pitch-timing-belt-9mm-width-700mm-pitch-length-140-tooth"], [149, "3412-series-5mm-htd-pitch-timing-belt-9mm-width-745mm-pitch-length-149-tooth"], [160, "3412-series-5mm-htd-pitch-timing-belt-9mm-width-800mm-pitch-length-160-tooth"], [168, "3412-series-5mm-htd-pitch-timing-belt-9mm-width-840mm-pitch-length-168-tooth"], [178, "3412-series-5mm-htd-pitch-timing-belt-9mm-width-890mm-pitch-length-178-tooth"]]);
// AndyMark: [teeth, SKU]. One product page per width, every length a variant on it.
andyMark("HTD-5mm", 9, "https://www.andymark.com/products/9-mm-wide-5-mm-pitch-htd-timing-belts", [[30, "am-5209_30T"], [35, "am-5209_35T"], [40, "am-5209_40T"], [45, "am-5209_45T"], [50, "am-5209_50T"], [55, "am-5209_55T"], [60, "am-5209_60T"], [64, "am-5209_64T"], [65, "am-5209_65T"], [70, "am-5209_70T"], [75, "am-5209_75T"], [80, "am-5209_80T"], [85, "am-5209_85T"], [90, "am-5209_90T"], [91, "am-5209_91T"], [93, "am-5209_93T"], [95, "am-5209_95T"], [100, "am-5209_100T"], [105, "am-5209_105T"], [106, "am-5209_106T"], [110, "am-5209_110T"], [115, "am-5209_115T"], [120, "am-5209_120T"], [121, "am-5209_121T"], [125, "am-5209_125T"], [130, "am-5209_130T"], [135, "am-5209_135T"], [136, "am-5209_136T"], [140, "am-5209_140T"], [145, "am-5209_145T"], [150, "am-5209_150T"], [152, "am-5209_152T"], [160, "am-5209_160T"], [167, "am-5209_167T"], [170, "am-5209_170T"], [180, "am-5209_180T"], [190, "am-5209_190T"], [200, "am-5209_200T"], [225, "am-5209_225T"], [250, "am-5209_250T"]]);
andyMark("HTD-5mm", 15, "https://www.andymark.com/products/15-mm-wide-5-mm-pitch-htd-timing-belts", [[30, "am-5215_30T"], [35, "am-5215_35T"], [40, "am-5215_40T"], [45, "am-5215_45T"], [50, "am-5215_50T"], [55, "am-5215_55T"], [60, "am-5215_60T"], [64, "am-5457_64T"], [65, "am-5215_65T"], [70, "am-5215_70T"], [75, "am-5215_75T"], [78, "am-5457_78T"], [80, "am-5215_80T"], [85, "am-5215_85T"], [90, "am-5215_90T"], [95, "am-5215_95T"], [100, "am-5215_100T"], [104, "am-2267"], [105, "am-5215_105T"], [107, "am-5215_107T"], [110, "am-5215_110T"], [115, "am-5215_115T"], [117, "am-5215_117T"], [120, "am-5215_120T"], [125, "am-5215_125T"], [130, "am-5215_130T"], [131, "am-5215_131T"], [135, "am-5215_135T"], [140, "am-5215_140T"], [145, "am-5215_145T"], [150, "am-5215_150T"], [151, "am-5215_151T"], [160, "am-5215_160T"], [170, "am-5215_170T"], [180, "am-5215_180T"], [190, "am-5215_190T"], [200, "am-5215_200T"], [220, "am-4932"], [225, "am-5215_225T"], [230, "am-4933"], [250, "am-5215_250T"]]);
// WCP: [teeth, part]. Each belt is its own page, named by its part number.
wcp("HTD-5mm", 15, [[30, "WCP-0161"], [35, "WCP-0525"], [40, "WCP-0526"], [44, "WCP-2434"], [45, "WCP-0163"], [50, "WCP-0527"], [55, "WCP-0165"], [60, "WCP-0644"], [64, "WCP-1779"], [65, "WCP-0528"], [70, "WCP-0645"], [75, "WCP-0529"], [80, "WCP-0646"], [85, "WCP-0530"], [90, "WCP-0647"], [95, "WCP-0531"], [100, "WCP-0648"], [104, "WCP-0649"], [105, "WCP-0532"], [110, "WCP-0650"], [115, "WCP-0533"], [120, "WCP-0651"], [125, "WCP-0534"], [130, "WCP-0652"], [135, "WCP-0535"], [140, "WCP-0653"], [145, "WCP-0536"], [150, "WCP-0654"], [155, "WCP-1780"], [160, "WCP-0655"], [165, "WCP-1781"], [170, "WCP-0656"], [175, "WCP-1782"], [180, "WCP-0657"], [185, "WCP-1783"], [190, "WCP-0537"], [195, "WCP-1784"], [200, "WCP-0658"], [210, "WCP-1785"], [220, "WCP-1786"], [225, "WCP-0659"], [230, "WCP-1787"], [240, "WCP-1788"], [250, "WCP-0660"], [260, "WCP-1789"], [270, "WCP-1790"], [280, "WCP-1791"], [290, "WCP-1792"], [300, "WCP-1793"]]);
wcp("HTD-5mm", 9, [[30, "WCP-0160"], [35, "WCP-0612"], [40, "WCP-0613"], [41, "WCP-2707"], [43, "WCP-0511"], [44, "WCP-2433"], [45, "WCP-0162"], [47, "WCP-2708"], [50, "WCP-0615"], [53, "WCP-0512"], [55, "WCP-0164"], [57, "WCP-1635"], [60, "WCP-0617"], [64, "WCP-1757"], [65, "WCP-0618"], [70, "WCP-0619"], [75, "WCP-0620"], [80, "WCP-0621"], [85, "WCP-0622"], [90, "WCP-0623"], [95, "WCP-0624"], [100, "WCP-0625"], [104, "WCP-0626"], [105, "WCP-0627"], [110, "WCP-0628"], [115, "WCP-0629"], [120, "WCP-0630"], [125, "WCP-0631"], [130, "WCP-0632"], [135, "WCP-0633"], [140, "WCP-0634"], [145, "WCP-0635"], [150, "WCP-0636"], [155, "WCP-1758"], [160, "WCP-0637"], [165, "WCP-1759"], [170, "WCP-0638"], [175, "WCP-1760"], [180, "WCP-0639"], [185, "WCP-1761"], [190, "WCP-0640"], [195, "WCP-1762"], [200, "WCP-0641"], [210, "WCP-1763"], [220, "WCP-1764"], [225, "WCP-0642"], [230, "WCP-1765"], [240, "WCP-1766"], [250, "WCP-0643"], [260, "WCP-1767"], [270, "WCP-1768"], [280, "WCP-1769"], [290, "WCP-1770"], [300, "WCP-1771"]]);
// McMaster-Carr: [teeth, part].
mcMaster("GT2-2mm", 6, [[50, "7947K711"], [56, "7947K712"], [62, "7947K713"], [63, "7947K714"], [67, "7947K715"], [68, "7947K716"], [70, "7947K717"], [76, "7947K718"], [79, "7947K719"], [80, "7947K721"], [82, "7947K722"], [86, "7947K725"], [90, "7947K726"], [93, "7947K727"], [96, "7947K728"], [100, "7947K729"], [101, "7947K731"], [106, "7947K732"], [110, "7947K733"], [116, "7947K734"], [118, "7947K735"], [120, "7947K736"], [125, "7947K737"], [126, "7947K738"], [129, "7947K739"], [140, "7947K741"], [150, "7947K742"], [160, "7947K743"], [166, "7947K744"], [175, "7947K745"], [185, "7947K746"], [190, "7947K747"], [200, "7947K748"], [210, "7947K749"], [228, "7947K751"], [244, "7947K753"], [252, "7947K754"], [264, "7947K755"], [276, "7947K756"], [288, "7947K757"], [300, "7947K758"], [320, "7947K759"], [348, "7947K761"], [372, "7947K762"], [424, "7947K763"], [582, "7947K764"]]);
mcMaster("HTD-5mm", 9, [[80, "7939K531"], [95, "7939K534"], [134, "7939K554"]]);
mcMaster("HTD-5mm", 15, [[80, "7939K13"], [90, "7939K15"], [95, "7939K16"], [107, "7939K18"], [113, "7939K19"], [134, "7939K23"], [178, "7939K28"]]);
// B&B: teeth only. Part = pitch length-style-width, page = the part, lower case.
bAndB("GT2-2mm", 6, [50, 51, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 100, 101, 102, 103, 104, 105, 106, 107, 108, 110, 111, 112, 113, 114, 115, 116, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 132, 133, 134, 135, 137, 139, 140, 141, 142, 143, 144, 145, 146, 147, 150, 151, 152, 153, 154, 155, 157, 159, 160, 161, 162, 163, 164, 165, 166, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 182, 183, 185, 186, 188, 190, 191, 193, 196, 197, 200, 203, 206, 210, 213, 214, 215, 218, 220, 222, 223, 224, 226, 227, 228, 230, 233, 235, 237, 239, 240, 242, 243, 244, 246, 247, 250, 251, 252, 253, 258, 262, 264, 265, 267, 272, 275, 276, 279, 280, 285, 286, 288, 289, 293, 299, 300, 303, 308, 309, 317, 320, 323, 330, 335, 338, 340, 345, 348, 351, 363, 365, 371, 372, 376, 380, 386, 391, 400, 405, 408, 424, 426, 430, 433, 446, 450, 465, 475, 478, 488, 497, 502, 516, 533, 534, 539, 555, 570, 582, 590, 605, 614, 617, 628, 655, 660, 672, 680, 717]);
bAndB("GT2-2mm", 9, [50, 51, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 100, 101, 102, 103, 104, 105, 106, 107, 108, 110, 111, 112, 113, 114, 115, 116, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 132, 133, 134, 135, 137, 139, 140, 141, 142, 143, 144, 145, 146, 147, 150, 151, 152, 153, 154, 155, 157, 159, 160, 161, 162, 163, 164, 165, 166, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 182, 183, 185, 186, 188, 190, 191, 193, 196, 197, 200, 203, 206, 210, 213, 214, 215, 218, 220, 222, 223, 224, 226, 227, 228, 230, 233, 235, 237, 239, 240, 242, 243, 244, 246, 247, 250, 251, 252, 253, 258, 262, 264, 265, 267, 272, 275, 276, 279, 280, 285, 286, 288, 289, 293, 299, 300, 303, 308, 309, 317, 320, 323, 330, 335, 338, 340, 345, 348, 351, 363, 365, 371, 372, 376, 380, 386, 391, 400, 405, 408, 424, 426, 430, 433, 446, 450, 465, 475, 478, 488, 497, 502, 516, 533, 534, 539, 555, 570, 582, 590, 605, 614, 617, 628, 655, 660, 672, 680, 693, 717]);
bAndB("HTD-5mm", 6, [30, 35, 36, 40, 43, 45, 46, 48, 49, 51, 52, 53, 54, 55, 56, 57, 59, 60, 61, 62, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 77, 80, 81, 82, 83, 84, 85, 88, 89, 90, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 110, 111, 112, 113, 114, 115, 116, 117, 118, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 133, 134, 135, 136, 137, 138, 139, 140, 142, 143, 144, 145, 148, 149, 150, 151, 153, 154, 155, 156, 158, 160, 162, 163, 165, 166, 167, 168, 169, 170, 172, 174, 178, 180, 184, 185, 186, 187, 188, 190, 193, 195, 196, 197, 200, 205, 207, 210, 216, 220, 223, 225, 227, 230, 232, 235, 236, 239, 240, 242, 245, 247, 248, 250, 254, 258, 259, 264, 268, 270, 275, 276, 280, 284, 291, 300]);
bAndB("HTD-5mm", 9, [30, 35, 36, 40, 43, 45, 46, 48, 49, 51, 52, 53, 54, 55, 56, 57, 59, 60, 61, 62, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 77, 80, 81, 82, 83, 84, 85, 88, 89, 90, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 110, 111, 112, 113, 114, 115, 116, 117, 118, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 133, 134, 135, 136, 137, 138, 139, 140, 142, 143, 144, 145, 148, 149, 150, 151, 153, 154, 155, 156, 158, 160, 162, 163, 165, 166, 167, 168, 169, 170, 172, 174, 178, 180, 184, 185, 186, 187, 188, 190, 192, 193, 195, 196, 197, 200, 205, 207, 210, 216, 220, 223, 225, 227, 229, 230, 232, 235, 236, 239, 240, 242, 245, 247, 248, 250, 254, 258, 259, 260, 264, 268, 270, 275, 276, 280, 284, 291, 300]);
bAndB("HTD-5mm", 15, [30, 35, 36, 40, 43, 45, 46, 48, 49, 51, 52, 53, 54, 55, 56, 57, 59, 60, 61, 62, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 77, 80, 81, 82, 83, 84, 85, 88, 89, 90, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 133, 134, 135, 136, 137, 138, 139, 140, 142, 143, 144, 145, 148, 149, 150, 151, 153, 154, 155, 156, 158, 160, 162, 163, 165, 166, 167, 168, 169, 170, 172, 174, 178, 180, 184, 185, 186, 187, 188, 190, 192, 193, 195, 196, 197, 200, 205, 207, 210, 216, 220, 223, 225, 227, 229, 230, 232, 235, 236, 239, 240, 242, 245, 247, 248, 250, 254, 258, 259, 260, 264, 268, 270, 275, 276, 280, 284, 291, 300]);
// SDP/SI: [teeth, part].
sdpSi("HTD-5mm", 9, [[51, "A 6R25M051090"], [100, "A 6R25M100090"], [105, "A 6R25M105090"], [208, "A 6R25M208090"], [235, "A 6R25M235090"]]);
sdpSi("HTD-5mm", 15, [[284, "A 6R25M284150"]]);
// Misumi: [teeth, part, page].
misumi("GT2-2mm", 6, [[121, "GBN2422GT-60", "https://us.misumi-ec.com/vona2/detail/110302652060/?HissuCode=GBN2422GT-60"]]);
