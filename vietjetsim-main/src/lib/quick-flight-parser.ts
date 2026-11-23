import { AIRPORT_CITIES } from '@/shared/constants';
import { normalizeFlightNo, FLIGHT_NO_PATTERN } from '@/lib/flight-no';
import { AIRCRAFT_MODELS } from '@/features/flights/constants';

export const FARE_LADDER_RATIO = 2.77;

export interface ParsedFlight {
  flight_no: string;
  from_code: string;
  to_code: string;
  from_city?: string;
  to_city?: string;
  date: string; // YYYY-MM-DD
  depart_time_str: string; // HH:mm
  arrive_time_str: string; // HH:mm
  depart_time: string; // ISO string
  arrive_time: string; // ISO string
  aircraft: string;
  terminal?: string;
  economy_price: number;
  business_price: number;
  price: number;
  class: string;
  available: number;
  rawText?: string;
  parseError?: string;
}

export interface QuickFlightParserOptions {
  defaultEcoPrice?: number;
  defaultBizPrice?: number;
  defaultCapacity?: number;
  defaultAircraft?: string;
  referenceYear?: number;
}

/**
 * Bảng alias tên thành phố / sân bay đầy đủ tại Việt Nam và quốc tế
 */
interface AirportAliasItem {
  code: string;
  city: string;
  aliases: string[];
}

export const AIRPORT_ALIASES: AirportAliasItem[] = [
  {
    code: 'SGN',
    city: 'TP. Hồ Chí Minh',
    aliases: [
      'tp. hồ chí minh',
      'tp hồ chí minh',
      'p hồ chí minh',
      'hồ chí minh',
      'ho chi minh',
      'tp.hcm',
      'tphcm',
      'sài gòn',
      'sai gon',
      'tân sơn nhất',
      'tan son nhat',
      'sgn',
    ],
  },
  {
    code: 'HAN',
    city: 'Hà Nội',
    aliases: ['hà nội', 'ha noi', 'nội bài', 'noi bai', 'han'],
  },
  {
    code: 'HPH',
    city: 'Hải Phòng',
    aliases: ['hải phòng', 'hai phong', 'cát bi', 'cat bi', 'hph'],
  },
  {
    code: 'DAD',
    city: 'Đà Nẵng',
    aliases: ['đà nẵng', 'da nang', 'dad'],
  },
  {
    code: 'CXR',
    city: 'Nha Trang',
    aliases: ['nha trang', 'cam ranh', 'cxr'],
  },
  {
    code: 'PQC',
    city: 'Phú Quốc',
    aliases: ['phú quốc', 'phu quoc', 'pqc'],
  },
  {
    code: 'VDO',
    city: 'Quảng Ninh',
    aliases: ['quảng ninh', 'quang ninh', 'vân đồn', 'van don', 'vdo'],
  },
  {
    code: 'HUI',
    city: 'Huế',
    aliases: ['huế', 'hue', 'phú bài', 'phu bai', 'hui'],
  },
  {
    code: 'DLI',
    city: 'Đà Lạt',
    aliases: ['đà lạt', 'da lat', 'liên khương', 'lien khuong', 'dli'],
  },
  {
    code: 'VII',
    city: 'Vinh',
    aliases: ['vinh', 'vii'],
  },
  {
    code: 'UIH',
    city: 'Quy Nhơn',
    aliases: ['quy nhơn', 'quy nhon', 'phù cát', 'phu cat', 'uih'],
  },
  {
    code: 'BMV',
    city: 'Buôn Ma Thuột',
    aliases: ['buôn ma thuột', 'buon ma thuot', 'bmv'],
  },
  {
    code: 'PXU',
    city: 'Pleiku',
    aliases: ['pleiku', 'pxu'],
  },
  {
    code: 'VCA',
    city: 'Cần Thơ',
    aliases: ['cần thơ', 'can tho', 'vca'],
  },
  {
    code: 'VCS',
    city: 'Côn Đảo',
    aliases: ['côn đảo', 'con dao', 'vcs'],
  },
  {
    code: 'THD',
    city: 'Thanh Hóa',
    aliases: ['thanh hóa', 'thanh hoa', 'thọ xuân', 'tho xuan', 'thd'],
  },
  {
    code: 'VDH',
    city: 'Quảng Bình',
    aliases: ['quảng bình', 'quang binh', 'đồng hới', 'dong hoi', 'vdh'],
  },
  {
    code: 'VCL',
    city: 'Chu Lai',
    aliases: ['chu lai', 'vcl'],
  },
  {
    code: 'DIN',
    city: 'Điện Biên Phủ',
    aliases: ['điện biên phủ', 'dien bien phu', 'điện biên', 'dien bien', 'din'],
  },
  {
    code: 'VKG',
    city: 'Rạch Giá',
    aliases: ['rạch giá', 'rach gia', 'vkg'],
  },
  {
    code: 'TBB',
    city: 'Phú Yên',
    aliases: ['tuy hòa', 'tuy hoa', 'phú yên', 'phu yen', 'tbb'],
  },
  // Quốc tế
  {
    code: 'SIN',
    city: 'Singapore',
    aliases: ['singapore', 'changi', 'sin'],
  },
  {
    code: 'BKK',
    city: 'Bangkok',
    aliases: ['bangkok', 'suvarnabhumi', 'bkk'],
  },
  {
    code: 'DMK',
    city: 'Bangkok (Don Mueang)',
    aliases: ['don mueang', 'dmk'],
  },
  {
    code: 'ICN',
    city: 'Seoul',
    aliases: ['seoul', 'incheon', 'icn'],
  },
  {
    code: 'KUL',
    city: 'Kuala Lumpur',
    aliases: ['kuala lumpur', 'kul'],
  },
  {
    code: 'NRT',
    city: 'Tokyo (Narita)',
    aliases: ['narita', 'nrt'],
  },
  {
    code: 'HND',
    city: 'Tokyo (Haneda)',
    aliases: ['haneda', 'hnd'],
  },
  {
    code: 'KIX',
    city: 'Osaka',
    aliases: ['osaka', 'kansai', 'kix'],
  },
  {
    code: 'TPE',
    city: 'Taipei',
    aliases: ['taipei', 'đài bắc', 'dai bac', 'tpe'],
  },
  {
    code: 'HKG',
    city: 'Hong Kong',
    aliases: ['hong kong', 'hkg'],
  },
];

