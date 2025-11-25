// routes/admin.js
const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const cfg = require('../config/config');
const db = require('../models/db');

const router = express.Router();

// Multer config - save to public/uploads (tạo folder public/uploads nếu chưa có)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../public/uploads')),
  filename: (req, file, cb) => {
    const safe = Date.now() + '-' + file.originalname.replace(/\s+/g, '_');
    cb(null, safe);
  }
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// ---------- CKEditor image upload (robust) ----------
/**
 * POST /admin/upload-image
 * - expects multipart form-data with file field 'upload' (CKEditor default)
 * - returns JSON accepted by CKEditor5: { url: "/public/uploads/..." }
 * - also returns CKEditor4-compatible response when possible
 */
router.post('/upload-image', requireLogin, (req, res) => {
  // ensure multer single is executed and catch multer errors explicitly
  upload.single('upload')(req, res, function (err) {
    if (err) {
      console.error('Multer error on /admin/upload-image:', err);
      // Multer file size error or others
      return res.status(400).json({ error: err.message || 'Upload error' });
    }

    // Debug info to help diagnose session/cookie issues
    console.log('UPLOAD IMAGE called, headers.cookie:', req.headers.cookie);
    console.log('session:', !!req.session, 'isAdmin:', req.session && req.session.isAdmin, 'adminUser:', req.session && req.session.adminUser);
    console.log('body keys:', Object.keys(req.body || {}));
    console.log('file:', req.file && { field: req.file.fieldname, original: req.file.originalname, size: req.file.size });

    if (!req.file) {
      // No file received (field name mismatch or client didn't send)
      return res.status(400).json({ error: 'No file received. Ensure field name is "upload" and request is multipart/form-data.' });
    }

    const url = '/public/uploads/' + req.file.filename;

    // For CKEditor5 simple adapter, returning { url } is sufficient.
    // Also include CKEditor4-style response for compatibility.
    return res.json({
      uploaded: 1,
      fileName: req.file.filename,
      url: url
    });
  });
});
// helper: require login (session based)
function requireLogin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.redirect('/admin/login');
}

// ---------- Login page ----------
router.get('/login', (req, res) => {
  if (req.session && req.session.isAdmin) return res.redirect('/admin');
  res.render('admin_login', { message: null, title: 'Đăng nhập Admin' });
});

router.post('/login', express.urlencoded({ extended: true }), async (req, res) => {
  const { username, password } = req.body;
  const adminUser = process.env.ADMIN_USER || cfg.ADMIN_USER || 'admin';
  const adminPass = process.env.ADMIN_PASS || cfg.ADMIN_PASS || 'changeme';

  if (username === adminUser && password === adminPass) {
    req.session.isAdmin = true;
    req.session.adminUser = username;
    return res.redirect('/admin');
  } else {
    return res.render('admin_login', { message: 'Sai tên đăng nhập hoặc mật khẩu', title: 'Đăng nhập Admin' });
  }
});

// ---------- Logout ----------
router.get('/logout', (req, res) => {
  req.session.destroy(err => {
    res.clearCookie('connect.sid');
    return res.redirect('/admin/login');
  });
});

// ---------- Admin dashboard (upload + list + book management) ----------
router.get('/', requireLogin, async (req, res) => {
  try {
    // load books with class/region names
    const [books] = await db.query(`
      SELECT b.id, b.title, b.description, b.position, b.cover,
             c.name AS class_name, r.name AS region_name
      FROM books b
      LEFT JOIN classes c ON b.class_id = c.id
      LEFT JOIN regions r ON b.region_id = r.id
      ORDER BY b.position, b.id
    `);

    // list recent lessons (articles)
    const [articles] = await db.query(`
      SELECT l.id, l.title, l.created_at, b.title AS topic
      FROM lessons l
      LEFT JOIN books b ON l.book_id = b.id
      ORDER BY l.created_at DESC
      LIMIT 50
    `);
    const [specials] = await db.query('SELECT id, title, created_at, published FROM special_articles ORDER BY created_at DESC LIMIT 50');
    res.render('admin_dashboard', { books, articles, specials, message: null, title: 'Admin Dashboard' });
  } catch (err) {
    console.error(err);
    res.render('admin_dashboard', { books: [], articles: [], message: 'Lỗi khi tải dữ liệu', title: 'Admin Dashboard' });
  }
});

// ---------- LESSON (article) routes ----------

// upload new article
router.post('/upload-lesson', requireLogin, upload.single('attachment'), async (req, res) => {
  try {
    const { book_id, title, objectives, content } = req.body;
    const attachment = req.file ? `/public/uploads/${req.file.filename}` : null;
    await db.query('INSERT INTO lessons (book_id, title, objectives, content, attachment, created_by) VALUES (?,?,?,?,?,?)',
      [book_id || null, title, objectives, content, attachment, req.session.adminUser || 'admin']);
    return res.redirect('/admin');
  } catch (err) {
    console.error(err);
    return res.render('admin_dashboard', { books: [], articles: [], message: 'Lỗi khi upload: ' + err.message, title: 'Admin Dashboard' });
  }
});

