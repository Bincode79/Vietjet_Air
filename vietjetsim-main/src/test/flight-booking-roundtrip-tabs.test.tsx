import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FlightBookingClient from '@/features/bookings/components/FlightBookingClient';

// Mock useRouter and useSearchParams
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () =>
    new URLSearchParams('from=SGN&to=HAN&depart=2026-11-20&return=2026-11-25&adult=1'),
}));

vi.mock('@/features/flights/services', () => ({
  searchFlightsWithDates: vi.fn(async ({ from_code }: { from_code: string }) => ({
    flights: [
      {
        id: from_code === 'SGN' ? 'fl-out' : 'fl-in',
        flightNo: from_code === 'SGN' ? 'VJ120' : 'VJ121',
        from: from_code,
        to: from_code === 'SGN' ? 'HAN' : 'SGN',
        fromCity: from_code === 'SGN' ? 'TP. Hồ Chí Minh' : 'Hà Nội',
        toCity: from_code === 'SGN' ? 'Hà Nội' : 'TP. Hồ Chí Minh',
        departTime: '05:45',
        arriveTime: '07:55',
        duration: '2h 10m',
        stops: 0,
        price: 1090000,
        airline: 'Vietjet Air',
        aircraft: 'Airbus A321neo',
        available: 10,
        fareClass: 'eco',
      },
    ],
    availableDates: ['2026-11-20', '2026-11-25'],
  })),
  getAirportCity: (code: string) => (code === 'SGN' ? 'TP. Hồ Chí Minh' : 'Hà Nội'),
}));

vi.mock('@/features/flights/hooks/useFlightStatusSSE', () => ({
  useFlightStatusSSE: () => ({ data: null, status: 'connected' }),
}));

describe('FlightBookingClient round-trip leg switcher & leg indicators', () => {
  it('renders dual tabs for Chiều đi and Chiều về in round-trip mode', async () => {
    render(<FlightBookingClient />);

    // Tabs exist
    const outTab = await screen.findByTestId('tab-leg-outbound');
    const inTab = await screen.findByTestId('tab-leg-inbound');
    expect(outTab).toBeInTheDocument();
    expect(inTab).toBeInTheDocument();

    expect(outTab.textContent).toContain('Chiều đi: SGN → HAN');
    expect(outTab.textContent).toContain('Đang chọn');

    expect(inTab.textContent).toContain('Chiều về: HAN → SGN');
    expect(inTab.textContent).toContain('Chưa chọn');

    // Route board has Chiều đi badge
    const badge = await screen.findByTestId('flight-leg-badge');
    expect(badge.textContent).toContain('Chuyến bay chiều đi');

    // User can switch to inbound leg by clicking inbound tab
    fireEvent.click(inTab);

    // Now inbound tab is active and route board shows Chiều về
    await waitFor(() => {
      const updatedBadge = screen.getByTestId('flight-leg-badge');
      expect(updatedBadge.textContent).toContain('Chuyến bay chiều về');
    });
  });
});
