import {
  boolean,
  date,
  integer,
  pgTable,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const equipmentTable = pgTable("agrishare_equipment", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  ownerName: text("owner_name").notNull(),
  ownerTrust: integer("owner_trust").notNull().default(90),
  name: text("name").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  buyPrice: integer("buy_price").notNull(),
  rentalPrice: integer("rental_price").notNull(),
  condition: text("condition").notNull(),
  year: integer("year").notNull(),
  usageHours: integer("usage_hours").notNull(),
  location: text("location").notNull(),
  images: text("images").array().notNull().default([]),
  rating: real("rating").notNull().default(4.5),
  availability: boolean("availability").notNull().default(true),
  distanceKm: real("distance_km").notNull().default(5),
  groupInterested: integer("group_interested").notNull().default(0),
  maintenanceHistory: text("maintenance_history").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const bookingsTable = pgTable("agrishare_bookings", {
  id: text("id").primaryKey(),
  equipmentId: text("equipment_id").notNull(),
  farmerId: text("farmer_id").notNull(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  totalPrice: integer("total_price").notNull(),
  status: text("status").notNull().default("Requested"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reviewsTable = pgTable("agrishare_reviews", {
  id: text("id").primaryKey(),
  equipmentId: text("equipment_id").notNull(),
  userId: text("user_id").notNull(),
  author: text("author").notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const groupInterestsTable = pgTable("agrishare_group_interests", {
  id: text("id").primaryKey(),
  equipmentId: text("equipment_id").notNull(),
  userId: text("user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const purchasesTable = pgTable("agrishare_purchases", {
  id: text("id").primaryKey(),
  equipmentId: text("equipment_id").notNull(),
  buyerId: text("buyer_id").notNull(),
  price: integer("price").notNull(),
  status: text("status").notNull().default("Completed"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const inquiriesTable = pgTable("agrishare_inquiries", {
  id: text("id").primaryKey(),
  equipmentId: text("equipment_id").notNull(),
  senderId: text("sender_id").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("Sent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const storageUploadsTable = pgTable("agrishare_storage_uploads", {
  objectPath: text("object_path").primaryKey(),
  ownerId: text("owner_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertEquipmentSchema = createInsertSchema(equipmentTable).omit({
  id: true,
  createdAt: true,
});
export type InsertEquipment = z.infer<typeof insertEquipmentSchema>;
export type Equipment = typeof equipmentTable.$inferSelect;
export type Booking = typeof bookingsTable.$inferSelect;
export type Review = typeof reviewsTable.$inferSelect;
