const mysql = require('mysql2/promise');
const cfg = require('../config/config');

const pool = mysql.createPool({
  host: cfg.DB_HOST,
  user: cfg.DB_USER,
  password: cfg.DB_PASS,
  database: cfg.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

module.exports = pool;
