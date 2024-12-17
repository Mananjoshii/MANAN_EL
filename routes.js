import express from "express";
const router = express.Router();
import db from './db.js'; // Import the database configuration

// Fetch Artists
router.get('/artists', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM artists');
    // res.json(result.rows); // Send data as JSON for client-side rendering
    res.render('artists', { title: 'Find Artists', artists: result.rows });
  } catch (err) {
    console.error('Error fetching artists:', err);
    res.status(500).send('Error fetching artists');
  }
});

// Fetch Events
router.get('/events', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM events');
    res.render('/events.ejs', { title: 'Live Events', events: result.rows });
  } catch (err) {
    console.error('Error fetching events:', err);
    res.status(500).send('Error fetching events');
  }
});

// Fetch Bands
router.get('/bands', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM bands');
    res.render('bands', { title: 'Join Bands', bands: result.rows });
  } catch (err) {
    console.error('Error fetching bands:', err);
    res.status(500).send('Error fetching bands');
  }
});



export default router;
