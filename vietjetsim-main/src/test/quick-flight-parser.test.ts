import { describe, it, expect } from 'vitest';
import {
  parseQuickFlightText,
  parseItineraryBlock,
  parseRouteLine,
  parseAircraft,
  parseSingleFlightToForm,
} from '@/lib/quick-flight-parser';

describe('quick-flight-parser', () => {
  describe('Khối hành trình sao chép thực tế từ người dùng', () => {
    const userInput = `P Hồ Chí Minh (T1)Hải Phòng T.Tư  02/12
	Vietjet Air VJ272
07:00 - 09:00
T1: Nhà ga T1
Máy bay: Airbus A321`;

    it('nhận diện đầy đủ thông tin từ chuỗi mẫu của người dùng', () => {
      const results = parseQuickFlightText(userInput);
      expect(results).toHaveLength(1);

      const flight = results[0];
      expect(flight.flight_no).toBe('VJ 272');
      expect(flight.from_code).toBe('SGN');
      expect(flight.to_code).toBe('HPH');
      expect(flight.from_city).toBe('TP. Hồ Chí Minh');
      expect(flight.to_city).toBe('Hải Phòng');
      expect(flight.date).toBe('2026-12-02');
      expect(flight.depart_time_str).toBe('07:00');
      expect(flight.arrive_time_str).toBe('09:00');
      expect(flight.aircraft).toBe('Airbus A321');
      expect(flight.terminal).toBe('T1');
      expect(flight.available).toBe(180);
      expect(flight.economy_price).toBe(499000);
      expect(flight.business_price).toBe(Math.round(499000 * 2.77));
      expect(flight.parseError).toBeUndefined();

      // Kiểm tra ISO string hợp lệ
      expect(flight.depart_time).toContain('2026-12-02T');
      expect(flight.arrive_time).toContain('2026-12-02T');
    });

    it('parseRouteLine xử lý chặng bay dính liền terminal', () => {
      const res = parseRouteLine('P Hồ Chí Minh (T1)Hải Phòng T.Tư  02/12');
      expect(res.fromCode).toBe('SGN');
      expect(res.toCode).toBe('HPH');
      expect(res.dateStr).toBe('2026-12-02');
      expect(res.terminal).toBe('T1');
    });

    it('parseAircraft nhận diện đúng loại tàu bay', () => {
      expect(parseAircraft('Máy bay: Airbus A321')).toBe('Airbus A321');
      expect(parseAircraft('Tàu bay: A321neo')).toBe('Airbus A321neo');
      expect(parseAircraft('Airbus A320')).toBe('Airbus A320');
      expect(parseAircraft('Boeing 737 MAX')).toBe('Boeing 737 MAX');
    });
  });

  describe('Nhiều chuyến bay trong một lần dán', () => {
    const multiInput = `P Hồ Chí Minh (T1)Hải Phòng T.Tư  02/12
Vietjet Air VJ272
07:00 - 09:00
T1: Nhà ga T1
Máy bay: Airbus A321

Hải Phòng (T1)P Hồ Chí Minh T.Tư  02/12
Vietjet Air VJ273
10:00 - 12:00
T1: Nhà ga T1
Máy bay: Airbus A321`;

    it('phân tách chính xác 2 khối chuyến bay', () => {
      const results = parseQuickFlightText(multiInput);
      expect(results).toHaveLength(2);

      expect(results[0].flight_no).toBe('VJ 272');
      expect(results[0].from_code).toBe('SGN');
      expect(results[0].to_code).toBe('HPH');

      expect(results[1].flight_no).toBe('VJ 273');
      expect(results[1].from_code).toBe('HPH');
      expect(results[1].to_code).toBe('SGN');
    });
  });

  describe('Các biến thể tên thành phố và chặng bay', () => {
    it('nhận diện chặng có dấu gạch ngang và ngày có năm', () => {
      const res = parseItineraryBlock(`Hà Nội - Đà Nẵng 15/12/2026
VJ 181
08:30 - 09:50
Máy bay: Airbus A320`);

      expect(res?.flight_no).toBe('VJ 181');
      expect(res?.from_code).toBe('HAN');
      expect(res?.to_code).toBe('DAD');
      expect(res?.date).toBe('2026-12-15');
      expect(res?.depart_time_str).toBe('08:30');
      expect(res?.arrive_time_str).toBe('09:50');
      expect(res?.aircraft).toBe('Airbus A320');
    });

    it('nhận diện chặng bay quốc tế', () => {
      const res = parseItineraryBlock(`TP. Hồ Chí Minh -> Singapore 20/12
VJ 813
14:15 - 17:25
Airbus A321`);

      expect(res?.flight_no).toBe('VJ 813');
      expect(res?.from_code).toBe('SGN');
      expect(res?.to_code).toBe('SIN');
    });
  });

  describe('Định dạng CSV truyền thống', () => {
    it('phân tích danh sách CSV tương thích ngược', () => {
      const csv = `VJ 120, SGN, HAN, 2026-11-25, 08:00, 10:15, 699000, 1899000, 180, Airbus A321
VJ 121, HAN, SGN, 2026-11-25, 11:30, 13:45, 699000, 1899000, 180, Airbus A321`;

      const results = parseQuickFlightText(csv);
      expect(results).toHaveLength(2);
      expect(results[0].flight_no).toBe('VJ 120');
      expect(results[0].from_code).toBe('SGN');
      expect(results[0].to_code).toBe('HAN');
      expect(results[0].economy_price).toBe(699000);
      expect(results[0].business_price).toBe(1899000);

      expect(results[1].flight_no).toBe('VJ 121');
      expect(results[1].from_code).toBe('HAN');
      expect(results[1].to_code).toBe('SGN');
    });
  });

  describe('Chuyến bay qua đêm (overnight)', () => {
    it('tự động cộng thêm 1 ngày cho giờ hạ cánh nếu giờ đến nhỏ hơn giờ đi', () => {
      const res = parseItineraryBlock(`SGN - HAN 10/12/2026
VJ 198
23:30 - 01:45
Airbus A321`);

      expect(res?.date).toBe('2026-12-10');
      expect(res?.depart_time_str).toBe('23:30');
      expect(res?.arrive_time_str).toBe('01:45');
      expect(res?.depart_time).toContain('2026-12-10T16:30:00'); // 23:30 UTC+7 = 16:30 UTC
      expect(res?.arrive_time).toContain('2026-12-10T18:45:00'); // 01:45 ngày hôm sau UTC+7 = 18:45 cùng ngày UTC
    });
  });

  describe('parseSingleFlightToForm', () => {
    it('điền đầy đủ trường cho form thêm chuyến bay từ văn bản người dùng', () => {
      const input = `P Hồ Chí Minh (T1)Hải Phòng T.Tư  02/12
	Vietjet Air VJ272
07:00 - 09:00
T1: Nhà ga T1
Máy bay: Airbus A321`;

      const res = parseSingleFlightToForm(input);
      expect(res.success).toBe(true);
      expect(res.data?.flightNo).toBe('VJ 272');
      expect(res.data?.from).toBe('SGN');
      expect(res.data?.to).toBe('HPH');
      expect(res.data?.date).toBe('2026-12-02');
      expect(res.data?.departTime).toBe('07:00');
      expect(res.data?.arriveTime).toBe('09:00');
      expect(res.data?.aircraft).toBe('Airbus A321');
      expect(res.summary).toContain('VJ 272 (SGN → HPH');
    });
  });

  describe('Vé khứ hồi nhập nhanh (Vietnam Airlines Hà Nội - Đà Lạt)', () => {
    const roundTripInput = `Hà Nội      Đà Lạt  	Chủ Nhật 07/02/2027	
 Vietnam Airlines   VN1575	12:00 - 13:55	
Máy bay: Airbus A321		
Đà Lạt      Hà Nội  	Thứ Năm 11/02/2027	
 Vietnam Airlines   VN1574	14:30 - 16:25	
Máy bay: Airbus A321`;

    it('nhận diện chính xác cả 2 chiều đi và về không có dòng trống', () => {
      const results = parseQuickFlightText(roundTripInput);
      expect(results).toHaveLength(2);

      // Chiều đi
      const outbound = results[0];
      expect(outbound.flight_no).toBe('VN 1575');
      expect(outbound.from_code).toBe('HAN');
      expect(outbound.to_code).toBe('DLI');
      expect(outbound.from_city).toBe('Hà Nội');
      expect(outbound.to_city).toBe('Đà Lạt');
      expect(outbound.date).toBe('2027-02-07');
      expect(outbound.depart_time_str).toBe('12:00');
      expect(outbound.arrive_time_str).toBe('13:55');
      expect(outbound.aircraft).toBe('Airbus A321');
      expect(outbound.parseError).toBeUndefined();

      // Chiều về
      const inbound = results[1];
      expect(inbound.flight_no).toBe('VN 1574');
      expect(inbound.from_code).toBe('DLI');
      expect(inbound.to_code).toBe('HAN');
      expect(inbound.from_city).toBe('Đà Lạt');
      expect(inbound.to_city).toBe('Hà Nội');
      expect(inbound.date).toBe('2027-02-11');
      expect(inbound.depart_time_str).toBe('14:30');
      expect(inbound.arrive_time_str).toBe('16:25');
      expect(inbound.aircraft).toBe('Airbus A321');
      expect(inbound.parseError).toBeUndefined();
    });

    it('parseSingleFlightToForm hỗ trợ thông báo khứ hồi khi dán vé khứ hồi', () => {
      const res = parseSingleFlightToForm(roundTripInput);
      expect(res.success).toBe(true);
      expect(res.data?.flightNo).toBe('VN 1575');
      expect(res.data?.from).toBe('HAN');
      expect(res.data?.to).toBe('DLI');
      expect(res.data?.date).toBe('2027-02-07');
      expect(res.data?.departTime).toBe('12:00');
      expect(res.data?.arriveTime).toBe('13:55');
      expect(res.summary).toContain('Kèm chiều về: VN 1574');
      expect(res.data?.returnFlight?.flightNo).toBe('VN 1574');
    });
  });

  describe('Bổ sung thêm giá vé cho chuyến bay 1 chiều và 2 chiều', () => {
    it('nhận diện giá vé 1 chiều (VJ272 có Giá vé: 1.550.000 VND)', () => {
      const input = `P Hồ Chí Minh (T1)Hải Phòng T.Tư  02/12
	Vietjet Air VJ272
07:00 - 09:00
T1: Nhà ga T1
Máy bay: Airbus A321
Giá vé: 1.550.000 VND`;

      const results = parseQuickFlightText(input);
      expect(results).toHaveLength(1);
      const f = results[0];
      expect(f.flight_no).toBe('VJ 272');
      expect(f.economy_price).toBe(1550000);
      expect(f.price).toBe(1550000);
      expect(f.priceSource).toBe('text');
      expect(f.tripType).toBe('one_way');
    });

    it('nhận diện giá vé cả Eco và Thương gia trong cùng một dòng', () => {
      const input = `Hà Nội - Sài Gòn 10/12/2026
VJ 120
07:00 - 09:15
Eco: 1.250.000 VND | Thương gia: 3.500.000 VND`;

      const results = parseQuickFlightText(input);
      expect(results).toHaveLength(1);
      const f = results[0];
      expect(f.economy_price).toBe(1250000);
      expect(f.business_price).toBe(3500000);
      expect(f.priceSource).toBe('text');
    });

    it('nhận diện vé 2 chiều có giá riêng cho từng chiều', () => {
      const input = `Hà Nội      Đà Lạt  	Chủ Nhật 07/02/2027	
 Vietnam Airlines   VN1575	12:00 - 13:55	
Máy bay: Airbus A321		
Giá vé: 1.850.000 VND

Đà Lạt      Hà Nội  	Thứ Năm 11/02/2027	
 Vietnam Airlines   VN1574	14:30 - 16:25	
Máy bay: Airbus A321
Giá vé: 1.650.000 VND`;

      const results = parseQuickFlightText(input);
      expect(results).toHaveLength(2);

      const [outbound, inbound] = results;
      expect(outbound.economy_price).toBe(1850000);
      expect(outbound.priceSource).toBe('text');
      expect(outbound.tripType).toBe('round_trip');
      expect(outbound.direction).toBe('outbound');

      expect(inbound.economy_price).toBe(1650000);
      expect(inbound.priceSource).toBe('text');
      expect(inbound.tripType).toBe('round_trip');
      expect(inbound.direction).toBe('return');

      expect(outbound.roundTripTotalPrice).toBe(3500000);
      expect(inbound.roundTripTotalPrice).toBe(3500000);
    });

    it('nhận diện vé 2 chiều có dòng tổng giá vé khứ hồi (chia đều 2 chiều)', () => {
      const input = `Hà Nội      Đà Lạt  	Chủ Nhật 07/02/2027	
 Vietnam Airlines   VN1575	12:00 - 13:55	
Máy bay: Airbus A321		
Đà Lạt      Hà Nội  	Thứ Năm 11/02/2027	
 Vietnam Airlines   VN1574	14:30 - 16:25	
Máy bay: Airbus A321
Giá vé 2 chiều: 3.500.000 VND`;

      const results = parseQuickFlightText(input);
      expect(results).toHaveLength(2);

      const [outbound, inbound] = results;
      expect(outbound.economy_price).toBe(1750000);
      expect(inbound.economy_price).toBe(1750000);
      expect(outbound.priceSource).toBe('roundtrip_split');
      expect(inbound.priceSource).toBe('roundtrip_split');
      expect(outbound.roundTripTotalPrice).toBe(3500000);
    });

    it('parseSingleFlightToForm trả về đầy đủ giá vé 1 chiều và 2 chiều', () => {
      const singleInput = `P Hồ Chí Minh Hải Phòng 02/12
VJ 272 07:00 - 09:00
Giá vé: 1.550.000 VND`;

      const res1 = parseSingleFlightToForm(singleInput);
      expect(res1.success).toBe(true);
      expect(res1.data?.economyPrice).toBe('1550000');
      expect(res1.summary).toContain('1.550.000₫');

      const roundInput = `Hà Nội - Đà Lạt 07/02/2027
VN 1575 12:00 - 13:55
Giá vé: 1.850.000 VND
Đà Lạt - Hà Nội 11/02/2027
VN 1574 14:30 - 16:25
Giá vé: 1.650.000 VND`;

      const res2 = parseSingleFlightToForm(roundInput);
      expect(res2.success).toBe(true);
      expect(res2.data?.economyPrice).toBe('1850000');
      expect(res2.data?.returnFlight?.economyPrice).toBe('1650000');
      expect(res2.data?.totalRoundTripPrice).toBe(3500000);
      expect(res2.summary).toContain('Tổng 2 chiều: 3.500.000₫');
    });
  });
});
