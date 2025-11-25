require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 2026,
  DB_NAME: process.env.DB_NAME || "hcm_ebook",
  DB_USER: process.env.DB_USER || "root",
  DB_PASS: process.env.DB_PASS || "",
  DB_HOST: process.env.DB_HOST || "localhost",
  ADMIN_USER: process.env.ADMIN_USER || "admin",
  ADMIN_PASS: process.env.ADMIN_PASS || "admin",
  SESSION_SECRET: process.env.SESSION_SECRET || "abcdefgthptntbdstartup26"
};
