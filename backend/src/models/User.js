const mongoose = require('mongoose');

/**
 * User model — supports multi-role accounts.
 *
 * `roles`  (new, authoritative) — array of allowed roles for this account.
 *           Example: ["teacher"], ["student"], ["teacher","student"]
 *
 * `role`   (legacy) — the original single-role field kept for backward
 *           compatibility with existing DB documents that were created before
 *           the roles[] migration.  New code must use `roles`.
 *           Never drop this field; old documents still have it.
 *
 * Helper: getRoles(user)
 *   Returns the effective roles array regardless of which field is populated.
 *   Use this in all business logic instead of checking user.role directly.
 */
const userSchema = new mongoose.Schema({
  email:        { type: String, required: true, unique: true, lowercase: true },
  displayName:  { type: String, default: '' },

  // ── New authoritative role array ──────────────────────────────────────────
  roles: {
    type: [{ type: String, enum: ['teacher', 'student'] }],
    default: [],
  },

  // ── Legacy single-role field — kept for backward compat, do not remove ───
  role: { type: String, enum: ['teacher', 'student'], default: null },

  // ── Student profile fields ────────────────────────────────────────────────
  rollNumber: { type: String, default: '' },
  section:    { type: String, default: '' },
  course:     { type: String, default: '' },

  // ── Auth fields ───────────────────────────────────────────────────────────
  googleId:     { type: String, default: null },
  photoUrl:     { type: String, default: null },
  passwordHash: { type: String, default: null },
}, { timestamps: true });

// ── Instance method: effective roles ─────────────────────────────────────────
// Always use this instead of reading user.roles or user.role directly.
// Normalises legacy single-role documents transparently.
userSchema.methods.getRoles = function () {
  if (this.roles && this.roles.length > 0) return this.roles;
  if (this.role) return [this.role];
  return [];
};

// ── Static helper usable without a document instance ─────────────────────────
userSchema.statics.normalizeRoles = function (user) {
  if (user.roles && user.roles.length > 0) return user.roles;
  if (user.role) return [user.role];
  return [];
};

/**
 * ensureRole(role)
 * Adds `role` to the roles[] array if not already present.
 * Also keeps the legacy `role` field in sync (set to first role for compat).
 * Returns true if the role was newly added, false if it was already present.
 */
userSchema.methods.ensureRole = async function (role) {
  const effective = this.getRoles();
  if (effective.includes(role)) return false;          // already has this role

  this.roles = [...new Set([...effective, role])];      // add without duplicates
  this.role  = this.roles[0];                           // keep legacy field in sync
  await this.save();
  return true;                                           // role was added
};

module.exports = mongoose.model('User', userSchema);
