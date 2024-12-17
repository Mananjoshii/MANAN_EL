import express from 'express';
import db from '../db.js'; // Import your database connection module

const router = express.Router();

// GET /search route to handle search requests
router.get('/search', async (req, res) => {
  const { query, type } = req.query;

  if (!query || !type) {
    return res.redirect('/'); // Redirect to homepage if no search input
  }

  let sqlQuery = '';
  let params = [`%${query}%`]; // Use parameterized queries for safety

  // Build SQL query based on the search 'type'
  if (type === 'artist') {
    sqlQuery = 'SELECT name, description FROM users WHERE role = $2 AND name ILIKE $1';
    params.push('musician'); // Only fetch users who are artists
  } else if (type === 'band') {
    sqlQuery = 'SELECT name, description FROM bands WHERE name ILIKE $1';
  } else if (type === 'event') {
    sqlQuery = 'SELECT name, description, date FROM events WHERE name ILIKE $1';
  } else {
    return res.redirect('/'); // Invalid type, redirect to homepage
  }

  try {
    const result = await db.query(sqlQuery, params);
    res.render('search-results', { results: result.rows, type, query });
  } catch (err) {
    console.error('Error during search:', err.message);
    res.status(500).send('Server error');
  }
});

export default router;
