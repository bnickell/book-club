// ============================================================
// Org taxonomy for signup + club browsing filters.
// Customize these lists for your organization: members pick one of each at
// sign-up, and clubs can be browsed/filtered by them. Business groups and
// departments are independent (a department like Engineering can exist
// across every group). Values are stored as plain text on profiles, so you
// can edit the lists freely without a database migration.
// ============================================================

export const BUSINESS_GROUPS = [
  "Corporate / Shared Services",
  "Product & Engineering",
  "Sales & Marketing",
  "Operations",
  "Customer Success",
  "Other",
] as const;

export const DEPARTMENTS = [
  "Engineering / R&D",
  "Product Management",
  "Sales",
  "Marketing",
  "Operations / Manufacturing",
  "Supply Chain",
  "Customer & Technical Support",
  "Quality",
  "Finance",
  "Human Resources",
  "IT / Digital",
  "Other",
] as const;

export type BusinessGroup = (typeof BUSINESS_GROUPS)[number];
export type Department = (typeof DEPARTMENTS)[number];
