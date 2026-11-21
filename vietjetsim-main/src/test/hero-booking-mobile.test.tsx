import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import HeroBookingWidget from '@/app/trang-chu/components/HeroBookingWidget';

const LONG_AIRPORTS = [
  { code: 'HAN', city: 'Hà Nội', airport: 'Sân bay quốc tế Nội Bài' },
  { code: 'SGN', city: 'Thành phố Hồ Chí Minh', airport: 'Sân bay quốc tế Tân Sơn Nhất' },
  { code: 'DAD', city: 'Đà Nẵng', airport: 'Sân bay quốc tế Đà Nẵng' },
  { code: 'CXR', city: 'Nha Trang', airport: 'Sân bay quốc tế Cam Ranh' },
];

function setViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, 'innerHeight', {
    writable: true,
    configurable: true,
    value: height,
  });
}

function mockAirports(airports = LONG_AIRPORTS) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ airports }),
  } as Response);
}

describe('HeroBookingWidget mobile responsive', () => {
  beforeEach(() => {
    mockAirports();
    vi.restoreAllMocks();
    setViewport(390, 844);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setViewport(390, 844);
  });

  it('renders the booking form and CTA at 375px portrait', () => {
    setViewport(375, 812);
    render(<HeroBookingWidget />);

    expect(screen.getByText('Điểm khởi hành')).toBeInTheDocument();
    expect(screen.getByText('Điểm đến')).toBeInTheDocument();
    expect(screen.getByText('Hành khách')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tìm chuyến bay/i })).toBeInTheDocument();
  });

  it('truncates long airport names at 375px', () => {
    setViewport(375, 812);
    render(<HeroBookingWidget />);

    fireEvent.click(screen.getByRole('button', { name: 'Điểm khởi hành' }));
    expect(screen.getByRole('listbox', { name: 'Điểm khởi hành' })).toBeInTheDocument();
    // Each option shows city (code); long names are truncated, not wrapped.
    expect(screen.getAllByText('Hà Nội ( HAN )')).toHaveLength(2);
  });

  it('opens airport picker listbox at 375px', () => {
    setViewport(375, 812);
    render(<HeroBookingWidget />);

    fireEvent.click(screen.getByRole('button', { name: 'Điểm khởi hành' }));
    const listbox = screen.getByRole('listbox', { name: 'Điểm khởi hành' });
    expect(listbox).toBeInTheDocument();
    expect(listbox).toHaveClass('bg-white');
  });

  it('opens date picker popover at 375px', () => {
    setViewport(375, 812);
    render(<HeroBookingWidget />);

    fireEvent.click(screen.getByRole('button', { name: 'Ngày đi' }));
    // Popover renders two month headers ("Tháng X YYYY").
    expect(screen.getAllByText(/tháng/i)).toHaveLength(2);
  });

  it('opens passenger picker dialog at 375px', () => {
    setViewport(375, 812);
    render(<HeroBookingWidget />);

    fireEvent.click(screen.getByRole('button', { name: 'Số hành khách' }));
    const dialog = screen.getByRole('dialog', { name: 'Chọn số hành khách' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('Người lớn')).toBeInTheDocument();
    expect(screen.getByText('Trẻ em')).toBeInTheDocument();
    expect(screen.getByText('Em bé')).toBeInTheDocument();
  });

  it('renders the form and CTA in landscape 812x375', () => {
    setViewport(812, 375);
    render(<HeroBookingWidget />);

    expect(screen.getByText('Điểm khởi hành')).toBeInTheDocument();
    expect(screen.getByText('Điểm đến')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tìm chuyến bay/i })).toBeInTheDocument();
  });

  it('caps the airport picker list to available room in landscape', () => {
    setViewport(812, 375);
    render(<HeroBookingWidget />);

    fireEvent.click(screen.getByRole('button', { name: 'Điểm khởi hành' }));
    const list = screen.getByRole('listbox', { name: 'Điểm khởi hành' }).querySelector('ul');
    expect(list).not.toBeNull();
    // With innerHeight=375 and no layout in jsdom, room = 375 - 0 - 70 - 16 = 289,
    // floored at 96 and capped at 448.
    expect(Number.parseFloat(list!.style.maxHeight)).toBe(289);
  });
});
