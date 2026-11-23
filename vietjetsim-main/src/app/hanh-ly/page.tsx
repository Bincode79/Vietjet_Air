import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// Baggage is a purchasable extra rather than a page of its own, so this route
// forwards to the baggage section of the services page.
export default function BaggagePage() {
  redirect('/dich-vu?service=baggage');
}
