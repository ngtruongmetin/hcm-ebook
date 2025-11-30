const express = require('express');
const router = express.Router();
const db = require('../models/db');

// HOME
router.get('/', async (req, res) => {
  try {
    const [books] = await db.query('SELECT * FROM books ORDER BY position');

    // lấy bài báo special (published = 1), mới nhất ở trên
    const [specials] = await db.query('SELECT id, title, summary, cover, created_at FROM special_articles WHERE published=1 ORDER BY created_at DESC LIMIT 8');

    // hero image: bạn có thể thay bằng '/public/defaults/home.jpg'
    const heroImage = '/public/defaults/home.jpg';

    res.render('index', { books, specials, heroImage, title: 'Trang chủ - HCM E-Book' });
  } catch (err) {
    console.error('Home route error', err);
    res.render('index', { books: [], specials: [], heroImage: '/public/defaults/home.jpg', title: 'Trang chủ - HCM E-Book' });
  }
});


// CLASS OVERVIEW
router.get('/class/:classId', async (req, res) => {
  const classId = parseInt(req.params.classId);

  const [[cls]] = await db.query('SELECT * FROM classes WHERE id=?', [classId]);
  if (!cls) return res.status(404).send('Không tìm thấy lớp');

  const [regions] = await db.query('SELECT * FROM regions ORDER BY id');

  const [topics] = await db.query(
    'SELECT id, title, description, cover, region_id FROM books WHERE class_id=? ORDER BY region_id, position',
    [classId]
  );
  const regionsWithTopics = regions.map(r => ({
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description,
    cover: r.cover,
    topics: topics.filter(t => Number(t.region_id) === Number(r.id))
  }));


  res.render('class_overview', {
    cls,
    regions: regionsWithTopics,
    classId,
    title: `${cls.name}`
  });
});
// TONG QUAN (Giới thiệu siêu đô thị TP.HCM)
router.get('/tong-quan', async (req, res) => {
  res.render('tong_quan', { 
    title: 'Tổng quan về TP Hồ Chí Minh' 
  });
});

// CLASS + REGION
router.get('/class/:classId/region/:regionId', async (req, res) => {
  const classId = parseInt(req.params.classId);
  const regionId = parseInt(req.params.regionId);

  const [[cls]] = await db.query('SELECT * FROM classes WHERE id=?', [classId]);
  const [[reg]] = await db.query('SELECT * FROM regions WHERE id=?', [regionId]);

  const [topics] = await db.query(
    'SELECT id, title, description, cover FROM books WHERE class_id=? AND region_id=? ORDER BY position',
    [classId, regionId]
  );

  res.render('region_list', {
    cls,
    reg,
    topics,
    title: `${cls.name} – ${reg.name}`
  });
});

// TOPIC DETAIL
router.get('/topic/:id', async (req, res) => {
  const topicId = req.params.id;

  const [[topic]] = await db.query('SELECT * FROM books WHERE id=?', [topicId]);
  if (!topic) return res.status(404).send('Không tìm thấy chủ đề');

  const [articles] = await db.query(
    'SELECT id, title, created_at FROM lessons WHERE book_id=? ORDER BY created_at DESC',
    [topicId]
  );

  res.render('topic_detail', { topic, articles, title: topic.title });
});

// LESSON DETAIL
router.get('/lesson/:id', async (req, res) => {
  const [[lesson]] = await db.query('SELECT * FROM lessons WHERE id=?', [req.params.id]);
  if (!lesson) return res.status(404).send('Không tìm thấy bài học');
  res.render('lesson', { lesson, title: lesson.title });
});

// BOOK (old)
router.get('/book/:id', async (req, res) => {
  const bookId = req.params.id;

  const [[book]] = await db.query('SELECT * FROM books WHERE id=?', [bookId]);
  if (!book) return res.status(404).send('Không tìm thấy quyển');

  const [lessons] = await db.query(
    'SELECT id, title FROM lessons WHERE book_id=? ORDER BY created_at',
    [bookId]
  );

  res.render('book', { book, lessons, title: book.title });
});
// special article detail (by id)
router.get('/special/:id', async (req, res) => {
  const id = req.params.id;
  const [[article]] = await db.query('SELECT * FROM special_articles WHERE id = ? AND published=1', [id]);
  if (!article) return res.status(404).send('Bài báo không tồn tại');
  res.render('special_detail', { article, title: article.title });
});

module.exports = router;
