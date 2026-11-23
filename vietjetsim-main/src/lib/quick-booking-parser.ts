/**
 * Bộ phân tích bóc tách danh sách hành khách nhanh cho Admin Đặt vé
 */

export interface ParsedPassenger {
  name: string;
  gender: 'male' | 'female';
  passenger_type: 'adult' | 'child' | 'infant';
  dob?: string;
  id_number?: string;
  phone?: string;
  email?: string;
  seat_number?: string;
}

export function parsePassengerQuickText(text: string): ParsedPassenger[] {
  if (!text || !text.trim()) return [];
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  const results: ParsedPassenger[] = [];

  for (const line of lines) {
    // Loại bỏ số thứ tự ở đầu dòng: "1. ", "1/ ", "1- ", "[1] "
    let clean = line.replace(/^\s*(?:\[\d+\]|\d+[./\-)])\s*/, '').trim();

    // Tìm email nếu có
    let email: string | undefined;
    const emailMatch = clean.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch) {
      email = emailMatch[1].toLowerCase();
      clean = clean.replace(emailMatch[0], ' ').trim();
    }

    // Tìm số điện thoại (10 chữ số bắt đầu bằng 0)
    let phone: string | undefined;
    const phoneMatch = clean.match(/(?:(?:\+84|84|0)\s*[3|5|7|8|9]\d{8}|\b0\d{9}\b)/);
    if (phoneMatch) {
      phone = phoneMatch[0].replace(/\s+/g, '');
      clean = clean.replace(phoneMatch[0], ' ').trim();
    }

    // Tìm số CCCD / Hộ chiếu (9 đến 12 chữ số hoặc 1 chữ cái + 7-8 số)
    let idNumber: string | undefined;
    const idMatch = clean.match(/\b(?:\d{12}|\d{9}|[A-Z]\d{7,8})\b/i);
    if (idMatch) {
      idNumber = idMatch[0].toUpperCase();
      clean = clean.replace(idMatch[0], ' ').trim();
    }

    // Tìm ngày sinh (DD/MM/YYYY hoặc YYYY-MM-DD)
    let dob: string | undefined;
    const dobMatch = clean.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/);
    if (dobMatch) {
      const day = dobMatch[1].padStart(2, '0');
      const month = dobMatch[2].padStart(2, '0');
      const year = dobMatch[3];
      dob = `${year}-${month}-${day}`;
      clean = clean.replace(dobMatch[0], ' ').trim();
    } else {
      const isoDobMatch = clean.match(/\b(\d{4})[/-](\d{1,2})[/-](\d{1,2})\b/);
      if (isoDobMatch) {
        const year = isoDobMatch[1];
        const month = isoDobMatch[2].padStart(2, '0');
        const day = isoDobMatch[3].padStart(2, '0');
        dob = `${year}-${month}-${day}`;
        clean = clean.replace(isoDobMatch[0], ' ').trim();
      }
    }

    // Tìm loại khách: Trẻ em (child), Em bé (infant), Người lớn (adult)
    let passengerType: 'adult' | 'child' | 'infant' = 'adult';
    if (/em\s*bé|infant|sơ\s*sinh/i.test(clean)) {
      passengerType = 'infant';
      clean = clean.replace(/[[({]?(?:em\s*bé|infant|sơ\s*sinh)[\])}]*/gi, ' ').trim();
    } else if (/trẻ\s*em|child|te\b/i.test(clean)) {
      passengerType = 'child';
      clean = clean.replace(/[[({]?(?:trẻ\s*em|child|te\b)[\])}]*/gi, ' ').trim();
    } else if (/người\s*lớn|adult|nl\b/i.test(clean)) {
      passengerType = 'adult';
      clean = clean.replace(/[[({]?(?:người\s*lớn|adult|nl\b)[\])}]*/gi, ' ').trim();
    }

    // Tìm giới tính (Nam / Nữ / Male / Female)
    let gender: 'male' | 'female' = 'male';
    const femaleMatch = clean.match(
      /(?:^|[\s,;:|-])(nữ|female|chị|bà|cô|mrs|ms|miss)(?:$|[\s,;:|-])/i
    );
    const maleMatch = clean.match(/(?:^|[\s,;:|-])(nam|male|anh|ông|mr)(?:$|[\s,;:|-])/i);

    if (femaleMatch) {
      gender = 'female';
      clean = clean
        .replace(new RegExp(`(^|[\\s,;:|])${femaleMatch[1]}($|[\\s,;:|])`, 'gi'), ' ')
        .trim();
    } else if (maleMatch) {
      gender = 'male';
      clean = clean
        .replace(new RegExp(`(^|[\\s,;:|])${maleMatch[1]}($|[\\s,;:|])`, 'gi'), ' ')
        .trim();
    }

    // Tìm số ghế (VD: 12A, 5C, 24F)
    let seatNumber: string | undefined;
    const seatMatch = clean.match(/\b([1-3]?\d[A-F])\b/i);
    if (seatMatch) {
      seatNumber = seatMatch[1].toUpperCase();
      clean = clean.replace(seatMatch[0], ' ').trim();
    }

    // Phần còn lại sau khi tách các token phân cách (-, |, ,, :) là tên hành khách
    const namePart = clean
      .replace(/^[\s,;:|-]+|[\s,;:|-]+$/g, '')
      .replace(/[\s,;:|-]+/g, ' ')
      .trim();

    if (namePart) {
      results.push({
        name: namePart.toUpperCase(),
        gender,
        passenger_type: passengerType,
        dob,
        id_number: idNumber,
        phone,
        email,
        seat_number: seatNumber,
      });
    }
  }

  return results;
}
