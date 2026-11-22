import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Footer from '@/shared/components/navigation/Footer';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe('Footer Component — Mobile & Desktop Responsiveness', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders all key sections and the brand wave strip', () => {
    render(<Footer />);

    expect(screen.getByTestId('vj-wave-strip')).toBeInTheDocument();
    expect(screen.getByText('CÔNG TY CỔ PHẦN HÀNG KHÔNG VIETJET')).toBeInTheDocument();
    expect(screen.getByText('ĐÃ THÔNG BÁO BỘ CÔNG THƯƠNG')).toBeInTheDocument();
    expect(screen.getByText('Về đầu trang')).toBeInTheDocument();
  });

  it('toggles mobile accordion sections when clicked', () => {
    render(<Footer />);

    // Initial state: accordion buttons exist
    const accordionBtn = screen.getByRole('button', { name: /Để có chuyến bay tốt đẹp/i });
    expect(accordionBtn).toHaveAttribute('aria-expanded', 'false');

    // Click to open
    fireEvent.click(accordionBtn);
    expect(accordionBtn).toHaveAttribute('aria-expanded', 'true');

    // Links inside section should now be visible
    expect(screen.getAllByText('Điều lệ vận chuyển').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Quy định hành lý').length).toBeGreaterThanOrEqual(1);

    // Click again to close
    fireEvent.click(accordionBtn);
    expect(accordionBtn).toHaveAttribute('aria-expanded', 'false');
  });

  it('calls window.scrollTo when clicking Về đầu trang', () => {
    const scrollToSpy = vi.fn();
    window.scrollTo = scrollToSpy;

    render(<Footer />);
    const topBtn = screen.getByText('Về đầu trang');
    fireEvent.click(topBtn);

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('renders social channels and mobile app badges', () => {
    render(<Footer />);

    expect(screen.getByLabelText('Facebook')).toBeInTheDocument();
    expect(screen.getByLabelText('Instagram')).toBeInTheDocument();
    expect(screen.getByLabelText('X (Twitter)')).toBeInTheDocument();
    expect(screen.getByLabelText('Download on the App Store')).toBeInTheDocument();
    expect(screen.getByLabelText('Get it on Google Play')).toBeInTheDocument();
  });
});
