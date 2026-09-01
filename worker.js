```javascript
export default {
  async fetch(request, env) {
    try {
      if (!env.DB) {
        return json({ error: "La base D1 DB n'est pas configurée." }, 500);
      }

      await initDatabase(env.DB);

      const url = new URL(request.url);

      if (url.pathname.startsWith("/api/")) {
        return await api(request, env, url);
      }

      return new Response(APP_HTML, {
        headers: {
          "content-type": "text/html;charset=UTF-8"
        }
      });
    } catch (error) {
      console.error(error);

      return json({
        error: "Erreur serveur",
        details: error?.message || "Erreur inconnue"
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
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      address TEXT DEFAULT '',
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
      address TEXT DEFAULT '',
      city TEXT DEFAULT '',
      type TEXT DEFAULT 'Appartement',
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
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      address TEXT DEFAULT '',
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
      payment_method TEXT DEFAULT '',
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


function safeText(value) {
  return String(value ?? "").trim();
}


async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new Error("JSON invalide.");
  }
}


async function hashPassword(password) {
  const data = new TextEncoder().encode(password);

  const hash = await crypto.subtle.digest(
    "SHA-256",
    data
  );

  return [...new Uint8Array(hash)]
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


function cookie(token, maxAge) {
  return `immoflow_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}


function clearCookie() {
  return "immoflow_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
}


/* =========================================================
   API
========================================================= */

