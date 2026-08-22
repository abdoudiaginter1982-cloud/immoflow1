export default {
  async fetch(request, env) {
    try {
      if (!env.DB) {
        return json({
          error: "Base D1 non connectée.",
          details: "La variable DB n'est pas configurée dans le Worker."
        }, 500);
      }

      await initDatabase(env.DB);

      const url = new URL(request.url);

      if (url.pathname.startsWith("/api/")) {
        return await api(request, env, url);
      }

      return new Response(APP_HTML, {
        headers: {
          "content-type": "text/html;charset=UTF-8",
          "cache-control": "no-store"
        }
      });
    } catch (error) {
      console.error(error);

      return json({
        error: "Erreur serveur",
        details: error?.message || String(error)
      }, 500);
    }
  }
};


/* =========================================================
   DATABASE
========================================================= */

async function initDatabase(db) {

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agency_name TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS owners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS properties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      owner_id INTEGER,
      reference TEXT NOT NULL,
      title TEXT NOT NULL,
      address TEXT,
      city TEXT,
      type TEXT,
      bedrooms INTEGER DEFAULT 0,
      rent INTEGER DEFAULT 0,
      status TEXT DEFAULT 'available',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS tenants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS leases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      property_id INTEGER NOT NULL,
      tenant_id INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT,
      monthly_rent INTEGER NOT NULL,
      deposit INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      lease_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      due_date TEXT NOT NULL,
      paid_date TEXT,
      status TEXT DEFAULT 'pending',
      payment_method TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT DEFAULT 'info',
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      tenant_id INTEGER,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT DEFAULT 'automatic',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}


/* =========================================================
   HELPERS
========================================================= */

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json;charset=UTF-8",
      ...headers
    }
  });
}


async function hashPassword(password) {
  const data = new TextEncoder().encode(password);

  const hash = await crypto.subtle.digest(
    "SHA-256",
    data
  );

  return Array.from(new Uint8Array(hash))
    .map(x => x.toString(16).padStart(2, "0"))
    .join("");
}


function randomToken() {
  return crypto.randomUUID() + crypto.randomUUID();
}


function getCookie(request, name) {
  const cookies = request.headers.get("Cookie") || "";

  for (const part of cookies.split(";")) {
    const [key, ...rest] = part.trim().split("=");

    if (key === name) {
      return rest.join("=");
    }
  }

  return null;
}


async function getUser(request, db) {

  const token = getCookie(
    request,
    "immoflow_session"
  );

  if (!token) {
    return null;
  }

  const session = await db.prepare(`
    SELECT
      users.id,
      users.agency_name,
      users.name,
      users.email
    FROM sessions
    JOIN users
      ON users.id = sessions.user_id
    WHERE sessions.token = ?
      AND datetime(sessions.expires_at) > datetime('now')
  `)
  .bind(token)
  .first();

  return session || null;
}


function today() {
  return new Date().toISOString().slice(0, 10);
}


/* =========================================================
   API
========================================================= */

