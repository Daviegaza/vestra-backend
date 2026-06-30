import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z, ZodError } from 'zod';
import { PrismaClient, type UserRole, type SubscriptionTier } from '@prisma/client';

const prisma = new PrismaClient();

const PORT = parseInt(process.env.PORT || '4000', 10);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

const app = express();
app.use(helmet());
app.use(cors({ origin: CORS_ORIGIN.split(',').map((s) => s.trim()), credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  max: parseInt(process.env.RATE_LIMIT_MAX || '200', 10),
  standardHeaders: true,
}));

interface JwtPayload { sub: string; }

interface AuthedRequest extends Request {
  userId?: string;
  user?: Awaited<ReturnType<typeof loadUser>>;
}

async function loadUser(id: string) {
  return prisma.user.findUnique({
    where: { id },
    include: { roles: { orderBy: { activatedAt: 'asc' } }, agentProfile: true },
  });
}

function signToken(userId: string): string {
  return jwt.sign({ sub: userId } as JwtPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function shapeUser(u: NonNullable<Awaited<ReturnType<typeof loadUser>>>) {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    phone: u.phone,
    activeRole: u.activeRole,
    roles: u.roles.map((r) => r.role),
    roleProfiles: u.roles.map((r) => ({ role: r.role, status: r.status, activatedAt: r.activatedAt, meta: r.meta })),
    avatar: u.avatar,
    isVerified: u.isVerified,
    isKycVerified: u.isKycVerified,
    location: u.location,
    bio: u.bio,
    agentProfile: u.agentProfile,
  };
}

async function authMiddleware(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' });
  try {
    const decoded = jwt.verify(header.slice(7), JWT_SECRET) as JwtPayload;
    const user = await loadUser(decoded.sub);
    if (!user) return res.status(401).json({ error: 'Invalid token' });
    req.userId = user.id;
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(...roles: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    const userRoles = new Set(req.user.roles.map((r) => r.role));
    if (!roles.some((r) => userRoles.has(r))) return res.status(403).json({ error: 'Insufficient role' });
    next();
  };
}

app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// ─── Subscription tier catalog ───────────────────────────────────────────────

interface TierLimits {
  tier: SubscriptionTier;
  role: UserRole;
  label: string;
  priceKes: number;
  /** Max listings/units allowed at this tier. -1 = unlimited. */
  maxListings: number;
  featuredSlots: number;
  description: string;
  perks: string[];
}

const TIER_CATALOG: TierLimits[] = [
  // Agent
  { tier: 'free', role: 'agent', label: 'Free', priceKes: 0, maxListings: 5, featuredSlots: 0, description: 'Test the waters', perks: ['5 listings', 'Email lead alerts', 'Bronze badge'] },
  { tier: 'starter', role: 'agent', label: 'Starter', priceKes: 1500, maxListings: 20, featuredSlots: 2, description: 'Growing solo agent', perks: ['20 listings', '2 featured/mo', 'Email + SMS alerts', 'Silver badge'] },
  { tier: 'pro', role: 'agent', label: 'Pro', priceKes: 4500, maxListings: 100, featuredSlots: 10, description: 'Established agent', perks: ['100 listings', '10 featured/mo', 'Real-time + WhatsApp alerts', 'Co-broker tools', 'Gold badge'] },
  { tier: 'elite', role: 'agent', label: 'Elite', priceKes: 12000, maxListings: -1, featuredSlots: -1, description: 'Top-performing agency', perks: ['Unlimited listings', 'Unlimited featured', 'Priority alerts', 'CS manager', 'Analytics export', 'Platinum badge'] },
  // Landlord
  { tier: 'free', role: 'landlord', label: 'Free', priceKes: 0, maxListings: 3, featuredSlots: 0, description: 'Small landlord', perks: ['3 units', 'Manual reminders', 'Basic maintenance'] },
  { tier: 'plus', role: 'landlord', label: 'Plus', priceKes: 800, maxListings: 15, featuredSlots: 0, description: 'Growing portfolio', perks: ['15 units', 'Auto rent reminders', 'CSV tax export'] },
  { tier: 'pro', role: 'landlord', label: 'Pro', priceKes: 2500, maxListings: 50, featuredSlots: 0, description: 'Pro landlord', perks: ['50 units', 'Escalation flow', 'Contractor marketplace', 'CSV + PDF tax export'] },
  { tier: 'estate', role: 'landlord', label: 'Estate', priceKes: 8000, maxListings: -1, featuredSlots: 0, description: 'Property management firm', perks: ['Unlimited units', 'Tenant scoring', 'Dedicated coordinator', 'Accountant-ready exports'] },
  // Buyer
  { tier: 'free', role: 'buyer', label: 'Free', priceKes: 0, maxListings: 0, featuredSlots: 0, description: 'Browse + 20 saves', perks: ['Browse market', 'Save up to 20', 'Standard inquiry'] },
  { tier: 'buyer_verified', role: 'buyer', label: 'Verified Buyer', priceKes: 500, maxListings: 0, featuredSlots: 0, description: 'KES 500 one-off', perks: ['Unlimited saves', 'Priority inquiry response', 'Verified shield for sellers'] },
  { tier: 'buyer_pro', role: 'buyer', label: 'Pro Buyer', priceKes: 2000, maxListings: 0, featuredSlots: 0, description: 'For serious buyers', perks: ['AI valuation reports', 'Mortgage pre-qual', 'Suburb deep-dives', 'ROI calculator'] },
];

function findTier(role: UserRole, tier: SubscriptionTier): TierLimits | undefined {
  return TIER_CATALOG.find((t) => t.role === role && t.tier === tier);
}

async function getActiveSubscription(userId: string, role: UserRole) {
  const sub = await prisma.subscription.findUnique({ where: { userId_role: { userId, role } } });
  if (!sub) return null;
  if (sub.status !== 'active' && sub.status !== 'trialing') return null;
  if (sub.expiresAt < new Date()) {
    await prisma.subscription.update({ where: { id: sub.id }, data: { status: 'expired' } });
    return null;
  }
  return sub;
}

function tierFor(role: UserRole, sub: { tier: SubscriptionTier } | null): TierLimits {
  const tier = sub?.tier || 'free';
  return findTier(role, tier) || findTier(role, 'free')!;
}

// ─── Subscriptions ──────────────────────────────────────────────────────────

app.get('/api/subscriptions/catalog', (_req, res) => {
  res.json({ tiers: TIER_CATALOG });
});

app.get('/api/subscriptions/me', authMiddleware, async (req: AuthedRequest, res, next) => {
  try {
    const subs = await prisma.subscription.findMany({
      where: { userId: req.userId! },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ subscriptions: subs });
  } catch (e) { next(e); }
});

const subscribeSchema = z.object({
  role: z.enum(['buyer', 'seller', 'agent', 'landlord', 'tenant', 'admin']),
  tier: z.enum(['free', 'starter', 'plus', 'pro', 'elite', 'estate', 'buyer_verified', 'buyer_pro', 'chama_group', 'chama_cooperative']),
  paymentMethod: z.enum(['mpesa', 'airtel_money', 'card', 'bank_transfer', 'pesalink', 'equitel', 'paypal', 'flutterwave', 'intasend', 'cash']).default('mpesa'),
  paymentRef: z.string().optional(),
  mpesaRef: z.string().optional(),
  autoRenew: z.boolean().optional(),
});

app.post('/api/subscriptions/subscribe', authMiddleware, async (req: AuthedRequest, res, next) => {
  try {
    const data = subscribeSchema.parse(req.body);
    const limits = findTier(data.role, data.tier);
    if (!limits) return res.status(400).json({ error: 'Unknown tier for that role' });
    if (!req.user!.roles.some((r) => r.role === data.role)) {
      return res.status(403).json({ error: `Activate the ${data.role} role first` });
    }
    const periodDays = data.tier === 'buyer_verified' ? 3650 : 30; // verified buyer is one-off
    const expiresAt = new Date(Date.now() + periodDays * 24 * 3600 * 1000);
    const paymentRef = data.paymentRef || data.mpesaRef;
    const sub = await prisma.subscription.upsert({
      where: { userId_role: { userId: req.userId!, role: data.role } },
      create: {
        userId: req.userId!,
        role: data.role,
        tier: data.tier,
        priceKes: limits.priceKes,
        periodDays,
        autoRenew: data.autoRenew ?? true,
        expiresAt,
        paymentMethod: data.paymentMethod,
        paymentRef,
        mpesaRef: data.mpesaRef,
        status: 'active',
      },
      update: {
        tier: data.tier,
        priceKes: limits.priceKes,
        periodDays,
        autoRenew: data.autoRenew ?? true,
        expiresAt,
        paymentMethod: data.paymentMethod,
        paymentRef,
        mpesaRef: data.mpesaRef,
        status: 'active',
        cancelledAt: null,
      },
    });
    await prisma.notification.create({
      data: {
        userId: req.userId!,
        title: `${limits.label} plan active`,
        message: `Your ${data.role} subscription is live until ${expiresAt.toDateString()}.`,
        type: 'success',
      },
    });
    res.json({ subscription: sub });
  } catch (e) { next(e); }
});

app.post('/api/subscriptions/:role/cancel', authMiddleware, async (req: AuthedRequest, res, next) => {
  try {
    const role = req.params.role as UserRole;
    await prisma.subscription.updateMany({
      where: { userId: req.userId!, role },
      data: { status: 'cancelled', cancelledAt: new Date(), autoRenew: false },
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// AUTH
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(2),
  phone: z.string().min(7),
});

app.post('/api/auth/register', async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) return res.status(409).json({ error: 'Email already registered' });
    const hashedPassword = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
    const user = await prisma.user.create({
      data: {
        email: data.email,
        fullName: data.fullName,
        phone: data.phone,
        hashedPassword,
        activeRole: 'buyer',
        roles: { create: { role: 'buyer', status: 'active' } },
      },
      include: { roles: true, agentProfile: true },
    });
    res.status(201).json({ token: signToken(user.id), user: shapeUser(user) });
  } catch (e) { next(e); }
});

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email: data.email },
      include: { roles: true, agentProfile: true },
    });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(data.password, user.hashedPassword);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    res.json({ token: signToken(user.id), user: shapeUser(user) });
  } catch (e) { next(e); }
});