/** Bỏ dấu tiếng Việt để so khớp không phân biệt dấu */
export function removeDiacritics(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/** Chuẩn hoá số hiệu chuyến bay dạng chuẩn hãng: VJ 272 (kèm dấu cách) */
export function formatCanonicalFlightNo(raw: string): string {
  const norm = normalizeFlightNo(raw);
  const m = norm.match(/^([A-Z]{2})\s*(\d{2,4}(?:-\d{4})?)$/);
  if (m) {
    return `${m[1]} ${m[2]}`;
  }
  return norm;
}

/** Chuẩn hoá chuỗi so khớp (chữ thường, bỏ dấu, gộp khoảng trắng) */
function normalizeKey(str: string): string {
  return removeDiacritics(str.trim().toLowerCase()).replace(/\s+/g, ' ');
}

/** Danh sách tất cả alias được sắp xếp theo độ dài giảm dần */
interface FlatAlias {
  key: string;
  code: string;
  length: number;
}

const SORTED_ALIASES: FlatAlias[] = AIRPORT_ALIASES.flatMap((item) =>
  item.aliases.map((alias) => ({
    key: normalizeKey(alias),
    code: item.code,
    length: normalizeKey(alias).length,
  }))
).sort((a, b) => b.length - a.length);

/**
 * Tìm mã sân bay từ một đoạn text (chữ hoặc mã IATA)
 */
export function findAirportCode(text: string): string | null {
  if (!text) return null;
  const rawUpper = text.trim().toUpperCase();
  if (AIRPORT_CITIES[rawUpper]) return rawUpper;

  const norm = normalizeKey(text);
  for (const item of SORTED_ALIASES) {
    if (norm === item.key || norm.startsWith(item.key + ' ') || norm.endsWith(' ' + item.key)) {
      return item.code;
    }
  }
  return null;
}

/**
 * Phân tích dòng chặng bay chứa cả Điểm đi và Điểm đến (VD: "P Hồ Chí Minh (T1)Hải Phòng T.Tư 02/12")
 */
export function parseRouteLine(line: string): {
  fromCode: string | null;
  toCode: string | null;
  dateStr: string | null;
  terminal: string | null;
} {
  let terminal: string | null = null;
  const termMatch = line.match(/\(T(\d+)\)|Nhà ga (T\d+|\d+)/i);
  if (termMatch) {
    terminal = termMatch[1] ? `T${termMatch[1]}` : termMatch[2];
  }

  // 1. Tìm ngày bay trong dòng (VD: T.Tư 02/12, Thứ 4 02/12, 02/12, 02/12/2026, 2026-12-02)
  let dateStr: string | null = null;
  let remainingLine = line;

  // Pattern: Thứ / T.X + DD/MM(/YYYY)? hoặc DD/MM(/YYYY)?
  const dateMatch = line.match(
    /(?:(?:T\.[A-Za-zÀ-ỹ]+|Thứ\s*[A-Za-zÀ-ỹ0-9]+|T[2-7]|CN|Chủ\s*nhật)\s*)?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/i
  );

  if (dateMatch) {
    const rawMatch = dateMatch[0];
    const day = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10);
    const yearRaw = dateMatch[3];

    const curYear = new Date().getFullYear();
    const curMonth = new Date().getMonth() + 1;
    let year = yearRaw ? parseInt(yearRaw, 10) : curYear;
    if (yearRaw && yearRaw.length === 2) {
      year = 2000 + year;
    } else if (!yearRaw) {
      // Nếu tháng quá khứ sâu (>6 tháng) so với hiện tại, tăng sang năm sau
      if (month < curMonth && curMonth - month > 6) {
        year = curYear + 1;
      }
    }

    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    // Cắt bỏ phần ngày ra khỏi chuỗi để phân tích địa danh
    remainingLine = remainingLine.replace(rawMatch, ' ');
  }

  // Bỏ các thẻ terminal như (T1), (T2)
  remainingLine = remainingLine.replace(/\(T\d+\)/gi, ' ').replace(/Nhà ga \w+/gi, ' ');

  // 2. Tách Điểm đi & Điểm đến
  let fromCode: string | null = null;
  let toCode: string | null = null;

  // Kiểm tra nếu có dấu phân cách rõ ràng (-, —, –, →, ->, đến, to, hoặc tab, >= 2 khoảng trắng)
  const sepMatch = remainingLine.match(/\s*(?:[-—–~→]|->|đến|to|\t|\s{2,})\s*/i);
  if (sepMatch && sepMatch.index !== undefined) {
    const part1 = remainingLine.slice(0, sepMatch.index).trim();
    const part2 = remainingLine.slice(sepMatch.index + sepMatch[0].length).trim();
    if (part1 && part2) {
      const c1 = findAirportCode(part1);
      const c2 = findAirportCode(part2);
      if (c1 && c2 && c1 !== c2) {
        fromCode = c1;
        toCode = c2;
      }
    }
  }

  // Nếu chưa tìm được (như case "P Hồ Chí Minh Hải Phòng" không có dấu gạch)
  if (!fromCode || !toCode) {
    const normLine = normalizeKey(remainingLine);

    // Duyệt tìm alias khớp ở đầu chuỗi (Điểm đi)
    for (const item of SORTED_ALIASES) {
      if (normLine.startsWith(item.key)) {
        fromCode = item.code;
        // Phần còn lại của dòng
        const rest = normLine.slice(item.key.length).trim();
        // Tìm tiếp Điểm đến trong phần còn lại
        for (const item2 of SORTED_ALIASES) {
          if (rest.startsWith(item2.key) || rest.endsWith(item2.key) || rest.includes(item2.key)) {
            toCode = item2.code;
            break;
          }
        }
        break;
      }
    }
  }

  // Fallback: nếu vẫn chưa có, quét tìm bất kỳ 2 mã hoặc alias xuất hiện trong dòng
  if (!fromCode || !toCode) {
    const normLine = normalizeKey(remainingLine);
    const found: Array<{ code: string; index: number; len: number }> = [];

    for (const item of SORTED_ALIASES) {
      const idx = normLine.indexOf(item.key);
      if (idx !== -1) {
        // Kiểm tra không bị overlap với từ đã tìm
        const isOverlap = found.some(
          (f) =>
            (idx >= f.index && idx < f.index + f.len) ||
            (idx + item.length > f.index && idx + item.length <= f.index + f.len)
        );
        if (!isOverlap) {
          found.push({ code: item.code, index: idx, len: item.length });
        }
      }
      if (found.length >= 2) break;
    }

    if (found.length >= 2) {
      found.sort((a, b) => a.index - b.index);
      fromCode = found[0].code;
      toCode = found[1].code;
    }
  }

  return { fromCode, toCode, dateStr, terminal };
}

