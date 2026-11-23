import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Footer from '@/shared/components/navigation/Footer';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe('Footer Component — Mobile & Desktop Responsiveness', () => {
  it('renders all key sections and the brand wave strip', () => {
    render(<Footer />);

    expect(screen.getByTestId('vj-wave-strip')).toBeInTheDocument();
    expect(screen.getByText('CÔNG TY CỔ PHẦN HÀNG KHÔNG VIETJET')).toBeInTheDocument();
    expect(screen.getByText('ĐÃ THÔNG BÁO BỘ CÔNG THƯƠNG')).toBeInTheDocument();
  });

  it('toggles mobile accordion sections when clicked', () => {
    render(<Footer />);

    const accordionBtn = screen.getByRole('button', { name: /Để có chuyến bay tốt đẹp/i });
    const panelId = accordionBtn.getAttribute('aria-controls')!;
    expect(accordionBtn).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById(panelId)).not.toBeInTheDocument();

    fireEvent.click(accordionBtn);
    expect(accordionBtn).toHaveAttribute('aria-expanded', 'true');
    const panel = within(document.getElementById(panelId)!);
    expect(panel.getByRole('link', { name: 'Điều lệ vận chuyển' })).toHaveAttribute(
      'href',
      '/gioi-thieu#terms'
    );
    expect(panel.getByRole('link', { name: 'Quy định hành lý' })).toHaveAttribute(
      'href',
      '/hanh-ly'
    );

    fireEvent.click(accordionBtn);
    expect(accordionBtn).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById(panelId)).not.toBeInTheDocument();
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
