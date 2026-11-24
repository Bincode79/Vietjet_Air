import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FareBenefitsModal from '@/features/flights/components/FareBenefitsModal';

describe('FareBenefitsModal', () => {
  it('renders above the page stacking contexts and closes on confirmation', () => {
    const onClose = vi.fn();
    const { container } = render(<FareBenefitsModal open onClose={onClose} />);
    const dialog = screen.getByRole('dialog');

    expect(document.body).toContainElement(dialog);
    expect(container).not.toContainElement(dialog);
    expect(dialog.parentElement).toHaveClass('z-[80]');

    fireEvent.click(screen.getByText('Đã hiểu'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
