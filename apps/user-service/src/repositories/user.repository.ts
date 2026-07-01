import { pool } from "./db";
import { UpdateUserInput, User } from "../types/user";

const SELECT_COLUMNS = `
  id, phone_number, email, name, preferred_language, city, vehicle_type,
  active_platforms, active_domains, is_active,
  created_at, updated_at
`;

export async function findUserByPhone(phoneNumber: string): Promise<User | null> {
  const result = await pool.query(
    `SELECT ${SELECT_COLUMNS} FROM users WHERE phone_number = $1`,
    [phoneNumber]
  );
  return result.rows[0] ?? null;
}

export async function findUserById(id: string): Promise<User | null> {
  const result = await pool.query(
    `SELECT ${SELECT_COLUMNS} FROM users WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

/**
 * Creates a bare-minimum user row from just a verified phone number.
 * All other fields take their DB defaults (CONVENTIONS.md / DB_SCHEMA.sql).
 */
export async function createUserWithPhone(phoneNumber: string): Promise<User> {
  const result = await pool.query(
    `INSERT INTO users (phone_number) VALUES ($1) RETURNING ${SELECT_COLUMNS}`,
    [phoneNumber]
  );
  return result.rows[0];
}

/**
 * Finds a user by phone, creating one if it doesn't exist yet.
 * OTP is the only signup mechanism (⚠️ see README SPEC GAP notes).
 */
export async function findOrCreateUserByPhone(phoneNumber: string): Promise<{ user: User; isNewUser: boolean }> {
  const existing = await findUserByPhone(phoneNumber);
  if (existing) {
    return { user: existing, isNewUser: false };
  }
  const created = await createUserWithPhone(phoneNumber);
  return { user: created, isNewUser: true };
}

export async function updateUser(id: string, patch: UpdateUserInput): Promise<User | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (patch.name !== undefined) {
    fields.push(`name = $${idx++}`);
    values.push(patch.name);
  }
  if (patch.preferred_language !== undefined) {
    fields.push(`preferred_language = $${idx++}::language_enum`);
    values.push(patch.preferred_language);
  }
  if (patch.city !== undefined) {
    fields.push(`city = $${idx++}`);
    values.push(patch.city);
  }
  if (patch.vehicle_type !== undefined) {
    fields.push(`vehicle_type = $${idx++}::vehicle_type_enum`);
    values.push(patch.vehicle_type);
  }
  if (patch.active_platforms !== undefined) {
    fields.push(`active_platforms = $${idx++}::platform_enum[]`);
    values.push(patch.active_platforms);
  }
  if (patch.active_domains !== undefined) {
    fields.push(`active_domains = $${idx++}::domain_enum[]`);
    values.push(patch.active_domains);
  }

  if (fields.length === 0) {
    // Nothing to update — just return current row
    return findUserById(id);
  }

  fields.push(`updated_at = NOW()`);
  values.push(id);

  const result = await pool.query(
    `UPDATE users SET ${fields.join(", ")} WHERE id = $${idx} RETURNING ${SELECT_COLUMNS}`,
    values
  );
  return result.rows[0] ?? null;
}
