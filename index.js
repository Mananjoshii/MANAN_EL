import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy } from "passport-local";
import session from "express-session";
import dotenv from "dotenv";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const port = 3000;
const saltRounds = 10;
dotenv.config();

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const destinationPath = file.fieldname === "video" ? "uploads/videos/"
            : file.fieldname === "audio" ? "uploads/audio/"
                : "uploads/images/";
        cb(null, destinationPath); // Set folder based on field name
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, file.fieldname + "-" + uniqueSuffix + "-" + file.originalname);
    },
});
const upload = multer({ storage });

// File path helpers
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// App configuration
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

// Express Session
app.use(
    session({
        secret: process.env.SECRET,
        resave: false,
        saveUninitialized: true,
    })
);

// Passport Initialization
app.use(passport.initialize());
app.use(passport.session());

// Database Connection
const db = new pg.Client({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database: process.env.PG_DATABASE,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT,
});
db.connect();

// Home Route
app.get("/", (req, res) => {
    res.render("home.ejs");
});

// About Route
app.get("/about", (req, res) => {
    res.render("about.ejs");
});

// Login Route
app.get("/login", (req, res) => {
    res.render("login.ejs");
});

// Register Route
app.get("/register", (req, res) => {
    res.render("register.ejs");
});
app.get('/artists', async (req, res) => {
    try {
      const result = await db.query('SELECT * FROM artists');
      const artists = result.rows; // Array of artists from the database
      res.render('artists', { artists });
    } catch (error) {
      console.error('Error fetching artists:', error);
      res.status(500).send('Internal Server Error');
    }
  });

  app.get('/bands', async (req, res) => {
    try {
      const result = await db.query('SELECT * FROM bands');
      const bands = result.rows; // Array of bands from the database
      res.render('bands', { bands });
    } catch (error) {
      console.error('Error fetching bands:', error);
      res.status(500).send('Internal Server Error');
    }
  });
  



// Events Route
app.get("/events", async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM events ORDER BY id DESC");
        res.render("events.ejs", { events: result.rows });
    } catch (err) {
        console.error("Error fetching events:", err);
        res.status(500).send("Internal Server Error");
    }
});

// Add Event Route
app.post("/add-event", upload.single("image"), async (req, res) => {
    const { title, description } = req.body;
    const imageUrl = `/uploads/images/${req.file.filename}`;

    try {
        await db.query(
            "INSERT INTO events (title, description, image_url) VALUES ($1, $2, $3)",
            [title, description, imageUrl]
        );
        res.redirect("/events");
    } catch (err) {
        console.error("Error adding event:", err);
        res.status(500).send("Internal Server Error");
    }
});

// Logout Route
app.get("/logout", (req, res) => {
    req.logout(function (err) {
        if (err) {
            console.error("Error logging out:", err);
            return res.status(500).send("Internal Server Error");
        }
        res.redirect("/");
    });
});
app.post(
    "/login",
    passport.authenticate("local", {
        successRedirect: "/profile",
        failureRedirect: "/login",
    })
);

// Register New User
app.post("/register", upload.fields([
    { name: "profile_picture", maxCount: 1 },
    { name: "video", maxCount: 1 },
    { name: "audio", maxCount: 1 },
]), async (req, res) => {
    const {
        username: email,
        password,
        name,
        role,
        description,
        instrument,
    } = req.body;
    const profile_picture = req.files?.profile_picture?.[0]?.filename || null;
    const video = req.files?.video?.[0]?.filename || null;
    const audio = req.files?.audio?.[0]?.filename || null;

    try {
        const checkResult = await db.query("SELECT * FROM users WHERE email = $1", [email]);

        if (checkResult.rows.length > 0) {
            res.redirect("/login");
        } else {
            bcrypt.hash(password, saltRounds, async (err, hash) => {
                if (err) {
                    console.error("Error hashing password:", err);
                    res.status(500).send("Internal Server Error");
                } else {
                    const result = await db.query(
                        `INSERT INTO users 
                        (email, password, name, role, description, profile_picture, video, audio, instrument) 
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
                        RETURNING *`,
                        [
                            email,
                            hash,
                            name,
                            role,
                            description,
                            profile_picture,
                            video,
                            audio,
                            instrument,
                        ]
                    );

                    const user = result.rows[0];
                    req.login(user, (err) => {
                        if (err) {
                            console.error("Error logging in user:", err);
                            res.status(500).send("Internal Server Error");
                        } else {
                            res.redirect("/profile");
                        }
                    });
                }
            });
        }
    } catch (err) {
        console.error("Error registering user:", err);
        res.status(500).send("Internal Server Error");
    }
});

// Profile Route
app.get("/profile", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }

    const userId = req.user.id;

    db.query("SELECT * FROM users WHERE id = $1", [userId], (err, result) => {
        if (err) {
            console.error("Error fetching user:", err);
            res.status(500).send("Internal Server Error");
        } else {
            const user = result.rows[0];

            if (user.role === "musician") {
                res.render("profile_musician.ejs", { user });
            } else if (user.role === "band_member") {
                db.query(
                    `SELECT b.name, b.description 
                     FROM bands b 
                     JOIN user_bands ub ON b.id = ub.band_id 
                     WHERE ub.user_id = $1`,
                    [userId],
                    (err, bandsResult) => {
                        if (err) {
                            console.error("Error fetching bands:", err);
                            res.status(500).send("Internal Server Error");
                        } else {
                            const bands = bandsResult.rows;
                            res.render("profile_band.ejs", { user, bands });
                        }
                    }
                );
            } else if (user.role === "event_organizer") {
                db.query(
                    "SELECT * FROM events WHERE organizer_id = $1",
                    [user.id],
                    (err, eventsResult) => {
                        if (err) {
                            console.error("Error fetching events:", err);
                            return res.status(500).send("Error fetching events");
                        }
                        res.render("profile_organizer.ejs", { user, events: eventsResult.rows });
                    }
                );
            } else {
                res.status(404).send("Profile not found");
            }
        }
    });
});

// Passport Configuration
passport.use(
    "local",
    new Strategy(async function verify(username, password, cb) {
        try {
            const result = await db.query("SELECT * FROM users WHERE email = $1 ", [username]);
            if (result.rows.length > 0) {
                const user = result.rows[0];
                const storedHashedPassword = user.password;
                bcrypt.compare(password, storedHashedPassword, (err, valid) => {
                    if (err) {
                        console.error("Error comparing passwords:", err);
                        return cb(err);
                    } else {
                        if (valid) {
                            return cb(null, user);
                        } else {
                            return cb(null, false);
                        }
                    }
                });
            } else {
                return cb(null, false);
            }
        } catch (err) {
            console.error("Error during login verification:", err);
            return cb(err);
        }
    })
);

passport.serializeUser((user, cb) => {
    cb(null, user.id);
});

passport.deserializeUser((id, cb) => {
    db.query("SELECT * FROM users WHERE id = $1", [id], (err, result) => {
        if (err) {
            return cb(err);
        } else {
            return cb(null, result.rows[0]);
        }
    });
});

// Start the Server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