app.get('/api/auth/me', authMiddleware, (req: AuthedRequest, res) => {
  res.json({ user: shapeUser(req.user!) });
});

// ROLES
const activateRoleSchema = z.object({
  role: z.enum(['buyer', 'seller', 'agent', 'landlord', 'tenant', 'admin']),
  meta: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});

app.post('/api/roles/activate', authMiddleware, async (req: AuthedRequest, res, next) => {
  try {
    const data = activateRoleSchema.parse(req.body);
    await prisma.roleProfile.upsert({
      where: { userId_role: { userId: req.userId!, role: data.role } },
      create: { userId: req.userId!, role: data.role, meta: data.meta ?? undefined, status: 'active' },
      update: { status: 'active', meta: data.meta ?? undefined },
    });
    await prisma.user.update({ where: { id: req.userId! }, data: { activeRole: data.role } });
    const fresh = await loadUser(req.userId!);
    res.json({ user: shapeUser(fresh!) });
  } catch (e) { next(e); }
});

app.post('/api/roles/switch', authMiddleware, async (req: AuthedRequest, res, next) => {
  try {
    const { role } = z.object({ role: z.enum(['buyer', 'seller', 'agent', 'landlord', 'tenant', 'admin']) }).parse(req.body);
    const has = await prisma.roleProfile.findUnique({ where: { userId_role: { userId: req.userId!, role } } });
    if (!has) return res.status(400).json({ error: 'Role not activated' });
    await prisma.user.update({ where: { id: req.userId! }, data: { activeRole: role } });
    const fresh = await loadUser(req.userId!);
    res.json({ user: shapeUser(fresh!) });
  } catch (e) { next(e); }
});

