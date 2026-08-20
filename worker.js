export default {
  async fetch(request, env) {
    try {
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
        details: error.message
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

  return [...new Uint8Array(hash)]
    .map(x => x.toString(16).padStart(2, "0"))
    .join("");
}


function randomToken() {
  return crypto.randomUUID() + crypto.randomUUID();
}


function getCookie(request, name) {

  const cookies = request.headers.get("Cookie") || "";

  const parts = cookies.split(";");

  for (const part of parts) {

    const [key, ...rest] = part.trim().split("=");

    if (key === name) {
      return rest.join("=");
    }
  }

  return null;
}


async function getUser(request, db) {

  const token = getCookie(request, "immoflow_session");

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
   API ROUTER
========================================================= */

async function api(request, env, url) {

  const db = env.DB;

  const path = url.pathname;
  const method = request.method;


  /* =======================================================
     REGISTER
  ======================================================= */

  if (path === "/api/register" && method === "POST") {

    const data = await request.json();

    const agency = String(data.agency_name || "").trim();
    const name = String(data.name || "").trim();
    const email = String(data.email || "").trim().toLowerCase();
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

    const userId = result.meta.last_row_id;

    const token = randomToken();

    const expires = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000
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


  /* =======================================================
     LOGIN
  ======================================================= */

  if (path === "/api/login" && method === "POST") {

    const data = await request.json();

    const email = String(data.email || "")
      .trim()
      .toLowerCase();

    const password = String(data.password || "");

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


  /* =======================================================
     ME
  ======================================================= */

  if (path === "/api/me") {

    const user = await getUser(request, db);

    return json({
      user: user || null
    });
  }


  /* =======================================================
     LOGOUT
  ======================================================= */

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
      "Set-Cookie":
        "immoflow_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
    });
  }


  /* =======================================================
     AUTH REQUIRED
  ======================================================= */

  const user = await getUser(request, db);

  if (!user) {
    return json({
      error: "Vous devez être connecté."
    }, 401);
  }

  const uid = user.id;


  /* =======================================================
     DASHBOARD
  ======================================================= */

  if (path === "/api/dashboard") {

    const properties = await db.prepare(`
      SELECT COUNT(*) count
      FROM properties
      WHERE user_id = ?
    `)
    .bind(uid)
    .first();

    const tenants = await db.prepare(`
      SELECT COUNT(*) count
      FROM tenants
      WHERE user_id = ?
    `)
    .bind(uid)
    .first();

    const occupied = await db.prepare(`
      SELECT COUNT(*) count
      FROM properties
      WHERE user_id = ?
      AND status = 'occupied'
    `)
    .bind(uid)
    .first();

    const late = await db.prepare(`
      SELECT COALESCE(SUM(amount),0) total
      FROM payments
      WHERE user_id = ?
      AND status = 'late'
    `)
    .bind(uid)
    .first();

    const unread = await db.prepare(`
      SELECT COUNT(*) count
      FROM notifications
      WHERE user_id = ?
      AND is_read = 0
    `)
    .bind(uid)
    .first();

    return json({
      properties: properties.count,
      tenants: tenants.count,
      occupied: occupied.count,
      late: late.total,
      unread: unread.count
    });
  }


  /* =======================================================
     OWNERS
  ======================================================= */

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

      return json(result.results);
    }

    if (method === "POST") {

      const data = await request.json();

      if (!data.name) {
        return json({
          error: "Le nom est obligatoire."
        }, 400);
      }

      const result = await db.prepare(`
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
        data.name,
        data.phone || "",
        data.email || "",
        data.address || ""
      )
      .run();

      return json({
        success: true,
        id: result.meta.last_row_id
      }, 201);
    }
  }


  /* =======================================================
     PROPERTIES
  ======================================================= */

  if (path === "/api/properties") {

    if (method === "GET") {

      const result = await db.prepare(`
        SELECT
          properties.*,
          owners.name owner_name
        FROM properties
        LEFT JOIN owners
          ON owners.id = properties.owner_id
          AND owners.user_id = properties.user_id
        WHERE properties.user_id = ?
        ORDER BY properties.id DESC
      `)
      .bind(uid)
      .all();

      return json(result.results);
    }

    if (method === "POST") {

      const data = await request.json();

      if (!data.reference || !data.title) {
        return json({
          error: "Référence et nom du bien obligatoires."
        }, 400);
      }

      const result = await db.prepare(`
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
        data.owner_id ? Number(data.owner_id) : null,
        data.reference,
        data.title,
        data.address || "",
        data.city || "",
        data.type || "Appartement",
        Number(data.bedrooms || 0),
        Number(data.rent || 0)
      )
      .run();

      await createNotification(
        db,
        uid,
        "Nouveau bien",
        `${data.title} a été ajouté à votre portefeuille.`,
        "property"
      );

      return json({
        success: true,
        id: result.meta.last_row_id
      }, 201);
    }
  }


  /* =======================================================
     TENANTS
  ======================================================= */

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

      return json(result.results);
    }

    if (method === "POST") {

      const data = await request.json();

      if (!data.first_name || !data.last_name) {
        return json({
          error: "Prénom et nom obligatoires."
        }, 400);
      }

      const result = await db.prepare(`
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
        data.first_name,
        data.last_name,
        data.phone || "",
        data.email || "",
        data.address || ""
      )
      .run();

      await createNotification(
        db,
        uid,
        "Nouveau locataire",
        `${data.first_name} ${data.last_name} a été ajouté.`,
        "tenant"
      );

      return json({
        success: true,
        id: result.meta.last_row_id
      }, 201);
    }
  }


  /* =======================================================
     LEASES
  ======================================================= */

  if (path === "/api/leases") {

    if (method === "GET") {

      const result = await db.prepare(`
        SELECT
          leases.*,
          properties.reference,
          properties.title property_title,
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

      return json(result.results);
    }

    if (method === "POST") {

      const data = await request.json();

      if (
        !data.property_id ||
        !data.tenant_id ||
        !data.start_date ||
        !data.monthly_rent
      ) {
        return json({
          error: "Informations du bail incomplètes."
        }, 400);
      }

      const property = await db.prepare(`
        SELECT id
        FROM properties
        WHERE id = ?
        AND user_id = ?
      `)
      .bind(
        Number(data.property_id),
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
        Number(data.tenant_id),
        uid
      )
      .first();

      if (!property || !tenant) {
        return json({
          error: "Bien ou locataire invalide."
        }, 400);
      }

      const result = await db.prepare(`
        INSERT INTO leases
        (
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
        Number(data.property_id),
        Number(data.tenant_id),
        data.start_date,
        data.end_date || null,
        Number(data.monthly_rent),
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
        Number(data.property_id),
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


  /* =======================================================
     PAYMENTS
  ======================================================= */

  if (path === "/api/payments") {

    if (method === "GET") {

      await updateLatePayments(db, uid);

      const result = await db.prepare(`
        SELECT
          payments.*,
          tenants.first_name,
          tenants.last_name,
          properties.reference
        FROM payments
        JOIN leases
          ON leases.id = payments.lease_id
          AND leases.user_id = payments.user_id
        JOIN tenants
          ON tenants.id = leases.tenant_id
          AND tenants.user_id = leases.user_id
        JOIN properties
          ON properties.id = leases.property_id
          AND properties.user_id = leases.user_id
        WHERE payments.user_id = ?
        ORDER BY payments.due_date DESC
      `)
      .bind(uid)
      .all();

      return json(result.results);
    }

    if (method === "POST") {

      const data = await request.json();

      if (
        !data.lease_id ||
        !data.amount ||
        !data.due_date
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
      `)
      .bind(
        Number(data.lease_id),
        uid
      )
      .first();

      if (!lease) {
        return json({
          error: "Bail introuvable."
        }, 404);
      }

      const result = await db.prepare(`
        INSERT INTO payments
        (
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
        Number(data.lease_id),
        Number(data.amount),
        data.due_date,
        data.payment_method || ""
      )
      .run();

      return json({
        success: true,
        id: result.meta.last_row_id
      }, 201);
    }
  }


  /* =======================================================
     MARK PAYMENT PAID
  ======================================================= */

  const paidMatch =
    path.match(/^\/api\/payments\/(\d+)\/paid$/);

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
      "payment",
      "Paiement enregistré",
      "Le paiement du loyer a été enregistré.",
      "payment"
    );

    return json({
      success: true
    });
  }


  /* =======================================================
     NOTIFICATIONS
  ======================================================= */

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

    return json(result.results);
  }


  const notificationMatch =
    path.match(/^\/api\/notifications\/(\d+)\/read$/);

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


  /* =======================================================
     MESSAGES
  ======================================================= */

  if (path === "/api/messages") {

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

    return json(result.results);
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
      tenants.first_name,
      tenants.last_name,
      properties.reference
    FROM payments
    JOIN leases
      ON leases.id = payments.lease_id
      AND leases.user_id = payments.user_id
    JOIN tenants
      ON tenants.id = leases.tenant_id
      AND tenants.user_id = leases.user_id
    JOIN properties
      ON properties.id = leases.property_id
      AND properties.user_id = leases.user_id
    WHERE payments.user_id = ?
    AND payments.status = 'pending'
    AND payments.due_date < ?
  `)
  .bind(
    userId,
    date
  )
  .all();

  for (const payment of late.results) {

    await db.prepare(`
      UPDATE payments
      SET status = 'late'
      WHERE id = ?
      AND user_id = ?
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
        INSERT INTO messages
        (
          user_id,
          tenant_id,
          title,
          message,
          type
        )
        VALUES (?, NULL, ?, ?, 'automatic')
      `)
      .bind(
        userId,
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
    INSERT INTO notifications
    (
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

const APP_HTML = `

<!DOCTYPE html>

<html lang="fr">

<head>

<meta charset="UTF-8">

<meta
name="viewport"
content="width=device-width,initial-scale=1"
>

<title>ImmoFlow</title>

<style>

*{
box-sizing:border-box
}

body{
margin:0;
font-family:Arial,sans-serif;
background:#f4f6fa;
color:#172033
}

button,
input,
select{
font:inherit
}

button{
cursor:pointer
}

.hidden{
display:none!important
}

.auth{
min-height:100vh;
display:flex;
align-items:center;
justify-content:center;
padding:20px
}

.auth-card{
width:100%;
max-width:430px;
background:white;
padding:30px;
border-radius:18px;
box-shadow:0 10px 40px rgba(0,0,0,.08)
}

.logo{
font-size:30px;
font-weight:800;
margin-bottom:5px
}

.logo span{
color:#2563eb
}

.muted{
color:#64748b
}

.field{
margin-bottom:15px
}

.field label{
display:block;
font-size:14px;
font-weight:600;
margin-bottom:6px
}

.field input,
.field select{
width:100%;
padding:12px;
border:1px solid #d7dce5;
border-radius:9px
}

.primary{
background:#2563eb;
border:0;
color:white;
padding:11px 16px;
border-radius:9px;
font-weight:700
}

.secondary{
background:#e5e7eb;
border:0;
padding:11px 16px;
border-radius:9px
}

.full{
width:100%
}

.auth-switch{
text-align:center;
margin-top:18px
}

.link{
border:0;
background:none;
color:#2563eb;
font-weight:700
}

.app{
display:flex;
min-height:100vh
}

.sidebar{
width:240px;
background:#111827;
color:white;
position:fixed;
top:0;
bottom:0;
left:0;
padding:20px
}

.side-logo{
font-size:25px;
font-weight:800;
margin-bottom:30px
}

.side-logo span{
color:#60a5fa
}

.nav button{
display:block;
width:100%;
border:0;
background:transparent;
color:#cbd5e1;
text-align:left;
padding:13px;
border-radius:8px;
margin-bottom:5px
}

.nav button:hover,
.nav button.active{
background:#1f2937;
color:white
}

.logout{
position:absolute;
bottom:20px;
left:20px;
right:20px
}

.main{
margin-left:240px;
width:calc(100% - 240px);
padding:25px
}

.top{
display:flex;
justify-content:space-between;
align-items:center;
margin-bottom:25px
}

.page{
display:none
}

.page.active{
display:block
}

.cards{
display:grid;
grid-template-columns:repeat(4,1fr);
gap:15px
}

.card{
background:white;
padding:20px;
border-radius:15px;
box-shadow:0 3px 15px rgba(0,0,0,.05)
}

.card-title{
color:#64748b;
font-size:14px
}

.card-value{
font-size:26px;
font-weight:800;
margin-top:8px
}

.panel{
background:white;
padding:20px;
border-radius:15px;
margin-top:20px;
box-shadow:0 3px 15px rgba(0,0,0,.05)
}

.panel-head{
display:flex;
justify-content:space-between;
align-items:center;
margin-bottom:15px
}

table{
width:100%;
border-collapse:collapse
}

th,
td{
padding:12px 8px;
border-bottom:1px solid #edf0f4;
text-align:left
}

.badge{
background:#ef4444;
color:white;
border-radius:20px;
padding:3px 7px;
font-size:11px
}

.notification{
padding:15px;
border-bottom:1px solid #eee
}

.unread{
background:#eff6ff
}

.modal{
display:none;
position:fixed;
inset:0;
background:rgba(0,0,0,.5);
align-items:center;
justify-content:center;
padding:20px;
z-index:50
}

.modal.show{
display:flex
}

.modal-card{
background:white;
width:min(600px,100%);
padding:25px;
border-radius:16px
}

.grid{
display:grid;
grid-template-columns:1fr 1fr;
gap:12px
}

.actions{
display:flex;
justify-content:flex-end;
gap:10px;
margin-top:20px
}

.toast{
position:fixed;
right:20px;
bottom:20px;
background:#111827;
color:white;
padding:14px 18px;
border-radius:10px;
display:none;
z-index:100
}

@media(max-width:800px){

.sidebar{
width:70px;
padding:10px
}

.side-logo{
font-size:0;
text-align:center
}

.side-logo span{
font-size:22px
}

.nav button{
font-size:0;
text-align:center
}

.logout{
font-size:0;
padding:10px
}

.main{
margin-left:70px;
width:calc(100% - 70px);
padding:15px
}

.cards{
grid-template-columns:1fr 1fr
}

}

@media(max-width:500px){

.cards{
grid-template-columns:1fr
}

.grid{
grid-template-columns:1fr
}

}

</style>

</head>

<body>


<!-- AUTH -->

<div id="auth" class="auth">

<div class="auth-card">

<div class="logo">
Immo<span>Flow</span>
</div>

<p class="muted">
Gestion immobilière pour agences
</p>


<div id="login">

<h2>Connexion</h2>

<form id="loginForm">

<div class="field">

<label>Email</label>

<input
id="loginEmail"
type="email"
required
>

</div>

<div class="field">

<label>Mot de passe</label>

<input
id="loginPassword"
type="password"
required
>

</div>

<button class="primary full">
Se connecter
</button>

</form>

<p class="auth-switch">
Pas encore de compte ?
<button
class="link"
onclick="showRegister()"
>
Créer un compte
</button>
</p>

</div>


<div id="register" class="hidden">

<h2>Créer votre compte</h2>

<form id="registerForm">

<div class="field">

<label>Nom de l'agence</label>

<input
id="agency"
required
>

</div>

<div class="field">

<label>Votre nom</label>

<input
id="name"
required
>

</div>

<div class="field">

<label>Email</label>

<input
id="email"
type="email"
required
>

</div>

<div class="field">

<label>Mot de passe</label>

<input
id="password"
type="password"
minlength="6"
required
>

</div>

<button class="primary full">
Créer mon compte
</button>

</form>

<p class="auth-switch">
Déjà inscrit ?
<button
class="link"
onclick="showLogin()"
>
Se connecter
</button>
</p>

</div>

</div>

</div>


<!-- APP -->

<div id="app" class="app hidden">

<aside class="sidebar">

<div class="side-logo">
Immo<span>Flow</span>
</div>

<div class="nav">

<button
class="active"
onclick="page('dashboard',this)"
>
🏠 Tableau de bord
</button>

<button
onclick="page('properties',this)"
>
🏢 Biens
</button>

<button
onclick="page('owners',this)"
>
👔 Propriétaires
</button>

<button
onclick="page('tenants',this)"
>
👤 Locataires
</button>

<button
onclick="page('leases',this)"
>
📄 Baux
</button>

<button
onclick="page('payments',this)"
>
💰 Loyers
</button>

<button
onclick="page('notifications',this)"
>
🔔 Notifications
<span id="notificationBadge" class="badge">0</span>
</button>

<button
onclick="page('messages',this)"
>
💬 Messages
</button>

</div>

<button
class="secondary logout"
onclick="logout()"
>
Déconnexion
</button>

</aside>


<main class="main">

<div class="top">

<div>

<h1 id="pageTitle">
Tableau de bord
</h1>

<div
id="agencyName"
class="muted"
></div>

</div>

</div>


<!-- DASHBOARD -->

<section
id="dashboard"
class="page active"
>

<div class="cards">

<div class="card">

<div class="card-title">
Biens
</div>

<div
id="propertiesCount"
class="card-value"
>
0
</div>

</div>


<div class="card">

<div class="card-title">
Biens occupés
</div>

<div
id="occupiedCount"
class="card-value"
>
0
</div>

</div>


<div class="card">

<div class="card-title">
Locataires
</div>

<div
id="tenantsCount"
class="card-value"
>
0
</div>

</div>


<div class="card">

<div class="card-title">
Impayés
</div>

<div
id="lateCount"
class="card-value"
>
0 FCFA
</div>

</div>

</div>


<div class="panel">

<div class="panel-head">

<h2>Bienvenue sur ImmoFlow</h2>

<button
class="primary"
onclick="refreshAll()"
>
Actualiser
</button>

</div>

<p class="muted">
Votre espace de gestion immobilière est connecté à votre base D1.
</p>

</div>

</section>


<!-- PROPERTIES -->

<section
id="properties"
class="page"
>

<div class="panel">

<div class="panel-head">

<h2>Biens</h2>

<button
class="primary"
onclick="openModal('propertyModal')"
>
+ Ajouter
</button>

</div>

<div id="propertiesList"></div>

</div>

</section>


<!-- OWNERS -->

<section
id="owners"
class="page"
>

<div class="panel">

<div class="panel-head">

<h2>Propriétaires</h2>

<button
class="primary"
onclick="openModal('ownerModal')"
>
+ Ajouter
</button>

</div>

<div id="ownersList"></div>

</div>

</section>


<!-- TENANTS -->

<section
id="tenants"
class="page"
>

<div class="panel">

<div class="panel-head">

<h2>Locataires</h2>

<button
class="primary"
onclick="openModal('tenantModal')"
>
+ Ajouter
</button>

</div>

<div id="tenantsList"></div>

</div>

</section>


<!-- LEASES -->

<section
id="leases"
class="page"
>

<div class="panel">

<div class="panel-head">

<h2>Baux</h2>

<button
class="primary"
onclick="openModal('leaseModal')"
>
+ Ajouter
</button>

</div>

<div id="leasesList"></div>

</div>

</section>


<!-- PAYMENTS -->

<section
id="payments"
class="page"
>

<div class="panel">

<div class="panel-head">

<h2>Loyers</h2>

<button
class="primary"
onclick="openModal('paymentModal')"
>
+ Ajouter
</button>

</div>

<div id="paymentsList"></div>

</div>

</section>


<!-- NOTIFICATIONS -->

<section
id="notifications"
class="page"
>

<div class="panel">

<div class="panel-head">

<h2>Notifications</h2>

<button
class="secondary"
onclick="readAll()"
>
Tout lire
</button>

</div>

<div id="notificationsList"></div>

</div>

</section>


<!-- MESSAGES -->

<section
id="messages"
class="page"
>

<div class="panel">

<h2>Messages automatiques</h2>

<div id="messagesList"></div>

</div>

</section>

</main>

</div>


<!-- PROPERTY MODAL -->

<div
id="propertyModal"
class="modal"
>

<div class="modal-card">

<h2>Ajouter un bien</h2>

<form id="propertyForm">

<div class="grid">

<div class="field">

<label>Référence</label>

<input
name="reference"
required
>

</div>

<div class="field">

<label>Nom du bien</label>

<input
name="title"
required
>

</div>

<div class="field">

<label>Adresse</label>

<input name="address">

</div>

<div class="field">

<label>Ville</label>

<input name="city">

</div>

<div class="field">

<label>Type</label>

<select name="type">

<option>Appartement</option>
<option>Villa</option>
<option>Studio</option>
<option>Maison</option>
<option>Local commercial</option>

</select>

</div>

<div class="field">

<label>Chambres</label>

<input
name="bedrooms"
type="number"
value="0"
>

</div>

<div class="field">

<label>Loyer</label>

<input
name="rent"
type="number"
value="0"
>

</div>

<div class="field">

<label>Propriétaire</label>

<select
id="ownerSelect"
name="owner_id"
>
</select>

</div>

</div>

<div class="actions">

<button
type="button"
class="secondary"
onclick="closeModals()"
>
Annuler
</button>

<button class="primary">
Enregistrer
</button>

</div>

</form>

</div>

</div>


<!-- OWNER MODAL -->

<div
id="ownerModal"
class="modal"
>

<div class="modal-card">

<h2>Ajouter un propriétaire</h2>

<form id="ownerForm">

<div class="field">

<label>Nom</label>

<input
name="name"
required
>

</div>

<div class="field">

<label>Téléphone</label>

<input name="phone">

</div>

<div class="field">

<label>Email</label>

<input
name="email"
type="email"
>

</div>

<div class="field">

<label>Adresse</label>

<input name="address">

</div>

<div class="actions">

<button
type="button"
class="secondary"
onclick="closeModals()"
>
Annuler
</button>

<button class="primary">
Enregistrer
</button>

</div>

</form>

</div>

</div>


<!-- TENANT MODAL -->

<div
id="tenantModal"
class="modal"
>

<div class="modal-card">

<h2>Ajouter un locataire</h2>

<form id="tenantForm">

<div class="grid">

<div class="field">

<label>Prénom</label>

<input
name="first_name"
required
>

</div>

<div class="field">

<label>Nom</label>

<input
name="last_name"
required
>

</div>

<div class="field">

<label>Téléphone</label>

<input name="phone">

</div>

<div class="field">

<label>Email</label>

<input name="email">

</div>

<div class="field">

<label>Adresse</label>

<input name="address">

</div>

</div>

<div class="actions">

<button
type="button"
class="secondary"
onclick="closeModals()"
>
Annuler
</button>

<button class="primary">
Enregistrer
</button>

</div>

</form>

</div>

</div>


<!-- LEASE MODAL -->

<div
id="leaseModal"
class="modal"
>

<div class="modal-card">

<h2>Créer un bail</h2>

<form id="leaseForm">

<div class="field">

<label>Bien</label>

<select
id="leaseProperty"
name="property_id"
required
>
</select>

</div>

<div class="field">

<label>Locataire</label>

<select
id="leaseTenant"
name="tenant_id"
required
>
</select>

</div>

<div class="grid">

<div class="field">

<label>Date début</label>

<input
name="start_date"
type="date"
required
>

</div>

<div class="field">

<label>Date fin</label>

<input
name="end_date"
type="date"
>

</div>

<div class="field">

<label>Loyer mensuel</label>

<input
name="monthly_rent"
type="number"
required
>

</div>

<div class="field">

<label>Dépôt</label>

<input
name="deposit"
type="number"
value="0"
>

</div>

</div>

<div class="actions">

<button
type="button"
class="secondary"
onclick="closeModals()"
>
Annuler
</button>

<button class="primary">
Créer
</button>

</div>

</form>

</div>

</div>


<!-- PAYMENT MODAL -->

<div
id="paymentModal"
class="modal"
>

<div class="modal-card">

<h2>Ajouter un loyer</h2>

<form id="paymentForm">

<div class="field">

<label>Bail</label>

<select
id="paymentLease"
name="lease_id"
required
>
</select>

</div>

<div class="field">

<label>Montant</label>

<input
name="amount"
type="number"
required
>

</div>

<div class="field">

<label>Date d'échéance</label>

<input
name="due_date"
type="date"
required
>

</div>

<div class="field">

<label>Moyen de paiement</label>

<select name="payment_method">

<option value="">Non renseigné</option>
<option>Espèces</option>
<option>Wave</option>
<option>Orange Money</option>
<option>Virement</option>

</select>

</div>

<div class="actions">

<button
type="button"
class="secondary"
onclick="closeModals()"
>
Annuler
</button>

<button class="primary">
Enregistrer
</button>

</div>

</form>

</div>

</div>


<div
id="toast"
class="toast"
></div>


<script>

const titles={
dashboard:"Tableau de bord",
properties:"Biens",
owners:"Propriétaires",
tenants:"Locataires",
leases:"Baux",
payments:"Loyers",
notifications:"Notifications",
messages:"Messages"
};


async function api(url,options={}){

const response=await fetch(url,{
...options,
headers:{
"Content-Type":"application/json",
...(options.headers||{})
}
});

const data=await response.json();

if(!response.ok){

throw new Error(
data.error || "Une erreur est survenue."
);

}

return data;
}


function toast(message){

const el=document.getElementById("toast");

el.textContent=message;

el.style.display="block";

setTimeout(()=>{
el.style.display="none";
},3000);

}


function showRegister(){

document
.getElementById("login")
.classList.add("hidden");

document
.getElementById("register")
.classList.remove("hidden");

}


function showLogin(){

document
.getElementById("register")
.classList.add("hidden");

document
.getElementById("login")
.classList.remove("hidden");

}


function showApp(user){

document
.getElementById("auth")
.classList.add("hidden");

document
.getElementById("app")
.classList.remove("hidden");

document
.getElementById("agencyName")
.textContent =
user.agency_name +
" — " +
user.name;

refreshAll();

}


function showAuth(){

document
.getElementById("app")
.classList.add("hidden");

document
.getElementById("auth")
.classList.remove("hidden");

}


async function checkSession(){

try{

const data=await api("/api/me");

if(data.user){

showApp(data.user);

}else{

showAuth();

}

}catch{

showAuth();

}

}


document
.getElementById("registerForm")
.addEventListener(
"submit",
async event=>{

event.preventDefault();

try{

const data=await api(
"/api/register",
{
method:"POST",
body:JSON.stringify({
agency_name:
document.getElementById("agency").value,

name:
document.getElementById("name").value,

email:
document.getElementById("email").value,

password:
document.getElementById("password").value
})
}
);

showApp(data.user);

toast("Compte créé.");

}catch(error){

toast(error.message);

}

});


document
.getElementById("loginForm")
.addEventListener(
"submit",
async event=>{

event.preventDefault();

try{

const data=await api(
"/api/login",
{
method:"POST",
body:JSON.stringify({

email:
document.getElementById("loginEmail").value,

password:
document.getElementById("loginPassword").value

})
}
);

showApp(data.user);

toast("Connexion réussie.");

}catch(error){

toast(error.message);

}

});


async function logout(){

try{

await api(
"/api/logout",
{
method:"POST"
}
);

}catch{}

showAuth();
showLogin();

}


function page(name,button){

document
.querySelectorAll(".page")
.forEach(x=>{
x.classList.remove("active");
});

document
.getElementById(name)
.classList.add("active");

document
.querySelectorAll(".nav button")
.forEach(x=>{
x.classList.remove("active");
});

if(button){

button.classList.add("active");

}

document
.getElementById("pageTitle")
.textContent=titles[name];

if(name==="properties")loadProperties();
if(name==="owners")loadOwners();
if(name==="tenants")loadTenants();
if(name==="leases")loadLeases();
if(name==="payments")loadPayments();
if(name==="notifications")loadNotifications();
if(name==="messages")loadMessages();

}


async function refreshAll(){

try{

const d=await api("/api/dashboard");

document
.getElementById("propertiesCount")
.textContent=d.properties;

document
.getElementById("occupiedCount")
.textContent=d.occupied;

document
.getElementById("tenantsCount")
.textContent=d.tenants;

document
.getElementById("lateCount")
.textContent=
Number(d.late||0)
.toLocaleString("fr-FR")+" FCFA";

document
.getElementById("notificationBadge")
.textContent=d.unread;

}catch(error){

console.error(error);

}

}


async function loadProperties(){

const data=await api(
"/api/properties"
);

if(!data.length){

document
.getElementById("propertiesList")
.innerHTML=
"<p>Aucun bien enregistré.</p>";

return;

}

document
.getElementById("propertiesList")
.innerHTML=`

<table>

<thead>

<tr>
<th>Référence</th>
<th>Bien</th>
<th>Propriétaire</th>
<th>Type</th>
<th>Loyer</th>
<th>Statut</th>
</tr>

</thead>

<tbody>

${data.map(p=>`

<tr>

<td>${escapeHtml(p.reference)}</td>

<td>${escapeHtml(p.title)}</td>

<td>${escapeHtml(p.owner_name||"—")}</td>

<td>${escapeHtml(p.type||"")}</td>

<td>
${Number(p.rent||0).toLocaleString("fr-FR")} FCFA
</td>

<td>${escapeHtml(p.status)}</td>

</tr>

`).join("")}

</tbody>

</table>
`;

}


async function loadOwners(){

const data=await api("/api/owners");

document
.getElementById("ownersList")
.innerHTML=data.length?`

<table>

<thead>

<tr>
<th>Nom</th>
<th>Téléphone</th>
<th>Email</th>
</tr>

</thead>

<tbody>

${data.map(x=>`

<tr>
<td>${escapeHtml(x.name)}</td>
<td>${escapeHtml(x.phone)}</td>
<td>${escapeHtml(x.email)}</td>
</tr>

`).join("")}

</tbody>

</table>

`:"<p>Aucun propriétaire.</p>";

}


async function loadTenants(){

const data=await api("/api/tenants");

document
.getElementById("tenantsList")
.innerHTML=data.length?`

<table>

<thead>

<tr>
<th>Nom</th>
<th>Téléphone</th>
<th>Email</th>
</tr>

</thead>

<tbody>

${data.map(x=>`

<tr>

<td>
${escapeHtml(x.first_name)}
${escapeHtml(x.last_name)}
</td>

<td>${escapeHtml(x.phone)}</td>

<td>${escapeHtml(x.email)}</td>

</tr>

`).join("")}

</tbody>

</table>

`:"<p>Aucun locataire.</p>";

}


async function loadLeases(){

const data=await api("/api/leases");

document
.getElementById("leasesList")
.innerHTML=data.length?`

<table>

<thead>

<tr>
<th>Bien</th>
<th>Locataire</th>
<th>Début</th>
<th>Loyer</th>
<th>Statut</th>
</tr>

</thead>

<tbody>

${data.map(x=>`

<tr>

<td>${escapeHtml(x.reference)}</td>

<td>
${escapeHtml(x.first_name)}
${escapeHtml(x.last_name)}
</td>

<td>${escapeHtml(x.start_date)}</td>

<td>
${Number(x.monthly_rent||0)
.toLocaleString("fr-FR")} FCFA
</td>

<td>${escapeHtml(x.status)}</td>

</tr>

`).join("")}

</tbody>

</table>

`:"<p>Aucun bail.</p>";

}


async function loadPayments(){

const data=await api("/api/payments");

document
.getElementById("paymentsList")
.innerHTML=data.length?`

<table>

<thead>

<tr>
<th>Locataire</th>
<th>Bien</th>
<th>Montant</th>
<th>Échéance</th>
<th>Statut</th>
<th>Action</th>
</tr>

</thead>

<tbody>

${data.map(x=>`

<tr>

<td>
${escapeHtml(x.first_name)}
${escapeHtml(x.last_name)}
</td>

<td>${escapeHtml(x.reference)}</td>

<td>
${Number(x.amount||0)
.toLocaleString("fr-FR")} FCFA
</td>

<td>${escapeHtml(x.due_date)}</td>

<td>${escapeHtml(x.status)}</td>

<td>

${
x.status!=="paid"
?
`<button
class="primary"
onclick="markPaid(${x.id})"
>
Payé
</button>`
:""
}

</td>

</tr>

`).join("")}

</tbody>

</table>

`:"<p>Aucun loyer.</p>";

}


async function loadNotifications(){

const data=
await api("/api/notifications");

document
.getElementById("notificationsList")
.innerHTML=data.length?
data.map(x=>`

<div
class="notification
${x.is_read?"":"unread"}"
onclick="readNotification(${x.id})"
>

<strong>
${escapeHtml(x.title)}
</strong>

<p>
${escapeHtml(x.message)}
</p>

<small>
${escapeHtml(x.created_at)}
</small>

</div>

`).join("")
:
"<p>Aucune notification.</p>";

}


async function loadMessages(){

const data=
await api("/api/messages");

document
.getElementById("messagesList")
.innerHTML=data.length?
data.map(x=>`

<div class="notification">

<strong>
${escapeHtml(x.title)}
</strong>

<p>
${escapeHtml(x.message)}
</p>

</div>

`).join("")
:
"<p>Aucun message automatique.</p>";

}


async function readNotification(id){

await api(
"/api/notifications/"+id+"/read",
{
method:"POST"
}
);

loadNotifications();
refreshAll();

}


async function readAll(){

await api(
"/api/notifications/read-all",
{
method:"POST"
}
);

loadNotifications();
refreshAll();

}


async function markPaid(id){

await api(
"/api/payments/"+id+"/paid",
{
method:"POST"
}
);

toast("Paiement enregistré.");

loadPayments();
refreshAll();

}


async function loadOwnerOptions(){

const data=
await api("/api/owners");

document
.getElementById("ownerSelect")
.innerHTML=
'<option value="">Aucun</option>'+
data.map(x=>
`
<option value="${x.id}">
${escapeHtml(x.name)}
</option>
`
).join("");

}


async function loadLeaseOptions(){

const properties=
await api("/api/properties");

const tenants=
await api("/api/tenants");

document
.getElementById("leaseProperty")
.innerHTML=
properties
.filter(x=>x.status!=="occupied")
.map(x=>
`
<option value="${x.id}">
${escapeHtml(x.reference)}
-
${escapeHtml(x.title)}
</option>
`
)
.join("");

document
.getElementById("leaseTenant")
.innerHTML=
tenants
.map(x=>
`
<option value="${x.id}">
${escapeHtml(x.first_name)}
${escapeHtml(x.last_name)}
</option>
`
)
.join("");

}


async function loadPaymentOptions(){

const leases=
await api("/api/leases");

document
.getElementById("paymentLease")
.innerHTML=
leases
.filter(x=>x.status==="active")
.map(x=>
`
<option value="${x.id}">
${escapeHtml(x.reference)}
-
${escapeHtml(x.first_name)}
${escapeHtml(x.last_name)}
</option>
`
)
.join("");

}


function openModal(id){

document
.getElementById(id)
.classList.add("show");

if(id==="propertyModal"){
loadOwnerOptions();
}

if(id==="leaseModal"){
loadLeaseOptions();
}

if(id==="paymentModal"){
loadPaymentOptions();
}

}


function closeModals(){

document
.querySelectorAll(".modal")
.forEach(x=>{
x.classList.remove("show");
});

}


function escapeHtml(value){

return String(value ?? "")
.replaceAll("&","&amp;")
.replaceAll("<","&lt;")
.replaceAll(">","&gt;")
.replaceAll('"',"&quot;")
.replaceAll("'","&#039;");

}


/* =========================================================
   FORMS
========================================================= */


document
.getElementById("ownerForm")
.addEventListener(
"submit",
async event=>{

event.preventDefault();

const data=
Object.fromEntries(
new FormData(event.target)
);

try{

await api(
"/api/owners",
{
method:"POST",
body:JSON.stringify(data)
}
);

closeModals();

event.target.reset();

toast("Propriétaire ajouté.");

loadOwners();

}catch(error){

toast(error.message);

}

});


document
.getElementById("propertyForm")
.addEventListener(
"submit",
async event=>{

event.preventDefault();

const data=
Object.fromEntries(
new FormData(event.target)
);

try{

await api(
"/api/properties",
{
method:"POST",
body:JSON.stringify(data)
}
);

closeModals();

event.target.reset();

toast("Bien ajouté.");

loadProperties();
refreshAll();

}catch(error){

toast(error.message);

}

});


document
.getElementById("tenantForm")
.addEventListener(
"submit",
async event=>{

event.preventDefault();

const data=
Object.fromEntries(
new FormData(event.target)
);

try{

await api(
"/api/tenants",
{
method:"POST",
body:JSON.stringify(data)
}
);

closeModals();

event.target.reset();

toast("Locataire ajouté.");

loadTenants();
refreshAll();

}catch(error){

toast(error.message);

}

});


document
.getElementById("leaseForm")
.addEventListener(
"submit",
async event=>{

event.preventDefault();

const data=
Object.fromEntries(
new FormData(event.target)
);

try{

await api(
"/api/leases",
{
method:"POST",
body:JSON.stringify(data)
}
);

closeModals();

event.target.reset();

toast("Bail créé.");

loadLeases();
loadProperties();
refreshAll();

}catch(error){

toast(error.message);

}

});


document
.getElementById("paymentForm")
.addEventListener(
"submit",
async event=>{

event.preventDefault();

const data=
Object.fromEntries(
new FormData(event.target)
);

try{

await api(
"/api/payments",
{
method:"POST",
body:JSON.stringify(data)
}
);

closeModals();

event.target.reset();

toast("Loyer enregistré.");

loadPayments();

}catch(error){

toast(error.message);

}

});


checkSession();

</script>

</body>

</html>

`;
