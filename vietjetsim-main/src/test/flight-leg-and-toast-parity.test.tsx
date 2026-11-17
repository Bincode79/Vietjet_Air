import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FlightResultsStep from '@/features/flights/components/FlightResultsStep';
import { ToastContainer } from '@/shared/components/feedback';

vi.mock('@/features/flights/services', () => ({
  searchFlightsWithDates: vi.fn(async () => ({
    flights: [
      {
        id: 'fl-1',
        flightNo: 'VJ120',
        from: 'SGN',
        to: 'HAN',
        fromCity: 'TP. Hồ Chí Minh',
        toCity: 'Hà Nội',
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
    availableDates: ['2026-11-20'],
  })),
  getAirportCity: (code: string) => (code === 'SGN' ? 'TP. Hồ Chí Minh' : 'Hà Nội'),
}));

vi.mock('@/features/flights/hooks/useFlightStatusSSE', () => ({
  useFlightStatusSSE: () => ({ data: null, status: 'connected' }),
}));

describe('Flight Leg Indicator & Toast Parity', () => {
  it('displays "Chuyến bay chiều đi" when leg is outbound', async () => {
    render(
      <FlightResultsStep
        leg="outbound"
        isRoundTrip={true}
        onSelect={vi.fn()}
        search={{ from: 'SGN', to: 'HAN', depart: '2026-11-20' }}
      />
    );

    const badge = await screen.findByTestId('flight-leg-badge');
    expect(badge.textContent).toContain('Chuyến bay chiều đi');
  });

  it('displays "Chuyến bay chiều về" when leg is inbound', async () => {
    render(
      <FlightResultsStep
        leg="inbound"
        isRoundTrip={true}
        onSelect={vi.fn()}
        search={{ from: 'HAN', to: 'SGN', depart: '2026-11-25' }}
      />
    );

    const badge = await screen.findByTestId('flight-leg-badge');
    expect(badge.textContent).toContain('Chuyến bay chiều về');
  });

  it('does NOT auto-select a flight upon initial load', async () => {
    const onSelect = vi.fn();
    const onFlightSelect = vi.fn();

    render(
      <FlightResultsStep
        leg="outbound"
        isRoundTrip={false}
        onSelect={onSelect}
        onFlightSelect={onFlightSelect}
        search={{ from: 'SGN', to: 'HAN', depart: '2026-11-20' }}
      />
    );

    // Wait for flights to load
    await screen.findByText('1 chuyến bay phù hợp');

    // Neither onSelect nor onFlightSelect should be called silently on load
    expect(onSelect).not.toHaveBeenCalled();
    expect(onFlightSelect).not.toHaveBeenCalled();
  });

  it('ToastContainer renders below the fixed header/strip (top-[108px] sm:top-[88px]) and has z-[99999]', () => {
    const toasts = [
      {
        id: 't-1',
        type: 'success' as const,
        title: 'Đã chọn chuyến bay đi!',
        message: 'VJ120: TP. Hồ Chí Minh → Hà Nội',
      },
    ];

    render(<ToastContainer toasts={toasts} onDismiss={vi.fn()} position="top-right" />);

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(screen.getByText('Đã chọn chuyến bay đi!')).toBeInTheDocument();

    const container = screen.getByLabelText('Thông báo');
    expect(container.className).toContain('top-[108px]');
    expect(container.className).toContain('z-[99999]');
  });
});
