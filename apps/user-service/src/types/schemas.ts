import { z } from "zod";

// E.164 phone format, e.g. +919876543210
const phoneNumberSchema = z
  .string()
  .regex(/^\+[1-9]\d{6,14}$/, "phone_number must be in E.164 format, e.g. +919876543210");

export const requestOtpSchema = z.object({
  phone_number: phoneNumberSchema,
});

export const verifyOtpSchema = z.object({
  phone_number: phoneNumberSchema,
  otp: z.string().regex(/^\d{6}$/, "otp must be a 6-digit numeric string"),
});

export const refreshSchema = z.object({
  refresh_token: z.string().min(1),
});

const platformEnum = z.enum([
  "uber", "ola", "rapido",
  "swiggy", "zomato", "blinkit", "zepto",
  "porter", "urban_company", "dunzo", "other",
]);

const domainEnum = z.enum([
  "ride_hailing", "food_delivery", "quick_commerce",
  "home_services", "logistics", "other",
]);

const vehicleTypeEnum = z.enum(["bike", "auto", "car", "none"]);

const languageEnum = z.enum(["en", "hi", "te", "ta", "kn", "mr"]);

export const updateMeSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    preferred_language: languageEnum.optional(),
    city: z.string().min(1).max(100).optional(),
    vehicle_type: vehicleTypeEnum.optional(),
    active_platforms: z.array(platformEnum).optional(),
    active_domains: z.array(domainEnum).optional(),
  })
  .strict();

export type RequestOtpBody = z.infer<typeof requestOtpSchema>;
export type VerifyOtpBody = z.infer<typeof verifyOtpSchema>;
export type RefreshBody = z.infer<typeof refreshSchema>;
export type UpdateMeBody = z.infer<typeof updateMeSchema>;