/**
 * Trích xuất loại máy bay
 */
export function parseAircraft(text: string): string | null {
  if (!text) return null;
  const m = text.match(
    /(?:Máy bay|Tàu bay|Aircraft|Thiết bị)?\s*[:\s]*((?:Airbus\s+)?A\d{3}(?:neo)?|Boeing\s+\d{3}(?:[-\s]?MAX)?)/i
  );
  if (!m) return null;
  const raw = m[1].trim();

  // Chuẩn hoá về giá trị trong AIRCRAFT_MODELS
  if (/A321neo/i.test(raw)) return AIRCRAFT_MODELS.A321NEO;
  if (/A321/i.test(raw)) return AIRCRAFT_MODELS.A321;
  if (/A320/i.test(raw)) return AIRCRAFT_MODELS.A320;
  if (/A330/i.test(raw)) return AIRCRAFT_MODELS.A330;
  if (/737/i.test(raw)) return AIRCRAFT_MODELS.B737_MAX;
  if (/787/i.test(raw)) return AIRCRAFT_MODELS.B787;

  return raw;
}

/**
 * Phân tích một khối văn bản hành trình (Itinerary block)
 * Ví dụ:
 * P Hồ Chí Minh (T1)Hải Phòng T.Tư  02/12
 * 	Vietjet Air VJ272
 * 07:00 - 09:00
 * T1: Nhà ga T1
 * Máy bay: Airbus A321
 */
