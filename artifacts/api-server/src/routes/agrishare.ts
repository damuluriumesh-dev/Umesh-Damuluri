import { getAuth } from "@clerk/express";
import {
  CreateBookingBody,
  CreateBookingResponse,
  CreateEquipmentBody,
  CreateEquipmentResponse,
  CreatePurchaseParams,
  CreatePurchaseResponse,
  ContactOwnerParams,
  ContactOwnerBody,
  ContactOwnerResponse,
  CreateReviewBody,
  CreateReviewParams,
  CreateReviewResponse,
  EstimatePriceBody,
  EstimatePriceResponse,
  ExpressGroupInterestParams,
  ExpressGroupInterestResponse,
  FindReplacementsParams,
  FindReplacementsResponse,
  GetDashboardResponse,
  GetEquipmentParams,
  GetEquipmentResponse,
  GetNearbyEquipmentQueryParams,
  GetNearbyEquipmentResponse,
  ListBookingsResponse,
  ListEquipmentQueryParams,
  ListEquipmentResponse,
  RecommendEquipmentBody,
  RecommendEquipmentResponse,
} from "@workspace/api-zod";
import {
  bookingsTable,
  db,
  equipmentTable,
  groupInterestsTable,
  inquiriesTable,
  purchasesTable,
  reviewsTable,
} from "@workspace/db";
import { and, desc, eq, ilike, gte, inArray, lte, sql } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";

const router: IRouter = Router();

function userIdFor(req: Request): string {
  return getAuth(req).userId ?? "demo-farmer";
}

function requireAuth(req: Request, res: Response, next: (error?: unknown) => void): void {
  if (!getAuth(req).userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  next();
}

function reviewView(review: typeof reviewsTable.$inferSelect) {
  return {
    id: review.id,
    author: review.author,
    rating: review.rating,
    comment: review.comment,
    createdAt: review.createdAt.toISOString(),
  };
}

async function equipmentView(row: typeof equipmentTable.$inferSelect) {
  const reviews = await db
    .select()
    .from(reviewsTable)
    .where(eq(reviewsTable.equipmentId, row.id))
    .orderBy(desc(reviewsTable.createdAt));
  return {
    ...row,
    reviews: reviews.map(reviewView),
  };
}

router.get("/equipment", async (req, res): Promise<void> => {
  const parsed = ListEquipmentQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { search, category, transaction, location, condition, maxPrice, minRating } = parsed.data;
  const filters = [];
  if (search) filters.push(ilike(equipmentTable.name, `%${search}%`));
  if (category && category !== "All equipment") filters.push(eq(equipmentTable.category, category));
  if (location) filters.push(ilike(equipmentTable.location, `%${location}%`));
  if (condition && condition !== "all") {
    filters.push(condition === "new" ? eq(equipmentTable.condition, "New") : sql`${equipmentTable.condition} <> 'New'`);
  }
  if (minRating) filters.push(gte(equipmentTable.rating, minRating));
  if (maxPrice && transaction === "rent") filters.push(lte(equipmentTable.rentalPrice, maxPrice));
  if (maxPrice && transaction !== "rent") filters.push(lte(equipmentTable.buyPrice, maxPrice));
  if (transaction === "rent") filters.push(gte(equipmentTable.rentalPrice, 1));
  const rows = await db
    .select()
    .from(equipmentTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(equipmentTable.rating));
  const result = await Promise.all(rows.map(equipmentView));
  res.json(ListEquipmentResponse.parse(result));
});

router.post("/equipment", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateEquipmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = userIdFor(req);
  const body = parsed.data;
  const [row] = await db
    .insert(equipmentTable)
    .values({
      ...body,
      id: randomUUID(),
      ownerId: userId,
      ownerName: "Verified AgriShare owner",
      ownerTrust: 75,
      rating: 0,
      distanceKm: 2.5,
    })
    .returning();
  if (!row) {
    res.status(500).json({ error: "The listing could not be saved." });
    return;
  }
  res.status(201).json(CreateEquipmentResponse.parse(await equipmentView(row)));
});