async function api(request, env, url) {

  const db = env.DB;
  const path = url.pathname;
  const method = request.method;


  /* -------------------------------------------------------
     REGISTER
  ------------------------------------------------------- */

  if (path === "/api/register" && method === "POST") {

    const data = await readJson(request);

    const agency = safeText(data.agency_name);
    const name = safeText(data.name);
    const email = safeText(data.email).toLowerCase();
    const password = String(data.password || "");

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

    const passwordHash = await hashPassword(password);

    const result = await db.prepare(`
      INSERT INTO users (
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

    const userId = result.meta.last_row_id;

    const token = randomToken();

    const expires = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    await db.prepare(`
      INSERT INTO sessions (
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
      "Bienvenue sur Immoflow",
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
      "Set-Cookie": cookie(token, 604800)
    });
  }


  /* -------------------------------------------------------
     LOGIN
  ------------------------------------------------------- */

  if (path === "/api/login" && method === "POST") {

    const data = await readJson(request);

    const email = safeText(data.email).toLowerCase();
    const password = String(data.password || "");

    if (!email || !password) {
      return json({
        error: "Email et mot de passe obligatoires."
      }, 400);
    }

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

    const passwordHash = await hashPassword(password);

    if (passwordHash !== user.password_hash) {
      return json({
        error: "Email ou mot de passe incorrect."
      }, 401);
    }

    const token = randomToken();

    const expires = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    await db.prepare(`
      INSERT INTO sessions (
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
      "Set-Cookie": cookie(token, 604800)
    });
  }


  /* -------------------------------------------------------
     ME
  ------------------------------------------------------- */

  if (path === "/api/me" && method === "GET") {

    const user = await getUser(request, db);

    return json({
      user: user || null
    });
  }


  /* -------------------------------------------------------
     LOGOUT
  ------------------------------------------------------- */

  if (path === "/api/logout" && method === "POST") {

    const token = getCookie(
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
      "Set-Cookie": clearCookie()
    });
  }


  /* -------------------------------------------------------
     AUTHENTIFICATION
  ------------------------------------------------------- */

  const user = await getUser(request, db);

  if (!user) {
    return json({
      error: "Vous devez être connecté."
    }, 401);
  }

  const uid = user.id;


  /* -------------------------------------------------------
     DASHBOARD
  ------------------------------------------------------- */

  if (path === "/api/dashboard" && method === "GET") {

    const properties = await db.prepare(`
      SELECT COUNT(*) AS count
      FROM properties
      WHERE user_id = ?
    `)
      .bind(uid)
      .first();

    const tenants = await db.prepare(`
      SELECT COUNT(*) AS count
      FROM tenants
      WHERE user_id = ?
    `)
      .bind(uid)
      .first();

    const occupied = await db.prepare(`
      SELECT COUNT(*) AS count
      FROM properties
      WHERE user_id = ?
      AND status = 'occupied'
    `)
      .bind(uid)
      .first();

    const late = await db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM payments
      WHERE user_id = ?
      AND status = 'late'
    `)
      .bind(uid)
      .first();

    const unread = await db.prepare(`
      SELECT COUNT(*) AS count
      FROM notifications
      WHERE user_id = ?
      AND is_read = 0
    `)
      .bind(uid)
      .first();

    return json({
      properties: Number(properties?.count || 0),
      tenants: Number(tenants?.count || 0),
      occupied: Number(occupied?.count || 0),
      late: Number(late?.total || 0),
      unread: Number(unread?.count || 0)
    });
  }


  /* -------------------------------------------------------
     OWNERS
  ------------------------------------------------------- */

  if (path === "/api/owners") {

    if (method === "GET") {

      const result = await db.prepare(`
        SELECT *
        FROM owners
        WHERE user_id = ?
        ORDER BY id DESC
      `)
        .bind(uid)
        .all();

      return json(result.results || []);
    }

    if (method === "POST") {

      const data = await readJson(request);

      const name = safeText(data.name);

      if (!name) {
        return json({
          error: "Le nom est obligatoire."
        }, 400);
      }

      const result = await db.prepare(`
        INSERT INTO owners (
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
          name,
          safeText(data.phone),
          safeText(data.email),
          safeText(data.address)
        )
        .run();

      return json({
        success: true,
        id: result.meta.last_row_id
      }, 201);
    }
  }


  /* -------------------------------------------------------
     PROPERTIES
  ------------------------------------------------------- */

  if (path === "/api/properties") {

    if (method === "GET") {

      const result = await db.prepare(`
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

      return json(result.results || []);
    }

    if (method === "POST") {

      const data = await readJson(request);

      const reference = safeText(data.reference);
      const title = safeText(data.title);

      if (!reference || !title) {
        return json({
          error: "Référence et nom du bien obligatoires."
        }, 400);
      }

      let ownerId = null;

      if (data.owner_id) {

        const owner = await db.prepare(`
          SELECT id
          FROM owners
          WHERE id = ?
          AND user_id = ?
        `)
          .bind(
            Number(data.owner_id),
            uid
          )
          .first();

        if (!owner) {
          return json({
            error: "Propriétaire invalide."
          }, 400);
        }

        ownerId = Number(data.owner_id);
      }

      const result = await db.prepare(`
        INSERT INTO properties (
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
          ownerId,
          reference,
          title,
          safeText(data.address),
          safeText(data.city),
          safeText(data.type) || "Appartement",
          Number(data.bedrooms || 0),
          Number(data.rent || 0)
        )
        .run();

      await createNotification(
        db,
        uid,
        "Nouveau bien",
        `${title} a été ajouté à votre portefeuille.`,
        "property"
      );

      return json({
        success: true,
        id: result.meta.last_row_id
      }, 201);
    }
  }


  /* -------------------------------------------------------
     TENANTS
  ------------------------------------------------------- */

  if (path === "/api/tenants") {

    if (method === "GET") {

      const result = await db.prepare(`
        SELECT *
        FROM tenants
        WHERE user_id = ?
        ORDER BY id DESC
      `)
        .bind(uid)
        .all();

      return json(result.results || []);
    }

    if (method === "POST") {

      const data = await readJson(request);

      const firstName = safeText(data.first_name);
      const lastName = safeText(data.last_name);

      if (!firstName || !lastName) {
        return json({
          error: "Prénom et nom obligatoires."
        }, 400);
      }

      const result = await db.prepare(`
        INSERT INTO tenants (
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
          firstName,
          lastName,
          safeText(data.phone),
          safeText(data.email),
          safeText(data.address)
        )
        .run();

      await createNotification(
        db,
        uid,
        "Nouveau locataire",
        `${firstName} ${lastName} a été ajouté.`,
        "tenant"
      );

      return json({
        success: true,
        id: result.meta.last_row_id
      }, 201);
    }
  }


  /* -------------------------------------------------------
     LEASES
  ------------------------------------------------------- */

  if (path === "/api/leases") {

    if (method === "GET") {

      const result = await db.prepare(`
        SELECT
          leases.*,
          properties.reference,
          properties.title AS property_title,
          tenants.first_name,
          tenants.last_name
        FROM leases
        JOIN properties
          ON properties.id = leases.property_id
          AND properties.user_id = leases.user_id
        JOIN tenants
          ON tenants.id = leases.tenant_id
          AND tenants.user_id = leases.user_id
        WHERE leases.user_id = ?
        ORDER BY leases.id DESC
      `)
        .bind(uid)
        .all();

      return json(result.results || []);
    }

    if (method === "POST") {

      const data = await readJson(request);

      const propertyId = Number(data.property_id);
      const tenantId = Number(data.tenant_id);
      const startDate = safeText(data.start_date);
      const monthlyRent = Number(data.monthly_rent);

      if (
        !propertyId ||
        !tenantId ||
        !startDate ||
        !monthlyRent ||
        monthlyRent <= 0
      ) {
        return json({
          error: "Informations du bail incomplètes."
        }, 400);
      }

      const property = await db.prepare(`
        SELECT id, status
        FROM properties
        WHERE id = ?
        AND user_id = ?
      `)
        .bind(
          propertyId,
          uid
        )
        .first();

      const tenant = await db.prepare(`
        SELECT id
        FROM tenants
        WHERE id = ?
        AND user_id = ?
      `)
        .bind(
          tenantId,
          uid
        )
        .first();

      if (!property || !tenant) {
        return json({
          error: "Bien ou locataire invalide."
        }, 400);
      }

      if (property.status === "occupied") {
        return json({
          error: "Ce bien est déjà occupé."
        }, 409);
      }

      const result = await db.prepare(`
        INSERT INTO leases (
          user_id,
          property_id,
          tenant_id,
          start_date,
          end_date,
          monthly_rent,
          deposit,
          status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
      `)
        .bind(
          uid,
          propertyId,
          tenantId,
          startDate,
          safeText(data.end_date) || null,
          monthlyRent,
          Number(data.deposit || 0)
        )
        .run();

      await db.prepare(`
        UPDATE properties
        SET status = 'occupied'
        WHERE id = ?
        AND user_id = ?
      `)
        .bind(
          propertyId,
          uid
        )
        .run();

      await createNotification(
        db,
        uid,
        "Nouveau bail",
        "Un nouveau bail a été créé.",
        "lease"
      );

      return json({
        success: true,
        id: result.meta.last_row_id
      }, 201);
    }
  }


  /* -------------------------------------------------------
     PAYMENTS
  ------------------------------------------------------- */

  if (path === "/api/payments") {

    if (method === "GET") {

      await updateLatePayments(db, uid);

      const result = await db.prepare(`
        SELECT
          payments.*,
          tenants.first_name,
          tenants.last_name,
          properties.reference,
          properties.title AS property_title
        FROM payments
        JOIN leases
          ON leases.id = payments.lease_id
          AND leases.user_id = payments.user_id
        JOIN tenants
          ON tenants.id = leases.tenant_id
          AND tenants.user_id = payments.user_id
        JOIN properties
          ON properties.id = leases.property_id
          AND properties.user_id = payments.user_id
        WHERE payments.user_id = ?
        ORDER BY payments.due_date DESC
      `)
        .bind(uid)
        .all();

      return json(result.results || []);
    }

    if (method === "POST") {

      const data = await readJson(request);

      const leaseId = Number(data.lease_id);
      const amount = Number(data.amount);
      const dueDate = safeText(data.due_date);

      if (
        !leaseId ||
        !amount ||
        amount <= 0 ||
        !dueDate
      ) {
        return json({
          error: "Informations du loyer incomplètes."
        }, 400);
      }

      const lease = await db.prepare(`
        SELECT id
        FROM leases
        WHERE id = ?
        AND user_id = ?
        AND status = 'active'
      `)
        .bind(
          leaseId,
          uid
        )
        .first();

      if (!lease) {
        return json({
          error: "Bail actif introuvable."
        }, 404);
      }

      const result = await db.prepare(`
        INSERT INTO payments (
          user_id,
          lease_id,
          amount,
          due_date,
          status,
          payment_method
        )
        VALUES (?, ?, ?, ?, 'pending', ?)
      `)
        .bind(
          uid,
          leaseId,
          amount,
          dueDate,
          safeText(data.payment_method)
        )
        .run();

      return json({
        success: true,
        id: result.meta.last_row_id
      }, 201);
    }
  }


  /* -------------------------------------------------------
     PAYMENT PAID
  ------------------------------------------------------- */

  const paidMatch = path.match(
    /^\/api\/payments\/(\d+)\/paid$/
  );

  if (paidMatch && method === "POST") {

    const paymentId = Number(paidMatch[1]);

    const payment = await db.prepare(`
      SELECT id
      FROM payments
      WHERE id = ?
      AND user_id = ?
    `)
      .bind(
        paymentId,
        uid
      )
      .first();

    if (!payment) {
      return json({
        error: "Paiement introuvable."
      }, 404);
    }

    await db.prepare(`
      UPDATE payments
      SET
        status = 'paid',
        paid_date = ?
      WHERE id = ?
      AND user_id = ?
    `)
      .bind(
        today(),
        paymentId,
        uid
      )
      .run();

    await createNotification(
      db,
      uid,
      "Paiement enregistré",
      "Le paiement du loyer a été enregistré.",
      "payment"
    );

    return json({
      success: true
    });
  }


  /* -------------------------------------------------------
     NOTIFICATIONS
  ------------------------------------------------------- */

  if (path === "/api/notifications") {

    await updateLatePayments(db, uid);

    const result = await db.prepare(`
      SELECT *
      FROM notifications
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT 100
    `)
      .bind(uid)
      .all();

    return json(result.results || []);
  }


  const notificationMatch = path.match(
    /^\/api\/notifications\/(\d+)\/read$/
  );

  if (notificationMatch && method === "POST") {

    await db.prepare(`
      UPDATE notifications
      SET is_read = 1
      WHERE id = ?
      AND user_id = ?
    `)
      .bind(
        Number(notificationMatch[1]),
        uid
      )
      .run();

    return json({
      success: true
    });
  }


  if (
    path === "/api/notifications/read-all" &&
    method === "POST"
  ) {

    await db.prepare(`
      UPDATE notifications
      SET is_read = 1
      WHERE user_id = ?
    `)
      .bind(uid)
      .run();

    return json({
      success: true
    });
  }


  /* -------------------------------------------------------
     MESSAGES
  ------------------------------------------------------- */

  if (path === "/api/messages" && method === "GET") {

    const result = await db.prepare(`
      SELECT
        messages.*,
        tenants.first_name,
        tenants.last_name
      FROM messages
      LEFT JOIN tenants
        ON tenants.id = messages.tenant_id
        AND tenants.user_id = messages.user_id
      WHERE messages.user_id = ?
      ORDER BY messages.id DESC
      LIMIT 100
    `)
      .bind(uid)
      .all();

    return json(result.results || []);
  }


  return json({
    error: "Route inconnue."
  }, 404);
}


/* =========================================================
   LATE PAYMENTS
========================================================= */

async function updateLatePayments(db, userId) {

  const date = today();

  const late = await db.prepare(`
    SELECT
      payments.id,
      payments.lease_id,
      tenants.id AS tenant_id,
      tenants.first_name,
      tenants.last_name,
      properties.reference
    FROM payments
    JOIN leases
      ON leases.id = payments.lease_id
      AND leases.user_id = payments.user_id
    JOIN tenants
      ON tenants.id = leases.tenant_id
      AND tenants.user_id = payments.user_id
    JOIN properties
      ON properties.id = leases.property_id
      AND properties.user_id = payments.user_id
    WHERE payments.user_id = ?
      AND payments.status = 'pending'
      AND payments.due_date < ?
  `)
    .bind(
      userId,
      date
    )
    .all();

  for (const payment of late.results || []) {

    await db.prepare(`
      UPDATE payments
      SET status = 'late'
      WHERE id = ?
      AND user_id = ?
      AND status = 'pending'
    `)
      .bind(
        payment.id,
        userId
      )
      .run();

    const existing = await db.prepare(`
      SELECT id
      FROM notifications
      WHERE user_id = ?
      AND type = 'late'
      AND message LIKE ?
    `)
      .bind(
        userId,
        `%paiement ${payment.id}%`
      )
      .first();

    if (!existing) {

      await createNotification(
        db,
        userId,
        "Loyer en retard",
        `Le loyer de ${payment.first_name} ${payment.last_name} pour ${payment.reference} est en retard. Référence paiement ${payment.id}.`,
        "late"
      );

      await db.prepare(`
        INSERT INTO messages (
          user_id,
          tenant_id,
          title,
          message,
          type
        )
        VALUES (?, ?, ?, ?, 'automatic')
      `)
        .bind(
          userId,
          payment.tenant_id,
          "Rappel de loyer",
          `Le paiement ${payment.id} concernant ${payment.reference} est en retard.`
        )
        .run();
    }
  }
}


/* =========================================================
   CREATE NOTIFICATION
========================================================= */

async function createNotification(
  db,
  userId,
  title,
  message,
  type = "info"
) {

  await db.prepare(`
    INSERT INTO notifications (
      user_id,
      title,
      message,
      type
    )
    VALUES (?, ?, ?, ?)
  `)
    .bind(
      userId,
      title,
      message,
      type
    )
    .run();
}


/* =========================================================
   FRONTEND
========================================================= */

const APP_HTML = `<!doctype html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Immoflow — Gestion immobilière</title>

<script src="https://cdn.tailwindcss.com"></script>

<script crossorigin src="https://unpkg.com/react@18.3.1/umd/react.development.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js"></script>
<script src="https://unpkg.com/lucide-react@0.468.0/dist/umd/lucide-react.js"></script>
<script src="https://unpkg.com/@babel/standalone@7.26.0/babel.min.js"></script>

<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Roboto+Slab:wght@500;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap" rel="stylesheet">

<style>
html{
  scroll-behavior:smooth;
}

body{
  margin:0;
  background:#F2F4F3;
}

button,
input,
select{
  outline:none;
}

button:disabled{
  cursor:not-allowed;
}

::-webkit-scrollbar{
  width:8px;
  height:8px;
}

::-webkit-scrollbar-thumb{
  background:#cfcac4;
  border-radius:10px;
}
</style>
</head>

<body>

<div id="root"></div>

<script type="text/babel" data-presets="react">

const { useState, useEffect, useMemo } = React;

const lucide =
  window.lucideReact ||
  window.LucideReact ||
  {};


/* =========================================================
   FALLBACK ICON
========================================================= */

const fallbackIcon = ({
  size = 18,
  ...props
}) =>
  React.createElement(
    "svg",
    {
      width:size,
      height:size,
      viewBox:"0 0 24 24",
      fill:"none",
      stroke:"currentColor",
      strokeWidth:"2",
      strokeLinecap:"round",
      strokeLinejoin:"round",
      ...props
    },
    React.createElement("circle", {
      cx:"12",
      cy:"12",
      r:"8"
    }),
    React.createElement("path", {
      d:"M12 8v8"
    }),
    React.createElement("path", {
      d:"M8 12h8"
    })
  );


const Plus = lucide.Plus || fallbackIcon;
const X = lucide.X || fallbackIcon;
const Phone = lucide.Phone || fallbackIcon;
const MapPin = lucide.MapPin || fallbackIcon;
const AlertCircle = lucide.AlertCircle || fallbackIcon;
const CheckCircle2 = lucide.CheckCircle2 || fallbackIcon;
const TrendingUp = lucide.TrendingUp || fallbackIcon;
const Home = lucide.Home || fallbackIcon;
const Users = lucide.Users || fallbackIcon;
const LogOut = lucide.LogOut || fallbackIcon;
const ArrowRight = lucide.ArrowRight || fallbackIcon;
const Check = lucide.Check || fallbackIcon;
const Menu = lucide.Menu || fallbackIcon;
const Building2 = lucide.Building2 || fallbackIcon;
const UserRound = lucide.UserRound || fallbackIcon;
const FileText = lucide.FileText || fallbackIcon;
const Wallet = lucide.Wallet || fallbackIcon;
const Bell = lucide.Bell || fallbackIcon;
const MessageCircle = lucide.MessageCircle || fallbackIcon;

const NAVY = "#14213D";
const GOLD = "#C9A227";
const GREEN = "#2F6D4F";
const RUST = "#B5432B";

const MONTHS = [
  "Jan","Fév","Mar","Avr","Mai","Juin",
  "Juil","Août","Sep","Oct","Nov","Déc"
];

const CURRENT_MONTH = 7;


/* =========================================================
   API FRONTEND
========================================================= */

async function api(path, options = {}) {

  const response = await fetch(path, {
    credentials:"same-origin",
    ...options,
    headers:{
      ...(options.body
        ? {"content-type":"application/json"}
        : {}),
      ...(options.headers || {})
    }
  });

  let data = {};

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(
      data.error ||
      "Une erreur est survenue."
    );
  }

  return data;
}


function formatFCFA(value) {
  return Number(value || 0)
    .toLocaleString("fr-FR") +
    " FCFA";
}


function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}


/* =========================================================
   LANDING PAGE
========================================================= */

function Landing({
  onLogin,
  onSignup,
  onSelectPlan
}) {

  const [menuOpen,setMenuOpen] =
    useState(false);

  const plans = [
    {
      id:"starter",
      name:"Starter",
      price:"5 000 FCFA/mois",
      desc:"Pour démarrer",
      features:[
        "Jusqu'à 3 biens",
        "Suivi des paiements",
        "1 utilisateur"
      ],
      cta:"Commencer",
      waveLink:
        "https://pay.wave.com/m/M_sn_47KnWYA3OS8c/c/sn/?amount=5000"
    },
    {
      id:"pro",
      name:"Pro",
      price:"10 000 FCFA/mois",
      desc:"Pour les bailleurs actifs",
      features:[
        "Jusqu'à 10 biens",
        "Rappels automatiques",
        "3 utilisateurs"
      ],
      cta:"Choisir Pro",
      highlight:true,
      waveLink:
        "https://pay.wave.com/m/M_sn_47KnWYA3OS8c/c/sn/?amount=10000"
    },
    {
      id:"agence",
      name:"Agence",
      price:"25 000 FCFA/mois",
      desc:"Pour les agences immobilières",
      features:[
        "Biens illimités (10+)",
        "Vue par propriétaire",
        "Utilisateurs illimités"
      ],
      cta:"Choisir Agence",
      waveLink:
        "https://pay.wave.com/m/M_sn_47KnWYA3OS8c/c/sn/?amount=25000"
    }
  ];

  return (
    <div
      style={{
        fontFamily:"Inter,sans-serif",
        color:NAVY
      }}
    >

      <nav className="sticky top-0 z-40 bg-white border-b border-stone-200">

        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">

          <div className="flex items-center gap-2.5">

            <div
              className="font-bold text-2xl"
              style={{
                fontFamily:"Roboto Slab,serif",
                color:NAVY
              }}
            >
              Immo<span style={{color:GOLD}}>flow</span>
            </div>

          </div>

          <div className="hidden md:flex items-center gap-8 text-sm font-medium">

            <a
              href="#fonctionnalites"
              className="hover:opacity-70"
            >
              Fonctionnalités
            </a>

            <a
              href="#tarifs"
              className="hover:opacity-70"
            >
              Tarifs
            </a>

          </div>

          <div className="hidden md:flex items-center gap-3">

            <button
              onClick={onLogin}
              className="text-sm font-medium px-3 py-2"
            >
              Connexion
            </button>

            <button
              onClick={onSignup}
              className="text-sm font-medium px-4 py-2 rounded text-white"
              style={{backgroundColor:NAVY}}
            >
              Essayer gratuitement
            </button>

          </div>

          <button
            className="md:hidden"
            onClick={() => setMenuOpen(v => !v)}
          >
            <Menu size={22}/>
          </button>

        </div>

        {menuOpen && (
          <div className="md:hidden border-t border-stone-200 px-6 py-3 flex flex-col gap-3">

            <button
              onClick={onLogin}
              className="text-sm font-medium text-left"
            >
              Connexion
            </button>

            <button
              onClick={onSignup}
              className="text-sm font-medium text-left px-4 py-2 rounded text-white w-fit"
              style={{backgroundColor:NAVY}}
            >
              Essayer gratuitement
            </button>

          </div>
        )}

      </nav>


      <header
        style={{backgroundColor:NAVY}}
        className="text-white"
      >

        <div className="max-w-6xl mx-auto px-6 py-20 text-center">

          <span
            className="inline-block px-3 py-1 rounded-full text-xs font-medium mb-5"
            style={{
              backgroundColor:"rgba(201,162,39,0.15)",
              color:GOLD,
              border:"1px solid "+GOLD
            }}
          >
            Pensé pour les agences et bailleurs au Sénégal
          </span>

          <h1
            className="text-3xl sm:text-5xl font-bold mb-5 leading-tight max-w-3xl mx-auto"
            style={{
              fontFamily:"Roboto Slab,serif"
            }}
          >
            Le suivi de vos loyers,
            sans carnet ni tableur
          </h1>

          <p className="text-stone-300 max-w-xl mx-auto mb-8 text-base sm:text-lg">
            Centralisez vos biens, suivez chaque loyer payé ou en retard,
            et gagnez du temps — que vous gériez 2 appartements ou tout
            un portefeuille.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">

            <button
              onClick={onSignup}
              className="px-6 py-3 rounded font-medium flex items-center justify-center gap-2"
              style={{
                backgroundColor:GOLD,
                color:NAVY
              }}
            >
              Créer mon compte gratuit
              <ArrowRight size={16}/>
            </button>

            <button
              onClick={onLogin}
              className="px-6 py-3 rounded font-medium border border-stone-500 text-white"
            >
              J'ai déjà un compte
            </button>

          </div>

        </div>

      </header>


      <section
        id="fonctionnalites"
        className="max-w-6xl mx-auto px-6 py-16"
      >

        <h2
          className="text-2xl font-bold text-center mb-10"
          style={{
            fontFamily:"Roboto Slab,serif"
          }}
        >
          Tout ce qu'il faut, rien de superflu
        </h2>

        <div className="grid sm:grid-cols-3 gap-6">

          {[
            {
              icon:Home,
              title:"Registre des biens",
              desc:"Centralisez tous vos biens et unités, quel que soit le nombre de propriétés que vous gérez."
            },
            {
              icon:Users,
              title:"Suivi des locataires",
              desc:"Coordonnées, loyer, jour d'échéance — tout au même endroit, par bien ou vue d'ensemble."
            },
            {
              icon:TrendingUp,
              title:"Statut des paiements",
              desc:"Un coup d'œil suffit pour voir qui a payé ce mois-ci et qui est en retard."
            }
          ].map((f,i) => {

            const Icon = f.icon;

            return (
              <div
                key={i}
                className="p-5 rounded-lg border border-stone-200 bg-white"
              >

                <div
                  className="w-10 h-10 rounded flex items-center justify-center mb-3"
                  style={{backgroundColor:"#F2F4F3"}}
                >
                  <Icon size={20} color={NAVY}/>
                </div>

                <h3 className="font-semibold mb-1.5">
                  {f.title}
                </h3>

                <p className="text-sm text-stone-500">
                  {f.desc}
                </p>

              </div>
            );
          })}

        </div>

      </section>


      <section
        id="tarifs"
        style={{backgroundColor:"#F2F4F3"}}
        className="py-16"
      >

        <div className="max-w-5xl mx-auto px-6">

          <h2
            className="text-2xl font-bold text-center mb-10"
            style={{
              fontFamily:"Roboto Slab,serif"
            }}
          >
            Tarifs simples, sans surprise
          </h2>

          <div className="grid sm:grid-cols-3 gap-6">

            {plans.map((plan,i) => (

              <div
                key={i}
                className="rounded-lg p-6 bg-white flex flex-col"
                style={
                  plan.highlight
                    ? {
                        border:"2px solid "+GOLD
                      }
                    : {
                        border:"1px solid #e7e5e4"
                      }
                }
              >

                {plan.highlight && (
                  <span
                    className="text-xs font-semibold mb-2 w-fit px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor:GOLD,
                      color:NAVY
                    }}
                  >
                    Populaire
                  </span>
                )}

                <h3
                  className="font-semibold text-lg"
                  style={{
                    fontFamily:"Roboto Slab,serif"
                  }}
                >
                  {plan.name}
                </h3>

                <div
                  className="text-xl font-bold my-2"
                  style={{
                    fontFamily:"IBM Plex Mono,monospace"
                  }}
                >
                  {plan.price}
                </div>

                <p className="text-sm text-stone-500 mb-4">
                  {plan.desc}
                </p>

                <ul className="space-y-2 mb-6 flex-1">

                  {plan.features.map((f,j) => (

                    <li
                      key={j}
                      className="flex items-center gap-2 text-sm text-stone-600"
                    >
                      <Check size={14} color={GREEN}/>
                      {f}
                    </li>

                  ))}

                </ul>

                <button
                  onClick={() => onSelectPlan(plan)}
                  className="w-full py-2 rounded font-medium text-sm"
                  style={
                    plan.highlight
                      ? {
                          backgroundColor:NAVY,
                          color:"white"
                        }
                      : {
                          border:"1px solid "+NAVY,
                          color:NAVY
                        }
                  }
                >
                  {plan.cta}
                </button>

              </div>

            ))}

          </div>

        </div>

      </section>


      <footer
        style={{backgroundColor:NAVY}}
        className="text-stone-400 text-sm py-8 text-center"
      >
        © 2026 Immoflow — gestion immobilière simplifiée.
      </footer>

    </div>
  );
}


/* =========================================================
   AUTH
========================================================= */

function AuthPage({
  mode,
  onSuccess,
  onSwitch,
  onBack
}) {

  const [agency,setAgency] = useState("");
  const [name,setName] = useState("");
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState("");

  async function submit() {

    setError("");
    setLoading(true);

    try {

      const endpoint =
        mode === "login"
          ? "/api/login"
          : "/api/register";

      const body =
        mode === "login"
          ? {
              email,
              password
            }
          : {
              agency_name:agency,
              name,
              email,
              password
            };

      const data = await api(
        endpoint,
        {
          method:"POST",
          body:JSON.stringify(body)
        }
      );

      onSuccess(data.user);

    } catch (err) {

      setError(
        err.message ||
        "Une erreur est survenue."
      );

    } finally {
      setLoading(false);
    }
  }


  return (

    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        backgroundColor:"#F2F4F3",
        fontFamily:"Inter,sans-serif"
      }}
    >

      <div className="bg-white rounded-lg shadow-sm border border-stone-200 p-8 w-full max-w-sm">

        <button
          onClick={onBack}
          className="text-xs text-stone-400 mb-4"
        >
          ← Retour au site
        </button>

        <div className="mb-6">

          <div
            className="font-bold text-2xl"
            style={{
              fontFamily:"Roboto Slab,serif"
            }}
          >
            Immo<span style={{color:GOLD}}>flow</span>
          </div>

        </div>

        <h2
          className="font-semibold text-lg mb-1"
        >
          {mode === "login"
            ? "Connexion"
            : "Créer un compte"}
        </h2>

        <p className="text-sm text-stone-500 mb-5">

          {mode === "login"
            ? "Accédez à votre espace de gestion."
            : "Démarrez gratuitement, sans carte bancaire."}

        </p>


        {error && (
          <div
            className="mb-4 rounded border p-3 text-sm"
            style={{
              borderColor:"#f0b4aa",
              backgroundColor:"#fff5f3",
              color:RUST
            }}
          >
            {error}
          </div>
        )}


        <div className="space-y-3">

          {mode === "signup" && (
            <>
              <input
                className="w-full border border-stone-300 rounded px-3 py-2 text-sm"
                placeholder="Nom de l'agence"
                value={agency}
                onChange={e => setAgency(e.target.value)}
              />

              <input
                className="w-full border border-stone-300 rounded px-3 py-2 text-sm"
                placeholder="Votre nom"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </>
          )}

          <input
            type="email"
            className="w-full border border-stone-300 rounded px-3 py-2 text-sm"
            placeholder="Adresse e-mail"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />

          <input
            type="password"
            className="w-full border border-stone-300 rounded px-3 py-2 text-sm"
            placeholder="Mot de passe"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") submit();
            }}
          />

        </div>


        <button
          onClick={submit}
          disabled={loading}
          className="w-full mt-5 py-2.5 rounded font-medium text-white text-sm disabled:opacity-60"
          style={{backgroundColor:NAVY}}
        >
          {loading
            ? "Chargement..."
            : mode === "login"
              ? "Se connecter"
              : "Créer mon compte"}
        </button>


        <p className="text-xs text-stone-400 text-center mt-4">

          {mode === "login" ? (
            <>
              Pas encore de compte ?
              {" "}
              <button
                onClick={() => onSwitch("signup")}
                className="underline"
              >
                Inscrivez-vous
              </button>
            </>
          ) : (
            <>
              Déjà un compte ?
              {" "}
              <button
                onClick={() => onSwitch("login")}
                className="underline"
              >
                Connectez-vous
              </button>
            </>
          )}

        </p>

      </div>

    </div>
  );
}


/* =========================================================
   DASHBOARD
========================================================= */

function Dashboard({
  account,
  onLogout
}) {

  const [page,setPage] =
    useState("dashboard");

  const [dashboard,setDashboard] =
    useState(null);

  const [properties,setProperties] =
    useState([]);

  const [owners,setOwners] =
    useState([]);

  const [tenants,setTenants] =
    useState([]);

  const [leases,setLeases] =
    useState([]);

  const [payments,setPayments] =
    useState([]);

  const [notifications,setNotifications] =
    useState([]);

  const [messages,setMessages] =
    useState([]);

  const [loading,setLoading] =
    useState(true);

  const [modal,setModal] =
    useState(null);

  const [error,setError] =
    useState("");

  const [selectedProperty,setSelectedProperty] =
    useState("all");


  async function refresh() {

    try {

      setLoading(true);

      const [
        dash,
        props,
        own,
        ten,
        lea,
        pay,
        notif,
        msg
      ] = await Promise.all([
        api("/api/dashboard"),
        api("/api/properties"),
        api("/api/owners"),
        api("/api/tenants"),
        api("/api/leases"),
        api("/api/payments"),
        api("/api/notifications"),
        api("/api/messages")
      ]);

      setDashboard(dash);
      setProperties(props);
      setOwners(own);
      setTenants(ten);
      setLeases(lea);
      setPayments(pay);
      setNotifications(notif);
      setMessages(msg);

    } catch (err) {

      if (
        err.message ===
        "Vous devez être connecté."
      ) {
        onLogout();
        return;
      }

      setError(err.message);

    } finally {

      setLoading(false);
    }
  }


  useEffect(() => {
    refresh();
  }, []);


  async function logout() {

    try {
      await api(
        "/api/logout",
        {
          method:"POST"
        }
      );
    } finally {
      onLogout();
    }
  }


  async function markPaid(id) {

    try {

      await api(
        "/api/payments/" +
        Number(id) +
        "/paid",
        {
          method:"POST"
        }
      );

      await refresh();

    } catch (err) {
      setError(err.message);
    }
  }


  async function readNotification(id) {

    try {

      await api(
        "/api/notifications/" +
        Number(id) +
        "/read",
        {
          method:"POST"
        }
      );

      await refresh();

    } catch (err) {
      setError(err.message);
    }
  }


  async function readAll() {

    try {

      await api(
        "/api/notifications/read-all",
        {
          method:"POST"
        }
      );

      await refresh();

    } catch (err) {
      setError(err.message);
    }
  }


  const filteredTenants =
    selectedProperty === "all"
      ? tenants
      : tenants.filter(t =>
          leases.some(l =>
            l.tenant_id === t.id &&
            l.property_id === Number(selectedProperty)
          )
        );


  const pageTitles = {
    dashboard:"Tableau de bord",
    properties:"Biens",
    owners:"Propriétaires",
    tenants:"Locataires",
    leases:"Baux",
    payments:"Loyers",
    notifications:"Notifications",
    messages:"Messages"
  };


  const nav = [
    ["dashboard","Tableau de bord",Home],
    ["properties","Biens",Building2],
    ["owners","Propriétaires",UserRound],
    ["tenants","Locataires",Users],
    ["leases","Baux",FileText],
    ["payments","Loyers",Wallet],
    ["notifications","Notifications",Bell],
    ["messages","Messages",MessageCircle]
  ];


  return (

    <div
      className="min-h-screen"
      style={{
        backgroundColor:"#F2F4F3",
        fontFamily:"Inter,sans-serif"
      }}
    >

      <header
        style={{backgroundColor:NAVY}}
        className="text-white"
      >

        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">

          <div>

            <div
              className="font-semibold text-lg"
              style={{
                fontFamily:"Roboto Slab,serif"
              }}
            >
              Immo<span style={{color:GOLD}}>flow</span>
            </div>

            <div className="text-xs text-stone-300">
              {account?.agency_name ||
               account?.name ||
               "Mon agence"}
            </div>

          </div>

          <button
            onClick={logout}
            className="text-xs flex items-center gap-1 text-stone-300 hover:text-white"
          >
            <LogOut size={14}/>
            Déconnexion
          </button>

        </div>

      </header>


      <div className="max-w-6xl mx-auto px-4 sm:px-6">

        <div className="flex flex-col lg:flex-row gap-6 py-6">

          <aside className="lg:w-56 flex-shrink-0">

            <div className="bg-white rounded-lg border border-stone-200 p-2 lg:sticky lg:top-6">

              {nav.map(([id,label,Icon]) => (

                <button
                  key={id}
                  onClick={() => setPage(id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm mb-1 text-left"
                  style={
                    page === id
                      ? {
                          backgroundColor:NAVY,
                          color:"white"
                        }
                      : {
                          color:NAVY
                        }
                  }
                >
                  <Icon size={16}/>

                  <span>{label}</span>

                  {id === "notifications" &&
                    Number(dashboard?.unread || 0) > 0 && (
                      <span
                        className="ml-auto text-xs rounded-full px-2 py-0.5"
                        style={{
                          backgroundColor:RUST,
                          color:"white"
                        }}
                      >
                        {dashboard.unread}
                      </span>
                    )}

                </button>

              ))}

            </div>

          </aside>


          <main className="flex-1 min-w-0">

            <div className="flex items-center justify-between mb-6">

              <div>

                <h1
                  className="text-2xl font-bold"
                  style={{
                    fontFamily:"Roboto Slab,serif",
                    color:NAVY
                  }}
                >
                  {pageTitles[page]}
                </h1>

                <p className="text-sm text-stone-500 mt-1">
                  {account?.name || "Votre espace de gestion"}
                </p>

              </div>

              <div className="text-xs text-stone-400">
                Septembre 2026
              </div>

            </div>


            {error && (
              <div
                className="mb-5 rounded border p-3 text-sm flex justify-between"
                style={{
                  borderColor:"#f0b4aa",
                  backgroundColor:"#fff5f3",
                  color:RUST
                }}
              >
                <span>{error}</span>

                <button
                  onClick={() => setError("")}
                >
                  <X size={16}/>
                </button>

              </div>
            )}


            {loading && !dashboard ? (

              <div className="bg-white rounded-lg border border-stone-200 p-10 text-center">
                Chargement de votre espace...
              </div>

            ) : (

              <>

                {page === "dashboard" && (
                  <DashboardHome
                    dashboard={dashboard}
                    properties={properties}
                    tenants={tenants}
                    payments={payments}
                    setPage={setPage}
                    selectedProperty={selectedProperty}
                    setSelectedProperty={setSelectedProperty}
                    onAddProperty={() => setModal("property")}
                    onAddTenant={() => setModal("tenant")}
                  />
                )}


                {page === "properties" && (
                  <PropertiesPage
                    properties={properties}
                    onAdd={() => setModal("property")}
                  />
                )}


                {page === "owners" && (
                  <OwnersPage
                    owners={owners}
                    onAdd={() => setModal("owner")}
                  />
                )}


                {page === "tenants" && (
                  <TenantsPage
                    tenants={tenants}
                    onAdd={() => setModal("tenant")}
                  />
                )}


                {page === "leases" && (
                  <LeasesPage
                    leases={leases}
                    onAdd={() => setModal("lease")}
                  />
                )}


                {page === "payments" && (
                  <PaymentsPage
                    payments={payments}
                    onAdd={() => setModal("payment")}
                    onPaid={markPaid}
                  />
                )}


                {page === "notifications" && (
                  <NotificationsPage
                    notifications={notifications}
                    onRead={readNotification}
                    onReadAll={readAll}
                  />
                )}


                {page === "messages" && (
                  <MessagesPage
                    messages={messages}
                  />
                )}

              </>

            )}

          </main>

        </div>

      </div>


      {modal && (
        <Modal
          type={modal}
          owners={owners}
          properties={properties}
          tenants={tenants}
          leases={leases}
          onClose={() => setModal(null)}
          onSuccess={async () => {
            setModal(null);
            await refresh();
          }}
        />
      )}

    </div>
  );
}


/* =========================================================
   DASHBOARD HOME
========================================================= */

function DashboardHome({
  dashboard,
  properties,
  tenants,
  payments,
  setPage,
  selectedProperty,
  setSelectedProperty,
  onAddProperty,
  onAddTenant
}) {

  const expected =
    payments.reduce(
      (sum,p) =>
        p.status !== "paid"
          ? sum + Number(p.amount || 0)
          : sum,
      0
    );

  const collected =
    payments.reduce(
      (sum,p) =>
        p.status === "paid"
          ? sum + Number(p.amount || 0)
          : sum,
      0
    );

  return (

    <>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">

        <StatCard
          icon={Home}
          label="Biens"
          value={dashboard?.properties || 0}
        />

        <StatCard
          icon={Users}
          label="Locataires"
          value={dashboard?.tenants || 0}
        />

        <StatCard
          icon={TrendingUp}
          label="Encaissé"
          value={formatFCFA(collected)}
          green
        />

        <StatCard
          icon={AlertCircle}
          label="Retards"
          value={dashboard?.late || 0}
          danger={Number(dashboard?.late || 0) > 0}
        />

      </div>


      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">

        <div className="flex flex-wrap gap-2">

          <button
            onClick={() => setSelectedProperty("all")}
            className="px-3 py-1.5 rounded-full text-sm border"
            style={
              selectedProperty === "all"
                ? {
                    backgroundColor:NAVY,
                    color:"white",
                    borderColor:NAVY
                  }
                : {
                    backgroundColor:"white",
                    color:NAVY,
                    borderColor:"#d6d3d1"
                  }
            }
          >
            Tous les biens
          </button>

          {properties.map(p => (

            <button
              key={p.id}
              onClick={() =>
                setSelectedProperty(String(p.id))
              }
              className="px-3 py-1.5 rounded-full text-sm border flex items-center gap-1.5"
              style={
                selectedProperty === String(p.id)
                  ? {
                      backgroundColor:NAVY,
                      color:"white",
                      borderColor:NAVY
                    }
                  : {
                      backgroundColor:"white",
                      color:NAVY,
                      borderColor:"#d6d3d1"
                    }
              }
            >
              <MapPin size={12}/>
              {p.title}
            </button>

          ))}

        </div>


        <div className="flex gap-2">

          <button
            onClick={onAddProperty}
            className="px-3 py-1.5 rounded text-sm font-medium border flex items-center gap-1.5"
            style={{
              borderColor:NAVY,
              color:NAVY
            }}
          >
            <Plus size={14}/>
            Ajouter un bien
          </button>

          <button
            onClick={onAddTenant}
            disabled={!properties.length}
            className="px-3 py-1.5 rounded text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
            style={{
              backgroundColor:GOLD,
              color:NAVY
            }}
          >
            <Plus size={14}/>
            Ajouter un locataire
          </button>

        </div>

      </div>


      <div className="bg-white rounded-lg border border-stone-200 overflow-hidden">

        <div className="p-4 border-b border-stone-200 flex justify-between">

          <div>

            <h2
              className="font-semibold"
              style={{
                color:NAVY,
                fontFamily:"Roboto Slab,serif"
              }}
            >
              Suivi des loyers
            </h2>

            <p className="text-xs text-stone-400 mt-1">
              Vue d'ensemble de vos paiements
            </p>

          </div>

          <button
            onClick={() => setPage("payments")}
            className="text-xs underline"
            style={{color:NAVY}}
          >
            Voir les loyers
          </button>

        </div>


        <div className="overflow-x-auto">

          <table className="w-full text-sm">

            <thead>

              <tr
                className="border-b border-stone-200"
                style={{backgroundColor:"#FAF9F7"}}
              >

                <th className="text-left py-3 px-4 text-xs text-stone-500">
                  Locataire
                </th>

                <th className="text-left py-3 px-4 text-xs text-stone-500">
                  Bien
                </th>

                <th className="text-left py-3 px-4 text-xs text-stone-500">
                  Montant
                </th>

                <th className="text-left py-3 px-4 text-xs text-stone-500">
                  Échéance
                </th>

                <th className="text-left py-3 px-4 text-xs text-stone-500">
                  Statut
                </th>

              </tr>

            </thead>

            <tbody>

              {payments.slice(0,10).map(p => (

                <tr
                  key={p.id}
                  className="border-b border-stone-100"
                >

                  <td className="py-3 px-4">

                    {p.first_name} {p.last_name}

                  </td>

                  <td className="py-3 px-4">
                    {p.reference || "Référence non renseignée"}
                  </td>

                  <td
                    className="py-3 px-4"
                    style={{
                      fontFamily:"IBM Plex Mono,monospace"
                    }}
                  >
                    {formatFCFA(p.amount)}
                  </td>

                  <td className="py-3 px-4">
                    {p.due_date || "Date non renseignée"}
                  </td>

                  <td className="py-3 px-4">

                    <StatusBadge
                      status={p.status}
                    />

                  </td>

                </tr>

              ))}

              {!payments.length && (

                <tr>

                  <td
                    colSpan="5"
                    className="text-center py-10 text-stone-400"
                  >
                    Aucun paiement enregistré.
                  </td>

                </tr>

              )}

            </tbody>

          </table>

        </div>

      </div>


      <div className="grid sm:grid-cols-2 gap-4 mt-5">

        <div className="bg-white rounded-lg border border-stone-200 p-5">

          <div className="text-xs text-stone-500 mb-2">
            Total restant à encaisser
          </div>

          <div
            className="text-xl font-semibold"
            style={{
              color:NAVY,
              fontFamily:"IBM Plex Mono,monospace"
            }}
          >
            {formatFCFA(expected)}
          </div>

        </div>


        <div className="bg-white rounded-lg border border-stone-200 p-5">

          <div className="text-xs text-stone-500 mb-2">
            Biens occupés
          </div>

          <div
            className="text-xl font-semibold"
            style={{
              color:GREEN,
              fontFamily:"IBM Plex Mono,monospace"
            }}
          >
            {dashboard?.occupied || 0}
          </div>

        </div>

      </div>

    </>
  );
}


/* =========================================================
   STAT CARD
========================================================= */

function StatCard({
  icon:Icon,
  label,
  value,
  green,
  danger
}) {

  return (

    <div className="bg-white rounded-lg p-4 border border-stone-200">

      <div className="flex items-center gap-2 text-stone-500 text-xs mb-1">

        <Icon size={14}/>

        {label}

      </div>

      <div
        className="text-xl sm:text-2xl font-semibold"
        style={{
          fontFamily:"IBM Plex Mono,monospace",
          color:
            danger
              ? RUST
              : green
                ? GREEN
                : NAVY
        }}
      >
        {value}
      </div>

    </div>
  );
}


/* =========================================================
   STATUS
========================================================= */

function StatusBadge({status}) {

  const config = {
    paid:{
      label:"Payé",
      bg:"#eaf3ee",
      color:GREEN
    },
    late:{
      label:"En retard",
      bg:"#fff1ee",
      color:RUST
    },
    pending:{
      label:"En attente",
      bg:"#faf5df",
      color:"#8b7110"
    },
    active:{
      label:"Actif",
      bg:"#eaf3ee",
      color:GREEN
    },
    available:{
      label:"Disponible",
      bg:"#eaf3ee",
      color:GREEN
    },
    occupied:{
      label:"Occupé",
      bg:"#fff1ee",
      color:RUST
    }
  };

  const c =
    config[status] ||
    {
      label:status || "Statut non renseigné",
      bg:"#f5f5f4",
      color:"#57534e"
    };

  return (

    <span
      className="inline-block rounded-full px-2 py-1 text-xs font-medium"
      style={{
        backgroundColor:c.bg,
        color:c.color
      }}
    >
      {c.label}
    </span>
  );
}


/* =========================================================
   PROPERTIES
========================================================= */

function PropertiesPage({
  properties,
  onAdd
}) {

  return (

    <Section
      title="Vos biens"
      action="Ajouter un bien"
      onAction={onAdd}
    >

      <div className="overflow-x-auto">

        <table className="w-full text-sm">

          <thead>

            <tr className="border-b border-stone-200">

              <th className="text-left py-3 px-3">
                Référence
              </th>

              <th className="text-left py-3 px-3">
                Bien
              </th>

              <th className="text-left py-3 px-3">
                Ville
              </th>

              <th className="text-left py-3 px-3">
                Type
              </th>

              <th className="text-left py-3 px-3">
                Loyer
              </th>

              <th className="text-left py-3 px-3">
                Statut
              </th>

            </tr>

          </thead>

          <tbody>

            {properties.map(p => (

              <tr
                key={p.id}
                className="border-b border-stone-100"
              >

                <td className="py-3 px-3">
                  {p.reference || "Référence non renseignée"}
                </td>

                <td className="py-3 px-3 font-medium">
                  {p.title || "Bien non renseigné"}
                </td>

                <td className="py-3 px-3">
                  {p.city || "Ville non renseignée"}
                </td>

                <td className="py-3 px-3">
                  {p.type || "Type non renseigné"}
                </td>

                <td className="py-3 px-3">
                  {formatFCFA(p.rent)}
                </td>

                <td className="py-3 px-3">
                  <StatusBadge status={p.status}/>
                </td>

              </tr>

            ))}

          </tbody>

        </table>

        {!properties.length && (
          <Empty text="Aucun bien enregistré."/>
        )}

      </div>

    </Section>
  );
}


/* =========================================================
   OWNERS
========================================================= */

function OwnersPage({
  owners,
  onAdd
}) {

  return (

    <Section
      title="Propriétaires"
      action="Ajouter"
      onAction={onAdd}
    >

      <div className="overflow-x-auto">

        <table className="w-full text-sm">

          <thead>

            <tr className="border-b border-stone-200">

              <th className="text-left py-3 px-3">
                Nom
              </th>

              <th className="text-left py-3 px-3">
                Téléphone
              </th>

              <th className="text-left py-3 px-3">
                Email
              </th>

              <th className="text-left py-3 px-3">
                Adresse
              </th>

            </tr>

          </thead>

          <tbody>

            {owners.map(o => (

              <tr
                key={o.id}
                className="border-b border-stone-100"
              >

                <td className="py-3 px-3 font-medium">
                  {o.name || "Nom non renseigné"}
                </td>

                <td className="py-3 px-3">
                  {o.phone || "Téléphone non renseigné"}
                </td>

                <td className="py-3 px-3">
                  {o.email || "Email non renseigné"}
                </td>

                <td className="py-3 px-3">
                  {o.address || "Adresse non renseignée"}
                </td>

              </tr>

            ))}

          </tbody>

        </table>

        {!owners.length && (
          <Empty text="Aucun propriétaire enregistré."/>
        )}

      </div>

    </Section>
  );
}


/* =========================================================
   TENANTS
========================================================= */

function TenantsPage({
  tenants,
  onAdd
}) {

  return (

    <Section
      title="Locataires"
      action="Ajouter"
      onAction={onAdd}
    >

      <div className="overflow-x-auto">

        <table className="w-full text-sm">

          <thead>

            <tr className="border-b border-stone-200">

              <th className="text-left py-3 px-3">
                Nom
              </th>

              <th className="text-left py-3 px-3">
                Téléphone
              </th>

              <th className="text-left py-3 px-3">
                Email
              </th>

              <th className="text-left py-3 px-3">
                Adresse
              </th>

            </tr>

          </thead>

          <tbody>

            {tenants.map(t => (

              <tr
                key={t.id}
                className="border-b border-stone-100"
              >

                <td className="py-3 px-3 font-medium">
                  {t.first_name || "Prénom non renseigné"} {t.last_name || "Nom non renseigné"}
                </td>

                <td className="py-3 px-3">
                  {t.phone || "Téléphone non renseigné"}
                </td>

                <td className="py-3 px-3">
                  {t.email || "Email non renseigné"}
                </td>

                <td className="py-3 px-3">
                  {t.address || "Adresse non renseignée"}
                </td>

              </tr>

            ))}

          </tbody>

        </table>

        {!tenants.length && (
          <Empty text="Aucun locataire enregistré."/>
        )}

      </div>

    </Section>
  );
}


/* =========================================================
   LEASES
========================================================= */

function LeasesPage({
  leases,
  onAdd
}) {

  return (

    <Section
      title="Baux"
      action="Créer un bail"
      onAction={onAdd}
    >

      <div className="overflow-x-auto">

        <table className="w-full text-sm">

          <thead>

            <tr className="border-b border-stone-200">

              <th className="text-left py-3 px-3">
                Bien
              </th>

              <th className="text-left py-3 px-3">
                Locataire
              </th>

              <th className="text-left py-3 px-3">
                Début
              </th>

              <th className="text-left py-3 px-3">
                Fin
              </th>

              <th className="text-left py-3 px-3">
                Loyer
              </th>

              <th className="text-left py-3 px-3">
                Statut
              </th>

            </tr>

          </thead>

          <tbody>

            {leases.map(l => (

              <tr
                key={l.id}
                className="border-b border-stone-100"
              >

                <td className="py-3 px-3">
                  {l.reference || "Référence non renseignée"} — {l.property_title || "Bien non renseigné"}
                </td>

                <td className="py-3 px-3">
                  {l.first_name || "Prénom non renseigné"} {l.last_name || "Nom non renseigné"}
                </td>

                <td className="py-3 px-3">
                  {l.start_date || "Date non renseignée"}
                </td>

                <td className="py-3 px-3">
                  {l.end_date || "Date non renseignée"}
                </td>

                <td className="py-3 px-3">
                  {formatFCFA(l.monthly_rent)}
                </td>

                <td className="py-3 px-3">
                  <StatusBadge status={l.status}/>
                </td>

              </tr>

            ))}

          </tbody>

        </table>

        {!leases.length && (
          <Empty text="Aucun bail enregistré."/>
        )}

      </div>

    </Section>
  );
}


/* =========================================================
   PAYMENTS
========================================================= */

function PaymentsPage({
  payments,
  onAdd,
  onPaid
}) {

  return (

    <Section
      title="Loyers"
      action="Ajouter un loyer"
      onAction={onAdd}
    >

      <div className="overflow-x-auto">

        <table className="w-full text-sm">

          <thead>

            <tr className="border-b border-stone-200">

              <th className="text-left py-3 px-3">
                Locataire
              </th>

              <th className="text-left py-3 px-3">
                Bien
              </th>

              <th className="text-left py-3 px-3">
                Montant
              </th>

              <th className="text-left py-3 px-3">
                Échéance
              </th>

              <th className="text-left py-3 px-3">
                Statut
              </th>

              <th className="text-left py-3 px-3">
                Action
              </th>

            </tr>

          </thead>

          <tbody>

            {payments.map(p => (

              <tr
                key={p.id}
                className="border-b border-stone-100"
              >

                <td className="py-3 px-3">
                  {p.first_name || "Prénom non renseigné"} {p.last_name || "Nom non renseigné"}
                </td>

                <td className="py-3 px-3">
                  {p.reference || "Référence non renseignée"}
                </td>

                <td className="py-3 px-3">
                  {formatFCFA(p.amount)}
                </td>

                <td className="py-3 px-3">
                  {p.due_date || "Date non renseignée"}
                </td>

                <td className="py-3 px-3">
                  <StatusBadge status={p.status}/>
                </td>

                <td className="py-3 px-3">

                  {p.status !== "paid" ? (

                    <button
                      onClick={() => onPaid(p.id)}
                      className="px-3 py-1.5 rounded text-xs font-medium text-white"
                      style={{backgroundColor:NAVY}}
                    >
                      Marquer payé
                    </button>

                  ) : (

                    <span
                      className="text-xs"
                      style={{color:GREEN}}
                    >
                      ✓ Enregistré
                    </span>

                  )}

                </td>

              </tr>

            ))}

          </tbody>

        </table>

        {!payments.length && (
          <Empty text="Aucun loyer enregistré."/>
        )}

      </div>

    </Section>
  );
}


/* =========================================================
   NOTIFICATIONS
========================================================= */

function NotificationsPage({
  notifications,
  onRead,
  onReadAll
}) {

  return (

    <Section
      title="Notifications"
      action="Tout marquer comme lu"
      onAction={onReadAll}
    >

      <div>

        {notifications.map(n => (

          <button
            key={n.id}
            onClick={() => onRead(n.id)}
            className="w-full text-left p-4 border-b border-stone-100"
            style={{
              backgroundColor:
                n.is_read
                  ? "white"
                  : "#f4f8ff"
            }}
          >

            <div className="flex justify-between gap-4">

              <div>

                <strong
                  style={{color:NAVY}}
                >
                  {n.title || "Notification sans titre"}
                </strong>

                <p className="text-sm text-stone-500 mt-1">
                  {n.message || "Message non renseigné"}
                </p>

              </div>

              {!n.is_read && (
                <span
                  className="text-xs rounded-full px-2 py-1 h-fit"
                  style={{
                    backgroundColor:NAVY,
                    color:"white"
                  }}
                >
                  Nouveau
                </span>
              )}

            </div>

            <small className="text-xs text-stone-400">
              {n.created_at || "Date non renseignée"}
            </small>

          </button>

        ))}

        {!notifications.length && (
          <Empty text="Aucune notification."/>
        )}

      </div>

    </Section>
  );
}


/* =========================================================
   MESSAGES
========================================================= */

function MessagesPage({
  messages
}) {

  return (

    <Section title="Messages">

      {messages.map(m => (

        <div
          key={m.id}
          className="p-4 border-b border-stone-100"
        >

          <strong style={{color:NAVY}}>
            {m.title || "Message sans titre"}
          </strong>

          <p className="text-sm text-stone-500 mt-1">
            {m.message || "Message non renseigné"}
          </p>

          <small className="text-xs text-stone-400">
            {m.created_at || "Date non renseignée"}
          </small>

        </div>

      ))}

      {!messages.length && (
        <Empty text="Aucun message automatique."/>
      )}

    </Section>
  );
}


/* =========================================================
   SECTION
========================================================= */

function Section({
  title,
  action,
  onAction,
  children
}) {

  return (

    <div className="bg-white rounded-lg border border-stone-200">

      <div className="p-5 border-b border-stone-200 flex items-center justify-between gap-3">

        <h2
          className="font-semibold"
          style={{
            fontFamily:"Roboto Slab,serif",
            color:NAVY
          }}
        >
          {title}
        </h2>

        {action && (

          <button
            onClick={onAction}
            className="px-3 py-1.5 rounded text-sm font-medium"
            style={{
              backgroundColor:NAVY,
              color:"white"
            }}
          >
            + {action}
          </button>

        )}

      </div>

      <div className="p-4">
        {children}
      </div>

    </div>
  );
}


/* =========================================================
   EMPTY
========================================================= */

function Empty({text}) {

  return (

    <div className="py-10 text-center text-sm text-stone-400">
      {text}
    </div>
  );
}


/* =========================================================
   MODAL
========================================================= */

function Modal({
  type,
  owners,
  properties,
  tenants,
  leases,
  onClose,
  onSuccess
}) {

  const [form,setForm] = useState({});
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState("");


  function change(name,value) {
    setForm(prev => ({
      ...prev,
      [name]:value
    }));
  }


  async function submit(e) {

    e.preventDefault();

    setError("");
    setLoading(true);

    try {

      let endpoint = "";

      if (type === "owner")
        endpoint = "/api/owners";

      if (type === "property")
        endpoint = "/api/properties";

      if (type === "tenant")
        endpoint = "/api/tenants";

      if (type === "lease")
        endpoint = "/api/leases";

      if (type === "payment")
        endpoint = "/api/payments";


      await api(
        endpoint,
        {
          method:"POST",
          body:JSON.stringify(form)
        }
      );

      await onSuccess();

    } catch (err) {

      setError(err.message);

    } finally {

      setLoading(false);
    }
  }


  const titles = {
    owner:"Nouveau propriétaire",
    property:"Nouveau bien",
    tenant:"Nouveau locataire",
    lease:"Nouveau bail",
    payment:"Nouveau loyer"
  };


  return (

    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >

      <div
        className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >

        <div className="flex justify-between items-center mb-5">

          <h3
            className="font-semibold text-lg"
            style={{
              fontFamily:"Roboto Slab,serif",
              color:NAVY
            }}
          >
            {titles[type]}
          </h3>

          <button
            onClick={onClose}
            className="text-stone-400"
          >
            <X size={20}/>
          </button>

        </div>


        {error && (

          <div
            className="mb-4 rounded border p-3 text-sm"
            style={{
              borderColor:"#f0b4aa",
              backgroundColor:"#fff5f3",
              color:RUST
            }}
          >
            {error}
          </div>

        )}


        <form
          onSubmit={submit}
          className="space-y-3"
        >

          {type === "owner" && (
            <>
              <Input
                label="Nom"
                value={form.name}
                onChange={v => change("name",v)}
                required
              />

              <Input
                label="Téléphone"
                value={form.phone}
                onChange={v => change("phone",v)}
              />

              <Input
                label="Email"
                type="email"
                value={form.email}
                onChange={v => change("email",v)}
              />

              <Input
                label="Adresse"
                value={form.address}
                onChange={v => change("address",v)}
              />
            </>
          )}


          {type === "property" && (
            <>
              <Input
                label="Référence"
                value={form.reference}
                onChange={v => change("reference",v)}
                placeholder="IMM-001"
                required
              />

              <Input
                label="Nom du bien"
                value={form.title}
                onChange={v => change("title",v)}
                placeholder="Résidence Fann"
                required
              />

              <Select
                label="Propriétaire"
                value={form.owner_id || ""}
                onChange={v => change("owner_id",v)}
                options={[
                  {
                    value:"",
                    label:"Aucun propriétaire"
                  },
                  ...owners.map(o => ({
                    value:o.id,
                    label:o.name
                  }))
                ]}
              />

              <Input
                label="Adresse"
                value={form.address}
                onChange={v => change("address",v)}
              />

              <Input
                label="Ville"
                value={form.city}
                onChange={v => change("city",v)}
                placeholder="Dakar"
              />

              <Select
                label="Type"
                value={form.type || "Appartement"}
                onChange={v => change("type",v)}
                options={[
                  "Appartement",
                  "Villa",
                  "Studio",
                  "Local commercial"
                ].map(x => ({
                  value:x,
                  label:x
                }))}
              />

              <Input
                label="Nombre de chambres"
                type="number"
                value={form.bedrooms || ""}
                onChange={v => change("bedrooms",v)}
              />

              <Input
                label="Loyer mensuel (FCFA)"
                type="number"
                value={form.rent || ""}
                onChange={v => change("rent",v)}
              />
            </>
          )}


          {type === "tenant" && (
            <>
              <Input
                label="Prénom"
                value={form.first_name}
                onChange={v => change("first_name",v)}
                required
              />

              <Input
                label="Nom"
                value={form.last_name}
                onChange={v => change("last_name",v)}
                required
              />

              <Input
                label="Téléphone"
                value={form.phone}
                onChange={v => change("phone",v)}
              />

              <Input
                label="Email"
                type="email"
                value={form.email}
                onChange={v => change("email",v)}
              />

              <Input
                label="Adresse"
                value={form.address}
                onChange={v => change("address",v)}
              />
            </>
          )}


          {type === "lease" && (
            <>
              <Select
                label="Bien"
                value={form.property_id || ""}
                onChange={v => change("property_id",v)}
                options={[
                  {
                    value:"",
                    label:"Sélectionner un bien"
                  },
                  ...properties
                    .filter(p => p.status !== "occupied")
                    .map(p => ({
                      value:p.id,
                      label:
                        p.reference +
                        " — " +
                        p.title
                    }))
                ]}
                required
              />

              <Select
                label="Locataire"
                value={form.tenant_id || ""}
                onChange={v => change("tenant_id",v)}
                options={[
                  {
                    value:"",
                    label:"Sélectionner un locataire"
                  },
                  ...tenants.map(t => ({
                    value:t.id,
                    label:
                      t.first_name +
                      " " +
                      t.last_name
                  }))
                ]}
                required
              />

              <Input
                label="Date de début"
                type="date"
                value={form.start_date}
                onChange={v => change("start_date",v)}
                required
              />

              <Input
                label="Date de fin"
                type="date"
                value={form.end_date}
                onChange={v => change("end_date",v)}
              />

              <Input
                label="Loyer mensuel (FCFA)"
                type="number"
                value={form.monthly_rent || ""}
                onChange={v => change("monthly_rent",v)}
                required
              />

              <Input
                label="Dépôt de garantie (FCFA)"
                type="number"
                value={form.deposit || ""}
                onChange={v => change("deposit",v)}
              />
            </>
          )}


          {type === "payment" && (
            <>
              <Select
                label="Bail"
                value={form.lease_id || ""}
                onChange={v => change("lease_id",v)}
                options={[
                  {
                    value:"",
                    label:"Sélectionner un bail"
                  },
                  ...leases
                    .filter(l => l.status === "active")
                    .map(l => ({
                      value:l.id,
                      label:
                        l.reference +
                        " — " +
                        l.first_name +
                        " " +
                        l.last_name
                    }))
                ]}
                required
              />

              <Input
                label="Montant (FCFA)"
                type="number"
                value={form.amount || ""}
                onChange={v => change("amount",v)}
                required
              />

              <Input
                label="Date d'échéance"
                type="date"
                value={form.due_date}
                onChange={v => change("due_date",v)}
                required
              />

              <Select
                label="Mode de paiement"
                value={form.payment_method || ""}
                onChange={v => change("payment_method",v)}
                options={[
                  {
                    value:"",
                    label:"Non précisé"
                  },
                  {
                    value:"Wave",
                    label:"Wave"
                  },
                  {
                    value:"Orange Money",
                    label:"Orange Money"
                  },
                  {
                    value:"Espèces",
                    label:"Espèces"
                  },
                  {
                    value:"Virement",
                    label:"Virement"
                  }
                ]}
              />
            </>
          )}


          <div className="flex justify-end gap-2 pt-4">

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded text-sm"
              style={{
                backgroundColor:"#e7e5e4",
                color:NAVY
              }}
            >
              Annuler
            </button>

            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded text-sm font-medium text-white disabled:opacity-60"
              style={{
                backgroundColor:NAVY
              }}
            >
              {loading
                ? "Enregistrement..."
                : "Enregistrer"}
            </button>

          </div>

        </form>

      </div>

    </div>
  );
}


/* =========================================================
   INPUT
========================================================= */

function Input({
  label,
  value,
  onChange,
  type="text",
  placeholder="",
  required=false
}) {

  return (

    <label className="block">

      <span className="block text-xs font-medium text-stone-600 mb-1">
        {label}
      </span>

      <input
        type={type}
        required={required}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-stone-300 rounded px-3 py-2 text-sm"
      />

    </label>
  );
}


/* =========================================================
   SELECT
========================================================= */

function Select({
  label,
  value,
  onChange,
  options,
  required=false
}) {

  return (

    <label className="block">

      <span className="block text-xs font-medium text-stone-600 mb-1">
        {label}
      </span>

      <select
        required={required}
        value={value ?? ""}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-stone-300 rounded px-3 py-2 text-sm bg-white"
      >

        {options.map((o,i) => {

          const option =
            typeof o === "string"
              ? {
                  value:o,
                  label:o
                }
              : o;

          return (
            <option
              key={i}
              value={option.value}
            >
              {option.label}
            </option>
          );

        })}

      </select>

    </label>
  );
}


/* =========================================================
   APP ROOT
========================================================= */

function App() {

  const [view,setView] =
    useState("landing");

  const [account,setAccount] =
    useState(null);

  const [selectedPlan,setSelectedPlan] =
    useState(null);


  useEffect(() => {

    api("/api/me")
      .then(data => {

        if (data.user) {
          setAccount(data.user);
          setView("dashboard");
        }

      })
      .catch(() => {});

  }, []);


  function handleAuth(user) {

    setAccount(user);
    setView("dashboard");
  }


  function selectPlan(plan) {

    setSelectedPlan(plan);

    setView("signup");
  }


  function logout() {

    setAccount(null);
    setSelectedPlan(null);
    setView("landing");
  }


  if (view === "dashboard" && account) {

    return (
      <Dashboard
        account={account}
        onLogout={logout}
      />
    );
  }


  if (view === "login" || view === "signup") {

    return (
      <AuthPage
        mode={view}
        onSuccess={handleAuth}
        onSwitch={setView}
        onBack={() => setView("landing")}
      />
    );
  }


  return (
    <Landing
      onLogin={() => setView("login")}
      onSignup={() => setView("signup")}
      onSelectPlan={selectPlan}
    />
  );
}


const root =
  document.getElementById("root");

if (root) {
  ReactDOM
    .createRoot(root)
    .render(<App />);
}

</script>

</body>
</html>`;
```
