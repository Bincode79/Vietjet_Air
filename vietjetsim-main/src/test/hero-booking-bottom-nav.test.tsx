import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BOTTOM_NAV_HEIGHT } from '@/shared/components/navigation/MobileBottomNav';

describe('Mobile bottom nav does not cover page content', () => {
  const layoutSrc = fs.readFileSync(path.join(__dirname, '..', 'app', 'layout.tsx'), 'utf-8');

  it('matches the real-site nav height of 88px', () => {
    expect(BOTTOM_NAV_HEIGHT).toBe(88);
  });

  it('reserves at least the nav height below the body on mobile', () => {
    // `pb-[calc(62px+...)]` is smaller than the 88px nav and can leave the last
    // 26px of page content under the fixed bar. Pin the value at >= 88px so a
    // future edit cannot silently reintroduce the overlap.
    expect(layoutSrc).toContain('pb-[calc(88px+env(safe-area-inset-bottom))]');
  });
});