export function parseItineraryBlock(
  blockText: string,
  options?: QuickFlightParserOptions
): ParsedFlight | null {
  const lines = blockText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  if (lines.length === 0) return null;

  let flightNo: string | null = null;
  let fromCode: string | null = null;
  let toCode: string | null = null;
  let dateStr: string | null = null;
  let departTimeStr: string | null = null;
  let arriveTimeStr: string | null = null;
  let aircraft: string = options?.defaultAircraft || 'Airbus A321';
  let terminal: string | null = null;
  let economyPrice = options?.defaultEcoPrice || 499000;
  let businessPrice = options?.defaultBizPrice || Math.round(economyPrice * FARE_LADDER_RATIO);
  const capacity = options?.defaultCapacity || 180;

  for (const line of lines) {
    // 1. Kiểm tra số hiệu chuyến bay (chỉ nhận mã hãng viết hoa 2 ký tự: VJ, VN, QH, BL... hoặc có tên hãng đi kèm)
    const fnMatch = line.match(
      /(?:(?:Vietnam\s*Airlines|Vietjet(?:\s*Air)?|Bamboo(?:\s*Airways)?|Vietravel(?:\s*Airlines)?|Pacific(?:\s*Airlines)?)\s*)?(?:\b(VJ|VN|QH|BL|VU)\s*[-]?\s*(\d{2,4})\b|(?<![a-zA-ZÀ-ỹ])([A-Z]{2})\s*[-]?\s*(\d{2,4})\b)/
    );
    if (fnMatch && !flightNo) {
      const code = fnMatch[1] || fnMatch[3];
      const num = fnMatch[2] || fnMatch[4];
      if (code && num) {
        flightNo = formatCanonicalFlightNo(`${code} ${num}`);
      } else {
        flightNo = formatCanonicalFlightNo(fnMatch[0]);
      }
    }

    // 2. Kiểm tra giờ cất cánh - hạ cánh (VD: 07:00 - 09:00 hoặc 12:00 - 13:55)
    const timeMatch = line.match(/(\d{1,2}:\d{2})\s*(?:[-—–~→]|đến|to)\s*(\d{1,2}:\d{2})/i);
    if (timeMatch && !departTimeStr) {
      departTimeStr = timeMatch[1].padStart(5, '0');
      arriveTimeStr = timeMatch[2].padStart(5, '0');
    }

    // 3. Kiểm tra chặng bay & ngày bay
    if (!fromCode || !toCode || !dateStr) {
      const routeRes = parseRouteLine(line);
      if (routeRes.fromCode && !fromCode) fromCode = routeRes.fromCode;
      if (routeRes.toCode && !toCode) toCode = routeRes.toCode;
      if (routeRes.dateStr && !dateStr) dateStr = routeRes.dateStr;
      if (routeRes.terminal && !terminal) terminal = routeRes.terminal;
    }

    // 4. Kiểm tra loại máy bay (VD: Máy bay: Airbus A321)
    const ac = parseAircraft(line);
    if (ac) {
      aircraft = ac;
    }

    // 5. Kiểm tra terminal (VD: T1: Nhà ga T1)
    if (!terminal) {
      const termMatch = line.match(/(?:Nhà ga|Terminal|Ga)\s*(T\d+|\d+)/i);
      if (termMatch) {
        terminal = termMatch[1].startsWith('T') ? termMatch[1] : `T${termMatch[1]}`;
      }
    }

    // 6. Kiểm tra giá vé (nếu có ghi trong text, VD: Giá: 599.000đ)
    const priceMatch = line.match(
      /(?:Giá(?: vé)?|Eco(?:nomy)?|Từ)?\s*[:\s]*([\d.,]+)\s*(?:₫|VND|k)?/i
    );
    if (priceMatch) {
      const cleanNum = parseInt(priceMatch[1].replace(/[.,]/g, ''), 10);
      if (!isNaN(cleanNum) && cleanNum >= 10000 && cleanNum <= 50000000) {
        economyPrice = cleanNum;
        businessPrice = Math.round(cleanNum * FARE_LADDER_RATIO);
      }
    }
  }

  // Nếu thiếu các trường quan trọng thì báo lỗi
  if (!flightNo && !fromCode && !toCode && !departTimeStr) {
    return null;
  }

  // Tự động gán ngày mai nếu text không ghi ngày
  if (!dateStr) {
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);
    const y = tmr.getFullYear();
    const m = String(tmr.getMonth() + 1).padStart(2, '0');
    const d = String(tmr.getDate()).padStart(2, '0');
    dateStr = `${y}-${m}-${d}`;
  }

  if (!departTimeStr) departTimeStr = '07:00';
  if (!arriveTimeStr) arriveTimeStr = '09:00';

  const errors: string[] = [];
  if (!flightNo) errors.push('Không nhận diện được số hiệu (VJ / VN / QH xxx)');
  if (!fromCode) errors.push('Không nhận diện được điểm đi');
  if (!toCode) errors.push('Không nhận diện được điểm đến');
  if (fromCode && toCode && fromCode === toCode) errors.push('Điểm đi và điểm đến trùng nhau');

  const finalFlightNo = flightNo ? formatCanonicalFlightNo(flightNo) : 'VJ ???';
  if (flightNo && !FLIGHT_NO_PATTERN.test(finalFlightNo)) {
    errors.push(`Số hiệu "${finalFlightNo}" không đúng định dạng VJ XXX`);
  }

  // Tính toán depart_time & arrive_time ISO
  let departIso = '';
  let arriveIso = '';
  try {
    const depD = new Date(`${dateStr}T${departTimeStr}:00+07:00`);
    const arrD = new Date(`${dateStr}T${arriveTimeStr}:00+07:00`);
    // Nếu giờ đến nhỏ hơn giờ đi, tức là bay qua đêm sang ngày hôm sau
    if (arrD < depD) {
      arrD.setDate(arrD.getDate() + 1);
    }
    departIso = depD.toISOString();
    arriveIso = arrD.toISOString();
  } catch {
    errors.push('Định dạng ngày/giờ không hợp lệ');
  }

  return {
    flight_no: finalFlightNo,
    from_code: fromCode || '???',
    to_code: toCode || '???',
    from_city: fromCode ? AIRPORT_CITIES[fromCode] : undefined,
    to_city: toCode ? AIRPORT_CITIES[toCode] : undefined,
    date: dateStr,
    depart_time_str: departTimeStr,
    arrive_time_str: arriveTimeStr,
    depart_time: departIso,
    arrive_time: arriveIso,
    aircraft,
    terminal: terminal || undefined,
    economy_price: economyPrice,
    business_price: businessPrice,
    price: economyPrice,
    class: 'economy',
    available: capacity,
    rawText: blockText,
    parseError: errors.length > 0 ? errors.join('; ') : undefined,
  };
}