app.delete('/api/roles/:role', authMiddleware, async (req: AuthedRequest, res, next) => {
  try {
    const role = req.params.role as UserRole;
    if (role === 'buyer') return res.status(400).json({ error: 'Cannot remove base member role' });
    await prisma.roleProfile.deleteMany({ where: { userId: req.userId!, role } });
    if (req.user!.activeRole === role) {
      await prisma.user.update({ where: { id: req.userId! }, data: { activeRole: 'buyer' } });
    }
    const fresh = await loadUser(req.userId!);
    res.json({ user: shapeUser(fresh!) });
  } catch (e) { next(e); }
});

// USERS
const profileSchema = z.object({
  fullName: z.string().min(2).optional(),
  phone: z.string().optional(),
  avatar: z.string().url().optional(),
  location: z.string().optional(),
  bio: z.string().optional(),
});

app.patch('/api/users/me', authMiddleware, async (req: AuthedRequest, res, next) => {
  try {
    const data = profileSchema.parse(req.body);
    await prisma.user.update({ where: { id: req.userId! }, data });
    const fresh = await loadUser(req.userId!);
    res.json({ user: shapeUser(fresh!) });
  } catch (e) { next(e); }
});

// PROPERTIES
const propertySchema = z.object({
  title: z.string().min(3),
  description: z.string(),
  propertyType: z.enum(['residential', 'commercial', 'land', 'industrial', 'agricultural', 'student_housing', 'short_stay']),
  listingType: z.enum(['sale', 'rent', 'lease']),
  price: z.number().positive(),
  currency: z.string().default('KES'),
  bedrooms: z.number().int().min(0).default(0),
  bathrooms: z.number().int().min(0).default(0),
  sizeSqft: z.number().int().min(0).default(0),
  yearBuilt: z.number().int().optional(),
  address: z.string(),
  city: z.string(),
  county: z.string(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  amenities: z.array(z.string()).default([]),
  images: z.array(z.string()).default([]),
});

app.get('/api/properties', async (req, res, next) => {
  try {
    const { city, county, propertyType, listingType, minPrice, maxPrice, search, limit } = req.query;
    const where: Record<string, unknown> = {};
    if (city) where.city = city;
    if (county) where.county = county;
    if (propertyType) where.propertyType = propertyType;
    if (listingType) where.listingType = listingType;
    if (minPrice || maxPrice) {
      const range: Record<string, number> = {};
      if (minPrice) range.gte = Number(minPrice);
      if (maxPrice) range.lte = Number(maxPrice);
      where.price = range;
    }
    if (search) {
      where.OR = [
        { title: { contains: String(search), mode: 'insensitive' } },
        { description: { contains: String(search), mode: 'insensitive' } },
        { city: { contains: String(search), mode: 'insensitive' } },
      ];
    }
    const properties = await prisma.property.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit ? Number(limit) : 100,
    });
    res.json({ properties });
  } catch (e) { next(e); }
});

app.get('/api/properties/featured', async (_req, res, next) => {
  try {
    const properties = await prisma.property.findMany({ where: { isFeatured: true }, take: 6 });
    res.json({ properties });
  } catch (e) { next(e); }
});

app.get('/api/properties/:id', async (req, res, next) => {
  try {
    const property = await prisma.property.update({
      where: { id: req.params.id },
      data: { views: { increment: 1 } },
    });
    res.json({ property });
  } catch (e) { next(e); }
});

app.post('/api/properties', authMiddleware, requireRole('seller', 'agent', 'landlord'), async (req: AuthedRequest, res, next) => {
  try {
    const data = propertySchema.parse(req.body);
    const role = req.user!.activeRole;
    if (role === 'agent' || role === 'landlord') {
      const sub = await getActiveSubscription(req.userId!, role);
      const limits = tierFor(role, sub);
      if (limits.maxListings !== -1) {
        const count = await prisma.property.count({
          where: role === 'agent' ? { agentId: req.userId! } : { ownerId: req.userId! },
        });
        if (count >= limits.maxListings) {
          return res.status(402).json({
            error: `Your ${limits.label} plan allows ${limits.maxListings} listings. Upgrade to add more.`,
            code: 'PLAN_LIMIT',
            currentTier: limits.tier,
            limit: limits.maxListings,
          });
        }
      }
    }
    const property = await prisma.property.create({
      data: { ...data, ownerId: req.userId!, agentId: role === 'agent' ? req.userId : null },
    });
    res.status(201).json({ property });
  } catch (e) { next(e); }
});

