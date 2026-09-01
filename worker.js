

export default {
  async fetch(request, env) {
    try {
      if (!env.DB) {
        return json(
          {
            error:
              "La base de données D1 n'est pas configurée. Vérifiez le binding DB dans Cloudflare."
          },
          500
        );
      }

      await initDatabase(env.DB);

      const url = new URL(request.url);

      if (url.pathname.startsWith("/api/")) {
        return await api(request, env, url);
      }

      return new Response(APP_HTML, {
        status: 200,
        headers: {
          "content-type": "text/html; charset=UTF-8",
          "cache-control": "no-store"
        }
      });
    } catch (error) {
      console.error(error);

      return json(
        {
          error: "Erreur serveur",
          details: error instanceof Error ? error.message : String(error)
        },
        500
      );
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

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_sessions_token
    ON sessions(token)
  `).run();

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_properties_user
    ON properties(user_id)
  `).run();

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_tenants_user
    ON tenants(user_id)
  `).run();

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_payments_user
    ON payments(user_id)
  `).run();

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_notifications_user
    ON notifications(user_id)
  `).run();
}


/* =========================================================
   HELPERS
========================================================= */

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      ...headers
    }
  });
}


function cleanString(value) {
  return String(value ?? "").trim();
}


function toPositiveInteger(value, fallback = 0) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    return fallback;
  }

  return Math.floor(number);
}


function today() {
  return new Date().toISOString().slice(0, 10);
}


function randomToken() {
  return crypto.randomUUID() + "-" + crypto.randomUUID();
}


/* =========================================================
   PASSWORD HASH
========================================================= */

async function hashPassword(password) {

  const data = new TextEncoder().encode(password);

  const hash = await crypto.subtle.digest(
    "SHA-256",
    data
  );

  return Array.from(new Uint8Array(hash))
    .map(function (x) {
      return x.toString(16).padStart(2, "0");
    })
    .join("");
}


/* =========================================================
   COOKIE
========================================================= */

function getCookie(request, name) {

  const cookies =
    request.headers.get("Cookie") || "";

  const parts = cookies.split(";");

  for (const part of parts) {

    const index = part.indexOf("=");

    if (index === -1) {
      continue;
    }

    const key =
      part.slice(0, index).trim();

    const value =
      part.slice(index + 1).trim();

    if (key === name) {
      return value;
    }
  }

  return null;
}


function sessionCookie(token) {

  return (
    "immoflow_session=" +
    token +
    "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800"
  );
}


function deleteSessionCookie() {

  return (
    "immoflow_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
  );
}


/* =========================================================
   USER
========================================================= */

async function getUser(request, db) {

  const token =
    getCookie(request, "immoflow_session");

  if (!token) {
    return null;
  }

  const session =
    await db.prepare(`
      SELECT
        users.id,
        users.agency_name,
        users.name,
        users.email
      FROM sessions
      INNER JOIN users
        ON users.id = sessions.user_id
      WHERE sessions.token = ?
        AND datetime(sessions.expires_at) > datetime('now')
      LIMIT 1
    `)
    .bind(token)
    .first();

  return session || null;
}


/* =========================================================
   SAFE REQUEST JSON
========================================================= */

async function readJson(request) {

  try {
    return await request.json();
  } catch {
    return null;
  }
}


/* =========================================================
   API
========================================================= */

async function api(request, env, url) {

  const db = env.DB;

  const path = url.pathname;
  const method = request.method.toUpperCase();


  /* =======================================================
     REGISTER
  ======================================================= */

  if (
    path === "/api/register" &&
    method === "POST"
  ) {

    const data = await readJson(request);

    if (!data) {
      return json(
        { error: "Données invalides." },
        400
      );
    }

    const agency =
      cleanString(data.agency_name);

    const name =
      cleanString(data.name);

    const email =
      cleanString(data.email).toLowerCase();

    const password =
      String(data.password || "");

    if (!agency || !name || !email || !password) {
      return json(
        {
          error:
            "Tous les champs sont obligatoires."
        },
        400
      );
    }

    if (password.length < 6) {
      return json(
        {
          error:
            "Le mot de passe doit contenir au moins 6 caractères."
        },
        400
      );
    }

    const existing =
      await db.prepare(`
        SELECT id
        FROM users
        WHERE email = ?
        LIMIT 1
      `)
      .bind(email)
      .first();

    if (existing) {
      return json(
        {
          error:
            "Un compte existe déjà avec cet email."
        },
        409
      );
    }

    const passwordHash =
      await hashPassword(password);

    const result =
      await db.prepare(`
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

    return json(
      {
        success: true,
        user: {
          id: userId,
          agency_name: agency,
          name: name,
          email: email
        }
      },
      201,
      {
        "Set-Cookie":
          sessionCookie(token)
      }
    );
  }


  /* =======================================================
     LOGIN
  ======================================================= */

  if (
    path === "/api/login" &&
    method === "POST"
  ) {

    const data = await readJson(request);

    if (!data) {
      return json(
        { error: "Données invalides." },
        400
      );
    }

    const email =
      cleanString(data.email).toLowerCase();

    const password =
      String(data.password || "");

    if (!email || !password) {
      return json(
        {
          error:
            "Email et mot de passe obligatoires."
        },
        400
      );
    }

    const user =
      await db.prepare(`
        SELECT *
        FROM users
        WHERE email = ?
        LIMIT 1
      `)
      .bind(email)
      .first();

    if (!user) {
      return json(
        {
          error:
            "Email ou mot de passe incorrect."
        },
        401
      );
    }

    const passwordHash =
      await hashPassword(password);

    if (
      passwordHash !==
      user.password_hash
    ) {
      return json(
        {
          error:
            "Email ou mot de passe incorrect."
        },
        401
      );
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

    return json(
      {
        success: true,
        user: {
          id: user.id,
          agency_name: user.agency_name,
          name: user.name,
          email: user.email
        }
      },
      200,
      {
        "Set-Cookie":
          sessionCookie(token)
      }
    );
  }


  /* =======================================================
     ME
  ======================================================= */

  if (path === "/api/me") {

    const user =
      await getUser(request, db);

    return json({
      user: user || null
    });
  }


  /* =======================================================
     LOGOUT
  ======================================================= */

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

    return json(
      {
        success: true
      },
      200,
      {
        "Set-Cookie":
          deleteSessionCookie()
      }
    );
  }


  /* =======================================================
     AUTH REQUIRED
  ======================================================= */

  const user =
    await getUser(request, db);

  if (!user) {
    return json(
      {
        error:
          "Vous devez être connecté."
      },
      401
    );
  }

  const uid = user.id;


  /* =======================================================
     DASHBOARD
  ======================================================= */

  if (
    path === "/api/dashboard" &&
    method === "GET"
  ) {

    await updateLatePayments(
      db,
      uid
    );

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
        SELECT COALESCE(SUM(amount), 0) AS total
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

    const paid =
      await db.prepare(`
        SELECT COALESCE(SUM(amount), 0) AS total
        FROM payments
        WHERE user_id = ?
          AND status = 'paid'
      `)
      .bind(uid)
      .first();

    return json({
      properties: Number(properties?.count || 0),
      tenants: Number(tenants?.count || 0),
      occupied: Number(occupied?.count || 0),
      late: Number(late?.total || 0),
      paid: Number(paid?.total || 0),
      unread: Number(unread?.count || 0)
    });
  }


  /* =======================================================
     OWNERS
  ======================================================= */

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
        await readJson(request);

      if (!data) {
        return json(
          {
            error: "Données invalides."
          },
          400
        );
      }

      const name =
        cleanString(data.name);

      if (!name) {
        return json(
          {
            error:
              "Le nom est obligatoire."
          },
          400
        );
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
          name,
          cleanString(data.phone),
          cleanString(data.email),
          cleanString(data.address)
        )
        .run();

      return json(
        {
          success: true,
          id: result.meta.last_row_id
        },
        201
      );
    }
  }


  /* =======================================================
     PROPERTIES
  ======================================================= */

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
        await readJson(request);

      if (!data) {
        return json(
          {
            error:
              "Données invalides."
          },
          400
        );
      }

      const reference =
        cleanString(data.reference);

      const title =
        cleanString(data.title);

      if (!reference || !title) {
        return json(
          {
            error:
              "Référence et nom du bien obligatoires."
          },
          400
        );
      }

      let ownerId = null;

      if (
        data.owner_id !== undefined &&
        data.owner_id !== null &&
        String(data.owner_id) !== ""
      ) {

        ownerId =
          toPositiveInteger(
            data.owner_id,
            0
          );

        const owner =
          await db.prepare(`
            SELECT id
            FROM owners
            WHERE id = ?
              AND user_id = ?
          `)
          .bind(
            ownerId,
            uid
          )
          .first();

        if (!owner) {
          return json(
            {
              error:
                "Propriétaire invalide."
            },
            400
          );
        }
      }

      const bedrooms =
        toPositiveInteger(
          data.bedrooms,
          0
        );

      const rent =
        toPositiveInteger(
          data.rent,
          0
        );

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
          ownerId,
          reference,
          title,
          cleanString(data.address),
          cleanString(data.city),
          cleanString(data.type) ||
            "Appartement",
          bedrooms,
          rent
        )
        .run();

      await createNotification(
        db,
        uid,
        "Nouveau bien",
        title +
          " a été ajouté à votre portefeuille.",
        "property"
      );

      return json(
        {
          success: true,
          id: result.meta.last_row_id
        },
        201
      );
    }
  }


  /* =======================================================
     TENANTS
  ======================================================= */

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
        await readJson(request);

      if (!data) {
        return json(
          {
            error:
              "Données invalides."
          },
          400
        );
      }

      const firstName =
        cleanString(data.first_name);

      const lastName =
        cleanString(data.last_name);

      if (!firstName || !lastName) {
        return json(
          {
            error:
              "Prénom et nom obligatoires."
          },
          400
        );
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
          firstName,
          lastName,
          cleanString(data.phone),
          cleanString(data.email),
          cleanString(data.address)
        )
        .run();

      await createNotification(
        db,
        uid,
        "Nouveau locataire",
        firstName +
          " " +
          lastName +
          " a été ajouté.",
        "tenant"
      );

      return json(
        {
          success: true,
          id: result.meta.last_row_id
        },
        201
      );
    }
  }


  /* =======================================================
     LEASES
  ======================================================= */

  if (path === "/api/leases") {

    if (method === "GET") {

      const result =
        await db.prepare(`
          SELECT
            leases.*,
            properties.reference,
            properties.title AS property_title,
            tenants.first_name,
            tenants.last_name
          FROM leases
          INNER JOIN properties
            ON properties.id = leases.property_id
            AND properties.user_id = leases.user_id
          INNER JOIN tenants
            ON tenants.id = leases.tenant_id
            AND tenants.user_id = leases.user_id
          WHERE leases.user_id = ?
          ORDER BY leases.id DESC
        `)
        .bind(uid)
        .all();

      return json(
        result.results || []
      );
    }

    if (method === "POST") {

      const data =
        await readJson(request);

      if (!data) {
        return json(
          {
            error:
              "Données invalides."
          },
          400
        );
      }

      const propertyId =
        toPositiveInteger(
          data.property_id,
          0
        );

      const tenantId =
        toPositiveInteger(
          data.tenant_id,
          0
        );

      const startDate =
        cleanString(data.start_date);

      const monthlyRent =
        toPositiveInteger(
          data.monthly_rent,
          0
        );

      if (
        !propertyId ||
        !tenantId ||
        !startDate ||
        !monthlyRent
      ) {
        return json(
          {
            error:
              "Informations du bail incomplètes."
          },
          400
        );
      }

      const property =
        await db.prepare(`
          SELECT id, status
          FROM properties
          WHERE id = ?
            AND user_id = ?
          LIMIT 1
        `)
        .bind(
          propertyId,
          uid
        )
        .first();

      if (!property) {
        return json(
          {
            error:
              "Bien introuvable."
          },
          404
        );
      }

      if (property.status === "occupied") {
        return json(
          {
            error:
              "Ce bien est déjà occupé."
          },
          409
        );
      }

      const tenant =
        await db.prepare(`
          SELECT id
          FROM tenants
          WHERE id = ?
            AND user_id = ?
          LIMIT 1
        `)
        .bind(
          tenantId,
          uid
        )
        .first();

      if (!tenant) {
        return json(
          {
            error:
              "Locataire introuvable."
          },
          404
        );
      }

      const result =
        await db.prepare(`
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
          propertyId,
          tenantId,
          startDate,
          cleanString(data.end_date) ||
            null,
          monthlyRent,
          toPositiveInteger(
            data.deposit,
            0
          )
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

      return json(
        {
          success: true,
          id: result.meta.last_row_id
        },
        201
      );
    }
  }


  /* =======================================================
     PAYMENTS
  ======================================================= */

  if (path === "/api/payments") {

    if (method === "GET") {

      await updateLatePayments(
        db,
        uid
      );

      const result =
        await db.prepare(`
          SELECT
            payments.*,
            tenants.first_name,
            tenants.last_name,
            properties.reference
          FROM payments
          INNER JOIN leases
            ON leases.id = payments.lease_id
            AND leases.user_id = payments.user_id
          INNER JOIN tenants
            ON tenants.id = leases.tenant_id
            AND tenants.user_id = payments.user_id
          INNER JOIN properties
            ON properties.id = leases.property_id
            AND properties.user_id = payments.user_id
          WHERE payments.user_id = ?
          ORDER BY payments.due_date DESC,
                   payments.id DESC
        `)
        .bind(uid)
        .all();

      return json(
        result.results || []
      );
    }

    if (method === "POST") {

      const data =
        await readJson(request);

      if (!data) {
        return json(
          {
            error:
              "Données invalides."
          },
          400
        );
      }

      const leaseId =
        toPositiveInteger(
          data.lease_id,
          0
        );

      const amount =
        toPositiveInteger(
          data.amount,
          0
        );

      const dueDate =
        cleanString(data.due_date);

      if (
        !leaseId ||
        !amount ||
        !dueDate
      ) {
        return json(
          {
            error:
              "Informations du loyer incomplètes."
          },
          400
        );
      }

      const lease =
        await db.prepare(`
          SELECT id
          FROM leases
          WHERE id = ?
            AND user_id = ?
          LIMIT 1
        `)
        .bind(
          leaseId,
          uid
        )
        .first();

      if (!lease) {
        return json(
          {
            error:
              "Bail introuvable."
          },
          404
        );
      }

      const result =
        await db.prepare(`
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
          leaseId,
          amount,
          dueDate,
          cleanString(
            data.payment_method
          )
        )
        .run();

      return json(
        {
          success: true,
          id: result.meta.last_row_id
        },
        201
      );
    }
  }


  /* =======================================================
     MARK PAYMENT PAID
  ======================================================= */

  const paidMatch =
    path.match(
      /^\/api\/payments\/(\d+)\/paid$/
    );

  if (
    paidMatch &&
    method === "POST"
  ) {

    const paymentId =
      Number(paidMatch[1]);

    const payment =
      await db.prepare(`
        SELECT id
        FROM payments
        WHERE id = ?
          AND user_id = ?
        LIMIT 1
      `)
      .bind(
        paymentId,
        uid
      )
      .first();

    if (!payment) {
      return json(
        {
          error:
            "Paiement introuvable."
        },
        404
      );
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

  if (
    path === "/api/notifications" &&
    method === "GET"
  ) {

    await updateLatePayments(
      db,
      uid
    );

    const result =
      await db.prepare(`
        SELECT *
        FROM notifications
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT 100
      `)
      .bind(uid)
      .all();

    return json(
      result.results || []
    );
  }


  const notificationMatch =
    path.match(
      /^\/api\/notifications\/(\d+)\/read$/
    );

  if (
    notificationMatch &&
    method === "POST"
  ) {

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

  if (
    path === "/api/messages" &&
    method === "GET"
  ) {

    const result =
      await db.prepare(`
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

    return json(
      result.results || []
    );
  }


  return json(
    {
      error:
        "Route inconnue."
    },
    404
  );
}


/* =========================================================
   LATE PAYMENTS
========================================================= */

async function updateLatePayments(
  db,
  userId
) {

  const date = today();

  const late =
    await db.prepare(`
      SELECT
        payments.id,
        payments.lease_id,
        tenants.id AS tenant_id,
        tenants.first_name,
        tenants.last_name,
        properties.reference
      FROM payments
      INNER JOIN leases
        ON leases.id = payments.lease_id
        AND leases.user_id = payments.user_id
      INNER JOIN tenants
        ON tenants.id = leases.tenant_id
        AND tenants.user_id = payments.user_id
      INNER JOIN properties
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

  for (
    const payment of
    late.results || []
  ) {

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

    const existing =
      await db.prepare(`
        SELECT id
        FROM notifications
        WHERE user_id = ?
          AND type = 'late'
          AND message LIKE ?
        LIMIT 1
      `)
      .bind(
        userId,
        "%Référence paiement " +
          payment.id +
          "%"
      )
      .first();

    if (!existing) {

      await createNotification(
        db,
        userId,
        "Loyer en retard",
        "Le loyer de " +
          payment.first_name +
          " " +
          payment.last_name +
          " pour " +
          payment.reference +
          " est en retard. Référence paiement " +
          payment.id +
          ".",
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
        VALUES (?, ?, ?, ?, 'automatic')
      `)
      .bind(
        userId,
        payment.tenant_id,
        "Rappel de loyer",
        "Le paiement " +
          payment.id +
          " concernant " +
          payment.reference +
          " est en retard."
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

const APP_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ImmoFlow</title>

<style>

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: Arial, sans-serif;
  background: #f4f6fa;
  color: #172033;
}

button,
input,
select {
  font: inherit;
}

button {
  cursor: pointer;
}

.hidden {
  display: none !important;
}

.auth {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.auth-card {
  width: 100%;
  max-width: 430px;
  background: #fff;
  padding: 30px;
  border-radius: 18px;
  box-shadow: 0 10px 40px rgba(0,0,0,.08);
}

.logo {
  font-size: 30px;
  font-weight: 800;
  margin-bottom: 5px;
}

.logo span {
  color: #2563eb;
}

.muted {
  color: #64748b;
}

.field {
  margin-bottom: 15px;
}

.field label {
  display: block;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 6px;
}

.field input,
.field select {
  width: 100%;
  padding: 12px;
  border: 1px solid #d7dce5;
  border-radius: 9px;
  background: white;
}

.primary {
  background: #2563eb;
  border: 0;
  color: white;
  padding: 11px 16px;
  border-radius: 9px;
  font-weight: 700;
}

.primary:hover {
  background: #1d4ed8;
}

.secondary {
  background: #e5e7eb;
  border: 0;
  padding: 11px 16px;
  border-radius: 9px;
}

.full {
  width: 100%;
}

.auth-switch {
  text-align: center;
  margin-top: 18px;
}

.link {
  border: 0;
  background: none;
  color: #2563eb;
  font-weight: 700;
}

.app {
  display: flex;
  min-height: 100vh;
}

.sidebar {
  width: 240px;
  background: #111827;
  color: white;
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  padding: 20px;
  z-index: 20;
}

.side-logo {
  font-size: 25px;
  font-weight: 800;
  margin-bottom: 30px;
}

.side-logo span {
  color: #60a5fa;
}

.nav button {
  display: block;
  width: 100%;
  border: 0;
  background: transparent;
  color: #cbd5e1;
  text-align: left;
  padding: 13px;
  border-radius: 8px;
  margin-bottom: 5px;
}

.nav button:hover,
.nav button.active {
  background: #1f2937;
  color: white;
}

.logout {
  position: absolute;
  bottom: 20px;
  left: 20px;
  right: 20px;
}

.main {
  margin-left: 240px;
  width: calc(100% - 240px);
  padding: 25px;
}

.top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 25px;
}

.page {
  display: none;
}

.page.active {
  display: block;
}

.cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 15px;
}

.card {
  background: white;
  padding: 20px;
  border-radius: 15px;
  box-shadow: 0 3px 15px rgba(0,0,0,.05);
}

.card-title {
  color: #64748b;
  font-size: 14px;
}

.card-value {
  font-size: 26px;
  font-weight: 800;
  margin-top: 8px;
}

.panel {
  background: white;
  padding: 20px;
  border-radius: 15px;
  margin-top: 20px;
  box-shadow: 0 3px 15px rgba(0,0,0,.05);
  overflow-x: auto;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  gap: 10px;
}

table {
  width: 100%;
  border-collapse: collapse;
  min-width: 600px;
}

th,
td {
  padding: 12px 8px;
  border-bottom: 1px solid #edf0f4;
  text-align: left;
}

.badge {
  background: #ef4444;
  color: white;
  border-radius: 20px;
  padding: 3px 7px;
  font-size: 11px;
}

.notification {
  padding: 15px;
  border-bottom: 1px solid #eee;
}

.unread {
  background: #eff6ff;
}

.modal {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.5);
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 50;
}

.modal.show {
  display: flex;
}

.modal-card {
  background: white;
  width: min(600px,100%);
  padding: 25px;
  border-radius: 16px;
  max-height: 90vh;
  overflow-y: auto;
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

.toast {
  position: fixed;
  right: 20px;
  bottom: 20px;
  background: #111827;
  color: white;
  padding: 14px 18px;
  border-radius: 10px;
  display: none;
  z-index: 100;
}

.status-available {
  color: #16a34a;
  font-weight: 700;
}

.status-occupied {
  color: #2563eb;
  font-weight: 700;
}

.status-late {
  color: #dc2626;
  font-weight: 700;
}

.status-paid {
  color: #16a34a;
  font-weight: 700;
}

.status-pending {
  color: #d97706;
  font-weight: 700;
}

.empty {
  color: #64748b;
  padding: 20px 0;
}

@media(max-width:900px) {

  .cards {
    grid-template-columns: 1fr 1fr;
  }

}

@media(max-width:800px) {

  .sidebar {
    width: 70px;
    padding: 10px;
  }

  .side-logo {
    font-size: 0;
    text-align: center;
  }

  .side-logo span {
    font-size: 22px;
  }

  .nav button {
    font-size: 0;
    text-align: center;
  }

  .nav button::first-letter {
    font-size: 20px;
  }

  .logout {
    font-size: 0;
    padding: 10px;
  }

  .main {
    margin-left: 70px;
    width: calc(100% - 70px);
    padding: 15px;
  }

}

@media(max-width:500px) {

  .cards {
    grid-template-columns: 1fr;
  }

  .grid {
    grid-template-columns: 1fr;
  }

  .top h1 {
    font-size: 24px;
  }

}

</style>
</head>

<body>


<!-- =====================================================
     AUTH
====================================================== -->

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
          <label for="loginEmail">Email</label>
          <input
            id="loginEmail"
            type="email"
            autocomplete="email"
            required
          >
        </div>

        <div class="field">
          <label for="loginPassword">
            Mot de passe
          </label>

          <input
            id="loginPassword"
            type="password"
            autocomplete="current-password"
            required
          >
        </div>

        <button
          class="primary full"
          type="submit"
        >
          Se connecter
        </button>

      </form>

      <p class="auth-switch">
        Pas encore de compte ?
        <button
          class="link"
          type="button"
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
          <label for="agency">
            Nom de l'agence
          </label>

          <input
            id="agency"
            required
          >
        </div>

        <div class="field">
          <label for="name">
            Votre nom
          </label>

          <input
            id="name"
            required
          >
        </div>

        <div class="field">
          <label for="email">
            Email
          </label>

          <input
            id="email"
            type="email"
            autocomplete="email"
            required
          >
        </div>

        <div class="field">
          <label for="password">
            Mot de passe
          </label>

          <input
            id="password"
            type="password"
            minlength="6"
            autocomplete="new-password"
            required
          >
        </div>

        <button
          class="primary full"
          type="submit"
        >
          Créer mon compte
        </button>

      </form>

      <p class="auth-switch">
        Déjà inscrit ?
        <button
          class="link"
          type="button"
          onclick="showLogin()"
        >
          Se connecter
        </button>
      </p>

    </div>

  </div>

</div>


<!-- =====================================================
     APPLICATION
====================================================== -->

<div id="app" class="app hidden">

  <aside class="sidebar">

    <div class="side-logo">
      Immo<span>Flow</span>
    </div>

    <div class="nav">

      <button
        class="active"
        data-page="dashboard"
        onclick="page('dashboard',this)"
      >
        🏠 Tableau de bord
      </button>

      <button
        data-page="properties"
        onclick="page('properties',this)"
      >
        🏢 Biens
      </button>

      <button
        data-page="owners"
        onclick="page('owners',this)"
      >
        👔 Propriétaires
      </button>

      <button
        data-page="tenants"
        onclick="page('tenants',this)"
      >
        👤 Locataires
      </button>

      <button
        data-page="leases"
        onclick="page('leases',this)"
      >
        📄 Baux
      </button>

      <button
        data-page="payments"
        onclick="page('payments',this)"
      >
        💰 Loyers
      </button>

      <button
        data-page="notifications"
        onclick="page('notifications',this)"
      >
        🔔 Notifications
        <span
          id="notificationBadge"
          class="badge"
        >
          0
        </span>
      </button>

      <button
        data-page="messages"
        onclick="page('messages',this)"
      >
        💬 Messages
      </button>

    </div>

    <button
      class="secondary logout"
      type="button"
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
      id="page-dashboard"
      class="page active"
    >

      <div class="cards">

        <div class="card">
          <div class="card-title">
            Biens
          </div>

          <div
            id="statProperties"
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
            id="statTenants"
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
            id="statOccupied"
            class="card-value"
          >
            0
          </div>
        </div>

        <div class="card">
          <div class="card-title">
            Loyers en retard
          </div>

          <div
            id="statLate"
            class="card-value"
          >
            0 FCFA
          </div>
        </div>

      </div>


      <div class="panel">

        <div class="panel-head">
          <h2>
            Résumé
          </h2>
        </div>

        <p class="muted">
          Bienvenue sur votre espace ImmoFlow.
          Utilisez le menu pour gérer vos biens,
          propriétaires, locataires, baux et loyers.
        </p>

      </div>

    </section>


    <!-- PROPERTIES -->

    <section
      id="page-properties"
      class="page"
    >

      <div class="panel">

        <div class="panel-head">

          <h2>
            Biens immobiliers
          </h2>

          <button
            class="primary"
            type="button"
            onclick="openModal('propertyModal')"
          >
            + Ajouter
          </button>

        </div>

        <div id="propertiesList">
          Chargement...
        </div>

      </div>

    </section>


    <!-- OWNERS -->

    <section
      id="page-owners"
      class="page"
    >

      <div class="panel">

        <div class="panel-head">

          <h2>
            Propriétaires
          </h2>

          <button
            class="primary"
            type="button"
            onclick="openModal('ownerModal')"
          >
            + Ajouter
          </button>

        </div>

        <div id="ownersList">
          Chargement...
        </div>

      </div>

    </section>


    <!-- TENANTS -->

    <section
      id="page-tenants"
      class="page"
    >

      <div class="panel">

        <div class="panel-head">

          <h2>
            Locataires
          </h2>

          <button
            class="primary"
            type="button"
            onclick="openModal('tenantModal')"
          >
            + Ajouter
          </button>

        </div>

        <div id="tenantsList">
          Chargement...
        </div>

      </div>

    </section>


    <!-- LEASES -->

    <section
      id="page-leases"
      class="page"
    >

      <div class="panel">

        <div class="panel-head">

          <h2>
            Baux
          </h2>

          <button
            class="primary"
            type="button"
            onclick="openModal('leaseModal')"
          >
            + Créer un bail
          </button>

        </div>

        <div id="leasesList">
          Chargement...
        </div>

      </div>

    </section>


    <!-- PAYMENTS -->

    <section
      id="page-payments"
      class="page"
    >

      <div class="panel">

        <div class="panel-head">

          <h2>
            Loyers
          </h2>

          <button
            class="primary"
            type="button"
            onclick="openModal('paymentModal')"
          >
            + Enregistrer un loyer
          </button>

        </div>

        <div id="paymentsList">
          Chargement...
        </div>

      </div>

    </section>


    <!-- NOTIFICATIONS -->

    <section
      id="page-notifications"
      class="page"
    >

      <div class="panel">

        <div class="panel-head">

          <h2>
            Notifications
          </h2>

          <button
            class="secondary"
            type="button"
            onclick="readAll()"
          >
            Tout marquer comme lu
          </button>

        </div>

        <div id="notificationsList">
          Chargement...
        </div>

      </div>

    </section>


    <!-- MESSAGES -->

    <section
      id="page-messages"
      class="page"
    >

      <div class="panel">

        <div class="panel-head">

          <h2>
            Messages automatiques
          </h2>

        </div>

        <div id="messagesList">
          Chargement...
        </div>

      </div>

    </section>

  </main>

</div>


<!-- =====================================================
     OWNER MODAL
====================================================== -->

<div
  id="ownerModal"
  class="modal"
>

  <div class="modal-card">

    <h2>
      Ajouter un propriétaire
    </h2>

    <form id="ownerForm">

      <div class="field">
        <label>
          Nom
        </label>

        <input
          name="name"
          required
        >
      </div>

      <div class="grid">

        <div class="field">
          <label>
            Téléphone
          </label>

          <input
            name="phone"
            type="tel"
          >
        </div>

        <div class="field">
          <label>
            Email
          </label>

          <input
            name="email"
            type="email"
          >
        </div>

      </div>

      <div class="field">
        <label>
          Adresse
        </label>

        <input
          name="address"
        >
      </div>

      <div class="actions">

        <button
          type="button"
          class="secondary"
          onclick="closeModals()"
        >
          Annuler
        </button>

        <button
          type="submit"
          class="primary"
        >
          Enregistrer
        </button>

      </div>

    </form>

  </div>

</div>


<!-- =====================================================
     PROPERTY MODAL
====================================================== -->

<div
  id="propertyModal"
  class="modal"
>

  <div class="modal-card">

    <h2>
      Ajouter un bien
    </h2>

    <form id="propertyForm">

      <div class="grid">

        <div class="field">
          <label>
            Référence
          </label>

          <input
            name="reference"
            placeholder="IMMO-001"
            required
          >
        </div>

        <div class="field">
          <label>
            Type
          </label>

          <select name="type">
            <option>
              Appartement
            </option>

            <option>
              Maison
            </option>

            <option>
              Villa
            </option>

            <option>
              Bureau
            </option>

            <option>
              Commerce
            </option>

            <option>
              Terrain
            </option>
          </select>
        </div>

      </div>

      <div class="field">
        <label>
          Nom du bien
        </label>

        <input
          name="title"
          placeholder="Appartement F3"
          required
        >
      </div>

      <div class="grid">

        <div class="field">
          <label>
            Propriétaire
          </label>

          <select
            id="ownerSelect"
            name="owner_id"
          >
            <option value="">
              Aucun
            </option>
          </select>
        </div>

        <div class="field">
          <label>
            Chambres
          </label>

          <input
            name="bedrooms"
            type="number"
            min="0"
            value="0"
          >
        </div>

      </div>

      <div class="grid">

        <div class="field">
          <label>
            Loyer mensuel
          </label>

          <input
            name="rent"
            type="number"
            min="0"
            value="0"
          >
        </div>

        <div class="field">
          <label>
            Ville
          </label>

          <input
            name="city"
            value="Thiès"
          >
        </div>

      </div>

      <div class="field">
        <label>
          Adresse
        </label>

        <input
          name="address"
        >
      </div>

      <div class="actions">

        <button
          type="button"
          class="secondary"
          onclick="closeModals()"
        >
          Annuler
        </button>

        <button
          type="submit"
          class="primary"
        >
          Enregistrer
        </button>

      </div>

    </form>

  </div>

</div>


<!-- =====================================================
     TENANT MODAL
====================================================== -->

<div
  id="tenantModal"
  class="modal"
>

  <div class="modal-card">

    <h2>
      Ajouter un locataire
    </h2>

    <form id="tenantForm">

      <div class="grid">

        <div class="field">
          <label>
            Prénom
          </label>

          <input
            name="first_name"
            required
          >
        </div>

        <div class="field">
          <label>
            Nom
          </label>

          <input
            name="last_name"
            required
          >
        </div>

      </div>

      <div class="grid">

        <div class="field">
          <label>
            Téléphone
          </label>

          <input
            name="phone"
            type="tel"
          >
        </div>

        <div class="field">
          <label>
            Email
          </label>

          <input
            name="email"
            type="email"
          >
        </div>

      </div>

      <div class="field">
        <label>
          Adresse
        </label>

        <input
          name="address"
        >
      </div>

      <div class="actions">

        <button
          type="button"
          class="secondary"
          onclick="closeModals()"
        >
          Annuler
        </button>

        <button
          type="submit"
          class="primary"
        >
          Enregistrer
        </button>

      </div>

    </form>

  </div>

</div>


<!-- =====================================================
     LEASE MODAL
====================================================== -->

<div
  id="leaseModal"
  class="modal"
>

  <div class="modal-card">

    <h2>
      Créer un bail
    </h2>

    <form id="leaseForm">

      <div class="field">
        <label>
          Bien
        </label>

        <select
          id="leaseProperty"
          name="property_id"
          required
        >
          <option value="">
            Chargement...
          </option>
        </select>
      </div>

      <div class="field">
        <label>
          Locataire
        </label>

        <select
          id="leaseTenant"
          name="tenant_id"
          required
        >
          <option value="">
            Chargement...
          </option>
        </select>
      </div>

      <div class="grid">

        <div class="field">
          <label>
            Date de début
          </label>

          <input
            name="start_date"
            type="date"
            required
          >
        </div>

        <div class="field">
          <label>
            Date de fin
          </label>

          <input
            name="end_date"
            type="date"
          >
        </div>

      </div>

      <div class="grid">

        <div class="field">
          <label>
            Loyer mensuel
          </label>

          <input
            name="monthly_rent"
            type="number"
            min="1"
            required
          >
        </div>

        <div class="field">
          <label>
            Dépôt de garantie
          </label>

          <input
            name="deposit"
            type="number"
            min="0"
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

        <button
          type="submit"
          class="primary"
        >
          Créer le bail
        </button>

      </div>

    </form>

  </div>

</div>


<!-- =====================================================
     PAYMENT MODAL
====================================================== -->

<div
  id="paymentModal"
  class="modal"
>

  <div class="modal-card">

    <h2>
      Enregistrer un loyer
    </h2>

    <form id="paymentForm">

      <div class="field">
        <label>
          Bail
        </label>

        <select
          id="paymentLease"
          name="lease_id"
          required
        >
          <option value="">
            Chargement...
          </option>
        </select>
      </div>

      <div class="grid">

        <div class="field">
          <label>
            Montant
          </label>

          <input
            name="amount"
            type="number"
            min="1"
            required
          >
        </div>

        <div class="field">
          <label>
            Date d'échéance
          </label>

          <input
            name="due_date"
            type="date"
            required
          >
        </div>

      </div>

      <div class="field">
        <label>
          Mode de paiement
        </label>

        <select name="payment_method">

          <option value="">
            Non précisé
          </option>

          <option value="Wave">
            Wave
          </option>

          <option value="Orange Money">
            Orange Money
          </option>

          <option value="Espèces">
            Espèces
          </option>

          <option value="Virement">
            Virement bancaire
          </option>

          <option value="Chèque">
            Chèque
          </option>

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

        <button
          type="submit"
          class="primary"
        >
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

"use strict";


/* =========================================================
   API FRONTEND
========================================================= */

async function api(url, options) {

  const config = options || {};

  config.headers = {
    ...(config.headers || {}),
    "Content-Type": "application/json"
  };

  const response =
    await fetch(url, {
      credentials: "same-origin",
      ...config
    });

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {

    throw new Error(
      data && data.error
        ? data.error
        : "Une erreur est survenue."
    );
  }

  return data;
}


/* =========================================================
   AUTH DISPLAY
========================================================= */

function showRegister() {

  document
    .getElementById("login")
    .classList.add("hidden");

  document
    .getElementById("register")
    .classList.remove("hidden");
}


function showLogin() {

  document
    .getElementById("register")
    .classList.add("hidden");

  document
    .getElementById("login")
    .classList.remove("hidden");
}


/* =========================================================
   TOAST
========================================================= */

let toastTimer = null;

function toast(message) {

  const element =
    document.getElementById("toast");

  element.textContent =
    String(message || "");

  element.style.display =
    "block";

  clearTimeout(toastTimer);

  toastTimer =
    setTimeout(
      function () {
        element.style.display =
          "none";
      },
      3000
    );
}


/* =========================================================
   NAVIGATION
========================================================= */

const pageTitles = {
  dashboard: "Tableau de bord",
  properties: "Biens immobiliers",
  owners: "Propriétaires",
  tenants: "Locataires",
  leases: "Baux",
  payments: "Loyers",
  notifications: "Notifications",
  messages: "Messages"
};


function page(name, button) {

  document
    .querySelectorAll(".page")
    .forEach(function (section) {
      section.classList.remove("active");
    });

  const target =
    document.getElementById(
      "page-" + name
    );

  if (target) {
    target.classList.add("active");
  }

  document
    .querySelectorAll(".nav button")
    .forEach(function (item) {
      item.classList.remove("active");
    });

  if (button) {
    button.classList.add("active");
  }

  document
    .getElementById("pageTitle")
    .textContent =
      pageTitles[name] ||
      "ImmoFlow";

  loadPageData(name);
}


async function loadPageData(name) {

  try {

    if (name === "dashboard") {
      await loadDashboard();
    }

    if (name === "properties") {
      await loadProperties();
    }

    if (name === "owners") {
      await loadOwners();
    }

    if (name === "tenants") {
      await loadTenants();
    }

    if (name === "leases") {
      await loadLeases();
    }

    if (name === "payments") {
      await loadPayments();
    }

    if (name === "notifications") {
      await loadNotifications();
    }

    if (name === "messages") {
      await loadMessages();
    }

  } catch (error) {

    toast(error.message);

  }
}


/* =========================================================
   SESSION
========================================================= */

async function checkSession() {

  try {

    const data =
      await api("/api/me");

    if (data.user) {

      showApp(data.user);

    } else {

      showAuth();

    }

  } catch {

    showAuth();

  }
}


function showAuth() {

  document
    .getElementById("auth")
    .classList.remove("hidden");

  document
    .getElementById("app")
    .classList.add("hidden");
}


function showApp(user) {

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
      " • " +
      user.name;

  refreshAll();
}


async function logout() {

  try {

    await api(
      "/api/logout",
      {
        method: "POST"
      }
    );

    showAuth();

    showLogin();

  } catch (error) {

    toast(error.message);

  }
}


/* =========================================================
   DASHBOARD
========================================================= */

async function loadDashboard() {

  const data =
    await api("/api/dashboard");

  document
    .getElementById("statProperties")
    .textContent =
      Number(
        data.properties || 0
      ).toLocaleString("fr-FR");

  document
    .getElementById("statTenants")
    .textContent =
      Number(
        data.tenants || 0
      ).toLocaleString("fr-FR");

  document
    .getElementById("statOccupied")
    .textContent =
      Number(
        data.occupied || 0
      ).toLocaleString("fr-FR");

  document
    .getElementById("statLate")
    .textContent =
      Number(
        data.late || 0
      ).toLocaleString("fr-FR") +
      " FCFA";

  document
    .getElementById("notificationBadge")
    .textContent =
      Number(
        data.unread || 0
      );
}


/* =========================================================
   PROPERTIES
========================================================= */

async function loadProperties() {

  const data =
    await api("/api/properties");

  const element =
    document.getElementById(
      "propertiesList"
    );

  if (!data.length) {

    element.innerHTML =
      '<p class="empty">Aucun bien enregistré.</p>';

    return;
  }

  element.innerHTML =
    "<table>" +
      "<thead>" +
        "<tr>" +
          "<th>Référence</th>" +
          "<th>Bien</th>" +
          "<th>Propriétaire</th>" +
          "<th>Ville</th>" +
          "<th>Loyer</th>" +
          "<th>Statut</th>" +
        "</tr>" +
      "</thead>" +
      "<tbody>" +

        data.map(function (x) {

          return (
            "<tr>" +
              "<td>" +
                escapeHtml(x.reference) +
              "</td>" +

              "<td>" +
                escapeHtml(x.title) +
              "</td>" +

              "<td>" +
                escapeHtml(
                  x.owner_name || "—"
                ) +
              "</td>" +

              "<td>" +
                escapeHtml(x.city || "—") +
              "</td>" +

              "<td>" +
                Number(
                  x.rent || 0
                ).toLocaleString("fr-FR") +
                " FCFA" +
              "</td>" +

              "<td class='status-" +
                escapeHtml(x.status) +
                "'>" +
                escapeHtml(
                  formatStatus(x.status)
                ) +
              "</td>" +

            "</tr>"
          );

        }).join("") +

      "</tbody>" +
    "</table>";
}


/* =========================================================
   OWNERS
========================================================= */

async function loadOwners() {

  const data =
    await api("/api/owners");

  const element =
    document.getElementById(
      "ownersList"
    );

  if (!data.length) {

    element.innerHTML =
      '<p class="empty">Aucun propriétaire.</p>';

    return;
  }

  element.innerHTML =
    "<table>" +
      "<thead>" +
        "<tr>" +
          "<th>Nom</th>" +
          "<th>Téléphone</th>" +
          "<th>Email</th>" +
          "<th>Adresse</th>" +
        "</tr>" +
      "</thead>" +

      "<tbody>" +

        data.map(function (x) {

          return (
            "<tr>" +

              "<td>" +
                escapeHtml(x.name) +
              "</td>" +

              "<td>" +
                escapeHtml(x.phone || "—") +
              "</td>" +

              "<td>" +
                escapeHtml(x.email || "—") +
              "</td>" +

              "<td>" +
                escapeHtml(x.address || "—") +
              "</td>" +

            "</tr>"
          );

        }).join("") +

      "</tbody>" +
    "</table>";
}


/* =========================================================
   TENANTS
========================================================= */

async function loadTenants() {

  const data =
    await api("/api/tenants");

  const element =
    document.getElementById(
      "tenantsList"
    );

  if (!data.length) {

    element.innerHTML =
      '<p class="empty">Aucun locataire.</p>';

    return;
  }

  element.innerHTML =
    "<table>" +

      "<thead>" +
        "<tr>" +
          "<th>Nom</th>" +
          "<th>Téléphone</th>" +
          "<th>Email</th>" +
          "<th>Adresse</th>" +
        "</tr>" +
      "</thead>" +

      "<tbody>" +

        data.map(function (x) {

          return (
            "<tr>" +

              "<td>" +
                escapeHtml(
                  x.first_name
                ) +
                " " +
                escapeHtml(
                  x.last_name
                ) +
              "</td>" +

              "<td>" +
                escapeHtml(x.phone || "—") +
              "</td>" +

              "<td>" +
                escapeHtml(x.email || "—") +
              "</td>" +

              "<td>" +
                escapeHtml(x.address || "—") +
              "</td>" +

            "</tr>"
          );

        }).join("") +

      "</tbody>" +

    "</table>";
}


/* =========================================================
   LEASES
========================================================= */

async function loadLeases() {

  const data =
    await api("/api/leases");

  const element =
    document.getElementById(
      "leasesList"
    );

  if (!data.length) {

    element.innerHTML =
      '<p class="empty">Aucun bail.</p>';

    return;
  }

  element.innerHTML =
    "<table>" +

      "<thead>" +
        "<tr>" +
          "<th>Bien</th>" +
          "<th>Locataire</th>" +
          "<th>Début</th>" +
          "<th>Fin</th>" +
          "<th>Loyer</th>" +
          "<th>Statut</th>" +
        "</tr>" +
      "</thead>" +

      "<tbody>" +

        data.map(function (x) {

          return (
            "<tr>" +

              "<td>" +
                escapeHtml(
                  x.reference
                ) +
                " - " +
                escapeHtml(
                  x.property_title
                ) +
              "</td>" +

              "<td>" +
                escapeHtml(
                  x.first_name
                ) +
                " " +
                escapeHtml(
                  x.last_name
                ) +
              "</td>" +

              "<td>" +
                escapeHtml(
                  x.start_date
                ) +
              "</td>" +

              "<td>" +
                escapeHtml(
                  x.end_date || "—"
                ) +
              "</td>" +

              "<td>" +
                Number(
                  x.monthly_rent || 0
                ).toLocaleString("fr-FR") +
                " FCFA" +
              "</td>" +

              "<td>" +
                escapeHtml(
                  formatStatus(x.status)
                ) +
              "</td>" +

            "</tr>"
          );

        }).join("") +

      "</tbody>" +

    "</table>";
}


/* =========================================================
   PAYMENTS
========================================================= */

async function loadPayments() {

  const data =
    await api("/api/payments");

  const element =
    document.getElementById(
      "paymentsList"
    );

  if (!data.length) {

    element.innerHTML =
      '<p class="empty">Aucun loyer enregistré.</p>';

    return;
  }

  element.innerHTML =
    "<table>" +

      "<thead>" +
        "<tr>" +
          "<th>Locataire</th>" +
          "<th>Bien</th>" +
          "<th>Montant</th>" +
          "<th>Échéance</th>" +
          "<th>Statut</th>" +
          "<th>Action</th>" +
        "</tr>" +
      "</thead>" +

      "<tbody>" +

        data.map(function (x) {

          const action =
            x.status !== "paid"
              ? (
                  "<button " +
                    "class='primary' " +
                    "type='button' " +
                    "onclick='markPaid(" +
                    Number(x.id) +
                    ")'>" +
                    "Payé" +
                  "</button>"
                )
              : "✓";

          return (
            "<tr>" +

              "<td>" +
                escapeHtml(
                  x.first_name
                ) +
                " " +
                escapeHtml(
                  x.last_name
                ) +
              "</td>" +

              "<td>" +
                escapeHtml(
                  x.reference
                ) +
              "</td>" +

              "<td>" +
                Number(
                  x.amount || 0
                ).toLocaleString("fr-FR") +
                " FCFA" +
              "</td>" +

              "<td>" +
                escapeHtml(
                  x.due_date
                ) +
              "</td>" +

              "<td class='status-" +
                escapeHtml(x.status) +
                "'>" +
                escapeHtml(
                  formatStatus(x.status)
                ) +
              "</td>" +

              "<td>" +
                action +
              "</td>" +

            "</tr>"
          );

        }).join("") +

      "</tbody>" +

    "</table>";
}


/* =========================================================
   NOTIFICATIONS
========================================================= */

async function loadNotifications() {

  const data =
    await api("/api/notifications");

  const element =
    document.getElementById(
      "notificationsList"
    );

  if (!data.length) {

    element.innerHTML =
      '<p class="empty">Aucune notification.</p>';

    return;
  }

  element.innerHTML =
    data.map(function (x) {

      return (
        "<div " +
          "class='notification " +
          (
            Number(x.is_read)
              ? ""
              : "unread"
          ) +
          "' " +
          "onclick='readNotification(" +
          Number(x.id) +
          ")'>" +

          "<strong>" +
            escapeHtml(x.title) +
          "</strong>" +

          "<p>" +
            escapeHtml(x.message) +
          "</p>" +

          "<small>" +
            escapeHtml(x.created_at) +
          "</small>" +

        "</div>"
      );

    }).join("");
}


/* =========================================================
   MESSAGES
========================================================= */

async function loadMessages() {

  const data =
    await api("/api/messages");

  const element =
    document.getElementById(
      "messagesList"
    );

  if (!data.length) {

    element.innerHTML =
      '<p class="empty">Aucun message automatique.</p>';

    return;
  }

  element.innerHTML =
    data.map(function (x) {

      return (
        "<div class='notification'>" +

          "<strong>" +
            escapeHtml(x.title) +
          "</strong>" +

          "<p>" +
            escapeHtml(x.message) +
          "</p>" +

          "<small>" +
            escapeHtml(x.created_at) +
          "</small>" +

        "</div>"
      );

    }).join("");
}


/* =========================================================
   NOTIFICATION ACTIONS
========================================================= */

async function readNotification(id) {

  try {

    await api(
      "/api/notifications/" +
      Number(id) +
      "/read",
      {
        method: "POST"
      }
    );

    await loadNotifications();
    await loadDashboard();

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
    await loadDashboard();

  } catch (error) {

    toast(error.message);

  }
}


/* =========================================================
   PAYMENT ACTION
========================================================= */

async function markPaid(id) {

  if (!confirm(
    "Confirmer que ce loyer a été payé ?"
  )) {
    return;
  }

  try {

    await api(
      "/api/payments/" +
      Number(id) +
      "/paid",
      {
        method: "POST"
      }
    );

    toast(
      "Paiement enregistré."
    );

    await loadPayments();
    await loadDashboard();

  } catch (error) {

    toast(error.message);

  }
}


/* =========================================================
   OWNER OPTIONS
========================================================= */

async function loadOwnerOptions() {

  const data =
    await api("/api/owners");

  const select =
    document.getElementById(
      "ownerSelect"
    );

  select.innerHTML =
    '<option value="">Aucun</option>' +

    data.map(function (x) {

      return (
        '<option value="' +
        Number(x.id) +
        '">' +
        escapeHtml(x.name) +
        "</option>"
      );

    }).join("");
}


/* =========================================================
   LEASE OPTIONS
========================================================= */

async function loadLeaseOptions() {

  const properties =
    await api("/api/properties");

  const tenants =
    await api("/api/tenants");

  const propertySelect =
    document.getElementById(
      "leaseProperty"
    );

  const tenantSelect =
    document.getElementById(
      "leaseTenant"
    );

  const availableProperties =
    properties.filter(function (x) {
      return x.status !== "occupied";
    });

  propertySelect.innerHTML =
    availableProperties.length
      ? availableProperties.map(
          function (x) {
            return (
              '<option value="' +
              Number(x.id) +
              '">' +
              escapeHtml(
                x.reference
              ) +
              " - " +
              escapeHtml(
                x.title
              ) +
              "</option>"
            );
          }
        ).join("")
      : '<option value="">Aucun bien disponible</option>';

  tenantSelect.innerHTML =
    tenants.length
      ? tenants.map(
          function (x) {
            return (
              '<option value="' +
              Number(x.id) +
              '">' +
              escapeHtml(
                x.first_name
              ) +
              " " +
              escapeHtml(
                x.last_name
              ) +
              "</option>"
            );
          }
        ).join("")
      : '<option value="">Aucun locataire</option>';
}


/* =========================================================
   PAYMENT OPTIONS
========================================================= */

async function loadPaymentOptions() {

  const leases =
    await api("/api/leases");

  const select =
    document.getElementById(
      "paymentLease"
    );

  const activeLeases =
    leases.filter(function (x) {
      return x.status === "active";
    });

  select.innerHTML =
    activeLeases.length
      ? activeLeases.map(
          function (x) {
            return (
              '<option value="' +
              Number(x.id) +
              '">' +
              escapeHtml(
                x.reference
              ) +
              " - " +
              escapeHtml(
                x.first_name
              ) +
              " " +
              escapeHtml(
                x.last_name
              ) +
              "</option>"
            );
          }
        ).join("")
      : '<option value="">Aucun bail actif</option>';
}


/* =========================================================
   MODALS
========================================================= */

function openModal(id) {

  const modal =
    document.getElementById(id);

  if (!modal) {
    return;
  }

  modal.classList.add("show");

  if (
    id === "propertyModal"
  ) {

    loadOwnerOptions()
      .catch(function (error) {
        toast(error.message);
      });
  }

  if (
    id === "leaseModal"
  ) {

    loadLeaseOptions()
      .catch(function (error) {
        toast(error.message);
      });
  }

  if (
    id === "paymentModal"
  ) {

    loadPaymentOptions()
      .catch(function (error) {
        toast(error.message);
      });
  }
}


function closeModals() {

  document
    .querySelectorAll(".modal")
    .forEach(function (modal) {
      modal.classList.remove(
        "show"
      );
    });
}


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHtml(value) {

  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


/* =========================================================
   STATUS
========================================================= */

function formatStatus(status) {

  const values = {
    available: "Disponible",
    occupied: "Occupé",
    active: "Actif",
    ended: "Terminé",
    pending: "En attente",
    paid: "Payé",
    late: "En retard"
  };

  return values[status] ||
    status ||
    "—";
}


/* =========================================================
   REFRESH
========================================================= */

async function refreshAll() {

  try {

    await Promise.all([
      loadDashboard(),
      loadProperties(),
      loadOwners(),
      loadTenants(),
      loadLeases(),
      loadPayments(),
      loadNotifications(),
      loadMessages()
    ]);

  } catch (error) {

    console.error(error);

    if (
      error.message !==
      "Vous devez être connecté."
    ) {
      toast(error.message);
    }
  }
}


/* =========================================================
   LOGIN FORM
========================================================= */

document
  .getElementById("loginForm")
  .addEventListener(
    "submit",
    async function (event) {

      event.preventDefault();

      const email =
        document
          .getElementById(
            "loginEmail"
          )
          .value
          .trim();

      const password =
        document
          .getElementById(
            "loginPassword"
          )
          .value;

      try {

        const data =
          await api(
            "/api/login",
            {
              method: "POST",
              body: JSON.stringify({
                email: email,
                password: password
              })
            }
          );

        showApp(data.user);

        event.target.reset();

      } catch (error) {

        toast(error.message);

      }
    }
  );


/* =========================================================
   REGISTER FORM
========================================================= */

document
  .getElementById("registerForm")
  .addEventListener(
    "submit",
    async function (event) {

      event.preventDefault();

      const agency =
        document
          .getElementById("agency")
          .value
          .trim();

      const name =
        document
          .getElementById("name")
          .value
          .trim();

      const email =
        document
          .getElementById("email")
          .value
          .trim();

      const password =
        document
          .getElementById("password")
          .value;

      try {

        const data =
          await api(
            "/api/register",
            {
              method: "POST",
              body: JSON.stringify({
                agency_name: agency,
                name: name,
                email: email,
                password: password
              })
            }
          );

        showApp(data.user);

        event.target.reset();

      } catch (error) {

        toast(error.message);

      }
    }
  );


/* =========================================================
   OWNER FORM
========================================================= */

document
  .getElementById("ownerForm")
  .addEventListener(
    "submit",
    async function (event) {

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

        toast(
          "Propriétaire ajouté."
        );

        await loadOwners();
        await loadOwnerOptions();

      } catch (error) {

        toast(error.message);

      }
    }
  );


/* =========================================================
   PROPERTY FORM
========================================================= */

document
  .getElementById("propertyForm")
  .addEventListener(
    "submit",
    async function (event) {

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

        toast(
          "Bien ajouté."
        );

        await loadProperties();
        await loadDashboard();

      } catch (error) {

        toast(error.message);

      }
    }
  );


/* =========================================================
   TENANT FORM
========================================================= */

document
  .getElementById("tenantForm")
  .addEventListener(
    "submit",
    async function (event) {

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

        toast(
          "Locataire ajouté."
        );

        await loadTenants();
        await loadDashboard();

      } catch (error) {

        toast(error.message);

      }
    }
  );


/* =========================================================
   LEASE FORM
========================================================= */

document
  .getElementById("leaseForm")
  .addEventListener(
    "submit",
    async function (event) {

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

        toast(
          "Bail créé."
        );

        await loadLeases();
        await loadProperties();
        await loadDashboard();

      } catch (error) {

        toast(error.message);

      }
    }
  );


/* =========================================================
   PAYMENT FORM
========================================================= */

document
  .getElementById("paymentForm")
  .addEventListener(
    "submit",
    async function (event) {

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

        toast(
          "Loyer enregistré."
        );

        await loadPayments();
        await loadDashboard();

      } catch (error) {

        toast(error.message);

      }
    }
  );


/* =========================================================
   MODAL OUTSIDE CLICK
========================================================= */

document
  .querySelectorAll(".modal")
  .forEach(function (modal) {

    modal.addEventListener(
      "click",
      function (event) {

        if (
          event.target === modal
        ) {
          modal.classList.remove(
            "show"
          );
        }

      }
    );

  });


/* =========================================================
   ESC KEY
========================================================= */

document.addEventListener(
  "keydown",
  function (event) {

    if (event.key === "Escape") {
      closeModals();
    }

  }
);


/* =========================================================
   START
========================================================= */

checkSession();

</script>

</body>
</html>`;