/**
 * Phân tích một dòng CSV
 * Định dạng: flight_no, from, to, date, dep_time, arr_time, eco_price, biz_price, capacity, aircraft
 */
export function parseCsvLine(
  line: string,
  lineNumber: number,
  options?: QuickFlightParserOptions
): ParsedFlight | null {
  const parts = line.split(/[,\t]/).map((p) => p.trim());
  if (parts.length < 4) {
    return {
      flight_no: `Dòng ${lineNumber}`,
      from_code: '???',
      to_code: '???',
      date: '',
      depart_time_str: '',
      arrive_time_str: '',
      depart_time: '',
      arrive_time: '',
      aircraft: 'Airbus A321',
      economy_price: 0,
      business_price: 0,
      price: 0,
      class: 'economy',
      available: 0,
      parseError: 'Thiếu cột (Cần tối thiểu: Số hiệu, Điểm đi, Điểm đến, Ngày bay, Giờ đi)',
      rawText: line,
    };
  }

  const rawFlightNo = parts[0];
  const flightNo = formatCanonicalFlightNo(rawFlightNo);
  const from = parts[1]?.toUpperCase();
  const to = parts[2]?.toUpperCase();
  const dateStr = parts[3];
  const depTime = parts[4] || '07:00';
  const arrTime = parts[5] || '09:00';
  const eco = parts[6] ? parseInt(parts[6], 10) : options?.defaultEcoPrice || 499000;
  const biz = parts[7]
    ? parseInt(parts[7], 10)
    : options?.defaultBizPrice || Math.round(eco * FARE_LADDER_RATIO);
  const cap = parts[8] ? parseInt(parts[8], 10) : options?.defaultCapacity || 180;
  const ac = parts[9] || options?.defaultAircraft || 'Airbus A321';

  try {
    const depD = new Date(`${dateStr}T${depTime}:00+07:00`);
    const arrD = new Date(`${dateStr}T${arrTime}:00+07:00`);
    if (arrD < depD) {
      arrD.setDate(arrD.getDate() + 1);
    }

    return {
      flight_no: flightNo,
      from_code: from,
      to_code: to,
      from_city: AIRPORT_CITIES[from],
      to_city: AIRPORT_CITIES[to],
      date: dateStr,
      depart_time_str: depTime,
      arrive_time_str: arrTime,
      depart_time: depD.toISOString(),
      arrive_time: arrD.toISOString(),
      economy_price: eco,
      business_price: biz,
      price: eco,
      class: 'economy',
      available: cap,
      aircraft: ac,
      rawText: line,
    };
  } catch {
    return {
      flight_no: flightNo,
      from_code: from,
      to_code: to,
      date: dateStr,
      depart_time_str: depTime,
      arrive_time_str: arrTime,
      depart_time: '',
      arrive_time: '',
      aircraft: ac,
      economy_price: eco,
      business_price: biz,
      price: eco,
      class: 'economy',
      available: cap,
      parseError: 'Định dạng ngày hoặc giờ không hợp lệ',
      rawText: line,
    };
  }
}

