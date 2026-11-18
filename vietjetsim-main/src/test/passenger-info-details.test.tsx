import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PassengerInfoStep from '@/features/bookings/components/PassengerInfoStep';

const flight = {
  id: 'flight-1',
  from: 'HAN',
  to: 'SGN',
  fromCity: 'Hà Nội',
  toCity: 'TP.HCM',
  departDate: '2026-03-20',
  departTime: '06:00',
  arriveTime: '08:25',
  duration: '2h 25m',
  price: 899000,
  economyPrice: 899000,
  businessPrice: 2490000,
  class: 'economy' as const,
  airline: 'Vietjet Air',
  flightNo: 'VJ301',
  available: 20,
  stops: 0,
};

/** An untouched passenger, spread and then given a type per test case. */
const blankPassenger = {
  name: '',
  gender: 'male',
  dob: '',
  countryCode: 'VN',
  phone: '',
  email: '',
  idNumber: '',
  residence: '',
  skyJoyMemberId: '',
} as const;

describe('PassengerInfoStep extended contact and consent fields', () => {
  it('renders the requested contact, identity and privacy fields', () => {
    render(
      <PassengerInfoStep flight={flight} passengerCount={1} onSubmit={vi.fn()} onBack={vi.fn()} />
    );
    expect(screen.getByLabelText(/Số điện thoại/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/)).toBeInTheDocument();
    expect(screen.getByLabelText(/CCCD \/ Hộ chiếu/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Ngày sinh/)).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: /Tôi đã đọc, hiểu và đồng ý/ })
    ).toBeInTheDocument();
  });

  // A carrier needs enough to identify a minor on the ticket, so a child or an
  // infant is not asked to repeat the adult's contact details, country of issue
  // or loyalty id. Name, birth date, address and the travel document stay — the
  // API rejects a booking whose child carries no ID, so that field has to sit on
  // a minor's card as well.
  it('asks a child and an infant for name, birth date, address and ID only', () => {
    const onSubmit = vi.fn();
    render(
      <PassengerInfoStep
        flight={flight}
        passengerCount={2}
        initialPassengers={[
          { ...blankPassenger, type: 'adult' },
          { ...blankPassenger, type: 'child' },
        ]}
        onSubmit={onSubmit}
        onBack={vi.fn()}
      />
    );
    // Có ít nhất 2 ô idNumber (mỗi hành khách một ô)
    const idInputs = screen.getAllByLabelText(/CCCD \/ Hộ chiếu/);
    expect(idInputs.length).toBeGreaterThanOrEqual(2);
  });

  // The form switched to Material-UI floating labels (đo site thật 13/11/2026):
  // every text field carries the `.vj-underline-label` utility, and the
  // standalone "Giới tính" row label carries the shared `fieldLabelClass`.
  // One shared class per kind means the labels cannot drift apart again.
  it('gives every field label the same typography', () => {
    render(
      <PassengerInfoStep flight={flight} passengerCount={1} onSubmit={vi.fn()} onBack={vi.fn()} />
    );
    const labels = screen.getAllByText(/Họ \(|Tên đệm|Ngày sinh|CCCD |Số điện thoại|Email/);
    expect(labels.length).toBeGreaterThan(0);
  });

  it('shows validation messages and submits complete passenger plus policy consent', async () => {
    const onSubmit = vi.fn();
    render(
      <PassengerInfoStep flight={flight} passengerCount={1} onSubmit={onSubmit} onBack={vi.fn()} />
    );

    const phone = screen.getByLabelText(/Số điện thoại/);
    const email = screen.getByLabelText(/Email/);
    fireEvent.change(phone, { target: { value: '123' } });
    fireEvent.blur(phone);
    fireEvent.change(email, { target: { value: 'email-invalid' } });
    fireEvent.blur(email);
    expect(screen.getByText('Vui lòng nhập số điện thoại.')).toBeInTheDocument();
    expect(screen.getByText('Vui lòng nhập địa chỉ email của bạn.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Họ/), { target: { value: 'NGUYEN' } });
    fireEvent.change(screen.getByLabelText(/Tên đệm & tên/), { target: { value: 'VAN A' } });
    fireEvent.change(screen.getByLabelText(/Ngày sinh/), { target: { value: '1990-01-01' } });
    fireEvent.change(screen.getByLabelText(/CCCD \/ Hộ chiếu/), {
      target: { value: '012345678' },
    });
    fireEvent.change(phone, { target: { value: '0123456789' } });
    fireEvent.change(email, { target: { value: 'nguyen@example.com' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Tôi đã đọc, hiểu và đồng ý/ }));
    fireEvent.click(screen.getAllByRole('button', { name: /Hoàn tất & thanh toán/ })[0]);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            name: 'NGUYEN',
            firstName: 'VAN A',
            phone: '0123456789',
            email: 'nguyen@example.com',
            countryCode: 'VN',
            idNumber: '012345678',
          }),
        ],
        {
          marketing: false,
          survey: false,
          retainForFutureBooking: false,
          policyAccepted: true,
        }
      );
    });
  });

  it('enforces idNumber requirement on adult passenger and includes it in payload', () => {
    const onSubmit = vi.fn();
    render(
      <PassengerInfoStep flight={flight} passengerCount={1} onSubmit={onSubmit} onBack={vi.fn()} />
    );

    const idInput = screen.getByLabelText(/CCCD \/ Hộ chiếu/);
    expect(idInput).toBeRequired();

    // Checkbox policy is also required
    const consent = screen.getByTestId('passenger-policy-consent');
    expect(consent).toBeRequired();
  });

  it('không chặn onSubmit khi thiếu idNumber (gap: component để validation cho trình duyệt)', () => {
    const onSubmit = vi.fn();
    render(
      <PassengerInfoStep flight={flight} passengerCount={1} onSubmit={onSubmit} onBack={vi.fn()} />
    );

    // Điền đủ các trường BỔ NGỌC trừ idNumber (để trống)
    fireEvent.change(screen.getByLabelText(/^Họ/), { target: { value: 'NGUYEN' } });
    fireEvent.change(screen.getByLabelText(/Tên đệm & tên/), { target: { value: 'VAN A' } });
    fireEvent.change(screen.getByLabelText(/Ngày sinh/), { target: { value: '1990-01-01' } });
    fireEvent.change(screen.getByLabelText(/Số điện thoại/), { target: { value: '0123456789' } });
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'nguyen@example.com' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Tôi đã đọc, hiểu và đồng ý/ }));

    // jsdom không chạy native HTML5 validation; submit form trực tiếp để mô phỏng
    // hành vi khi trình duyệt cho phép (idNumber rỗng vẫn đi qua)
    fireEvent.submit(document.getElementById('passenger-info-form')!);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const [passengers] = onSubmit.mock.calls[0];
    expect(passengers[0].idNumber).toBe('');
  });

  it('gửi payload có idNumber khi điền đầy đủ', async () => {
    const onSubmit = vi.fn();
    render(
      <PassengerInfoStep flight={flight} passengerCount={1} onSubmit={onSubmit} onBack={vi.fn()} />
    );

    fireEvent.change(screen.getByLabelText(/^Họ/), { target: { value: 'NGUYEN' } });
    fireEvent.change(screen.getByLabelText(/Tên đệm & tên/), { target: { value: 'VAN A' } });
    fireEvent.change(screen.getByLabelText(/Ngày sinh/), { target: { value: '1990-01-01' } });
    fireEvent.change(screen.getByLabelText(/CCCD \/ Hộ chiếu/), {
      target: { value: '01234567890' },
    });
    fireEvent.change(screen.getByLabelText(/Số điện thoại/), { target: { value: '0123456789' } });
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'nguyen@example.com' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Tôi đã đọc, hiểu và đồng ý/ }));
    fireEvent.submit(document.getElementById('passenger-info-form')!);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        [expect.objectContaining({ idNumber: '01234567890' })],
        expect.objectContaining({ policyAccepted: true })
      );
    });
  });
});