// delete article
router.post('/delete-lesson', requireLogin, express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const id = req.body.id;
    // get attachment path to remove file
    const [rows] = await db.query('SELECT attachment FROM lessons WHERE id = ?', [id]);
    if (rows && rows[0] && rows[0].attachment) {
      const filePath = path.join(__dirname, '..', rows[0].attachment);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
      }
    }
    await db.query('DELETE FROM lessons WHERE id = ?', [id]);
    return res.redirect('/admin');
  } catch (err) {
    console.error(err);
    return res.redirect('/admin');
  }
});

// edit lesson page (load)
router.get('/edit/:id', requireLogin, async (req, res) => {
  try {
    const id = req.params.id;
    const [[lesson]] = await db.query('SELECT * FROM lessons WHERE id = ?', [id]);
    const [books] = await db.query('SELECT id, title FROM books ORDER BY position');
    if (!lesson) return res.redirect('/admin');
    res.render('admin_edit', { lesson, books, message: null, title: 'Sửa bài học' });
  } catch (err) {
    console.error(err);
    res.redirect('/admin');
  }
});

// save edit lesson
router.post('/edit/:id', requireLogin, upload.single('attachment'), async (req, res) => {
  try {
    const id = req.params.id;
    const { book_id, title, objectives, content } = req.body;
    let attachment = null;
    if (req.file) {
      attachment = `/public/uploads/${req.file.filename}`;
      // remove old file
      const [rows] = await db.query('SELECT attachment FROM lessons WHERE id = ?', [id]);
      if (rows && rows[0] && rows[0].attachment) {
        const oldPath = path.join(__dirname, '..', rows[0].attachment);
        if (fs.existsSync(oldPath)) {
          try { fs.unlinkSync(oldPath); } catch(e) {}
        }
      }
    }
    if (attachment) {
      await db.query('UPDATE lessons SET book_id=?, title=?, objectives=?, content=?, attachment=? WHERE id=?', [book_id || null, title, objectives, content, attachment, id]);
    } else {
      await db.query('UPDATE lessons SET book_id=?, title=?, objectives=?, content=? WHERE id=?', [book_id || null, title, objectives, content, id]);
    }
    res.redirect('/admin');
  } catch (err) {
    console.error(err);
    res.redirect('/admin');
  }
});
// ---------- SPECIAL ARTICLE routes ----------
// new special form
router.get('/special/new', requireLogin, async (req, res) => {
  res.render('admin_special_edit', { article: null, message: null, title: 'Tạo bài báo' });
});

// create special
router.post('/special/new', requireLogin, upload.fields([{ name: 'cover' }, { name: 'attachment' }]), async (req, res) => {
  try {
    const { title, summary, content, published } = req.body;
    const coverFile = req.files && req.files.cover && req.files.cover[0];
    const attachmentFile = req.files && req.files.attachment && req.files.attachment[0];
    const cover = coverFile ? `/public/uploads/${coverFile.filename}` : null;
    const attachment = attachmentFile ? `/public/uploads/${attachmentFile.filename}` : null;
    const slug = (title || '').toLowerCase().replace(/[^a-z0-9\-_]+/g,'-').replace(/^-|-$/g,'');

    await db.query(
      'INSERT INTO special_articles (title, slug, summary, content, cover, attachment, published, created_by) VALUES (?,?,?,?,?,?,?,?)',
      [title, slug, summary, content, cover, attachment, published ? 1 : 0, req.session.adminUser || 'admin']
    );
    return res.redirect('/admin');
  } catch (err) {
    console.error(err);
    return res.render('admin_special_edit', { article: null, message: 'Lỗi: '+err.message, title: 'Tạo bài báo' });
  }
});

// edit form
router.get('/special/edit/:id', requireLogin, async (req, res) => {
  const id = req.params.id;
  const [[article]] = await db.query('SELECT * FROM special_articles WHERE id=?', [id]);
  if (!article) return res.redirect('/admin');
  res.render('admin_special_edit', { article, message: null, title: 'Sửa bài báo' });
});

// save edit
router.post('/special/edit/:id', requireLogin, upload.fields([{ name: 'cover' }, { name: 'attachment' }]), async (req, res) => {
  try {
    const id = req.params.id;
    const { title, summary, content, published } = req.body;
    const coverFile = req.files && req.files.cover && req.files.cover[0];
    const attachmentFile = req.files && req.files.attachment && req.files.attachment[0];
    const cover = coverFile ? `/public/uploads/${coverFile.filename}` : null;
    const attachment = attachmentFile ? `/public/uploads/${attachmentFile.filename}` : null;

    // remove old files if replaced
    if (cover) {
      const [rows] = await db.query('SELECT cover FROM special_articles WHERE id=?', [id]);
      if (rows && rows[0] && rows[0].cover) {
        try { fs.unlinkSync(path.join(__dirname,'..', rows[0].cover)); } catch(e){}
      }
    }
    if (attachment) {
      const [rows2] = await db.query('SELECT attachment FROM special_articles WHERE id=?', [id]);
      if (rows2 && rows2[0] && rows2[0].attachment) {
        try { fs.unlinkSync(path.join(__dirname,'..', rows2[0].attachment)); } catch(e){}
      }
    }

    if (cover || attachment) {
      await db.query('UPDATE special_articles SET title=?, summary=?, content=?, cover=COALESCE(?,cover), attachment=COALESCE(?,attachment), published=? WHERE id=?',
        [title, summary, content, cover, attachment, published ? 1 : 0, id]);
    } else {
      await db.query('UPDATE special_articles SET title=?, summary=?, content=?, published=? WHERE id=?',
        [title, summary, content, published ? 1 : 0, id]);
    }

    return res.redirect('/admin');
  } catch (err) {
    console.error(err);
    return res.redirect('/admin');
  }
});