router.get("/equipment/:id", async (req, res): Promise<void> => {
  const params = GetEquipmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db.select().from(equipmentTable).where(eq(equipmentTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Equipment not found." });
    return;
  }
  res.json(GetEquipmentResponse.parse(await equipmentView(row)));
});

router.post("/equipment/:id/reviews", requireAuth, async (req, res): Promise<void> => {
  const params = CreateReviewParams.safeParse(req.params);
  const body = CreateReviewBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [equipment] = await db
    .select()
    .from(equipmentTable)
    .where(eq(equipmentTable.id, params.data.id));
  if (!equipment) {
    res.status(404).json({ error: "Equipment not found." });
    return;
  }
  const [review] = await db
    .insert(reviewsTable)
    .values({
      id: randomUUID(),
      equipmentId: equipment.id,
      userId: userIdFor(req),
      author: "AgriShare farmer",
      ...body.data,
    })
    .returning();
  if (!review) {
    res.status(500).json({ error: "The review could not be saved." });
    return;
  }
  const [aggregate] = await db
    .select({ rating: sql<number>`avg(${reviewsTable.rating})` })
    .from(reviewsTable)
    .where(eq(reviewsTable.equipmentId, equipment.id));
  if (aggregate?.rating != null) {
    await db.update(equipmentTable).set({ rating: Number(aggregate.rating) }).where(eq(equipmentTable.id, equipment.id));
  }
  res.status(201).json(CreateReviewResponse.parse(reviewView(review)));
});

router.post("/equipment/:id/group-interest", requireAuth, async (req, res): Promise<void> => {
  const params = ExpressGroupInterestParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [equipment] = await db
    .select()
    .from(equipmentTable)
    .where(eq(equipmentTable.id, params.data.id));
  if (!equipment) {
    res.status(404).json({ error: "Equipment not found." });
    return;
  }
  const userId = userIdFor(req);
  const [existing] = await db
    .select()
    .from(groupInterestsTable)
    .where(and(eq(groupInterestsTable.equipmentId, equipment.id), eq(groupInterestsTable.userId, userId)));
  if (!existing) {
    await db.insert(groupInterestsTable).values({
      id: randomUUID(),
      equipmentId: equipment.id,
      userId,
    });
  }
  const [count] = await db
    .select({ total: sql<number>`count(*)` })
    .from(groupInterestsTable)
    .where(eq(groupInterestsTable.equipmentId, equipment.id));
  const interestedCount = Number(count?.total ?? 0);
  await db
    .update(equipmentTable)
    .set({ groupInterested: interestedCount })
    .where(eq(equipmentTable.id, equipment.id));
  res.json(ExpressGroupInterestResponse.parse({
    equipmentId: equipment.id,
    interestedCount,
    goal: 5,
  }));
});

router.get("/equipment/:id/replacements", async (req, res): Promise<void> => {
  const params = FindReplacementsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [source] = await db.select().from(equipmentTable).where(eq(equipmentTable.id, params.data.id));
  if (!source) {
    res.status(404).json({ error: "Equipment not found." });
    return;
  }
  const rows = await db
    .select()
    .from(equipmentTable)
    .where(and(eq(equipmentTable.category, source.category), eq(equipmentTable.availability, true)))
    .orderBy(equipmentTable.distanceKm)
    .limit(4);
  res.json(FindReplacementsResponse.parse(rows
    .filter((row) => row.id !== source.id)
    .map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      location: row.location,
      distanceKm: row.distanceKm,
      buyPrice: row.buyPrice,
      rentalPrice: row.rentalPrice,
      availability: row.availability,
      image: row.images[0] ?? "",
    }))));
});

