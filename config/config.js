require('dotenv').config();

module.exports = {
  PORT: process.env.PORT,
  DB_NAME: process.env.DB_NAME,
  DB_USER: process.env.DB_USER,
  DB_PASS: process.env.DB_PASS,
  DB_HOST: process.env.DB_HOST,
  ADMIN_USER: process.env.ADMIN_USER,
  ADMIN_PASS: process.env.ADMIN_PASS,
  SESSION_SECRET: process.env.SESSION_SECRET,

  CONTACT: {
    facebook: process.env.CONTACT_FACEBOOK || '',
    zalo: process.env.CONTACT_ZALO || '',
    phone: process.env.CONTACT_PHONE || ''
  }
};
