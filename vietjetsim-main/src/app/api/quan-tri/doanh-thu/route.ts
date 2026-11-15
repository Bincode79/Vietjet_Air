import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin-auth';
import {
  getRevenueStats,
  getBookingStatusDistribution,
  getRecentActivity,
  getMonthlyRevenue,
  getRouteRevenue,
  getSeatClassSplit,
} from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const {
      payload: _payload,
      error,
      response,
    } = await verifyAdminRequest(request, 'analytics:view');
    if (error) return response;

    const [revenueStats, statusDistribution, recentActivity, monthly, routes, classSplit] =
      await Promise.all([
        getRevenueStats(),
        getBookingStatusDistribution(),
        getRecentActivity(10),
        // Chart aggregates power the revenue tab; each one degrades to an empty
        // series so a single failing query cannot blank the whole dashboard.
        getMonthlyRevenue(6).catch(() => []),
        getRouteRevenue(10).catch(() => []),
        getSeatClassSplit().catch(() => []),
      ]);

    return NextResponse.json({
      revenue: revenueStats,
      statusDistribution,
      recentActivity,
      monthly,
      routes,
      classSplit,
    });
  } catch (error) {
    console.error('Error fetching revenue stats:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to fetch revenue stats' },
      { status: 500 }
    );
  }
}