router.post("/price-estimates", async (req, res): Promise<void> => {
  const parsed = EstimatePriceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { category, year, usageHours, condition } = parsed.data;
  const base = category.toLowerCase().includes("harvester") ? 4200000
    : category.toLowerCase().includes("tractor") ? 950000
    : category.toLowerCase().includes("pump") ? 85000
    : category.toLowerCase().includes("transplanter") ? 680000
    : 260000;
  const age = Math.max(0, new Date().getFullYear() - year);
  const conditionFactor = condition === "New" ? 1 : condition === "Excellent" ? 0.79 : condition === "Good" ? 0.61 : 0.42;
  const useFactor = Math.max(0.6, 1 - Math.max(0, usageHours) / 28000);
  const suggested = Math.round((base * Math.max(0.22, 1 - age * 0.075) * conditionFactor * useFactor) / 1000) * 1000;
  res.json(EstimatePriceResponse.parse({
    low: Math.round(suggested * 0.9),
    high: Math.round(suggested * 1.1),
    suggested,
    rationale: `Based on ${age} years of age, ${usageHours.toLocaleString()} hours of use, and ${condition.toLowerCase()} condition.`,
  }));

router.post("/equipment/:id/purchase", requireAuth, async (req, res): Promise<void> => {
  const params = CreatePurchaseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const purchaseResult = await db.transaction(async (tx) => {
    const [equipment] = await tx
      .update(equipmentTable)
      .set({ availability: false })
      .where(and(eq(equipmentTable.id, params.data.id), eq(equipmentTable.availability, true)))
      .returning();
    if (!equipment) return null;
    const [purchase] = await tx
      .insert(purchasesTable)
      .values({
        id: randomUUID(),
        equipmentId: equipment.id,
        buyerId: userIdFor(req),
        price: equipment.buyPrice,
        status: "Reserved",
      })
      .returning();
    if (!purchase) return null;
    return { equipment, purchase };
  });
  if (!purchaseResult) {
    res.status(404).json({ error: "This equipment is not currently available." });
    return;
  }
  res.status(201).json(CreatePurchaseResponse.parse({
    id: purchaseResult.purchase.id,
    equipmentId: purchaseResult.equipment.id,
    equipmentName: purchaseResult.equipment.name,
    price: purchaseResult.purchase.price,
    status: "Reserved",
  }));
});

router.post("/equipment/:id/contact", requireAuth, async (req, res): Promise<void> => {
  const params = ContactOwnerParams.safeParse(req.params);
  const body = ContactOwnerBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [equipment] = await db
    .select()
    .from(equipmentTable)
    .where(eq(equipmentTable.id, params.data.id));
  if (!equipment) {
    res.status(404).json({ error: "Equipment not found." });
    return;
  }
  const [inquiry] = await db
    .insert(inquiriesTable)
    .values({
      id: randomUUID(),
      equipmentId: equipment.id,
      senderId: userIdFor(req),
      message: body.data.message,
    })
    .returning();
  if (!inquiry) {
    res.status(500).json({ error: "Your message could not be sent." });
    return;
  }
  res.status(201).json(ContactOwnerResponse.parse({
    id: inquiry.id,
    equipmentId: equipment.id,
    ownerName: equipment.ownerName,
    status: "Sent",
    createdAt: inquiry.createdAt.toISOString(),
  }));
});
});

router.post("/recommendations", async (req, res): Promise<void> => {
  const parsed = RecommendEquipmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { crop, acres, work, budget, transaction } = parsed.data;
  const workText = work.toLowerCase();
  const preferred = workText.includes("harvest") ? ["Harvester", "Combine Harvester"]
    : workText.includes("plant") || workText.includes("sow") ? ["Seeder", "Rice Transplanter"]
    : workText.includes("water") || workText.includes("irrigat") ? ["Water Pump"]
    : workText.includes("spray") ? ["Sprayer", "Power Sprayer"]
    : workText.includes("till") || workText.includes("cultivat") ? ["Rotavator", "Tractor"]
    : ["Tractor", "Harvester"];
  const rows = await db
    .select()
    .from(equipmentTable)
    .where(eq(equipmentTable.availability, true));
  const result = rows
    .map((row) => {
      const price = transaction === "rent" ? row.rentalPrice : row.buyPrice;
      const matchingWork = preferred.some((item) => row.category.toLowerCase().includes(item.toLowerCase()) || row.name.toLowerCase().includes(item.toLowerCase()));
      const affordable = budget <= 0 || price <= budget;
      return { row, score: (matchingWork ? 20 : 0) + (affordable ? 10 : 0) + row.rating - row.distanceKm / 100 + Math.min(acres, 100) / 100 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(({ row }) => row);
  const equipment = await Promise.all(result.map(equipmentView));
  res.json(RecommendEquipmentResponse.parse(equipment));
});

router.get("/nearby", async (req, res): Promise<void> => {
  const parsed = GetNearbyEquipmentQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const rows = await db
    .select()
    .from(equipmentTable)
    .where(parsed.data.location
      ? ilike(equipmentTable.location, `%${parsed.data.location}%`)
      : eq(equipmentTable.availability, true))
    .orderBy(equipmentTable.distanceKm)
    .limit(20);
  res.json(GetNearbyEquipmentResponse.parse(rows.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    location: row.location,
    distanceKm: row.distanceKm,
    buyPrice: row.buyPrice,
    rentalPrice: row.rentalPrice,
    availability: row.availability,
    image: row.images[0] ?? "",
  }))));
});