/**
 * Hàm phân tích tổng quát văn bản chuyến bay nhanh:
 * Tự động nhận diện cả 2 định dạng:
 * 1. Văn bản hành trình sao chép từ web/app (như "P Hồ Chí Minh (T1)Hải Phòng T.Tư 02/12 ...")
 * 2. Bảng CSV hoặc Tab-delimited (như "VJ 120, SGN, HAN, 2026-11-25, 08:00...")
 */
export function parseQuickFlightText(
  text: string,
  options?: QuickFlightParserOptions
): ParsedFlight[] {
  if (!text || !text.trim()) return [];

  const trimmed = text.trim();

  // Kiểm tra nếu văn bản là CSV (các dòng có >= 3 dấu phẩy và bắt đầu bằng VJ)
  const lines = trimmed.split('\n').filter((l) => l.trim().length > 0 && !l.trim().startsWith('#'));
  const isPureCsv =
    lines.length > 0 &&
    lines.every((l) => {
      const parts = l.split(',');
      return parts.length >= 4;
    });

  if (isPureCsv) {
    return lines
      .map((l, i) => parseCsvLine(l.trim(), i + 1, options))
      .filter((item): item is ParsedFlight => item !== null);
  }

  // Phân tách thành các block hành trình (hỗ trợ cả có hoặc không có dòng trống phân cách)
  const blocks: string[] = [];
  const sections = trimmed.split(/\n\s*\n/);

  for (const sec of sections) {
    const secLines = sec
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'));

    let currentBlockLines: string[] = [];
    let curHasRoute = false;
    let curHasFlightNo = false;

    for (const line of secLines) {
      const routeCheck = parseRouteLine(line);
      const lineHasRoute = !!(routeCheck.fromCode && routeCheck.toCode);
      const lineHasFlightNo =
        /(?:(?:Vietnam\s*Airlines|Vietjet(?:\s*Air)?|Bamboo(?:\s*Airways)?|Vietravel(?:\s*Airlines)?|Pacific(?:\s*Airlines)?)\s*)?(?:\b(VJ|VN|QH|BL|VU)\s*[-]?\s*\d{2,4}\b|(?<![a-zA-ZÀ-ỹ])[A-Z]{2}\s*[-]?\s*\d{2,4}\b)/.test(
          line
        );

      // Một chuyến bay mới bắt đầu nếu dòng này chứa chặng bay (hoặc số hiệu)
      // trong khi block hiện tại đã ghi nhận chặng bay / số hiệu trước đó
      const isNewFlight =
        (lineHasRoute && (curHasRoute || curHasFlightNo)) || (lineHasFlightNo && curHasFlightNo);

      if (isNewFlight && currentBlockLines.length > 0) {
        blocks.push(currentBlockLines.join('\n'));
        currentBlockLines = [line];
        curHasRoute = lineHasRoute;
        curHasFlightNo = lineHasFlightNo;
      } else {
        currentBlockLines.push(line);
        if (lineHasRoute) curHasRoute = true;
        if (lineHasFlightNo) curHasFlightNo = true;
      }
    }

    if (currentBlockLines.length > 0) {
      blocks.push(currentBlockLines.join('\n'));
    }
  }

  const results: ParsedFlight[] = [];
  for (const block of blocks) {
    const parsed = parseItineraryBlock(block, options);
    if (parsed) {
      results.push(parsed);
    }
  }

  return results;
}

