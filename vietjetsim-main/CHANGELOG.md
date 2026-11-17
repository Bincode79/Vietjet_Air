# Changelog - Vietjet Air

All notable changes to this project will be documented in this file.

## [Unreleased]

### ✨ Added - 2026-11-17

#### UI/UX Improvements - Sign In Popup
- **Enhanced Visual Feedback**
  - Input focus states now have glow effects
  - CTA buttons have hover lift animations
  - Success overlay with animated checkmark
  - Loading overlay with spinner during authentication
  
- **Better Error Handling**
  - Error messages now display in card format with icons
  - Smooth slide-in animations for error appearance
  - Better visual hierarchy with color and spacing

- **Improved Mobile Experience**
  - Larger touch targets (44px) for better usability
  - Optimized font sizes to prevent iOS auto-zoom
  - Better spacing and padding on small screens

- **Enhanced Animations**
  - Smooth transitions between form steps
  - Success animation before redirect
  - Loading states with backdrop blur

- **Design Token Additions**
  - New success color tokens
  - Shadow variables for consistent elevation
  - Transition timing variables

**Files Changed:**
- `src/styles/tailwind.css` (+243 lines)
- `src/features/auth/components/skyid/SkyIdAuthFlow.tsx` (+57 lines)
- `src/features/auth/components/skyid/SkyIdControls.tsx` (+14 lines)

**Documentation:**
- `UI_UX_IMPROVEMENTS_SIGNIN_POPUP.md` - Design proposal
- `UI_UX_IMPROVEMENTS_IMPLEMENTED.md` - Implementation details

---

## [1.0.0] - 2026-11-17

### 🚀 Initial Release - Production Ready

#### Features

**Flight Booking System**
- Flight search with filters (route, date, class)
- Seat selection with interactive seat map
- Ancillary services (baggage, meals, insurance, priority, lounge)
- Multi-step booking flow with progress tracking

**Payment System**
- Multi-payment gateway support (8+ methods)
- Wallet system (topup, withdraw, payment, refund)
- Bank transfer with VietQR
- Credit/debit card simulation
- E-wallets: MoMo, ZaloPay, VNPay
- Apple Pay, Google Pay support
- SkyPoint loyalty points redemption

**Authentication & Authorization**
- JWT-based authentication with token rotation
- CSRF protection
- 2FA support (TOTP)
- Role-based access control (68 permissions)
- Account lockout after failed attempts
- Password reset flow
- OTP login support

**Admin Dashboard**
- 18 specialized tabs (management, support, system)
- User management with role assignment
- Flight management with bulk price adjustment
- Booking management with status updates
- Revenue analytics and reporting
- Refund request approval workflow
- Chat support with voice calls
- Audit logging for all admin actions
- System settings management

**User Features**
- My Flights timeline
- Online check-in with seat selection
- E-ticket and QR boarding pass
- Booking lookup without login
- Real-time chat support with voice calls
- Loyalty program (SkyJoy)
- Profile management

**Technical**
- Next.js 16.4.6 with React 19.0.3
- TypeScript strict mode
- Server-side rendering (SSR)
- Static page generation where applicable
- 84 API routes
- 22 pages
- 121 components (91 feature + 30 shared)
- 1215 tests passing

**Infrastructure**
- PM2 process manager configuration
- Nginx reverse proxy setup
- SSL/TLS configuration
- Security headers (HSTS, X-Frame-Options, CSP)
- Gzip compression
- Cache optimization
- Log rotation support

**Security**
- HTTPS enforcement
- TLS 1.2+ only
- Rate limiting
- SQL injection prevention
- XSS protection
- RBAC with 68 granular permissions
- Audit logging
- Session management

**Deployment**
- Complete VPS deployment scripts
- Automated backup script
- Zero-downtime update script
- Health check script
- Comprehensive documentation

**Testing**
- 1215 unit and integration tests
- UI smoke tests (168 screenshots)
- Migration tests
- TypeScript type checking
- ESLint + Prettier code quality

---

## Version History

### Version Format
- **Major.Minor.Patch** (Semantic Versioning)
- **Unreleased** - Changes in development
- **[Version] - Date** - Released versions

### Categories
- ✨ **Added** - New features
- 🔄 **Changed** - Changes in existing functionality
- 🐛 **Fixed** - Bug fixes
- 🗑️ **Deprecated** - Soon-to-be removed features
- ❌ **Removed** - Removed features
- 🔒 **Security** - Security improvements

---

## Links

- **Repository:** (Internal)
- **Documentation:** See `/docs` folder
- **Deployment Guide:** `DEPLOY_VPS_GUIDE.md`
- **API Documentation:** (To be added)

---

**Maintained by:** Vietjet Air Development Team  
**Last Updated:** 2026-11-17