// delete special
router.post('/special/delete', requireLogin, express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const id = req.body.id;
    const [rows] = await db.query('SELECT cover, attachment FROM special_articles WHERE id=?', [id]);
    if (rows && rows[0]) {
      if (rows[0].cover) { try { fs.unlinkSync(path.join(__dirname,'..', rows[0].cover)); } catch(e){} }
      if (rows[0].attachment) { try { fs.unlinkSync(path.join(__dirname,'..', rows[0].attachment)); } catch(e){} }
    }
    await db.query('DELETE FROM special_articles WHERE id=?', [id]);
    res.redirect('/admin');
  } catch (err) {
    console.error(err);
    res.redirect('/admin');
  }
});

// ---------- BOOK MANAGEMENT (Admin) ----------

// GET: form tạo chủ đề mới
router.get('/book/new', requireLogin, async (req, res) => {
  const [classes] = await db.query('SELECT id, name FROM classes ORDER BY id');
  const [regions] = await db.query('SELECT id, name FROM regions ORDER BY id');
  res.render('admin_book_form', { book: null, classes, regions, title: 'Tạo chủ đề' });
});

// POST: tạo chủ đề mới
router.post('/book/new', requireLogin, upload.single('cover'), express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const { title, description, position, class_id, region_id } = req.body;
    const cover = req.file ? `/public/uploads/${req.file.filename}` : null;
    await db.query('INSERT INTO books (title, description, position, class_id, region_id, cover) VALUES (?,?,?,?,?,?)',
      [title, description || null, position || 0, class_id || null, region_id || null, cover]);
    res.redirect('/admin');
  } catch (err) {
    console.error(err);
    res.redirect('/admin');
  }
});

// GET: edit book form
router.get('/book/edit/:id', requireLogin, async (req, res) => {
  try {
    const id = req.params.id;
    const [[book]] = await db.query('SELECT * FROM books WHERE id = ?', [id]);
    if (!book) return res.redirect('/admin');
    const [classes] = await db.query('SELECT id, name FROM classes ORDER BY id');
    const [regions] = await db.query('SELECT id, name FROM regions ORDER BY id');
    res.render('admin_book_form', { book, classes, regions, title: 'Sửa chủ đề' });
  } catch (err) {
    console.error(err);
    res.redirect('/admin');
  }
});

// POST: save edit book
router.post('/book/edit/:id', requireLogin, upload.single('cover'), express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const id = req.params.id;
    const { title, description, position, class_id, region_id } = req.body;
    let cover = null;
    if (req.file) {
      cover = `/public/uploads/${req.file.filename}`;
      // delete old cover if exists
      const [rows] = await db.query('SELECT cover FROM books WHERE id = ?', [id]);
      if (rows && rows[0] && rows[0].cover) {
        const old = path.join(__dirname, '..', rows[0].cover);
        if (fs.existsSync(old)) try { fs.unlinkSync(old); } catch(e){}
      }
    }
    if (cover) {
      await db.query('UPDATE books SET title=?, description=?, position=?, class_id=?, region_id=?, cover=? WHERE id=?',
        [title, description || null, position || 0, class_id || null, region_id || null, cover, id]);
    } else {
      await db.query('UPDATE books SET title=?, description=?, position=?, class_id=?, region_id=? WHERE id=?',
        [title, description || null, position || 0, class_id || null, region_id || null, id]);
    }
    res.redirect('/admin');
  } catch (err) {
    console.error(err);
    res.redirect('/admin');
  }
});

// POST: delete book
router.post('/book/delete', requireLogin, express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const id = req.body.id;
    // delete cover file if exists
    const [rows] = await db.query('SELECT cover FROM books WHERE id = ?', [id]);
    if (rows && rows[0] && rows[0].cover) {
      const p = path.join(__dirname, '..', rows[0].cover);
      if (fs.existsSync(p)) try { fs.unlinkSync(p); } catch(e){}
    }
    // optional: delete lessons under book if you want
    // await db.query('DELETE FROM lessons WHERE book_id = ?', [id]);

    await db.query('DELETE FROM books WHERE id = ?', [id]);
    res.redirect('/admin');
  } catch (err) {
    console.error(err);
    res.redirect('/admin');
  }
});

module.exports = router;
