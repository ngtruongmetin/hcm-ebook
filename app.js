const express = require('express');
const path = require('path');
const cfg = require('./config/config');

const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');



const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// body parsers
app.use(express.urlencoded({ extended: true }));
app.use(express.json());


// session - required for admin login
const session = require('express-session');

app.use(session({
  secret: process.env.SESSION_SECRET || 'abc123',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 4 } // 4 hours
}));

// make admin session visible in views
app.use((req, res, next) => {
  res.locals.adminUser = req.session.adminUser || null;
  next();
});
  // ── chèn vào app.js ──
function formatDate(d) {
  if (!d) return '';
  const date = new Date(d);
  if (isNaN(date)) return String(d); // trả lại nguyên nếu không parse được
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// expose to EJS templates
app.locals.formatDate = formatDate;

// ---------------- NAV MIDDLEWARE ---------------- //
const db = require('./models/db');

app.use(async (req, res, next) => {
  try {
    const [classes] = await db.query('SELECT id, name FROM classes ORDER BY id');
    const [regions] = await db.query('SELECT id, name FROM regions ORDER BY id');
    const [topics] = await db.query(`
      SELECT id, title, description, cover, class_id, region_id 
      FROM books 
      ORDER BY class_id, region_id, position
    `);

    const nav = classes.map(c => {
      const regs = regions.map(r => ({
        id: r.id,
        name: r.name,
        topics: topics.filter(
          t => Number(t.class_id) === Number(c.id) && Number(t.region_id) === Number(r.id)
        )
      }));
      return { id: c.id, name: c.name, regions: regs };
    });

    res.locals.nav = nav;
  } catch (err) {
    console.error('Error building nav:', err);
    res.locals.nav = [];
  }
  next();
});
// ------------------------------------------------ //

// static files
app.use('/public', express.static(path.join(__dirname, 'public')));



// Intro
app.get('/gioi-thieu', (req, res) => {
  res.render('gioi_thieu', { title: 'Giới thiệu dự án' });
});

// Special page
app.get('/special/ky_uc_thoi_chien', (req, res) => {
  res.render('special_ky_uc_thoi_chien', { title: 'Ký ức thời chiến' });
});

// ROUTES
app.use('/', publicRoutes);
app.use('/admin', adminRoutes);

// 404
app.use((req, res) => {
  res.status(404).send('404 - Không tìm thấy trang');
});

app.listen(cfg.PORT, () => {
  console.log(`Server running on http://localhost:${cfg.PORT}`);
});