router.get("/bookings", async (req, res): Promise<void> => {
  const rows = await db
    .select({ booking: bookingsTable, equipment: equipmentTable })
    .from(bookingsTable)
    .innerJoin(equipmentTable, eq(bookingsTable.equipmentId, equipmentTable.id))
    .where(eq(bookingsTable.farmerId, userIdFor(req)))
    .orderBy(desc(bookingsTable.createdAt));
  res.json(ListBookingsResponse.parse(rows.map(({ booking, equipment }) => ({
    id: booking.id,
    equipmentId: booking.equipmentId,
    equipmentName: equipment.name,
    startDate: booking.startDate,
    endDate: booking.endDate,
    totalPrice: booking.totalPrice,
    status: booking.status,
    location: equipment.location,
  }))));
});

router.post("/bookings", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { equipmentId } = parsed.data;
  const startDate = parsed.data.startDate.toISOString().slice(0, 10);
  const endDate = parsed.data.endDate.toISOString().slice(0, 10);
  if (endDate <= startDate) {
    res.status(400).json({ error: "Return date must be after the start date." });
    return;
  }
  const [equipment] = await db.select().from(equipmentTable).where(eq(equipmentTable.id, equipmentId));
  if (!equipment || !equipment.availability) {
    res.status(404).json({ error: "This equipment is not currently available." });
    return;
  }
  const days = Math.max(1, Math.ceil((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000));
  const [booking] = await db
    .insert(bookingsTable)
    .values({
      id: randomUUID(),
      equipmentId,
      farmerId: userIdFor(req),
      startDate,
      endDate,
      totalPrice: equipment.rentalPrice * days,
      status: "Requested",
    })
    .returning();
  if (!booking) {
    res.status(500).json({ error: "The booking could not be created." });
    return;
  }
  res.status(201).json(CreateBookingResponse.parse({
    id: booking.id,
    equipmentId,
    equipmentName: equipment.name,
    startDate: booking.startDate,
    endDate: booking.endDate,
    totalPrice: booking.totalPrice,
    status: booking.status,
    location: equipment.location,
  }));
});

router.get("/dashboard", async (req, res): Promise<void> => {
  const userId = userIdFor(req);
  const [listings, bookings, groupPurchases, purchases, ownedListings] = await Promise.all([
    db.select({ total: sql<number>`count(*)` }).from(equipmentTable).where(eq(equipmentTable.ownerId, userId)),
    db.select().from(bookingsTable).where(eq(bookingsTable.farmerId, userId)),
    db.select().from(groupInterestsTable).where(eq(groupInterestsTable.userId, userId)),
    db.select().from(purchasesTable).where(eq(purchasesTable.buyerId, userId)),
    db.select({ id: equipmentTable.id }).from(equipmentTable).where(eq(equipmentTable.ownerId, userId)),
  ]);
  const ownerRequests = ownedListings.length
    ? await db
        .select({ id: inquiriesTable.id })
        .from(inquiriesTable)
        .where(inArray(inquiriesTable.equipmentId, ownedListings.map((item) => item.id)))
    : [];
  res.json(GetDashboardResponse.parse({
    activeListings: Number(listings[0]?.total ?? 0),
    activeRentals: bookings.filter((item) => item.status === "Requested" || item.status === "Confirmed").length,
    purchases: purchases.length,
    pendingRequests: ownerRequests.length,
    savedCount: groupPurchases.length,
    trustScore: 92,
    recentActivity: bookings.slice(0, 3).map((item) => `Rental request placed for ${item.startDate}`),
  }));
});

export default router;
