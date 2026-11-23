import { describe, it, expect } from 'vitest';
import { parsePassengerQuickText } from '@/lib/quick-booking-parser';

describe('Quick Booking Passenger Parser (Bóc tách văn bản hành khách nhanh)', () => {
  it('bóc tách hành khách đầy đủ thông tin với số thứ tự', () => {
    const text = '1. NGUYỄN VĂN AN - 0912345678 - 001200001111 - Nam - 15/05/1990';
    const res = parsePassengerQuickText(text);

    expect(res).toHaveLength(1);
    expect(res[0].name).toBe('NGUYỄN VĂN AN');
    expect(res[0].phone).toBe('0912345678');
    expect(res[0].id_number).toBe('001200001111');
    expect(res[0].gender).toBe('male');
    expect(res[0].dob).toBe('1990-05-15');
    expect(res[0].passenger_type).toBe('adult');
  });

  it('bóc tách nhiều hành khách gồm cả Nữ, Trẻ em, Em bé', () => {
    const text = `
      1. NGUYỄN VĂN AN - 0912345678 - Nam
      2. TRẦN THỊ BÌNH - 0987654321 - Nữ - 001200002222
      3. NGUYỄN VĂN CẢNH (Trẻ em) - 01/06/2018
      4. NGUYỄN BÉ BI (Em bé) - 10/10/2025
    `;
    const res = parsePassengerQuickText(text);

    expect(res).toHaveLength(4);

    expect(res[0].name).toBe('NGUYỄN VĂN AN');
    expect(res[0].gender).toBe('male');
    expect(res[0].passenger_type).toBe('adult');

    expect(res[1].name).toBe('TRẦN THỊ BÌNH');
    expect(res[1].gender).toBe('female');
    expect(res[1].id_number).toBe('001200002222');
    expect(res[1].passenger_type).toBe('adult');

    expect(res[2].name).toBe('NGUYỄN VĂN CẢNH');
    expect(res[2].passenger_type).toBe('child');
    expect(res[2].dob).toBe('2018-06-01');

    expect(res[3].name).toBe('NGUYỄN BÉ BI');
    expect(res[3].passenger_type).toBe('infant');
    expect(res[3].dob).toBe('2025-10-10');
  });

  it('nhận diện email và số ghế ngồi nếu có', () => {
    const text = 'LE VAN LONG - long.le@gmail.com - 0903123456 - 15A';
    const res = parsePassengerQuickText(text);

    expect(res).toHaveLength(1);
    expect(res[0].name).toBe('LE VAN LONG');
    expect(res[0].email).toBe('long.le@gmail.com');
    expect(res[0].phone).toBe('0903123456');
    expect(res[0].seat_number).toBe('15A');
  });

  it('xử lý chuỗi rỗng an toàn', () => {
    expect(parsePassengerQuickText('')).toEqual([]);
    expect(parsePassengerQuickText('   \n\n  ')).toEqual([]);
  });
});
