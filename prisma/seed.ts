import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED !== 'true') {
    throw new Error('Refusing to seed in production (set ALLOW_SEED=true only if intentional).');
  }
  const seedPassword = process.env.SEED_PASSWORD || 'password';
  const password = await bcrypt.hash(seedPassword, 12);

  const seedUsers = [
    { email: 'buyer@vestra.com',    fullName: 'John Doe',       phone: '+254711111111', roles: ['buyer'],             activeRole: 'buyer'    as const, location: 'Nairobi' },
    { email: 'seller@vestra.com',   fullName: 'Jane Muthoni',   phone: '+254722222222', roles: ['buyer', 'seller'],    activeRole: 'seller'   as const, location: 'Karen' },
    { email: 'landlord@vestra.com', fullName: 'Sammy Ndungu',   phone: '+254733333333', roles: ['buyer', 'landlord'],  activeRole: 'landlord' as const, location: 'Kilimani' },
    { email: 'tenant@vestra.com',   fullName: 'Mary Wanjiru',   phone: '+254744444444', roles: ['buyer', 'tenant'],    activeRole: 'tenant'   as const, location: 'Westlands' },
    { email: 'agent@vestra.com',    fullName: 'Wanjiku Mwangi', phone: '+254755555555', roles: ['buyer', 'agent'],     activeRole: 'agent'    as const, location: 'Nairobi' },
    { email: 'admin@vestra.com',    fullName: 'Admin User',     phone: '+254766666666', roles: ['buyer', 'admin'],     activeRole: 'admin'    as const, location: 'Nairobi' },
  ];

  for (const u of seedUsers) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        fullName: u.fullName,
        phone: u.phone,
        hashedPassword: password,
        activeRole: u.activeRole,
        isVerified: true,
        isKycVerified: true,
        location: u.location,
        roles: { create: u.roles.map((r) => ({ role: r as 'buyer' | 'seller' | 'landlord' | 'tenant' | 'agent' | 'admin', status: 'active' as const })) },
      },
    });
  }

  const seller = await prisma.user.findUnique({ where: { email: 'seller@vestra.com' } });
  const agent = await prisma.user.findUnique({ where: { email: 'agent@vestra.com' } });

  if (seller) {
    const existing = await prisma.property.count({ where: { ownerId: seller.id } });
    if (existing === 0) {
      await prisma.property.createMany({
        data: [
          { ownerId: seller.id, agentId: agent?.id ?? null, title: '4-Bedroom Townhouse in Karen', description: 'Modern townhouse with private garden, perimeter wall, and ample parking.', propertyType: 'residential', listingType: 'sale', price: 28500000, bedrooms: 4, bathrooms: 3, sizeSqft: 2800, address: 'Bogani Rd', city: 'Karen', county: 'Nairobi', amenities: ['parking', 'garden', 'security'], images: ['https://images.unsplash.com/photo-1568605114967-8130f3a36994'], trustScore: 92, isVerified: true, isFeatured: true },
          { ownerId: seller.id, agentId: agent?.id ?? null, title: 'Luxury Apartment in Westlands', description: 'High-rise apartment with city views, gym and pool.', propertyType: 'residential', listingType: 'sale', price: 18500000, bedrooms: 3, bathrooms: 2, sizeSqft: 1600, address: 'Waiyaki Way', city: 'Westlands', county: 'Nairobi', amenities: ['gym', 'pool', 'lift'], images: ['https://images.unsplash.com/photo-1493809842364-78817add7ffb'], trustScore: 88, isVerified: true, isFeatured: true },
          { ownerId: seller.id, agentId: null, title: '1-Acre Plot in Kitengela', description: 'Title-deed-ready 1-acre plot, fenced, with electricity.', propertyType: 'land', listingType: 'sale', price: 3500000, bedrooms: 0, bathrooms: 0, sizeSqft: 43560, address: 'Kitengela Bypass', city: 'Kitengela', county: 'Kajiado', amenities: ['fenced', 'title deed'], images: ['https://images.unsplash.com/photo-1500382017468-9049fed747ef'], trustScore: 85, isVerified: true, isFeatured: false },
        ],
      });
    }
  }

  if (agent) {
    await prisma.agentProfile.upsert({
      where: { userId: agent.id },
      update: {},
      create: {
        userId: agent.id,
        agencyName: 'Vestra Realty Partners',
        licenseNumber: 'EARB/2024/00100',
        badgeLevel: 'gold',
        rating: 4.8,
        reviewCount: 47,
        specialties: ['residential', 'land'],
        city: 'Nairobi',
        county: 'Nairobi',
        subscriptionTier: 'pro',
      },
    });
  }

  await prisma.blogPost.upsert({
    where: { slug: 'how-to-verify-a-title-deed' },
    update: {},
    create: {
      slug: 'how-to-verify-a-title-deed',
      title: 'How to Verify a Title Deed in Kenya',
      excerpt: 'Five steps every buyer should take before paying a cent.',
      content: 'Full article body here…',
      author: 'Vestra Team',
      category: 'Buying',
      readTime: '4 min',
    },
  });

  console.log('✅ Seed complete. Demo accounts password = "password"');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
