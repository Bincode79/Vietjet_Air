-- ============================================================================
-- FLIGHT OPERATIONS: Real-time tracking, Delay/Cancellation, Aircraft Rotation
-- ============================================================================

-- Bảng lịch trình chuyến bay (schedule) — được dùng cho real-time tracking,
-- disruption và rotation. Có thể cần cho các tính năng ops sau này.
CREATE TABLE IF NOT EXISTS flight_schedules (
    schedule_id BIGSERIAL PRIMARY KEY,
    flight_id UUID NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
    depart_time TIMESTAMPTZ NOT NULL,
    arrive_time TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1. Flight Events - Real-time status changes
CREATE TABLE IF NOT EXISTS flight_events (
    event_id BIGSERIAL PRIMARY KEY,
    flight_id UUID NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
    schedule_id BIGINT REFERENCES flight_schedules(schedule_id),
    event_type VARCHAR(50) NOT NULL, -- scheduled, delayed, boarding, departed, arrived, cancelled, diverted, gate_change, terminal_change
    event_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    old_value JSONB, -- Previous status/data
    new_value JSONB, -- New status/data
    reason TEXT, -- Reason for change
    source VARCHAR(50) DEFAULT 'manual', -- manual, acars, ops_system, airport_feed
    created_by TEXT REFERENCES user_profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flight_events_flight_time ON flight_events(flight_id, event_time DESC);
CREATE INDEX IF NOT EXISTS idx_flight_events_schedule ON flight_events(schedule_id);
CREATE INDEX IF NOT EXISTS idx_flight_events_type ON flight_events(event_type);

-- 2. Delay Codes - Standardized IATA delay codes
CREATE TABLE IF NOT EXISTS delay_codes (
    code VARCHAR(10) PRIMARY KEY,
    category VARCHAR(2) NOT NULL, -- 00-99 IATA categories
    description TEXT NOT NULL,
    description_vn TEXT,
    is_controllable BOOLEAN DEFAULT FALSE, -- Airline controllable vs external
    compensation_eligible BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed standard IATA delay codes
INSERT INTO delay_codes (code, category, description, description_vn, is_controllable, compensation_eligible) VALUES
('71', '7', 'Flight Operations', 'Vận hành chuyến bay', TRUE, TRUE),
('72', '7', 'Crewing', 'Phi hành đoàn', TRUE, TRUE),
('73', '7', 'Aircraft Technical', 'Kỹ thuật máy bay', TRUE, TRUE),
('74', '7', 'Aircraft Damage', 'Hư hỏng máy bay', TRUE, TRUE),
('75', '7', 'Ground Handling', 'Xử lý mặt đất', TRUE, TRUE),
('76', '7', 'Cargo/Mail', 'Hàng hóa/Bưu chính', TRUE, TRUE),
('77', '7', 'Catering', 'Verpflegung', TRUE, TRUE),
('81', '8', 'ATC', 'Kiểm soát không lưu', FALSE, FALSE),
('82', '8', 'Airport Facilities', 'Cơ sở hạ tầng sân bay', FALSE, FALSE),
('83', '8', 'Weather', 'Thời tiết', FALSE, FALSE),
('84', '8', 'Security', 'An ninh', FALSE, FALSE),
('85', '8', 'Immigration/Customs', 'Xuất nhập cảnh/Hải quan', FALSE, FALSE),
('86', '8', 'Medical', 'Y tế', FALSE, FALSE),
('87', '8', 'VIP Movement', 'Di chuyển VIP', FALSE, FALSE),
('88', '8', 'Airline Request', 'Yêu cầu hãng bay', TRUE, TRUE),
('89', '8', 'Reactionary', 'Phản ứng (chuyến trước hoãn)', FALSE, FALSE),
('91', '9', 'Passenger Handling', 'Xử lý hành khách', TRUE, TRUE),
('92', '9', 'Baggage', 'Hành lý', TRUE, TRUE),
('93', '9', 'Aircraft Cleaning', 'Dọn dẹp máy bay', TRUE, TRUE),
('94', '9', 'Cabin Crew', 'Tiếp viên', TRUE, TRUE),
('95', '9', 'Boarding', 'Lên máy bay', TRUE, TRUE),
('96', '9', 'Cargo Loading', 'Dỡ tải hàng hóa', TRUE, TRUE),
('97', '9', 'Ground Equipment', 'Thiết bị mặt đất', TRUE, TRUE),
('98', '9', 'De-icing', 'Khử băng', FALSE, FALSE),
('99', '9', 'Other', 'Khác', FALSE, FALSE)
ON CONFLICT (code) DO NOTHING;

-- 3. Flight Disruptions - Delay/Cancellation management
CREATE TABLE IF NOT EXISTS flight_disruptions (
    disruption_id BIGSERIAL PRIMARY KEY,
    schedule_id BIGINT NOT NULL REFERENCES flight_schedules(schedule_id),
    disruption_type VARCHAR(20) NOT NULL, -- delay, cancellation, diversion, retiming
    delay_code VARCHAR(10) REFERENCES delay_codes(code),
    original_depart_time TIMESTAMPTZ NOT NULL,
    original_arrive_time TIMESTAMPTZ NOT NULL,
    new_depart_time TIMESTAMPTZ,
    new_arrive_time TIMESTAMPTZ,
    delay_minutes INTEGER DEFAULT 0,
    reason TEXT,
    impact_assessment JSONB, -- {passengers_affected, connections_missed, revenue_impact}
    status VARCHAR(20) DEFAULT 'open', -- open, managing, resolved, closed
    assigned_to TEXT REFERENCES user_profiles(id),
    notified_passengers BOOLEAN DEFAULT FALSE,
    rebooked_passengers INTEGER DEFAULT 0,
    refunded_passengers INTEGER DEFAULT 0,
    compensated_passengers INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_disruptions_schedule ON flight_disruptions(schedule_id);
CREATE INDEX IF NOT EXISTS idx_disruptions_status ON flight_disruptions(status);
CREATE INDEX IF NOT EXISTS idx_disruptions_type ON flight_disruptions(disruption_type);

-- 4. Aircraft Rotation - Aircraft scheduling
CREATE TABLE IF NOT EXISTS aircraft_rotations (
    rotation_id BIGSERIAL PRIMARY KEY,
    aircraft_registration VARCHAR(20) NOT NULL,
    schedule_id BIGINT NOT NULL REFERENCES flight_schedules(schedule_id),
    position INTEGER NOT NULL, -- Sequence in rotation (1, 2, 3...)
    scheduled_depart TIMESTAMPTZ NOT NULL,
    scheduled_arrive TIMESTAMPTZ NOT NULL,
    actual_depart TIMESTAMPTZ,
    actual_arrive TIMESTAMPTZ,
    turnaround_minutes INTEGER, -- Minimum ground time required
    maintenance_due BOOLEAN DEFAULT FALSE,
    maintenance_type VARCHAR(50), -- transit, daily, weekly, A-check, C-check
    status VARCHAR(20) DEFAULT 'planned', -- planned, active, completed, delayed, cancelled, maintenance
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(schedule_id),
    UNIQUE(aircraft_registration, position, scheduled_depart)
);

CREATE INDEX IF NOT EXISTS idx_rotations_aircraft_date ON aircraft_rotations(aircraft_registration, scheduled_depart);
CREATE INDEX IF NOT EXISTS idx_rotations_status ON aircraft_rotations(status);

-- 5. Passenger Rebooking - For disruption management
CREATE TABLE IF NOT EXISTS passenger_rebookings (
    rebooking_id BIGSERIAL PRIMARY KEY,
    disruption_id BIGINT NOT NULL REFERENCES flight_disruptions(disruption_id),
    booking_id UUID NOT NULL REFERENCES bookings(id),
    passenger_id UUID NOT NULL REFERENCES passengers(id),
    original_flight_id VARCHAR(20) NOT NULL,
    new_flight_id VARCHAR(20) NOT NULL,
    new_schedule_id BIGINT REFERENCES flight_schedules(schedule_id),
    status VARCHAR(20) DEFAULT 'pending', -- pending, confirmed, declined, waitlisted
    fare_difference NUMERIC(12,2) DEFAULT 0,
    compensation_amount NUMERIC(12,2) DEFAULT 0,
    notified_at TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rebookings_disruption ON passenger_rebookings(disruption_id);
CREATE INDEX IF NOT EXISTS idx_rebookings_booking ON passenger_rebookings(booking_id);

-- 6. Compensation Rules - EU261/CAAV compliant
CREATE TABLE IF NOT EXISTS compensation_rules (
    rule_id BIGSERIAL PRIMARY KEY,
    disruption_type VARCHAR(20) NOT NULL, -- delay, cancellation, denied_boarding
    flight_distance_km INTEGER NOT NULL, -- <= 1500, 1500-3500, > 3500
    delay_hours_min INTEGER NOT NULL,
    delay_hours_max INTEGER,
    compensation_amount NUMERIC(12,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'VND',
    applies_to VARCHAR(20) DEFAULT 'all', -- all, eu_regulated, domestic_intl
    regulation VARCHAR(50), -- EU261, CAAV, Montreal Convention
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed compensation rules (Vietnam domestic + Intl)
INSERT INTO compensation_rules (disruption_type, flight_distance_km, delay_hours_min, delay_hours_max, compensation_amount, currency, applies_to, regulation) VALUES
-- Cancellation compensation (CAAV: 100% refund + care)
('cancellation', 0, 0, 0, 0, 'VND', 'domestic', 'CAAV'), -- Full refund handled separately
-- Delay compensation (EU261 style for intl)
('delay', 1500, 3, 4, 250, 'EUR', 'eu_regulated', 'EU261'),
('delay', 1500, 4, NULL, 400, 'EUR', 'eu_regulated', 'EU261'),
('delay', 3500, 3, 4, 300, 'EUR', 'eu_regulated', 'EU261'),
('delay', 3500, 4, NULL, 600, 'EUR', 'eu_regulated', 'EU261'),
('delay', 99999, 4, NULL, 600, 'EUR', 'eu_regulated', 'EU261')
ON CONFLICT DO NOTHING;

-- 7. Operational Alerts - System notifications for ops team
CREATE TABLE IF NOT EXISTS operational_alerts (
    alert_id BIGSERIAL PRIMARY KEY,
    alert_type VARCHAR(50) NOT NULL, -- delay_threshold, rotation_conflict, maintenance_due, crew_issue, weather_alert
    severity VARCHAR(20) NOT NULL, -- info, warning, critical
    title VARCHAR(200) NOT NULL,
    message TEXT,
    related_flight_id VARCHAR(20),
    related_schedule_id BIGINT,
    related_aircraft VARCHAR(20),
    metadata JSONB,
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by TEXT REFERENCES user_profiles(id),
    acknowledged_at TIMESTAMPTZ,
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_severity ON operational_alerts(severity, acknowledged);
CREATE INDEX IF NOT EXISTS idx_alerts_flight ON operational_alerts(related_flight_id);
CREATE INDEX IF NOT EXISTS idx_alerts_created ON operational_alerts(created_at DESC);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_flight_ops_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER update_flight_disruptions_updated_at BEFORE UPDATE ON flight_disruptions
    FOR EACH ROW EXECUTE FUNCTION update_flight_ops_updated_at();

CREATE OR REPLACE TRIGGER update_aircraft_rotations_updated_at BEFORE UPDATE ON aircraft_rotations
    FOR EACH ROW EXECUTE FUNCTION update_flight_ops_updated_at();

COMMIT;