app.patch('/api/properties/:id', authMiddleware, async (req: AuthedRequest, res, next) => {
  try {
    const existing = await prisma.property.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (existing.ownerId !== req.userId && existing.agentId !== req.userId && req.user!.activeRole !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const data = propertySchema.partial().parse(req.body);
    const property = await prisma.property.update({ where: { id: req.params.id }, data });
    res.json({ property });
  } catch (e) { next(e); }
});

app.delete('/api/properties/:id', authMiddleware, async (req: AuthedRequest, res, next) => {
  try {
    const existing = await prisma.property.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (existing.ownerId !== req.userId && req.user!.activeRole !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await prisma.property.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// AGENTS
app.get('/api/agents', async (_req, res, next) => {
  try {
    const agents = await prisma.user.findMany({
      where: { roles: { some: { role: 'agent', status: 'active' } } },
      include: { agentProfile: true, roles: true },
      take: 50,
    });
    res.json({ agents: agents.map(shapeUser) });
  } catch (e) { next(e); }
});

app.get('/api/agents/:id', async (req, res, next) => {
  try {
    const agent = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { agentProfile: true, agentListings: true, roles: true },
    });
    if (!agent) return res.status(404).json({ error: 'Not found' });
    res.json({ agent: shapeUser(agent), listings: agent.agentListings });
  } catch (e) { next(e); }
});

// RENTALS
const unitSchema = z.object({
  title: z.string(),
  address: z.string(),
  city: z.string(),
  bedrooms: z.number().int(),
  bathrooms: z.number().int(),
  rentAmount: z.number(),
  image: z.string().optional(),
});

app.get('/api/rentals/units', authMiddleware, requireRole('landlord', 'admin'), async (req: AuthedRequest, res, next) => {
  try {
    const units = await prisma.rentalUnit.findMany({
      where: req.user!.activeRole === 'admin' ? {} : { landlordId: req.userId! },
      include: { leases: { include: { tenant: true } } },
    });
    res.json({ units });
  } catch (e) { next(e); }
});

app.post('/api/rentals/units', authMiddleware, requireRole('landlord'), async (req: AuthedRequest, res, next) => {
  try {
    const data = unitSchema.parse(req.body);
    const unit = await prisma.rentalUnit.create({ data: { ...data, landlordId: req.userId! } });
    res.status(201).json({ unit });
  } catch (e) { next(e); }
});

app.get('/api/rentals/tenants', authMiddleware, requireRole('landlord'), async (req: AuthedRequest, res, next) => {
  try {
    const leases = await prisma.lease.findMany({
      where: { landlordId: req.userId!, status: 'active' },
      include: { tenant: true, unit: true },
    });
    res.json({ tenants: leases });
  } catch (e) { next(e); }
});

app.get('/api/rentals/receipts', authMiddleware, async (req: AuthedRequest, res, next) => {
  try {
    const where = req.user!.activeRole === 'tenant' ? { tenantId: req.userId! } : { landlordId: req.userId! };
    const receipts = await prisma.rentReceipt.findMany({ where, include: { unit: true }, orderBy: { paidAt: 'desc' } });
    res.json({ receipts });
  } catch (e) { next(e); }
});

app.post('/api/rentals/pay', authMiddleware, requireRole('tenant'), async (req: AuthedRequest, res, next) => {
  try {
    const { unitId, amount, period, paymentMethod, mpesaRef } = z.object({
      unitId: z.string(),
      amount: z.number().positive(),
      period: z.string(),
      paymentMethod: z.enum(['mpesa', 'airtel_money', 'card', 'bank_transfer', 'pesalink', 'equitel', 'paypal', 'flutterwave', 'intasend', 'cash']),
      mpesaRef: z.string().optional(),
    }).parse(req.body);
    const unit = await prisma.rentalUnit.findUnique({ where: { id: unitId } });
    if (!unit) return res.status(404).json({ error: 'Unit not found' });
    const receipt = await prisma.rentReceipt.create({
      data: { unitId, tenantId: req.userId!, landlordId: unit.landlordId, amount, period, paymentMethod, mpesaRef },
    });
    res.status(201).json({ receipt });
  } catch (e) { next(e); }
});

// TENANT INVITES (landlord → tenant)
const inviteSchema = z.object({
  unitId: z.string(),
  tenantEmail: z.string().email().optional(),
  tenantPhone: z.string().optional(),
  rentAmount: z.number().positive(),
  deposit: z.number().min(0),
  startDate: z.string(),
  endDate: z.string(),
  terms: z.string().default(''),
});

app.post('/api/rentals/invites', authMiddleware, requireRole('landlord'), async (req: AuthedRequest, res, next) => {
  try {
    const data = inviteSchema.parse(req.body);
    if (!data.tenantEmail && !data.tenantPhone) {
      return res.status(400).json({ error: 'Provide tenantEmail or tenantPhone' });
    }
    const unit = await prisma.rentalUnit.findUnique({ where: { id: data.unitId } });
    if (!unit) return res.status(404).json({ error: 'Unit not found' });
    if (unit.landlordId !== req.userId) return res.status(403).json({ error: 'Not your unit' });

    // Try to resolve to an existing user.
    const tenantUser = await prisma.user.findFirst({
      where: {
        OR: [
          data.tenantEmail ? { email: data.tenantEmail } : undefined,
          data.tenantPhone ? { phone: data.tenantPhone } : undefined,
        ].filter(Boolean) as { email: string }[] | { phone: string }[],
      },
    });

    const invite = await prisma.tenantInvite.create({
      data: {
        unitId: data.unitId,
        landlordId: req.userId!,
        tenantEmail: data.tenantEmail,
        tenantPhone: data.tenantPhone,
        tenantUserId: tenantUser?.id,
        rentAmount: data.rentAmount,
        deposit: data.deposit,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        terms: data.terms,
      },
      include: { unit: true },
    });

    if (tenantUser) {
      await prisma.notification.create({
        data: {
          userId: tenantUser.id,
          title: 'Tenant invitation',
          message: `${req.user!.fullName} invited you to ${unit.title}. Tap to review.`,
          type: 'invite',
        },
      });
    }

    res.status(201).json({ invite });
  } catch (e) { next(e); }
});

app.get('/api/rentals/invites/landlord', authMiddleware, requireRole('landlord'), async (req: AuthedRequest, res, next) => {
  try {
    const invites = await prisma.tenantInvite.findMany({
      where: { landlordId: req.userId! },
      include: { unit: true, tenantUser: { select: { id: true, fullName: true, email: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ invites });
  } catch (e) { next(e); }
});

app.get('/api/rentals/invites/mine', authMiddleware, async (req: AuthedRequest, res, next) => {
  try {
    const user = req.user!;
    const invites = await prisma.tenantInvite.findMany({
      where: {
        status: 'pending',
        OR: [
          { tenantUserId: user.id },
          { tenantEmail: user.email },
          { tenantPhone: user.phone },
        ],
      },
      include: {
        unit: true,
        landlord: { select: { id: true, fullName: true, phone: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ invites });
  } catch (e) { next(e); }
});

app.post('/api/rentals/invites/:id/accept', authMiddleware, async (req: AuthedRequest, res, next) => {
  try {
    const invite = await prisma.tenantInvite.findUnique({ where: { id: req.params.id }, include: { unit: true } });
    if (!invite) return res.status(404).json({ error: 'Invite not found' });
    const user = req.user!;
    const matches = invite.tenantUserId === user.id
      || invite.tenantEmail === user.email
      || invite.tenantPhone === user.phone;
    if (!matches) return res.status(403).json({ error: 'This invite is not addressed to you' });
    if (invite.status !== 'pending') return res.status(400).json({ error: `Invite already ${invite.status}` });

    // Create lease, mark invite accepted, occupy unit, ensure tenant role.
    const result = await prisma.$transaction(async (tx) => {
      const lease = await tx.lease.create({
        data: {
          unitId: invite.unitId,
          landlordId: invite.landlordId,
          tenantId: user.id,
          rentAmount: invite.rentAmount,
          deposit: invite.deposit,
          startDate: invite.startDate,
          endDate: invite.endDate,
          terms: invite.terms,
          status: 'active',
          signedByLandlord: true,
          signedByTenant: true,
        },
      });
      await tx.tenantInvite.update({
        where: { id: invite.id },
        data: { status: 'accepted', respondedAt: new Date(), tenantUserId: user.id },
      });
      await tx.rentalUnit.update({ where: { id: invite.unitId }, data: { status: 'occupied' } });
      await tx.roleProfile.upsert({
        where: { userId_role: { userId: user.id, role: 'tenant' } },
        create: { userId: user.id, role: 'tenant', status: 'active' },
        update: { status: 'active' },
      });
      await tx.user.update({ where: { id: user.id }, data: { activeRole: 'tenant' } });
      await tx.notification.create({
        data: {
          userId: invite.landlordId,
          title: 'Tenant accepted invite',
          message: `${user.fullName} accepted the lease for ${invite.unit.title}.`,
          type: 'success',
        },
      });
      return lease;
    });

    const fresh = await loadUser(user.id);
    res.json({ lease: result, user: shapeUser(fresh!) });
  } catch (e) { next(e); }
});

app.post('/api/rentals/invites/:id/decline', authMiddleware, async (req: AuthedRequest, res, next) => {
  try {
    const invite = await prisma.tenantInvite.findUnique({ where: { id: req.params.id } });
    if (!invite) return res.status(404).json({ error: 'Invite not found' });
    const user = req.user!;
    const matches = invite.tenantUserId === user.id
      || invite.tenantEmail === user.email
      || invite.tenantPhone === user.phone;
    if (!matches) return res.status(403).json({ error: 'This invite is not addressed to you' });
    if (invite.status !== 'pending') return res.status(400).json({ error: `Invite already ${invite.status}` });

    await prisma.tenantInvite.update({
      where: { id: invite.id },
      data: { status: 'declined', respondedAt: new Date() },
    });
    await prisma.notification.create({
      data: {
        userId: invite.landlordId,
        title: 'Tenant declined invite',
        message: `${user.fullName} declined the tenant invitation.`,
        type: 'warning',
      },
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// PAYMENT EXTENSIONS — "give me more time" for rent / deposit / subscription / escrow
const extensionRequestSchema = z.object({
  kind: z.enum(['rent', 'deposit', 'subscription', 'escrow', 'other']).default('rent'),
  unitId: z.string().optional(),
  amount: z.number().positive(),
  currency: z.string().default('KES'),
  originalDue: z.string(),
  requestedDue: z.string(),
  reason: z.string().min(5),
  /// Who you want to approve it. For rent, defaults to landlord of the unit.
  approverId: z.string().optional(),
});

app.post('/api/extensions', authMiddleware, async (req: AuthedRequest, res, next) => {
  try {
    const data = extensionRequestSchema.parse(req.body);
    let approverId = data.approverId;
    let unit = null;
    if (!approverId && data.unitId) {
      unit = await prisma.rentalUnit.findUnique({ where: { id: data.unitId } });
      if (!unit) return res.status(404).json({ error: 'Unit not found' });
      approverId = unit.landlordId;
    }
    const ext = await prisma.paymentExtension.create({
      data: {
        requesterId: req.userId!,
        approverId,
        unitId: data.unitId,
        kind: data.kind,
        amount: data.amount,
        currency: data.currency,
        originalDue: new Date(data.originalDue),
        requestedDue: new Date(data.requestedDue),
        reason: data.reason,
      },
    });
    if (approverId) {
      await prisma.notification.create({
        data: {
          userId: approverId,
          title: 'Extension requested',
          message: `${req.user!.fullName} requested more time to pay ${data.kind} (${data.currency} ${data.amount}).`,
          type: 'warning',
        },
      });
    }
    res.status(201).json({ extension: ext });
  } catch (e) { next(e); }
});

app.get('/api/extensions/mine', authMiddleware, async (req: AuthedRequest, res, next) => {
  try {
    const extensions = await prisma.paymentExtension.findMany({
      where: { requesterId: req.userId! },
      orderBy: { createdAt: 'desc' },
      include: { approver: { select: { id: true, fullName: true } } },
    });
    res.json({ extensions });
  } catch (e) { next(e); }
});

app.get('/api/extensions/incoming', authMiddleware, async (req: AuthedRequest, res, next) => {
  try {
    const extensions = await prisma.paymentExtension.findMany({
      where: { approverId: req.userId! },
      orderBy: { createdAt: 'desc' },
      include: { requester: { select: { id: true, fullName: true, email: true, phone: true } } },
    });
    res.json({ extensions });
  } catch (e) { next(e); }
});

app.post('/api/extensions/:id/approve', authMiddleware, async (req: AuthedRequest, res, next) => {
  try {
    const { note } = z.object({ note: z.string().optional() }).parse(req.body || {});
    const ext = await prisma.paymentExtension.findUnique({ where: { id: req.params.id } });
    if (!ext) return res.status(404).json({ error: 'Not found' });
    if (ext.approverId !== req.userId) return res.status(403).json({ error: 'Not your decision' });
    if (ext.status !== 'pending') return res.status(400).json({ error: `Already ${ext.status}` });
    const updated = await prisma.paymentExtension.update({
      where: { id: ext.id },
      data: { status: 'approved', decisionAt: new Date(), decisionNote: note },
    });
    await prisma.notification.create({
      data: {
        userId: ext.requesterId,
        title: 'Extension approved',
        message: `Your request for more time was approved. New due date: ${ext.requestedDue.toDateString()}.`,
        type: 'success',
      },
    });
    res.json({ extension: updated });
  } catch (e) { next(e); }
});

app.post('/api/extensions/:id/decline', authMiddleware, async (req: AuthedRequest, res, next) => {
  try {
    const { note } = z.object({ note: z.string().optional() }).parse(req.body || {});
    const ext = await prisma.paymentExtension.findUnique({ where: { id: req.params.id } });
    if (!ext) return res.status(404).json({ error: 'Not found' });
    if (ext.approverId !== req.userId) return res.status(403).json({ error: 'Not your decision' });
    if (ext.status !== 'pending') return res.status(400).json({ error: `Already ${ext.status}` });
    const updated = await prisma.paymentExtension.update({
      where: { id: ext.id },
      data: { status: 'declined', decisionAt: new Date(), decisionNote: note },
    });
    await prisma.notification.create({
      data: {
        userId: ext.requesterId,
        title: 'Extension declined',
        message: `Your extension request was declined.${note ? ` Note: ${note}` : ''}`,
        type: 'warning',
      },
    });
    res.json({ extension: updated });
  } catch (e) { next(e); }
});

app.get('/api/maintenance', authMiddleware, async (req: AuthedRequest, res, next) => {
  try {
    let where: Record<string, unknown> = {};
    if (req.user!.activeRole === 'tenant') where = { tenantId: req.userId! };
    else if (req.user!.activeRole === 'landlord') where = { unit: { landlordId: req.userId! } };
    const requests = await prisma.maintenanceRequest.findMany({ where, include: { unit: true }, orderBy: { createdAt: 'desc' } });
    res.json({ requests });
  } catch (e) { next(e); }
});

app.post('/api/maintenance', authMiddleware, async (req: AuthedRequest, res, next) => {
  try {
    const { unitId, title, description, priority } = z.object({
      unitId: z.string(),
      title: z.string(),
      description: z.string(),
      priority: z.enum(['low', 'medium', 'high', 'emergency']).default('medium'),
    }).parse(req.body);
    const request = await prisma.maintenanceRequest.create({
      data: { unitId, title, description, priority, tenantId: req.userId },
    });
    res.status(201).json({ request });
  } catch (e) { next(e); }
});

// LEADS & COMMISSIONS
app.get('/api/leads', authMiddleware, requireRole('agent', 'admin'), async (req: AuthedRequest, res, next) => {
  try {
    const where = req.user!.activeRole === 'admin' ? {} : { agentId: req.userId! };
    const leads = await prisma.lead.findMany({ where, include: { property: true }, orderBy: { createdAt: 'desc' } });
    res.json({ leads });
  } catch (e) { next(e); }
});

app.get('/api/commissions', authMiddleware, requireRole('agent', 'admin'), async (req: AuthedRequest, res, next) => {
  try {
    const where = req.user!.activeRole === 'admin' ? {} : { agentId: req.userId! };
    const commissions = await prisma.commission.findMany({ where, orderBy: { closedAt: 'desc' } });
    res.json({ commissions });
  } catch (e) { next(e); }
});

// ESCROW
app.get('/api/escrow', authMiddleware, async (req: AuthedRequest, res, next) => {
  try {
    const txns = await prisma.escrow.findMany({
      where: { OR: [{ buyerId: req.userId! }, { sellerId: req.userId! }] },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ transactions: txns });
  } catch (e) { next(e); }
});

app.post('/api/escrow', authMiddleware, async (req: AuthedRequest, res, next) => {
  try {
    const { propertyId, sellerId, amount } = z.object({
      propertyId: z.string(),
      sellerId: z.string(),
      amount: z.number().positive(),
    }).parse(req.body);
    const property = await prisma.property.findUnique({ where: { id: propertyId } });
    if (!property) return res.status(404).json({ error: 'Property not found' });
    const txn = await prisma.escrow.create({
      data: { propertyId, propertyTitle: property.title, buyerId: req.userId!, sellerId, amount },
    });
    res.status(201).json({ transaction: txn });
  } catch (e) { next(e); }
});

// MESSAGES & NOTIFICATIONS
app.get('/api/messages', authMiddleware, async (req: AuthedRequest, res, next) => {
  try {
    const messages = await prisma.message.findMany({
      where: { OR: [{ senderId: req.userId! }, { receiverId: req.userId! }] },
      include: { sender: { select: { id: true, fullName: true, avatar: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ messages });
  } catch (e) { next(e); }
});

app.post('/api/messages', authMiddleware, async (req: AuthedRequest, res, next) => {
  try {
    const data = z.object({
      receiverId: z.string(),
      subject: z.string(),
      content: z.string(),
    }).parse(req.body);
    const message = await prisma.message.create({ data: { ...data, senderId: req.userId! } });
    await prisma.notification.create({
      data: { userId: data.receiverId, title: 'New message', message: data.subject, type: 'message' },
    });
    res.status(201).json({ message });
  } catch (e) { next(e); }
});

app.get('/api/notifications', authMiddleware, async (req: AuthedRequest, res, next) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.userId! },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const unreadCount = await prisma.notification.count({ where: { userId: req.userId!, read: false } });
    res.json({ notifications, unreadCount });
  } catch (e) { next(e); }
});

app.post('/api/notifications/:id/read', authMiddleware, async (req: AuthedRequest, res, next) => {
  try {
    await prisma.notification.updateMany({ where: { id: req.params.id, userId: req.userId! }, data: { read: true } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.post('/api/notifications/read-all', authMiddleware, async (req: AuthedRequest, res, next) => {
  try {
    await prisma.notification.updateMany({ where: { userId: req.userId!, read: false }, data: { read: true } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// DASHBOARD
app.get('/api/dashboard/overview', authMiddleware, async (req: AuthedRequest, res, next) => {
  try {
    const [activeListings, verifiedCount, totalProperties] = await Promise.all([
      prisma.property.count({ where: { status: 'active' } }),
      prisma.property.count({ where: { isVerified: true } }),
      prisma.property.count(),
    ]);
    res.json({
      activeListings,
      verifiedCount,
      totalProperties,
      verifiedRate: totalProperties ? Math.round((verifiedCount / totalProperties) * 100) : 0,
      role: req.user!.activeRole,
    });
  } catch (e) { next(e); }
});

app.get('/api/dashboard/landlord', authMiddleware, requireRole('landlord'), async (req: AuthedRequest, res, next) => {
  try {
    const [units, activeLeases, monthRevenue] = await Promise.all([
      prisma.rentalUnit.count({ where: { landlordId: req.userId! } }),
      prisma.lease.count({ where: { landlordId: req.userId!, status: 'active' } }),
      prisma.rentReceipt.aggregate({
        where: { landlordId: req.userId!, paidAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } },
        _sum: { amount: true },
      }),
    ]);
    res.json({ units, activeLeases, monthRevenue: monthRevenue._sum.amount || 0 });
  } catch (e) { next(e); }
});

// ADMIN — platform revenue + counts
app.get('/api/admin/overview', authMiddleware, requireRole('admin'), async (_req: AuthedRequest, res, next) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [
      totalUsers, totalProperties, totalUnits, totalLeases,
      activeSubs, mtdSubsRevenue, prevMtdRevenue,
      escrowVolume, mtdEscrowFees,
      rentVolume,
      pendingExtensions, pendingInvites, pendingVerifications,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.property.count(),
      prisma.rentalUnit.count(),
      prisma.lease.count({ where: { status: 'active' } }),
      prisma.subscription.count({ where: { status: 'active' } }),
      prisma.subscription.aggregate({
        where: { status: 'active', updatedAt: { gte: startOfMonth }, priceKes: { gt: 0 } },
        _sum: { priceKes: true },
      }),
      prisma.subscription.aggregate({
        where: { status: 'active', updatedAt: { gte: startOfLastMonth, lt: startOfMonth }, priceKes: { gt: 0 } },
        _sum: { priceKes: true },
      }),
      prisma.escrow.aggregate({ _sum: { amount: true }, _count: true }),
      prisma.escrow.aggregate({
        where: { status: 'completed', updatedAt: { gte: startOfMonth } },
        _sum: { amount: true },
      }),
      prisma.rentReceipt.aggregate({
        where: { paidAt: { gte: startOfMonth } },
        _sum: { amount: true },
      }),
      prisma.paymentExtension.count({ where: { status: 'pending' } }),
      prisma.tenantInvite.count({ where: { status: 'pending' } }),
      prisma.property.count({ where: { isVerified: false } }),
    ]);

    const subsRevenue = Number(mtdSubsRevenue._sum.priceKes || 0);
    const prevRevenue = Number(prevMtdRevenue._sum.priceKes || 0);
    const subsGrowth = prevRevenue ? Math.round(((subsRevenue - prevRevenue) / prevRevenue) * 100) : 0;
    const escrowFeesMtd = Number(mtdEscrowFees._sum.amount || 0) * 0.005;
    const rentMtd = Number(rentVolume._sum.amount || 0);

    const tierBreakdown = await prisma.subscription.groupBy({
      by: ['role', 'tier'],
      where: { status: 'active', priceKes: { gt: 0 } },
      _count: true,
      _sum: { priceKes: true },
    });

    res.json({
      counts: {
        users: totalUsers,
        properties: totalProperties,
        units: totalUnits,
        activeLeases: totalLeases,
        activeSubscriptions: activeSubs,
        pendingExtensions, pendingInvites, pendingVerifications,
      },
      revenue: {
        mrr: subsRevenue,
        mrrPrevMonth: prevRevenue,
        mrrGrowthPct: subsGrowth,
        escrowFeesMtd,
        escrowVolumeAllTime: Number(escrowVolume._sum.amount || 0),
        rentProcessedMtd: rentMtd,
        totalMtd: subsRevenue + escrowFeesMtd,
      },
      tierBreakdown: tierBreakdown.map((t) => ({ role: t.role, tier: t.tier, count: t._count, revenue: Number(t._sum.priceKes || 0) })),
    });
  } catch (e) { next(e); }
});

app.get('/api/admin/subscriptions', authMiddleware, requireRole('admin'), async (_req: AuthedRequest, res, next) => {
  try {
    const subs = await prisma.subscription.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: { user: { select: { id: true, email: true, fullName: true } } },
    });
    res.json({ subscriptions: subs });
  } catch (e) { next(e); }
});

app.get('/api/admin/extensions', authMiddleware, requireRole('admin'), async (_req: AuthedRequest, res, next) => {
  try {
    const extensions = await prisma.paymentExtension.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        requester: { select: { id: true, fullName: true, email: true } },
        approver: { select: { id: true, fullName: true } },
      },
    });
    res.json({ extensions });
  } catch (e) { next(e); }
});

app.get('/api/admin/invites', authMiddleware, requireRole('admin'), async (_req: AuthedRequest, res, next) => {
  try {
    const invites = await prisma.tenantInvite.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        unit: { select: { id: true, title: true, city: true } },
        landlord: { select: { id: true, fullName: true } },
        tenantUser: { select: { id: true, fullName: true, email: true } },
      },
    });
    res.json({ invites });
  } catch (e) { next(e); }
});

app.get('/api/admin/rent-receipts', authMiddleware, requireRole('admin'), async (_req: AuthedRequest, res, next) => {
  try {
    const receipts = await prisma.rentReceipt.findMany({
      orderBy: { paidAt: 'desc' },
      take: 200,
      include: {
        tenant: { select: { id: true, fullName: true, email: true } },
        unit: { select: { id: true, title: true, landlordId: true } },
      },
    });
    res.json({ receipts });
  } catch (e) { next(e); }
});

app.get('/api/admin/leases', authMiddleware, requireRole('admin'), async (_req: AuthedRequest, res, next) => {
  try {
    const leases = await prisma.lease.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        unit: { select: { id: true, title: true, city: true } },
        landlord: { select: { id: true, fullName: true } },
        tenant: { select: { id: true, fullName: true, email: true } },
      },
    });
    res.json({ leases });
  } catch (e) { next(e); }
});

app.get('/api/admin/recent-activity', authMiddleware, requireRole('admin'), async (_req: AuthedRequest, res, next) => {
  try {
    const [recentSubs, recentEscrows, recentInvites, recentExtensions] = await Promise.all([
      prisma.subscription.findMany({ orderBy: { updatedAt: 'desc' }, take: 10, include: { user: { select: { fullName: true, email: true } } } }),
      prisma.escrow.findMany({ orderBy: { updatedAt: 'desc' }, take: 10 }),
      prisma.tenantInvite.findMany({ orderBy: { createdAt: 'desc' }, take: 10, include: { unit: { select: { title: true } }, landlord: { select: { fullName: true } } } }),
      prisma.paymentExtension.findMany({ orderBy: { createdAt: 'desc' }, take: 10, include: { requester: { select: { fullName: true } } } }),
    ]);
    res.json({ recentSubs, recentEscrows, recentInvites, recentExtensions });
  } catch (e) { next(e); }
});

app.get('/api/dashboard/agent', authMiddleware, requireRole('agent'), async (req: AuthedRequest, res, next) => {
  try {
    const [listings, leads, commissionTotal] = await Promise.all([
      prisma.property.count({ where: { agentId: req.userId! } }),
      prisma.lead.count({ where: { agentId: req.userId!, status: 'new' } }),
      prisma.commission.aggregate({ where: { agentId: req.userId!, status: 'completed' }, _sum: { commissionAmount: true } }),
    ]);
    res.json({ listings, newLeads: leads, lifetimeCommission: commissionTotal._sum.commissionAmount || 0 });
  } catch (e) { next(e); }
});

// CHAMA — investment cooperatives
const createChamaSchema = z.object({
  name: z.string().min(3),
  description: z.string(),
  targetKes: z.number().positive(),
  monthlyContribution: z.number().positive(),
});

app.post('/api/chamas', authMiddleware, async (req: AuthedRequest, res, next) => {
  try {
    const data = createChamaSchema.parse(req.body);
    const chama = await prisma.chama.create({
      data: {
        ...data,
        members: { create: { userId: req.userId!, role: 'founder', shares: 1 } },
      },
      include: { members: { include: { user: { select: { id: true, fullName: true, email: true } } } } },
    });
    res.status(201).json({ chama });
  } catch (e) { next(e); }
});

app.get('/api/chamas', authMiddleware, async (req: AuthedRequest, res, next) => {
  try {
    const chamas = await prisma.chama.findMany({
      where: { members: { some: { userId: req.userId! } } },
      include: {
        members: { include: { user: { select: { id: true, fullName: true, email: true } } } },
        properties: true,
        contributions: { orderBy: { paidAt: 'desc' }, take: 10 },
      },
      orderBy: { createdAt: 'desc' },
    });
    const totals = await Promise.all(chamas.map(async (c) => {
      const sum = await prisma.chamaContribution.aggregate({ where: { chamaId: c.id }, _sum: { amount: true } });
      return { id: c.id, raised: Number(sum._sum.amount || 0) };
    }));
    const raisedById: Record<string, number> = {};
    for (const t of totals) raisedById[t.id] = t.raised;
    res.json({ chamas: chamas.map((c) => ({ ...c, raisedKes: raisedById[c.id] || 0 })) });
  } catch (e) { next(e); }
});

app.get('/api/chamas/:id', authMiddleware, async (req: AuthedRequest, res, next) => {
  try {
    const chama = await prisma.chama.findUnique({
      where: { id: req.params.id },
      include: {
        members: { include: { user: { select: { id: true, fullName: true, email: true } } } },
        properties: true,
        contributions: { include: { member: { select: { id: true, fullName: true } } }, orderBy: { paidAt: 'desc' } },
      },
    });
    if (!chama) return res.status(404).json({ error: 'Not found' });
    const member = chama.members.find((m) => m.userId === req.userId);
    if (!member && req.user!.activeRole !== 'admin') return res.status(403).json({ error: 'Not a member' });
    const sum = await prisma.chamaContribution.aggregate({ where: { chamaId: chama.id }, _sum: { amount: true } });
    res.json({ chama: { ...chama, raisedKes: Number(sum._sum.amount || 0) } });
  } catch (e) { next(e); }
});

app.post('/api/chamas/:id/join', authMiddleware, async (req: AuthedRequest, res, next) => {
  try {
    const chama = await prisma.chama.findUnique({ where: { id: req.params.id } });
    if (!chama) return res.status(404).json({ error: 'Not found' });
    const member = await prisma.chamaMember.upsert({
      where: { chamaId_userId: { chamaId: chama.id, userId: req.userId! } },
      create: { chamaId: chama.id, userId: req.userId!, role: 'member' },
      update: {},
    });
    res.status(201).json({ member });
  } catch (e) { next(e); }
});

app.post('/api/chamas/:id/contribute', authMiddleware, async (req: AuthedRequest, res, next) => {
  try {
    const data = z.object({
      amount: z.number().positive(),
      period: z.string(),
      paymentMethod: z.enum(['mpesa', 'airtel_money', 'card', 'bank_transfer', 'pesalink', 'equitel', 'paypal', 'flutterwave', 'intasend', 'cash']).default('mpesa'),
      paymentRef: z.string().optional(),
    }).parse(req.body);
    const member = await prisma.chamaMember.findUnique({ where: { chamaId_userId: { chamaId: req.params.id, userId: req.userId! } } });
    if (!member) return res.status(403).json({ error: 'Not a member of this chama' });
    const contrib = await prisma.chamaContribution.create({
      data: {
        chamaId: req.params.id,
        memberId: req.userId!,
        amount: data.amount,
        period: data.period,
        paymentMethod: data.paymentMethod,
        paymentRef: data.paymentRef,
      },
    });
    res.status(201).json({ contribution: contrib });
  } catch (e) { next(e); }
});

// BLOG
app.get('/api/blog', async (_req, res, next) => {
  try {
    const posts = await prisma.blogPost.findMany({ orderBy: { publishedAt: 'desc' }, take: 20 });
    res.json({ posts });
  } catch (e) { next(e); }
});

app.get('/api/blog/:slug', async (req, res, next) => {
  try {
    const post = await prisma.blogPost.findUnique({ where: { slug: req.params.slug } });
    if (!post) return res.status(404).json({ error: 'Not found' });
    res.json({ post });
  } catch (e) { next(e); }
});

// ERROR HANDLER
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Validation failed', issues: err.issues });
  }
  // eslint-disable-next-line no-console
  console.error('[error]', err);
  const message = err instanceof Error ? err.message : 'Internal error';
  res.status(500).json({ error: message });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Vestra backend listening on http://localhost:${PORT}`);
});