async function api(request, env, url) {

  const db = env.DB;
  const path = url.pathname;
  const method = request.method;


  /* REGISTER */

  if (path === "/api/register" && method === "POST") {

    let data;

    try {
      data = await request.json();
    } catch {
      return json({
        error: "Données invalides."
      }, 400);
    }

    const agency = String(
      data.agency_name || ""
    ).trim();

    const name = String(
      data.name || ""
    ).trim();

    const email = String(
      data.email || ""
    ).trim().toLowerCase();

    const password = String(
      data.password || ""
    );

    if (!agency || !name || !email || !password) {
      return json({
        error: "Tous les champs sont obligatoires."
      }, 400);
    }

    if (password.length < 6) {
      return json({
        error: "Le mot de passe doit contenir au moins 6 caractères."
      }, 400);
    }

    const existing = await db.prepare(`
      SELECT id
      FROM users
      WHERE email = ?
    `)
    .bind(email)
    .first();

    if (existing) {
      return json({
        error: "Un compte existe déjà avec cet email."
      }, 409);
    }

    const passwordHash =
      await hashPassword(password);

    const result = await db.prepare(`
      INSERT INTO users
      (
        agency_name,
        name,
        email,
        password_hash
      )
      VALUES (?, ?, ?, ?)
    `)
    .bind(
      agency,
      name,
      email,
      passwordHash
    )
    .run();

    const userId =
      result.meta.last_row_id;

    const token =
      randomToken();

    const expires =
      new Date(
        Date.now() +
        7 * 24 * 60 * 60 * 1000
      ).toISOString();

    await db.prepare(`
      INSERT INTO sessions
      (
        user_id,
        token,
        expires_at
      )
      VALUES (?, ?, ?)
    `)
    .bind(
      userId,
      token,
      expires
    )
    .run();

    await createNotification(
      db,
      userId,
      "Bienvenue sur ImmoFlow",
      "Votre compte agence a été créé avec succès.",
      "system"
    );

    return json({
      success: true,
      user: {
        id: userId,
        agency_name: agency,
        name,
        email
      }
    }, 201, {
      "Set-Cookie":
        `immoflow_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`
    });
  }


  /* LOGIN */

  if (path === "/api/login" && method === "POST") {

    let data;

    try {
      data = await request.json();
    } catch {
      return json({
        error: "Données invalides."
      }, 400);
    }

    const email = String(
      data.email || ""
    ).trim().toLowerCase();

    const password = String(
      data.password || ""
    );

    const user = await db.prepare(`
      SELECT *
      FROM users
      WHERE email = ?
    `)
    .bind(email)
    .first();

    if (!user) {
      return json({
        error: "Email ou mot de passe incorrect."
      }, 401);
    }

    const passwordHash =
      await hashPassword(password);

    if (
      passwordHash !==
      user.password_hash
    ) {
      return json({
        error: "Email ou mot de passe incorrect."
      }, 401);
    }

    const token =
      randomToken();

    const expires =
      new Date(
        Date.now() +
        7 * 24 * 60 * 60 * 1000
      ).toISOString();

    await db.prepare(`
      INSERT INTO sessions
      (
        user_id,
        token,
        expires_at
      )
      VALUES (?, ?, ?)
    `)
    .bind(
      user.id,
      token,
      expires
    )
    .run();

    return json({
      success: true,
      user: {
        id: user.id,
        agency_name: user.agency_name,
        name: user.name,
        email: user.email
      }
    }, 200, {
      "Set-Cookie":
        `immoflow_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`
    });
  }


  /* ME */

  if (path === "/api/me") {

    const user =
      await getUser(request, db);

    return json({
      user: user || null
    });
  }


  /* LOGOUT */

  if (
    path === "/api/logout" &&
    method === "POST"
  ) {

    const token =
      getCookie(
        request,
        "immoflow_session"
      );

    if (token) {
      await db.prepare(`
        DELETE FROM sessions
        WHERE token = ?
      `)
      .bind(token)
      .run();
    }

    return json({
      success: true
    }, 200, {
      "Set-Cookie":
        "immoflow_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
    });
  }


  /* AUTHENTICATION */

  const user =
    await getUser(request, db);

  if (!user) {
    return json({
      error: "Vous devez être connecté."
    }, 401);
  }

  const uid = user.id;


  /* DASHBOARD */

  if (path === "/api/dashboard") {

    const properties =
      await db.prepare(`
        SELECT COUNT(*) AS count
        FROM properties
        WHERE user_id = ?
      `)
      .bind(uid)
      .first();

    const tenants =
      await db.prepare(`
        SELECT COUNT(*) AS count
        FROM tenants
        WHERE user_id = ?
      `)
      .bind(uid)
      .first();

    const occupied =
      await db.prepare(`
        SELECT COUNT(*) AS count
        FROM properties
        WHERE user_id = ?
        AND status = 'occupied'
      `)
      .bind(uid)
      .first();

    const late =
      await db.prepare(`
        SELECT COALESCE(
          SUM(amount),
          0
        ) AS total
        FROM payments
        WHERE user_id = ?
        AND status = 'late'
      `)
      .bind(uid)
      .first();

    const unread =
      await db.prepare(`
        SELECT COUNT(*) AS count
        FROM notifications
        WHERE user_id = ?
        AND is_read = 0
      `)
      .bind(uid)
      .first();

    return json({
      properties:
        Number(properties?.count || 0),

      tenants:
        Number(tenants?.count || 0),

      occupied:
        Number(occupied?.count || 0),

      late:
        Number(late?.total || 0),

      unread:
        Number(unread?.count || 0)
    });
  }


  /* OWNERS */

  if (path === "/api/owners") {

    if (method === "GET") {

      const result =
        await db.prepare(`
          SELECT *
          FROM owners
          WHERE user_id = ?
          ORDER BY id DESC
        `)
        .bind(uid)
        .all();

      return json(
        result.results || []
      );
    }

    if (method === "POST") {

      const data =
        await request.json();

      if (
        !String(data.name || "").trim()
      ) {
        return json({
          error: "Le nom est obligatoire."
        }, 400);
      }

      const result =
        await db.prepare(`
          INSERT INTO owners
          (
            user_id,
            name,
            phone,
            email,
            address
          )
          VALUES (?, ?, ?, ?, ?)
        `)
        .bind(
          uid,
          String(data.name).trim(),
          String(data.phone || ""),
          String(data.email || ""),
          String(data.address || "")
        )
        .run();

      return json({
        success: true,
        id: result.meta.last_row_id
      }, 201);
    }
  }


  /* PROPERTIES */

  if (path === "/api/properties") {

    if (method === "GET") {

      const result =
        await db.prepare(`
          SELECT
            properties.*,
            owners.name AS owner_name
          FROM properties
          LEFT JOIN owners
            ON owners.id = properties.owner_id
            AND owners.user_id = properties.user_id
          WHERE properties.user_id = ?
          ORDER BY properties.id DESC
        `)
        .bind(uid)
        .all();

      return json(
        result.results || []
      );
    }

    if (method === "POST") {

      const data =
        await request.json();

      if (
        !String(data.reference || "").trim() ||
        !String(data.title || "").trim()
      ) {
        return json({
          error: "Référence et nom du bien obligatoires."
        }, 400);
      }

      const result =
        await db.prepare(`
          INSERT INTO properties
          (
            user_id,
            owner_id,
            reference,
            title,
            address,
            city,
            type,
            bedrooms,
            rent,
            status
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'available')
        `)
        .bind(
          uid,
          data.owner_id
            ? Number(data.owner_id)
            : null,
          String(data.reference).trim(),
          String(data.title).trim(),
          String(data.address || ""),
          String(data.city || ""),
          String(data.type || "Appartement"),
          Number(data.bedrooms || 0),
          Number(data.rent || 0)
        )
        .run();

      await createNotification(
        db,
        uid,
        "Nouveau bien",
        `${String(data.title).trim()} a été ajouté à votre portefeuille.`,
        "property"
      );

      return json({
        success: true,
        id: result.meta.last_row_id
      }, 201);
    }
  }


  /* TENANTS */

  if (path === "/api/tenants") {

    if (method === "GET") {

      const result =
        await db.prepare(`
          SELECT *
          FROM tenants
          WHERE user_id = ?
          ORDER BY id DESC
        `)
        .bind(uid)
        .all();

      return json(
        result.results || []
      );
    }

    if (method === "POST") {

      const data =
        await request.json();

      if (
        !String(data.first_name || "").trim() ||
        !String(data.last_name || "").trim()
      ) {
        return json({
          error: "Prénom et nom obligatoires."
        }, 400);
      }

      const result =
        await db.prepare(`
          INSERT INTO tenants
          (
            user_id,
            first_name,
            last_name,
            phone,
            email,
            address
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `)
        .bind(
          uid,
          String(data.first_name).trim(),
          String(data.last_name).trim(),
          String(data.phone || ""),
          String(data.email || ""),
          String(data.address || "")
        )
        .run();

      await createNotification(
        db,
        uid,
        "Nouveau locataire",
        `${String(data.first_name).trim()} ${String(data.last_name).trim()} a été ajouté.`,
        "tenant"
      );

      return json({
        success: true,
        id: result.meta.last_row_id
      }, 201);
    }
  }
