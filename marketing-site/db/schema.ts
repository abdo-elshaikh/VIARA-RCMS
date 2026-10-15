import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
export const inquiries = sqliteTable("inquiries", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  organization: text("organization").notNull(),
  facility: text("facility").notNull(),
  branches: text("branches").notNull(),
  interest: text("interest").notNull(),
  plan: text("plan").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("new"),
  locale: text("locale").notNull().default("ar"),
  offer: text("offer").notNull().default(""),
  createdAt: integer("created_at").notNull(),
}, (table) => [index("inquiries_user_created_idx").on(table.userId, table.createdAt)]);

export const siteSettings = sqliteTable('site_settings', {
  key: text('key').primaryKey(), value: text('value').notNull(), version: integer('version').notNull().default(1),
  updatedBy: text('updated_by').notNull(), updatedAt: integer('updated_at').notNull(),
});
export const reviews = sqliteTable('reviews', {
  id: text('id').primaryKey(), userId: text('user_id').notNull(), name: text('name').notNull(), role: text('role').notNull(),
  organization: text('organization').notNull(), quote: text('quote').notNull(), rating: integer('rating').notNull(),
  locale: text('locale').notNull().default('ar'), status: text('status').notNull().default('pending'),
  consent: integer('consent').notNull().default(1), createdAt: integer('created_at').notNull(),
}, table => [index('reviews_status_created_idx').on(table.status, table.createdAt)]);
