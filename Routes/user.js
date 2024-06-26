const express = require("express");
const Pool = require("./Database");
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcrypt");

// bcrypt Password functions
const saltRound = 10;
const hashCompare = async (password, hashedPass) => {
    return await bcrypt.compare(password, hashedPass);
};
const hashPass = async (password) => {
    const salt = await bcrypt.genSalt(saltRound);
    const hashed = await bcrypt.hash(password, salt);
    return hashed;
};

const UserRouter = express.Router();

UserRouter.get("/", async (req, res, next) => {
    let conn;
    try {
        conn = await Pool.getConnection();
        const rows = await conn.query(
            "SELECT users.id AS id, users.name AS name, COUNT(images.name) AS uploads FROM users JOIN images ON users.id = images.artistId GROUP By images.artistId HAVING COUNT(images.id) > 0 ORDER BY name"
        );

        res.send(rows);
    } catch (err) {
        console.error(err);
        next(err);
    } finally {
        if (conn) return conn.end();
    }
});

UserRouter.get("/search", async (req, res, next) => {
    const { q } = req.query;

    if (!q || q.length < 3) {
        res.sendStatus(404);
        return;
    }

    let conn;
    try {
        conn = await Pool.getConnection();
        const rows = await conn.query(
            "SELECT users.id AS id, users.name AS name, COUNT(images.name) AS uploads FROM users LEFT JOIN images ON users.id = images.artistId WHERE users.name LIKE ? OR users.email LIKE ?  GROUP BY users.id, users.name ORDER BY users.name",
            [`%${q}%`, `%${q}%`]
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        next(err);
    } finally {
        if (conn) return conn.end();
    }
});

UserRouter.post("/login", async (req, res, next) => {
    const { name: username, password } = req.body;

    let conn;
    try {
        conn = await Pool.getConnection();
        const rows = await conn.query("SELECT id, name, password, email FROM users WHERE name = ?", [username]);

        if (rows.length < 1) {
            res.sendStatus(401);
            return;
        }
        const activeUser = {
            id: rows[0].id,
            name: rows[0].name,
            email: rows[0].email,
        };

        if (await hashCompare(password, rows[0].password)) {
            res.json(activeUser);
        } else {
            res.sendStatus(401);
        }
    } catch (err) {
        console.error(err);
        next(err);
    } finally {
        if (conn) return conn.end();
    }
});

UserRouter.post("/register", async (req, res, next) => {
    const { name, password, email } = req.body;

    const hashedPassword = await hashPass(password);

    let conn;
    try {
        conn = await Pool.getConnection();
        
        const existUser = await conn.query("SELECT name FROM users WHERE name = ?", [name]);
        if (existUser.length > 0) {
            res.status(409).json({"message": "Error: name already exists"})
            return
        } 

        const rows = await conn.query(
            "INSERT INTO users (id, name, password, email) VALUES (?, ?, ?, ?) RETURNING  id, name, email",
            [uuidv4(), name, hashedPassword, email]
        );
        const activeUser = {
            id: rows[0].id,
            name: rows[0].name,
            email: rows[0].email,
        };
        res.json(activeUser);
    } catch (err) {
        console.error(err);
        next(err);
    } finally {
        if (conn) return conn.end();
    }
});

const deleteServerDirectory = async (userId, url) => {
    const superUrl = new URL(url);
    const serverUrl = superUrl.origin;

    try {
        res = await fetch(`${serverUrl}/delete.php?id=${userId}`, {
            method: "DELETE",
        });
        if (res.ok) {
            const data = await res.json();
            return data.data;
        }
        return false;
    } catch (err) {
        throw new Error(err);
    }
};
UserRouter.delete("/:userId", async (req, res, next) => {
    const { userId } = req.params;

    let conn;
    try {
        conn = await Pool.getConnection();
        await conn.query("DELETE FROM users WHERE id = ?", [userId]);

        const rows = await conn.query("SELECT url from images where artistId = ? LIMIT 1", [userId]);
        if (rows.length < 1) {
            res.sendStatus(200);
            return;
        }
        const { url } = rows[0];
        const deletedDirectory = await deleteServerDirectory(userId, url);
        console.log(deletedDirectory)
        if (deletedDirectory && deletedDirectory.delete) {
            res.json(deletedDirectory);
        } else {
            res.sendStatus(400);
        }
    } catch (err) {
        console.error(err);
        next(err);
    } finally {
        if (conn) return conn.end();
    }
});

UserRouter.patch("/:userId", async (req, res, next) => {
    const { name, password, email } = req.body;
    const { userId } = req.params;

    let conn;
    try {
        conn = await Pool.getConnection();
        if (password && password.length > 0) {
            const hashedPassword = await hashPass(password);
            
            await conn.query("UPDATE users SET name = ?, email = ?, password = ? WHERE id = ?", [
                name,
                email,
                hashedPassword,
                userId,
            ]);
        } else {
            await conn.query("UPDATE users SET name = ?, email = ? WHERE id = ?", [name, email, userId]);
        }

        const rows = await conn.query("SELECT id, name, email FROM users WHERE id = ?", [userId]);

        const activeUser = {
            id: rows[0].id,
            name: rows[0].name,
            email: rows[0].email,
        };
        res.json(activeUser);
    } catch (err) {
        console.error(err);
        next(err);
    } finally {
        if (conn) return conn.end();
    }
});

UserRouter.post("/email", async (req, res, next) => {
    const { name, artistId, email, message } = req.body;
    res.send({
        from: name,
        to: artistId,
        email,
        message,
    });
});

UserRouter.get("/name/:id", async (req, res, next) => {
    const { id } = req.params;

    let conn;
    try {
        conn = await Pool.getConnection();
        const rows = await conn.query("SELECT id, name FROM users WHERE id = ?", [id]);

        if (rows.length > 0) {
            res.send(rows[0]);
        } else {
            res.sendStatus(404);
        }
    } catch (err) {
        console.error(err);
        next(err);
    } finally {
        if (conn) return conn.end();
    }
});

module.exports = UserRouter;
