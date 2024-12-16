import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy } from "passport-local";
import session from "express-session";
import env from "dotenv";

const app = express();
const port = 3000;
const saltRounds = 10;
env.config();

app.use(
    session({
        secret: process.env.SECRET,
        resave: false,
        saveUninitialized: true,
    })
);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(passport.initialize());
app.use(passport.session());

const db = new pg.Client({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database: process.env.PG_DATABASE,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT,
});
db.connect();

app.get("/", (req, res) => {
    res.render("home.ejs");
});

app.get("/login", (req, res) => {
    res.render("login.ejs");
});

app.get("/register", (req, res) => {
    res.render("register.ejs");
});

app.get("/logout", (req, res) => {
    req.logout(function (err) {
        if (err) {
            return next(err);
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

app.post("/register", async (req, res) => {
    const { username: email, password, name, role, description } = req.body;

    try {
        const checkResult = await db.query("SELECT * FROM users WHERE email = $1", [email]);

        if (checkResult.rows.length > 0) {
            res.redirect("/login");
        } else {
            bcrypt.hash(password, saltRounds, async (err, hash) => {
                if (err) {
                    console.error("Error hashing password:", err);
                } else {
                    const result = await db.query(
                        "INSERT INTO users (email, password, name, role, description) VALUES ($1, $2, $3, $4, $5) RETURNING *",
                        [email, hash, name, role, description]
                    );
                    const user = result.rows[0];
                    req.login(user, (err) => {
                        if (err) {
                            console.error("Error logging in user:", err);
                        } else {
                            res.redirect("/profile");
                        }
                    });
                }
            });
        }
    } catch (err) {
        console.log(err);
    }
});

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
            const result = await db.query("SELECT * FROM users WHERE email = $1 ", [
                username,
            ]);
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
                return cb("User not found");
            }
        } catch (err) {
            console.log(err);
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

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
