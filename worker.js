export default {
  async fetch(request, env) {
    try {
      if (!env.DB) {
        return json({
          error: "La base D1 n'est pas connectée.",
          message: "Vérifiez que le binding D1 s'appelle DB."
        }, 500);
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
        details: error instanceof Error
          ? error.message
          : String(error)
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

  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "content-type": "application/json;charset=UTF-8",
        ...headers
      }
    }
  );
}


async function hashPassword(password) {

  const data =
    new TextEncoder().encode(password);

  const hash =
    await crypto.subtle.digest(
      "SHA-256",
      data
    );

  return Array
    .from(new Uint8Array(hash))
    .map(
      x => x.toString(16).padStart(2, "0")
    )
    .join("");
}


function randomToken() {

  return (
    crypto.randomUUID() +
    crypto.randomUUID()
  );
}


function getCookie(request, name) {

  const cookies =
    request.headers.get("Cookie") || "";

  const parts =
    cookies.split(";");

  for (const part of parts) {

    const [key, ...rest] =
      part.trim().split("=");

    if (key === name) {
      return rest.join("=");
    }
  }

  return null;
}


async function getUser(request, db) {

  const token =
    getCookie(
      request,
      "immoflow_session"
    );

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


function today() {

  return new Date()
    .toISOString()
    .slice(0, 10);
}


function normalizeText(value) {

  return String(value ?? "").trim();
}


function toInteger(value) {

  const number =
    Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.round(number);
}


/* =========================================================
   API
========================================================= */

async function api(request, env, url) {

  const db = env.DB;

  const path =
    url.pathname;

  const method =
    request.method;


  /* =======================================================
     REGISTER
  ======================================================= */

  if (
    path === "/api/register" &&
    method === "POST"
  ) {

    let data;

    try {
      data = await request.json();
    } catch {
      return json({
        error: "Données invalides."
      }, 400);
    }

    const agency =
      normalizeText(data.agency_name);

    const name =
      normalizeText(data.name);

    const email =
      normalizeText(data.email)
        .toLowerCase();

    const password =
      String(data.password || "");

    if (
      !agency ||
      !name ||
      !email ||
      !password
    ) {
      return json({
        error: "Tous les champs sont obligatoires."
      }, 400);
    }

    if (password.length < 6) {
      return json({
        error:
          "Le mot de passe doit contenir au moins 6 caractères."
      }, 400);
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
      return json({
        error:
          "Un compte existe déjà avec cet email."
      }, 409);
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
          name,
          email
        }
      },
      201,
      {
        "Set-Cookie":
          `immoflow_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`
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

    let data;

    try {
      data = await request.json();
    } catch {
      return json({
        error: "Données invalides."
      }, 400);
    }

    const email =
      normalizeText(data.email)
        .toLowerCase();

    const password =
      String(data.password || "");

    if (!email || !password) {
      return json({
        error:
          "Email et mot de passe obligatoires."
      }, 400);
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
      return json({
        error:
          "Email ou mot de passe incorrect."
      }, 401);
    }

    const passwordHash =
      await hashPassword(password);

    if (
      passwordHash !==
      user.password_hash
    ) {
      return json({
        error:
          "Email ou mot de passe incorrect."
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
          `immoflow_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`
      }
    );
  }


  /* =======================================================
     ME
  ======================================================= */

  if (
    path === "/api/me" &&
    method === "GET"
  ) {

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
          "immoflow_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
      }
    );
  }


  /* =======================================================
     AUTH
  ======================================================= */

  const user =
    await getUser(
      request,
      db
    );

  if (!user) {

    return json({
      error:
        "Vous devez être connecté."
    }, 401);
  }

  const uid =
    user.id;


  /* =======================================================
     DASHBOARD
  ======================================================= */

  if (
    path === "/api/dashboard" &&
    method === "GET"
  ) {

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

      let data;

      try {
        data = await request.json();
      } catch {
        return json({
          error: "Données invalides."
        }, 400);
      }

      const name =
        normalizeText(data.name);

      if (!name) {
        return json({
          error:
            "Le nom est obligatoire."
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
          name,
          normalizeText(data.phone),
          normalizeText(data.email),
          normalizeText(data.address)
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

      let data;

      try {
        data = await request.json();
      } catch {
        return json({
          error: "Données invalides."
        }, 400);
      }

      const reference =
        normalizeText(data.reference);

      const title =
        normalizeText(data.title);

      if (!reference || !title) {
        return json({
          error:
            "Référence et nom du bien obligatoires."
        }, 400);
      }

      let ownerId = null;

      if (
        data.owner_id !== undefined &&
        data.owner_id !== null &&
        data.owner_id !== ""
      ) {

        ownerId =
          toInteger(data.owner_id);

        const owner =
          await db.prepare(`
            SELECT id
            FROM owners
            WHERE id = ?
              AND user_id = ?
            LIMIT 1
          `)
          .bind(
            ownerId,
            uid
          )
          .first();

        if (!owner) {
          return json({
            error:
              "Le propriétaire sélectionné est invalide."
          }, 400);
        }
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
          ownerId,
          reference,
          title,
          normalizeText(data.address),
          normalizeText(data.city),
          normalizeText(data.type) ||
            "Appartement",
          toInteger(data.bedrooms),
          toInteger(data.rent)
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

      let data;

      try {
        data = await request.json();
      } catch {
        return json({
          error: "Données invalides."
        }, 400);
      }

      const firstName =
        normalizeText(data.first_name);

      const lastName =
        normalizeText(data.last_name);

      if (!firstName || !lastName) {
        return json({
          error:
            "Prénom et nom obligatoires."
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
          firstName,
          lastName,
          normalizeText(data.phone),
          normalizeText(data.email),
          normalizeText(data.address)
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

      let data;

      try {
        data = await request.json();
      } catch {
        return json({
          error: "Données invalides."
        }, 400);
      }

      const propertyId =
        toInteger(data.property_id);

      const tenantId =
        toInteger(data.tenant_id);

      const startDate =
        normalizeText(data.start_date);

      const monthlyRent =
        toInteger(data.monthly_rent);

      if (
        !propertyId ||
        !tenantId ||
        !startDate ||
        monthlyRent <= 0
      ) {
        return json({
          error:
            "Informations du bail incomplètes."
        }, 400);
      }

      const property =
        await db.prepare(`
          SELECT id
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

      if (!property || !tenant) {
        return json({
          error:
            "Bien ou locataire invalide."
        }, 400);
      }

      const activeLease =
        await db.prepare(`
          SELECT id
          FROM leases
          WHERE property_id = ?
            AND user_id = ?
            AND status = 'active'
          LIMIT 1
        `)
        .bind(
          propertyId,
          uid
        )
        .first();

      if (activeLease) {
        return json({
          error:
            "Ce bien possède déjà un bail actif."
        }, 409);
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
          normalizeText(data.end_date) || null,
          monthlyRent,
          toInteger(data.deposit)
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
            properties.reference,
            properties.title AS property_title
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

      let data;

      try {
        data = await request.json();
      } catch {
        return json({
          error: "Données invalides."
        }, 400);
      }

      const leaseId =
        toInteger(data.lease_id);

      const amount =
        toInteger(data.amount);

      const dueDate =
        normalizeText(data.due_date);

      const paymentMethod =
        normalizeText(
          data.payment_method
        );

      if (
        !leaseId ||
        amount <= 0 ||
        !dueDate
      ) {
        return json({
          error:
            "Informations du loyer incomplètes."
        }, 400);
      }

      const lease =
        await db.prepare(`
          SELECT
            leases.id,
            leases.monthly_rent,
            properties.reference,
            tenants.first_name,
            tenants.last_name
          FROM leases
          INNER JOIN properties
            ON properties.id = leases.property_id
            AND properties.user_id = leases.user_id
          INNER JOIN tenants
            ON tenants.id = leases.tenant_id
            AND tenants.user_id = leases.user_id
          WHERE leases.id = ?
            AND leases.user_id = ?
          LIMIT 1
        `)
        .bind(
          leaseId,
          uid
        )
        .first();

      if (!lease) {
        return json({
          error:
            "Bail introuvable."
        }, 404);
      }

      const existing =
        await db.prepare(`
          SELECT id
          FROM payments
          WHERE lease_id = ?
            AND user_id = ?
            AND due_date = ?
          LIMIT 1
        `)
        .bind(
          leaseId,
          uid,
          dueDate
        )
        .first();

      if (existing) {
        return json({
          error:
            "Un paiement existe déjà pour cette échéance."
        }, 409);
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
          paymentMethod
        )
        .run();

      await createNotification(
        db,
        uid,
        "Nouveau loyer",
        `Un loyer de ${amount.toLocaleString("fr-FR")} FCFA a été enregistré pour ${lease.reference}.`,
        "payment"
      );

      return json({
        success: true,
        id: result.meta.last_row_id
      }, 201);
    }
  }


  /* =======================================================
     MARK PAYMENT AS PAID
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

    if (!Number.isInteger(paymentId)) {
      return json({
        error:
          "Identifiant de paiement invalide."
      }, 400);
    }

    const payment =
      await db.prepare(`
        SELECT
          payments.id,
          payments.amount,
          payments.status,
          payments.lease_id
        FROM payments
        WHERE payments.id = ?
          AND payments.user_id = ?
        LIMIT 1
      `)
      .bind(
        paymentId,
        uid
      )
      .first();

    if (!payment) {
      return json({
        error:
          "Paiement introuvable."
      }, 404);
    }

    if (payment.status === "paid") {
      return json({
        success: true,
        message:
          "Ce paiement est déjà enregistré comme payé."
      });
    }

    await db.prepare(`
      UPDATE payments
      SET
        status = 'paid',
        paid_date = ?,
        payment_method =
          CASE
            WHEN payment_method IS NULL
              OR payment_method = ''
            THEN 'Espèces'
            ELSE payment_method
          END
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
      `Le paiement de ${Number(payment.amount || 0).toLocaleString("fr-FR")} FCFA a été enregistré.`,
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


  /* =======================================================
     MARK NOTIFICATION AS READ
  ======================================================= */

  const notificationMatch =
    path.match(
      /^\/api\/notifications\/(\d+)\/read$/
    );

  if (
    notificationMatch &&
    method === "POST"
  ) {

    const notificationId =
      Number(
        notificationMatch[1]
      );

    await db.prepare(`
      UPDATE notifications
      SET is_read = 1
      WHERE id = ?
        AND user_id = ?
    `)
    .bind(
      notificationId,
      uid
    )
    .run();

    return json({
      success: true
    });
  }


  /* =======================================================
     MARK ALL NOTIFICATIONS AS READ
  ======================================================= */

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


  /* =======================================================
     DELETE SESSION / CLEAN EXPIRED SESSIONS
  ======================================================= */

  if (
    path === "/api/session/cleanup" &&
    method === "POST"
  ) {

    await db.prepare(`
      DELETE FROM sessions
      WHERE datetime(expires_at) <= datetime('now')
    `)
    .run();

    return json({
      success: true
    });
  }


  /* =======================================================
     LATE PAYMENTS
  ======================================================= */

  return json({
    error: "Route inconnue."
  }, 404);
}


/* =========================================================
   UPDATE LATE PAYMENTS
========================================================= */

async function updateLatePayments(
  db,
  userId
) {

  const currentDate =
    today();

  const late =
    await db.prepare(`
      SELECT
        payments.id,
        payments.lease_id,
        payments.amount,
        payments.due_date,
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
      currentDate
    )
    .all();


  for (
    const payment
    of (late.results || [])
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


    const notificationMessage =
      `Le loyer de ${payment.first_name} ${payment.last_name} pour ${payment.reference} est en retard. Référence paiement ${payment.id}.`;


    const existingNotification =
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
        `%Référence paiement ${payment.id}%`
      )
      .first();


    if (!existingNotification) {

      await createNotification(
        db,
        userId,
        "Loyer en retard",
        notificationMessage,
        "late"
      );


      const existingMessage =
        await db.prepare(`
          SELECT id
          FROM messages
          WHERE user_id = ?
            AND message LIKE ?
          LIMIT 1
        `)
        .bind(
          userId,
          `%paiement ${payment.id}%`
        )
        .first();


      if (!existingMessage) {

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
          `Le paiement ${payment.id} concernant ${payment.reference} est en retard.`
        )
        .run();
      }
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
      type,
      is_read
    )
    VALUES (?, ?, ?, ?, 0)
  `)
  .bind(
    userId,
    title,
    message,
    type
  )
  .run();
}
<!-- DASHBOARD -->

<section id="dashboard" class="page active">

  <div class="cards">

    <div class="card">
      <div class="card-title">Biens</div>
      <div id="statProperties" class="card-value">0</div>
    </div>

    <div class="card">
      <div class="card-title">Locataires</div>
      <div id="statTenants" class="card-value">0</div>
    </div>

    <div class="card">
      <div class="card-title">Biens occupés</div>
      <div id="statOccupied" class="card-value">0</div>
    </div>

    <div class="card">
      <div class="card-title">Loyers en retard</div>
      <div id="statLate" class="card-value">0 FCFA</div>
    </div>

  </div>

  <div class="panel">

    <div class="panel-head">
      <h2>Bienvenue sur ImmoFlow</h2>
    </div>

    <p class="muted">
      Gérez vos biens, propriétaires, locataires, baux et loyers
      depuis un seul espace.
    </p>

  </div>

</section>


<!-- PROPERTIES -->

<section id="properties" class="page">

  <div class="panel">

    <div class="panel-head">

      <h2>Biens immobiliers</h2>

      <button
        class="primary"
        onclick="openModal('propertyModal')"
      >
        + Ajouter un bien
      </button>

    </div>

    <div id="propertiesList">
      <p class="muted">Chargement...</p>
    </div>

  </div>

</section>


<!-- OWNERS -->

<section id="owners" class="page">

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

    <div id="ownersList">
      <p class="muted">Chargement...</p>
    </div>

  </div>

</section>


<!-- TENANTS -->

<section id="tenants" class="page">

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

    <div id="tenantsList">
      <p class="muted">Chargement...</p>
    </div>

  </div>

</section>


<!-- LEASES -->

<section id="leases" class="page">

  <div class="panel">

    <div class="panel-head">

      <h2>Baux</h2>

      <button
        class="primary"
        onclick="openModal('leaseModal')"
      >
        + Créer un bail
      </button>

    </div>

    <div id="leasesList">
      <p class="muted">Chargement...</p>
    </div>

  </div>

</section>


<!-- PAYMENTS -->

<section id="payments" class="page">

  <div class="panel">

    <div class="panel-head">

      <h2>Loyers</h2>

      <button
        class="primary"
        onclick="openModal('paymentModal')"
      >
        + Ajouter un loyer
      </button>

    </div>

    <div id="paymentsList">
      <p class="muted">Chargement...</p>
    </div>

  </div>

</section>


<!-- NOTIFICATIONS -->

<section id="notifications" class="page">

  <div class="panel">

    <div class="panel-head">

      <h2>Notifications</h2>

      <button
        class="secondary"
        onclick="readAll()"
      >
        Tout marquer comme lu
      </button>

    </div>

    <div id="notificationsList">
      <p class="muted">Chargement...</p>
    </div>

  </div>

</section>


<!-- MESSAGES -->

<section id="messages" class="page">

  <div class="panel">

    <div class="panel-head">

      <h2>Messages automatiques</h2>

    </div>

    <div id="messagesList">
      <p class="muted">Chargement...</p>
    </div>

  </div>

</section>

</main>

</div>


<!-- =====================================================
     OWNER MODAL
===================================================== -->

<div id="ownerModal" class="modal">

  <div class="modal-card">

    <h2>Ajouter un propriétaire</h2>

    <form id="ownerForm">

      <div class="field">

        <label>Nom complet</label>

        <input
          name="name"
          type="text"
          required
        >

      </div>

      <div class="grid">

        <div class="field">

          <label>Téléphone</label>

          <input
            name="phone"
            type="tel"
          >

        </div>

        <div class="field">

          <label>Email</label>

          <input
            name="email"
            type="email"
          >

        </div>

      </div>

      <div class="field">

        <label>Adresse</label>

        <input
          name="address"
          type="text"
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
===================================================== -->

<div id="propertyModal" class="modal">

  <div class="modal-card">

    <h2>Ajouter un bien</h2>

    <form id="propertyForm">

      <div class="grid">

        <div class="field">

          <label>Référence</label>

          <input
            name="reference"
            type="text"
            placeholder="IMM-001"
            required
          >

        </div>

        <div class="field">

          <label>Type</label>

          <select name="type">

            <option value="Appartement">
              Appartement
            </option>

            <option value="Maison">
              Maison
            </option>

            <option value="Villa">
              Villa
            </option>

            <option value="Studio">
              Studio
            </option>

            <option value="Bureau">
              Bureau
            </option>

            <option value="Local commercial">
              Local commercial
            </option>

            <option value="Terrain">
              Terrain
            </option>

          </select>

        </div>

      </div>


      <div class="field">

        <label>Nom du bien</label>

        <input
          name="title"
          type="text"
          placeholder="Appartement F3 Almadies"
          required
        >

      </div>


      <div class="grid">

        <div class="field">

          <label>Propriétaire</label>

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

          <label>Ville</label>

          <input
            name="city"
            type="text"
            placeholder="Dakar"
          >

        </div>

      </div>


      <div class="field">

        <label>Adresse</label>

        <input
          name="address"
          type="text"
        >

      </div>


      <div class="grid">

        <div class="field">

          <label>Chambres</label>

          <input
            name="bedrooms"
            type="number"
            min="0"
            value="0"
          >

        </div>

        <div class="field">

          <label>Loyer mensuel</label>

          <input
            name="rent"
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
          Ajouter le bien
        </button>

      </div>

    </form>

  </div>

</div>


<!-- =====================================================
     TENANT MODAL
===================================================== -->

<div id="tenantModal" class="modal">

  <div class="modal-card">

    <h2>Ajouter un locataire</h2>

    <form id="tenantForm">

      <div class="grid">

        <div class="field">

          <label>Prénom</label>

          <input
            name="first_name"
            type="text"
            required
          >

        </div>

        <div class="field">

          <label>Nom</label>

          <input
            name="last_name"
            type="text"
            required
          >

        </div>

      </div>


      <div class="grid">

        <div class="field">

          <label>Téléphone</label>

          <input
            name="phone"
            type="tel"
          >

        </div>

        <div class="field">

          <label>Email</label>

          <input
            name="email"
            type="email"
          >

        </div>

      </div>


      <div class="field">

        <label>Adresse</label>

        <input
          name="address"
          type="text"
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
          Ajouter
        </button>

      </div>

    </form>

  </div>

</div>


<!-- =====================================================
     LEASE MODAL
===================================================== -->

<div id="leaseModal" class="modal">

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
          <option value="">
            Chargement...
          </option>
        </select>

      </div>


      <div class="field">

        <label>Locataire</label>

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

          <label>Date de début</label>

          <input
            name="start_date"
            type="date"
            required
          >

        </div>

        <div class="field">

          <label>Date de fin</label>

          <input
            name="end_date"
            type="date"
          >

        </div>

      </div>


      <div class="grid">

        <div class="field">

          <label>Loyer mensuel</label>

          <input
            name="monthly_rent"
            type="number"
            min="1"
            required
          >

        </div>

        <div class="field">

          <label>Caution</label>

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
===================================================== -->

<div id="paymentModal" class="modal">

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
          <option value="">
            Chargement...
          </option>
        </select>

      </div>


      <div class="grid">

        <div class="field">

          <label>Montant</label>

          <input
            name="amount"
            type="number"
            min="1"
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

      </div>


      <div class="field">

        <label>Moyen de paiement</label>

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


<div id="toast" class="toast"></div>


<script>

/* =========================================================
   API
========================================================= */

async function api(url, options = {}) {

  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  let data;

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {

    throw new Error(
      data.error ||
      data.details ||
      "Une erreur est survenue."
    );

  }

  return data;
}


/* =========================================================
   TOAST
========================================================= */

let toastTimer = null;

function toast(message) {

  const element =
    document.getElementById("toast");

  if (!element) {
    return;
  }

  element.textContent = message;
  element.style.display = "block";

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    element.style.display = "none";
  }, 3000);
}


/* =========================================================
   AUTH
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
   PAGE NAVIGATION
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
    .forEach(section => {
      section.classList.remove("active");
    });

  const selected =
    document.getElementById(name);

  if (selected) {
    selected.classList.add("active");
  }

  document
    .querySelectorAll(".nav button")
    .forEach(item => {
      item.classList.remove("active");
    });

  if (button) {
    button.classList.add("active");
  }

  document.getElementById("pageTitle").textContent =
    pageTitles[name] || name;

  if (name === "dashboard") {
    loadDashboard();
  }

  if (name === "properties") {
    loadProperties();
  }

  if (name === "owners") {
    loadOwners();
  }

  if (name === "tenants") {
    loadTenants();
  }

  if (name === "leases") {
    loadLeases();
  }

  if (name === "payments") {
    loadPayments();
  }

  if (name === "notifications") {
    loadNotifications();
  }

  if (name === "messages") {
    loadMessages();
  }

}


/* =========================================================
   SESSION
========================================================= */

async function checkSession() {

  try {

    const data = await api("/api/me");

    if (data.user) {

      showApp(data.user);

    } else {

      showAuth();

    }

  } catch (error) {

    console.error(error);

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

  document.getElementById("agencyName").textContent =
    `${user.agency_name} — ${user.name}`;

  refreshAll();

}


/* =========================================================
   REGISTER FORM
========================================================= */

document
  .getElementById("registerForm")
  .addEventListener("submit", async event => {

    event.preventDefault();

    const data =
      Object.fromEntries(
        new FormData(event.target)
      );

    try {

      const result =
        await api(
          "/api/register",
          {
            method: "POST",
            body: JSON.stringify({
              agency_name: data.agency_name,
              name: data.name,
              email: data.email,
              password: data.password
            })
          }
        );

      toast("Compte créé avec succès.");

      showApp(result.user);

      event.target.reset();

    } catch (error) {

      toast(error.message);

    }

  });


/* =========================================================
   LOGIN FORM
========================================================= */

document
  .getElementById("loginForm")
  .addEventListener("submit", async event => {

    event.preventDefault();

    const email =
      document.getElementById("loginEmail").value.trim();

    const password =
      document.getElementById("loginPassword").value;

    try {

      const result =
        await api(
          "/api/login",
          {
            method: "POST",
            body: JSON.stringify({
              email,
              password
            })
          }
        );

      toast("Connexion réussie.");

      showApp(result.user);

      event.target.reset();

    } catch (error) {

      toast(error.message);

    }

  });


/* =========================================================
   LOGOUT
========================================================= */

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

    toast("Vous êtes déconnecté.");

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

  document.getElementById("statProperties").textContent =
    Number(data.properties || 0).toLocaleString("fr-FR");

  document.getElementById("statTenants").textContent =
    Number(data.tenants || 0).toLocaleString("fr-FR");

  document.getElementById("statOccupied").textContent =
    Number(data.occupied || 0).toLocaleString("fr-FR");

  document.getElementById("statLate").textContent =
    Number(data.late || 0).toLocaleString("fr-FR") +
    " FCFA";

  document.getElementById("notificationBadge").textContent =
    Number(data.unread || 0);

}


/* =========================================================
   PROPERTIES
========================================================= */

async function loadProperties() {

  const data =
    await api("/api/properties");

  document.getElementById("propertiesList").innerHTML =
    data.length
      ? `
        <table>

          <thead>

            <tr>
              <th>Référence</th>
              <th>Bien</th>
              <th>Propriétaire</th>
              <th>Ville</th>
              <th>Type</th>
              <th>Loyer</th>
              <th>Statut</th>
            </tr>

          </thead>

          <tbody>

            ${data.map(x => `

              <tr>

                <td>
                  ${escapeHtml(x.reference)}
                </td>

                <td>
                  ${escapeHtml(x.title)}
                </td>

                <td>
                  ${escapeHtml(x.owner_name || "—")}
                </td>

                <td>
                  ${escapeHtml(x.city || "—")}
                </td>

                <td>
                  ${escapeHtml(x.type || "—")}
                </td>

                <td>
                  ${Number(x.rent || 0)
                    .toLocaleString("fr-FR")}
                  FCFA
                </td>

                <td>
                  ${escapeHtml(
                    x.status === "occupied"
                      ? "Occupé"
                      : "Disponible"
                  )}
                </td>

              </tr>

            `).join("")}

          </tbody>

        </table>
      `
      : "<p>Aucun bien enregistré.</p>";

}


/* =========================================================
   OWNERS
========================================================= */

async function loadOwners() {

  const data =
    await api("/api/owners");

  document.getElementById("ownersList").innerHTML =
    data.length
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
                  ${escapeHtml(x.name)}
                </td>

                <td>
                  ${escapeHtml(x.phone)}
                </td>

                <td>
                  ${escapeHtml(x.email)}
                </td>

                <td>
                  ${escapeHtml(x.address)}
                </td>

              </tr>

            `).join("")}

          </tbody>

        </table>

      `
      : "<p>Aucun propriétaire.</p>";

}


/* =========================================================
   TENANTS
========================================================= */

async function loadTenants() {

  const data =
    await api("/api/tenants");

  document.getElementById("tenantsList").innerHTML =
    data.length
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

                <td>
                  ${escapeHtml(x.phone)}
                </td>

                <td>
                  ${escapeHtml(x.email)}
                </td>

                <td>
                  ${escapeHtml(x.address)}
                </td>

              </tr>

            `).join("")}

          </tbody>

        </table>

      `
      : "<p>Aucun locataire.</p>";

}


/* =========================================================
   LEASES
========================================================= */

async function loadLeases() {

  const data =
    await api("/api/leases");

  document.getElementById("leasesList").innerHTML =
    data.length
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
                  -
                  ${escapeHtml(x.property_title)}
                </td>

                <td>
                  ${escapeHtml(x.first_name)}
                  ${escapeHtml(x.last_name)}
                </td>

                <td>
                  ${escapeHtml(x.start_date)}
                </td>

                <td>
                  ${escapeHtml(x.end_date || "—")}
                </td>

                <td>
                  ${Number(x.monthly_rent || 0)
                    .toLocaleString("fr-FR")}
                  FCFA
                </td>

                <td>
                  ${escapeHtml(
                    x.status === "active"
                      ? "Actif"
                      : x.status
                  )}
                </td>

              </tr>

            `).join("")}

          </tbody>

        </table>

      `
      : "<p>Aucun bail.</p>";

}


/* =========================================================
   PAYMENTS
========================================================= */

async function loadPayments() {

  const data =
    await api("/api/payments");

  document.getElementById("paymentsList").innerHTML =
    data.length
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

                <td>
                  ${escapeHtml(x.reference)}
                </td>

                <td>
                  ${Number(x.amount || 0)
                    .toLocaleString("fr-FR")}
                  FCFA
                </td>

                <td>
                  ${escapeHtml(x.due_date)}
                </td>

                <td>
                  ${escapeHtml(
                    x.status === "paid"
                      ? "Payé"
                      : x.status === "late"
                      ? "En retard"
                      : "En attente"
                  )}
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
      : "<p>Aucun loyer enregistré.</p>";

}


/* =========================================================
   NOTIFICATIONS
========================================================= */

async function loadNotifications() {

  const data =
    await api("/api/notifications");

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


/* =========================================================
   MESSAGES
========================================================= */

async function loadMessages() {

  const data =
    await api("/api/messages");

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

    toast("Notifications marquées comme lues.");

  } catch (error) {

    toast(error.message);

  }

}


/* =========================================================
   PAYMENT ACTION
========================================================= */

async function markPaid(id) {

  try {

    await api(
      "/api/payments/" +
      Number(id) +
      "/paid",
      {
        method: "POST"
      }
    );

    toast("Paiement enregistré.");

    await loadPayments();
    await loadDashboard();

  } catch (error) {

    toast(error.message);

  }

}


/* =========================================================
   SELECT OPTIONS
========================================================= */

async function loadOwnerOptions() {

  const data =
    await api("/api/owners");

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

  const available =
    properties.filter(
      x => x.status !== "occupied"
    );

  propertySelect.innerHTML =
    available.length

      ? available.map(x => `

          <option value="${Number(x.id)}">
            ${escapeHtml(x.reference)}
            -
            ${escapeHtml(x.title)}
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

  const active =
    leases.filter(
      x => x.status === "active"
    );

  select.innerHTML =
    active.length

      ? active.map(x => `

          <option value="${Number(x.id)}">

            ${escapeHtml(x.reference)}
            -
            ${escapeHtml(x.first_name)}
            ${escapeHtml(x.last_name)}

          </option>

        `).join("")

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


/* =========================================================
   SECURITY
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
   FORMS
========================================================= */

document
  .getElementById("ownerForm")
  .addEventListener(
    "submit",
    async event => {

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

        event.target.reset();

        closeModals();

        toast("Propriétaire ajouté.");

        await loadOwners();
        await loadDashboard();

      } catch (error) {

        toast(error.message);

      }

    }
  );


document
  .getElementById("propertyForm")
  .addEventListener(
    "submit",
    async event => {

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

        event.target.reset();

        closeModals();

        toast("Bien ajouté.");

        await loadProperties();
        await loadDashboard();

      } catch (error) {

        toast(error.message);

      }

    }
  );


document
  .getElementById("tenantForm")
  .addEventListener(
    "submit",
    async event => {

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

        event.target.reset();

        closeModals();

        toast("Locataire ajouté.");

        await loadTenants();
        await loadDashboard();

      } catch (error) {

        toast(error.message);

      }

    }
  );


document
  .getElementById("leaseForm")
  .addEventListener(
    "submit",
    async event => {

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

        event.target.reset();

        closeModals();

        toast("Bail créé avec succès.");

        await loadLeases();
        await loadProperties();
        await loadDashboard();

      } catch (error) {

        toast(error.message);

      }

    }
  );


document
  .getElementById("paymentForm")
  .addEventListener(
    "submit",
    async event => {

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

        event.target.reset();

        closeModals();

        toast("Loyer enregistré.");

        await loadPayments();
        await loadDashboard();

      } catch (error) {

        toast(error.message);

      }

    }
  );


/* =========================================================
   CLOSE MODAL ON OUTSIDE CLICK
========================================================= */

document
  .querySelectorAll(".modal")
  .forEach(modal => {

    modal.addEventListener(
      "click",
      event => {

        if (event.target === modal) {
          modal.classList.remove("show");
        }

      }
    );

  });


/* =========================================================
   REFRESH ALL
========================================================= */

async function refreshAll() {

  try {

    await loadDashboard();

    await Promise.all([
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
      error.message.includes("connecté") ||
      error.message.includes("401")
    ) {

      showAuth();

    }

  }

}


/* =========================================================
   START
========================================================= */

checkSession();

</script>

</body>

</html>

`;
