export interface AdminRevenueStats {
  totalRevenue: number;
  totalBookings: number;
  avgBookingValue: number;
  completedBookings: number;
  pendingBookings: number;
}

export interface AdminRecentActivity {
  type: 'booking' | 'refund';
  id: string;
  booking_code?: string;
  user_name?: string;
  route?: string;
  created_at: string;
  status: string;
  total_price?: number;
  reason?: string;
}

export interface MonthlyRevenue {
  month: string;
  revenue: number;
  tickets: number;
}

export interface RouteRevenue {
  route: string;
  revenue: number;
  tickets: number;
}

export interface SeatClassCount {
  class: string;
  count: number;
}

/** Response contract consumed by admin overview and revenue charts. */
export interface AdminAnalytics {
  revenue: AdminRevenueStats;
  statusDistribution: Array<{ status: string; count: number }>;
  recentActivity: AdminRecentActivity[];
  /** Aggregates absent from older API responses are normalised to empty arrays. */
  monthly: MonthlyRevenue[];
  routes: RouteRevenue[];
  classSplit: SeatClassCount[];
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** List responses are `{ <key>: items[], pagination }` — e.g. `{ airports, pagination }`. */
export type AdminList<K extends string, T> = { pagination: Pagination } & { [P in K]: T[] };

export interface Airport {
  id: string;
  code: string;
  name: string;
  city: string;
  country: string;
  created_at: string;
}

export interface AdminAirportInput {
  code: string;
  name: string;
  city: string;
  country: string;
}

export interface AdminUser {
  id: string;
  email: string;
  full_name?: string;
  name?: string;
  /** `NULL` khi admin xoá số điện thoại trong form chỉnh sửa. */
  phone?: string | null;
  role: string;
  status?: 'active' | 'locked';
  loyalty_points?: number;
  bookings_count?: number;
  total_spent?: number;
  last_login?: string;
  address?: string;
  /** Ghi chú vận hành của operator (migration 050). */
  operator_notes?: string | null;
  created_at: string;
}

export interface AdminFlight {
  id: string;
  flight_no: string;
  airline: string;
  from_code: string;
  to_code: string;
  depart_time: string;
  arrive_time: string;
  price: number;
  /** Fare per cabin (migration 030). What the results cards and the booking API read. */
  economy_price?: number;
  business_price?: number;
  class: string;
  available: number;
  available_seats?: number;
  status?: string;
  /** Aircraft type (migration 040). Null/absent means the UI resolves it. */
  aircraft?: string | null;
}

export interface AdminBooking {
  id: string;
  booking_code: string;
  user_id?: string;
  flight_id: string;
  status: string;
  total_price: number;
  created_at: string;
  // Joined columns returned by `getAllBookings`.
  user_email?: string;
  user_name?: string;
  flight_no?: string;
  /** Route of the booked flight. */
  from_code?: string;
  to_code?: string;
  /** Passenger seats of the booking, comma-separated. Empty when unassigned. */
  seats?: string;
  /** Payment method of the settled charge. Empty when the booking has none. */
  payment_method?: string;
}

export interface AdminDiscount {
  id: string;
  code: string;
  discount_type?: string;
  discount_value?: number;
  min_order_value?: number;
  max_discount?: number;
  usage_limit?: number;
  used_count?: number;
  start_date?: string;
  end_date?: string;
  is_active: boolean;
  created_at?: string;
}

export interface AdminBankAccount {
  id: string;
  bank_name: string;
  account_number: string;
  account_holder: string;
  bank_bin?: string;
  branch?: string;
  is_default?: boolean;
  is_active?: boolean;
  transfer_note_template?: string;
  created_at?: string;
}

export interface AdminBankAccountInput {
  bank_name: string;
  account_number: string;
  account_holder: string;
  bank_bin?: string;
  branch?: string;
  is_default?: boolean;
  is_active?: boolean;
  transfer_note_template?: string;
}

export interface AdminAnnouncement {
  id: string;
  title: string;
  content: string;
  type: 'info' | 'warning' | 'promotion' | 'system';
  target_role: string;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  created_by_name?: string;
}

export interface AdminRefund {
  id: string;
  booking_id?: string;
  amount: number;
  status: string;
  reason?: string;
  created_at?: string;
  user_id?: string;
  /** Người yêu cầu hoàn — `getAllRefunds` join thẳng `user_profiles`. */
  user_email?: string | null;
  user_name?: string | null;
  /** Chuyến bay của booking (LEFT JOIN flights). */
  flight_no?: string | null;
  route?: string | null;
  flight_date?: string | null;
  note?: string | null;
  admin_note?: string | null;
  bank_name?: string | null;
  account_number?: string | null;
  account_holder?: string | null;
  processed_at?: string | null;
  /** PNR the customer typed on the refund form (migration 020). */
  booking_code?: string | null;
  /** Contact number supplied on the form (migration 020). */
  phone?: string | null;
  /** Whether the customer can currently see this ticket (migration 020). */
  visible_to_user?: boolean;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
}

/**
 * Row shape of `GET /api/quan-tri/giao-dich`.
 *
 * These are the query's aliases, not the underlying columns: the endpoint
 * projects `payments`/`bookings` into camelCase (`"paymentId"`,
 * `"bookingCode"`, …). The list tab renders all of them, so every field it
 * reads has to be declared here — the tab used to cast the whole array with
 * `as unknown as Transaction[]`, which let a renamed alias reach the screen
 * as `undefined` with nothing complaining.
 */
export interface AdminTransaction {
  id: string;
  amount: number;
  method?: string;
  status: string;
  createdAt?: string;
  bookingId?: string;
  bookingCode?: string;
  userEmail?: string;
  userName?: string;
  created_at?: string;
  /** The `payments.id` behind the row, empty when the booking has no payment row yet. */
  paymentId?: string;
  /** The booking's own status, which the payment status is derived from. */
  bookingStatus?: string;
  /** Transfer receipt uploaded by the customer. */
  receiptImage?: string | null;
  /** The transfer reference the customer typed. */
  transferNote?: string | null;
}

/**
 * Row shape of `GET /api/quan-tri/nhat-ky-kiem-toan`.
 *
 * These are the endpoint's aliases, not the `audit_logs` columns: the query
 * renames `target_type` → `resource` and `target_id` → `resource_id` because
 * the list column is headed "Tài nguyên", and it joins the acting admin's
 * profile in as `user_email` / `user_name` / `user_role`.
 *
 * The previous declaration named the raw columns (`actor_email`,
 * `target_type`, …), which no query returns — so the tab had to cast the
 * whole array with `as unknown as AuditLog[]` and any renamed alias reached
 * the screen as `undefined`.
 */
export interface AdminAuditLog {
  id: string;
  action: string;
  /** The audited object type (`audit_logs.target_type`). */
  resource: string;
  /** The audited object's id (`audit_logs.target_id`). */
  resource_id: string | null;
  /** The JSON payload, as stored in `audit_logs.details_json`. */
  details: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  /** The acting admin's email, joined from `user_profiles`. */
  user_email: string | null;
  /** The acting admin's display name. */
  user_name: string | null;
  /** The acting admin's role. */
  user_role: string | null;
}

/** Row shape returned by `?section=roles` on the RBAC endpoint. */
export interface AdminRoleRow {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  role_name: string;
  custom_permissions: string | null;
  created_at: string;
}

/** Row shape returned by `?section=audit` on the RBAC endpoint. */
export interface AdminRbacAuditRow {
  id: string;
  admin_email: string;
  action: string;
  target_type: string;
  target_id?: string;
  details_json: string;
  status: 'success' | 'error' | 'denied';
  created_at: string;
}

export * from './dashboard';