export interface SingleFlightFormData {
  flightNo: string;
  date: string;
  from: string;
  to: string;
  departTime: string;
  arriveTime: string;
  economyPrice: string;
  businessPrice: string;
  capacity: string;
  aircraft: string;
}

/**
 * Trợ thủ phân tích nhanh cho form "Thêm chuyến bay mới" (đơn lẻ)
 * Tự động điền tất cả các trường: số hiệu, ngày bay, điểm đi, điểm đến, giờ đi, giờ đến, tàu bay...
 */
export function parseSingleFlightToForm(
  text: string,
  current?: Partial<SingleFlightFormData>
): {
  success: boolean;
  data?: SingleFlightFormData;
  summary?: string;
  error?: string;
} {
  const flights = parseQuickFlightText(text);
  if (flights.length === 0) {
    return { success: false, error: 'Không nhận diện được chuyến bay từ văn bản.' };
  }
  const f = flights[0];
  if (f.parseError) {
    return { success: false, error: f.parseError };
  }

  let summary = `${f.flight_no} (${f.from_code} → ${f.to_code}, ${f.date} ${f.depart_time_str} - ${f.arrive_time_str})`;
  if (flights.length > 1) {
    const ret = flights[1];
    summary += ` · Kèm chiều về: ${ret.flight_no} (${ret.from_code} → ${ret.to_code}, ${ret.date} ${ret.depart_time_str} - ${ret.arrive_time_str})`;
  }

  return {
    success: true,
    data: {
      flightNo: f.flight_no,
      date: f.date,
      from: f.from_code,
      to: f.to_code,
      departTime: f.depart_time_str,
      arriveTime: f.arrive_time_str,
      economyPrice: String(f.economy_price || current?.economyPrice || 499000),
      businessPrice: String(
        f.business_price || current?.businessPrice || Math.round(499000 * FARE_LADDER_RATIO)
      ),
      capacity: String(f.available || current?.capacity || 180),
      aircraft: f.aircraft || current?.aircraft || 'Airbus A321',
    },
    summary,
  };
}
