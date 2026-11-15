/**
 * The OpenClaw integration is gone.
 *
 * OpenClaw was three things in one: an AI assistant in the admin console, a
 * web collector that scraped flights from vietjetair.com, and a gateway
 * client for Ollama. The collector never worked against the real site, so
 * the whole integration was removed rather than left as a broken button.
 *
 * The support chat between admin and customer is a separate system
 * (`/api/tro-chuyen/*`) and stays — only the AI half was removed.
 *
 * These tests pin the boundary so a stray import cannot drag the integration
 * back in, and so the pricing constants the collector used to own — which the
 * bulk price-adjust endpoint genuinely needs — are not deleted along with it.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

function exists(path: string) {
  return existsSync(join(ROOT, path));
}

function read(path: string) {
  return readFileSync(join(ROOT, path), 'utf8');
}

describe('OpenClaw đã bị gỡ khỏi dự án', () => {
  it('không còn thư mục lib/openclaw', () => {
    expect(exists('src/lib/openclaw')).toBe(false);
  });

  it('không còn route trợ lý AI', () => {
    expect(exists('src/app/api/tro-ly-ai')).toBe(false);
  });

  it('không còn các route thu thập dữ liệu', () => {
    for (const route of [
      'thu-thap-mang-luoi',
      'thu-thap-lich-bay',
      'thu-thap-hang-loat',
      'thu-thap-tu-dong',
      'thu-thap-giai-waf',
    ]) {
      expect(exists(`src/app/api/quan-tri/${route}`)).toBe(false);
    }
  });

  it('không còn widget trợ lý AI', () => {
    expect(exists('src/features/chat/components/OpenClawAssistant.tsx')).toBe(false);
  });

  it('không còn panel thu thập trong bảng quản trị', () => {
    expect(exists('src/features/admin/components/AutoSyncSettingsPanel.tsx')).toBe(false);
    expect(exists('src/features/admin/components/BulkCollectPanel.tsx')).toBe(false);

    const flightsTab = read('src/features/admin/components/FlightsTab.tsx');
    expect(flightsTab).not.toMatch(/Thu thập dữ liệu web/);
    expect(flightsTab).not.toMatch(/Thu Thập Dữ Liệu Web/);
    expect(flightsTab).not.toMatch(/AutoSyncSettingsPanel/);
    expect(flightsTab).not.toMatch(/BulkCollectPanel/);
  });

  it('không còn endpoint AI hay endpoint thu thập trong constants', () => {
    const constants = read('src/shared/constants/index.ts');
    expect(constants).not.toMatch(/tro-ly-ai/);
    expect(constants).not.toMatch(/thu-thap-/);
  });

  it('không còn service gọi tới AI hay thu thập', () => {
    const adminServices = read('src/features/admin/services/index.ts');
    expect(adminServices).not.toMatch(/collectAdmin/);
    expect(adminServices).not.toMatch(/importCollectedFlights/);
    expect(adminServices).not.toMatch(/AutoSync/);
    expect(adminServices).not.toMatch(/SolveWaf/);

    const chatServices = read('src/features/chat/services/index.ts');
    expect(chatServices).not.toMatch(/askAssistant/);
    expect(chatServices).not.toMatch(/getAssistantStatus/);
  });

  it('không còn hàm db chỉ phục vụ trợ lý AI', () => {
    const db = read('src/lib/db.ts');
    expect(db).not.toMatch(/getFlightByNoAndDate/);
    expect(db).not.toMatch(/getFlightDatesNear/);
  });
});

describe('hệ thống chat realtime khách hàng được giữ nguyên', () => {
  it('vẫn còn widget chat và các route chat', () => {
    expect(exists('src/features/chat/components/UserChat.tsx')).toBe(true);
    for (const route of [
      'src/app/api/tro-chuyen/route.ts',
      'src/app/api/tro-chuyen/cuoc-hoi-thoai/route.ts',
      'src/app/api/tro-chuyen/truc-tuyen/route.ts',
      'src/app/api/tro-chuyen/danh-dau-da-doc/route.ts',
      'src/app/api/tro-chuyen/cuoc-goi/route.ts',
      'src/app/api/tro-chuyen/khach/route.ts',
    ]) {
      expect(exists(route)).toBe(true);
    }
  });

  it('vẫn còn endpoint presence trong constants', () => {
    const constants = read('src/shared/constants/index.ts');
    expect(constants).toMatch(/\/api\/tro-chuyen\/truc-tuyen/);
  });

  it('vẫn còn kiểm thử bảo mật của hệ thống chat', () => {
    expect(exists('src/test/chat-security.test.ts')).toBe(true);
    const security = read('src/test/chat-security.test.ts');
    expect(security).toMatch(/postPresence/);
    expect(security).not.toMatch(/postAi/);
  });
});

describe('hằng số điều chỉnh giá được giữ lại', () => {
  it('tồn tại file hằng số riêng, không phụ thuộc collector', () => {
    expect(exists('src/lib/flight-pricing-constants.ts')).toBe(true);
    const constants = read('src/lib/flight-pricing-constants.ts');
    expect(constants).toMatch(/FARE_LADDER_RATIO/);
    expect(constants).toMatch(/DEFAULT_VIETJET_DISCOUNT_VND/);
    expect(constants).toMatch(/MIN_TICKET_PRICE_FLOOR/);
  });

  it('route điều chỉnh giá import từ file hằng số mới', () => {
    const route = read('src/app/api/quan-tri/chuyen-bay/dieu-chinh-gia/route.ts');
    expect(route).toMatch(/@\/lib\/flight-pricing-constants/);
    expect(route).not.toMatch(/lib\/openclaw/);
  });

  it('helper điều chỉnh giá cũng import từ file hằng số mới', () => {
    const helper = read('src/lib/flight-bulk-price.ts');
    expect(helper).toMatch(/@\/lib\/flight-pricing-constants/);
    expect(helper).not.toMatch(/lib\/openclaw/);
  });
});
