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
          AND tenants.user_id = payments.user_id
        JOIN properties
          ON properties.id = leases.property_id
          AND properties.user_id = payments.user_id
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
async function loadOwners() {
  const data = await api("/api/owners");

  document.getElementById("ownersList").innerHTML = data.length
    ? `
      <table>
        <thead>
          <tr>
            <th>Nom</th>
            <th>Téléphone</th>
            <th>Email</th>
            <th>Adresse</th>
          </tr>
        </thead>
        <tbody>
          ${data.map(x => `
            <tr>
              <td>${escapeHtml(x.name)}</td>
              <td>${escapeHtml(x.phone)}</td>
              <td>${escapeHtml(x.email)}</td>
              <td>${escapeHtml(x.address)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `
    : "<p>Aucun propriétaire.</p>";
}


async function loadTenants() {
  const data = await api("/api/tenants");

  document.getElementById("tenantsList").innerHTML = data.length
    ? `
      <table>
        <thead>
          <tr>
            <th>Nom</th>
            <th>Téléphone</th>
            <th>Email</th>
            <th>Adresse</th>
          </tr>
        </thead>
        <tbody>
          ${data.map(x => `
            <tr>
              <td>
                ${escapeHtml(x.first_name)}
                ${escapeHtml(x.last_name)}
              </td>
              <td>${escapeHtml(x.phone)}</td>
              <td>${escapeHtml(x.email)}</td>
              <td>${escapeHtml(x.address)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `
    : "<p>Aucun locataire.</p>";
}


async function loadLeases() {
  const data = await api("/api/leases");

  document.getElementById("leasesList").innerHTML = data.length
    ? `
      <table>
        <thead>
          <tr>
            <th>Bien</th>
            <th>Locataire</th>
            <th>Début</th>
            <th>Fin</th>
            <th>Loyer</th>
            <th>Statut</th>
          </tr>
        </thead>
        <tbody>
          ${data.map(x => `
            <tr>
              <td>
                ${escapeHtml(x.reference)}
                - ${escapeHtml(x.property_title)}
              </td>

              <td>
                ${escapeHtml(x.first_name)}
                ${escapeHtml(x.last_name)}
              </td>

              <td>${escapeHtml(x.start_date)}</td>
              <td>${escapeHtml(x.end_date || "—")}</td>

              <td>
                ${Number(x.monthly_rent || 0)
                  .toLocaleString("fr-FR")} FCFA
              </td>

              <td>${escapeHtml(x.status)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `
    : "<p>Aucun bail.</p>";
}


async function loadPayments() {
  const data = await api("/api/payments");

  document.getElementById("paymentsList").innerHTML = data.length
    ? `
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
          ${data.map(x => `
            <tr>
              <td>
                ${escapeHtml(x.first_name)}
                ${escapeHtml(x.last_name)}
              </td>

              <td>${escapeHtml(x.reference)}</td>

              <td>
                ${Number(x.amount || 0)
                  .toLocaleString("fr-FR")} FCFA
              </td>

              <td>${escapeHtml(x.due_date)}</td>

              <td>
                ${escapeHtml(x.status)}
              </td>

              <td>
                ${
                  x.status !== "paid"
                    ? `
                      <button
                        class="primary"
                        onclick="markPaid(${Number(x.id)})"
                      >
                        Payé
                      </button>
                    `
                    : "✓"
                }
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `
    : "<p>Aucun loyer.</p>";
}


async function loadNotifications() {
  const data = await api("/api/notifications");

  document.getElementById("notificationsList").innerHTML =
    data.length
      ? data.map(x => `
          <div
            class="notification ${x.is_read ? "" : "unread"}"
            onclick="readNotification(${Number(x.id)})"
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
      : "<p>Aucune notification.</p>";
}


async function loadMessages() {
  const data = await api("/api/messages");

  document.getElementById("messagesList").innerHTML =
    data.length
      ? data.map(x => `
          <div class="notification">
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
      : "<p>Aucun message automatique.</p>";
}


async function readNotification(id) {
  try {
    await api(
      "/api/notifications/" + Number(id) + "/read",
      {
        method: "POST"
      }
    );

    await loadNotifications();
    await refreshAll();

  } catch (error) {
    toast(error.message);
  }
}


async function readAll() {
  try {
    await api(
      "/api/notifications/read-all",
      {
        method: "POST"
      }
    );

    await loadNotifications();
    await refreshAll();

  } catch (error) {
    toast(error.message);
  }
}


async function markPaid(id) {
  try {
    await api(
      "/api/payments/" + Number(id) + "/paid",
      {
        method: "POST"
      }
    );

    toast("Paiement enregistré.");

    await loadPayments();
    await refreshAll();

  } catch (error) {
    toast(error.message);
  }
}


async function loadOwnerOptions() {
  const data = await api("/api/owners");

  const select =
    document.getElementById("ownerSelect");

  select.innerHTML =
    '<option value="">Aucun</option>' +
    data.map(x => `
      <option value="${Number(x.id)}">
        ${escapeHtml(x.name)}
      </option>
    `).join("");
}


async function loadLeaseOptions() {
  const properties =
    await api("/api/properties");

  const tenants =
    await api("/api/tenants");

  const propertySelect =
    document.getElementById("leaseProperty");

  const tenantSelect =
    document.getElementById("leaseTenant");

  const availableProperties =
    properties.filter(
      x => x.status !== "occupied"
    );

  propertySelect.innerHTML =
    availableProperties.length
      ? availableProperties.map(x => `
          <option value="${Number(x.id)}">
            ${escapeHtml(x.reference)}
            - ${escapeHtml(x.title)}
          </option>
        `).join("")
      : '<option value="">Aucun bien disponible</option>';

  tenantSelect.innerHTML =
    tenants.length
      ? tenants.map(x => `
          <option value="${Number(x.id)}">
            ${escapeHtml(x.first_name)}
            ${escapeHtml(x.last_name)}
          </option>
        `).join("")
      : '<option value="">Aucun locataire</option>';
}


async function loadPaymentOptions() {
  const leases =
    await api("/api/leases");

  const select =
    document.getElementById("paymentLease");

  const activeLeases =
    leases.filter(
      x => x.status === "active"
    );

  select.innerHTML =
    activeLeases.length
      ? activeLeases.map(x => `
          <option value="${Number(x.id)}">
            ${escapeHtml(x.reference)}
            -
            ${escapeHtml(x.first_name)}
            ${escapeHtml(x.last_name)}
          </option>
        `).join("")
      : '<option value="">Aucun bail actif</option>';
}


function openModal(id) {
  const modal =
    document.getElementById(id);

  if (!modal) {
    return;
  }

  modal.classList.add("show");

  if (id === "propertyModal") {
    loadOwnerOptions()
      .catch(error => toast(error.message));
  }

  if (id === "leaseModal") {
    loadLeaseOptions()
      .catch(error => toast(error.message));
  }

  if (id === "paymentModal") {
    loadPaymentOptions()
      .catch(error => toast(error.message));
  }
}


function closeModals() {
  document
    .querySelectorAll(".modal")
    .forEach(modal => {
      modal.classList.remove("show");
    });
}


function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


/* =========================================================
   FORMS
========================================================= */


document
  .getElementById("ownerForm")
  .addEventListener("submit", async event => {

    event.preventDefault();

    const data =
      Object.fromEntries(
        new FormData(event.target)
      );

    try {

      await api(
        "/api/owners",
        {
          method: "POST",
          body: JSON.stringify(data)
        }
      );

      closeModals();
      event.target.reset();

      toast("Propriétaire ajouté.");

      await loadOwners();

    } catch (error) {

      toast(error.message);

    }
  });


document
  .getElementById("propertyForm")
  .addEventListener("submit", async event => {

    event.preventDefault();

    const data =
      Object.fromEntries(
        new FormData(event.target)
      );

    try {

      await api(
        "/api/properties",
        {
          method: "POST",
          body: JSON.stringify(data)
        }
      );

      closeModals();
      event.target.reset();

      toast("Bien ajouté.");

      await loadProperties();
      await refreshAll();

    } catch (error) {

      toast(error.message);

    }
  });


document
  .getElementById("tenantForm")
  .addEventListener("submit", async event => {

    event.preventDefault();

    const data =
      Object.fromEntries(
        new FormData(event.target)
      );

    try {

      await api(
        "/api/tenants",
        {
          method: "POST",
          body: JSON.stringify(data)
        }
      );

      closeModals();
      event.target.reset();

      toast("Locataire ajouté.");

      await loadTenants();
      await refreshAll();

    } catch (error) {

      toast(error.message);

    }
  });


document
  .getElementById("leaseForm")
  .addEventListener("submit", async event => {

    event.preventDefault();

    const data =
      Object.fromEntries(
        new FormData(event.target)
      );

    try {

      await api(
        "/api/leases",
        {
          method: "POST",
          body: JSON.stringify(data)
        }
      );

      closeModals();
      event.target.reset();

      toast("Bail créé.");

      await loadLeases();
      await loadProperties();
      await refreshAll();

    } catch (error) {

      toast(error.message);

    }
  });


document
  .getElementById("paymentForm")
  .addEventListener("submit", async event => {

    event.preventDefault();

    const data =
      Object.fromEntries(
        new FormData(event.target)
      );

    try {

      await api(
        "/api/payments",
        {
          method: "POST",
          body: JSON.stringify(data)
        }
      );

      closeModals();
      event.target.reset();

      toast("Loyer enregistré.");

      await loadPayments();
      await refreshAll();

    } catch (error) {

      toast(error.message);

    }
  });


/* =========================================================
   MODAL CLICK OUTSIDE
========================================================= */

document
  .querySelectorAll(".modal")
  .forEach(modal => {

    modal.addEventListener("click", event => {

      if (event.target === modal) {
        modal.classList.remove("show");
      }

    });

  });


/* =========================================================
   INITIALISATION
========================================================= */

checkSession();

</script>

</body>
</html>
`;
