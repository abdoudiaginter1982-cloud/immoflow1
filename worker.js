/* ============================================================
   IMMOFLOW - CLOUDFLARE WORKER
   1 seul fichier + Cloudflare D1
   ============================================================ */

const SESSION_DAYS = 7;

const HTML = String.raw`
<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ImmoFlow</title>

<style>
*{box-sizing:border-box}
body{margin:0;font-family:Arial,sans-serif;background:#f5f7fb;color:#172033}
button,input,select,textarea{font:inherit}
button{cursor:pointer}

.hidden{display:none!important}

.auth{
min-height:100vh;
display:flex;
align-items:center;
justify-content:center;
padding:20px;
background:#f5f7fb
}

.auth-box{
width:min(430px,100%);
background:white;
padding:30px;
border-radius:18px;
box-shadow:0 10px 35px rgba(0,0,0,.08)
}

.logo{
font-size:28px;
font-weight:800;
margin-bottom:8px
}

.logo span{color:#2563eb}

.subtitle{
color:#64748b;
margin-bottom:25px
}

.field{
display:flex;
flex-direction:column;
gap:6px;
margin-bottom:14px
}

.field input,.field select,.field textarea{
padding:12px;
border:1px solid #d7dce5;
border-radius:9px;
outline:none;
width:100%
}

.primary{
background:#2563eb;
color:white;
border:0;
padding:11px 15px;
border-radius:9px;
font-weight:700
}

.secondary{
background:#e5e7eb;
border:0;
padding:11px 15px;
border-radius:9px
}

.full{width:100%}

.auth-switch{
margin-top:18px;
text-align:center;
color:#64748b
}

.auth-switch button{
border:0;
background:none;
color:#2563eb;
font-weight:700
}

.app{display:flex;min-height:100vh}

.sidebar{
width:240px;
background:#111827;
color:white;
position:fixed;
left:0;
top:0;
bottom:0;
padding:22px 14px;
z-index:20
}

.logo-side{
font-size:25px;
font-weight:800;
margin:5px 10px 30px
}

.logo-side span{color:#60a5fa}

.menu button{
display:block;
width:100%;
border:0;
background:transparent;
color:#cbd5e1;
padding:13px 14px;
margin:4px 0;
border-radius:9px;
text-align:left
}

.menu button:hover,.menu button.active{
background:#1f2937;
color:white
}

.logout{
position:absolute;
bottom:20px;
left:14px;
right:14px
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

.top h1{margin:0 0 4px}
.top small{color:#64748b}

.page{display:none}
.page.active{display:block}

.cards{
display:grid;
grid-template-columns:repeat(4,1fr);
gap:15px;
margin-bottom:20px
}

.card{
background:white;
padding:20px;
border-radius:15px;
box-shadow:0 3px 15px rgba(0,0,0,.05)
}

.label{font-size:13px;color:#64748b}
.value{font-size:26px;font-weight:800;margin-top:8px}

.panel{
background:white;
padding:20px;
border-radius:15px;
margin-bottom:20px;
box-shadow:0 3px 15px rgba(0,0,0,.05)
}

.panel-head{
display:flex;
justify-content:space-between;
align-items:center;
gap:10px;
margin-bottom:15px
}

table{
width:100%;
border-collapse:collapse
}

th,td{
padding:12px 8px;
border-bottom:1px solid #edf0f4;
text-align:left
}

th{font-size:13px;color:#64748b}

.status{
padding:5px 9px;
border-radius:20px;
font-size:12px;
font-weight:700
}

.paid{background:#dcfce7;color:#166534}
.pending{background:#fef3c7;color:#92400e}
.late{background:#fee2e2;color:#991b1b}
.available{background:#dbeafe;color:#1d4ed8}
.occupied{background:#dcfce7;color:#166534}

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

.modal.show{display:flex}

.modal-box{
background:white;
padding:25px;
border-radius:18px;
width:min(650px,100%);
max-height:90vh;
overflow:auto
}

.grid{
display:grid;
grid-template-columns:1fr 1fr;
gap:13px
}

.field.full{grid-column:1/-1}

.actions{
display:flex;
justify-content:flex-end;
gap:10px;
margin-top:18px
}

.notification{
padding:15px;
border-bottom:1px solid #eee
}

.notification.unread{background:#eff6ff}

.notification-title{font-weight:700;margin-bottom:5px}
.notification-message{color:#64748b;font-size:14px}

.badge{
display:inline-flex;
align-items:center;
justify-content:center;
min-width:20px;
height:20px;
padding:0 5px;
background:#ef4444;
color:white;
border-radius:20px;
font-size:11px
}

.empty{
padding:35px;
text-align:center;
color:#64748b
}

.search{
width:100%;
padding:11px;
border:1px solid #ddd;
border-radius:8px;
margin-bottom:15px
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

@media(max-width:900px){
.sidebar{width:70px}
.logo-side{font-size:0;text-align:center}
.logo-side span{font-size:22px}
.menu button{font-size:0;text-align:center}
.menu button:first-letter{font-size:20px}
.logout{font-size:0}
.main{
margin-left:70px;
width:calc(100% - 70px)
}
.cards{grid-template-columns:1fr 1fr}
}

@media(max-width:600px){
.main{padding:15px}
.cards{grid-template-columns:1fr}
.grid{grid-template-columns:1fr}
.field.full{grid-column:auto}
.panel{overflow-x:auto}
table{min-width:700px}
}
</style>
</head>

<body>

<!-- ================= AUTH ================= -->

<div id="auth" class="auth">

<div class="auth-box">

<div class="logo">Immo<span>Flow</span></div>

<div class="subtitle">
Gestion immobilière simple pour les agences
</div>

<div id="loginBox">

<h2>Connexion</h2>

<form id="loginForm">

<div class="field">
<label>Email</label>
<input id="loginEmail" type="email" required>
</div>

<div class="field">
<label>Mot de passe</label>
<input id="loginPassword" type="password" required>
</div>

<button class="primary full">Se connecter</button>

</form>

<div class="auth-switch">
Pas encore de compte ?
<button onclick="showRegister()">Créer un compte</button>
</div>

</div>


<div id="registerBox" class="hidden">

<h2>Créer votre compte</h2>

<form id="registerForm">

<div class="field">
<label>Nom de l'agence</label>
<input id="regAgency" required>
</div>

<div class="field">
<label>Votre nom</label>
<input id="regName" required>
</div>

<div class="field">
<label>Email</label>
<input id="regEmail" type="email" required>
</div>

<div class="field">
<label>Mot de passe</label>
<input id="regPassword" type="password" minlength="6" required>
</div>

<button class="primary full">Créer mon compte</button>

</form>

<div class="auth-switch">
Déjà inscrit ?
<button onclick="showLogin()">Se connecter</button>
</div>

</div>

</div>
</div>


<!-- ================= APP ================= -->

<div id="app" class="app hidden">

<aside class="sidebar">

<div class="logo-side">
Immo<span>Flow</span>
</div>

<div class="menu">

<button class="active" onclick="go('dashboard',this)">
🏠 Tableau de bord
</button>

<button onclick="go('properties',this)">
🏢 Biens
</button>

<button onclick="go('owners',this)">
👔 Propriétaires
</button>

<button onclick="go('tenants',this)">
👤 Locataires
</button>

<button onclick="go('leases',this)">
📄 Baux
</button>

<button onclick="go('payments',this)">
💰 Loyers
</button>

<button onclick="go('messages',this)">
💬 Messages
</button>

<button onclick="go('notifications',this)">
🔔 Notifications
<span id="badge" class="badge">0</span>
</button>

</div>

<button class="secondary logout" onclick="logout()">
Déconnexion
</button>

</aside>


<main class="main">

<div class="top">

<div>
<h1 id="pageTitle">Tableau de bord</h1>
<small id="agencyName"></small>
</div>

</div>


<!-- DASHBOARD -->

<section id="dashboard" class="page active">

<div class="cards">

<div class="card">
<div class="label">Biens</div>
<div class="value" id="statProperties">0</div>
</div>

<div class="card">
<div class="label">Occupés</div>
<div class="value" id="statOccupied">0</div>
</div>

<div class="card">
<div class="label">Locataires</div>
<div class="value" id="statTenants">0</div>
</div>

<div class="card">
<div class="label">Impayés</div>
<div class="value" id="statLate">0 FCFA</div>
</div>

</div>

<div class="panel">

<div class="panel-head">
<h2>Bienvenue sur ImmoFlow</h2>
<button class="primary" onclick="automation()">
🔄 Vérifier les loyers
</button>
</div>

<p>
Les échéances et impayés sont automatiquement contrôlés.
Les notifications apparaissent directement dans ImmoFlow.
</p>

</div>

<div class="panel">

<h2>Actions rapides</h2>

<button class="primary" onclick="openModal('property')">
+ Ajouter un bien
</button>

<button class="primary" onclick="openModal('tenant')">
+ Ajouter un locataire
</button>

</div>

</section>


<!-- PROPERTIES -->

<section id="properties" class="page">

<div class="panel">

<div class="panel-head">
<h2>Biens</h2>
<button class="primary" onclick="openModal('property')">
+ Ajouter
</button>
</div>

<input class="search"
placeholder="Rechercher..."
oninput="filterRows(this,'propertiesTable')">

<div id="propertiesTable"></div>

</div>

</section>


<!-- OWNERS -->

<section id="owners" class="page">

<div class="panel">

<div class="panel-head">
<h2>Propriétaires</h2>
<button class="primary" onclick="openModal('owner')">
+ Ajouter
</button>
</div>

<div id="ownersTable"></div>

</div>

</section>


<!-- TENANTS -->

<section id="tenants" class="page">

<div class="panel">

<div class="panel-head">
<h2>Locataires</h2>
<button class="primary" onclick="openModal('tenant')">
+ Ajouter
</button>
</div>

<div id="tenantsTable"></div>

</div>

</section>


<!-- LEASES -->

<section id="leases" class="page">

<div class="panel">

<div class="panel-head">
<h2>Baux</h2>
<button class="primary" onclick="openModal('lease')">
+ Ajouter
</button>
</div>

<div id="leasesTable"></div>

</div>

</section>


<!-- PAYMENTS -->

<section id="payments" class="page">

<div class="panel">

<div class="panel-head">
<h2>Loyers</h2>
<button class="primary" onclick="openModal('payment')">
+ Ajouter
</button>
</div>

<div id="paymentsTable"></div>

</div>

</section>


<!-- MESSAGES -->

<section id="messages" class="page">

<div class="panel">

<div class="panel-head">
<h2>Messages automatiques</h2>
</div>

<div id="messagesList"></div>

</div>

</section>


<!-- NOTIFICATIONS -->

<section id="notifications" class="page">

<div class="panel">

<div class="panel-head">
<h2>Notifications</h2>

<button class="secondary" onclick="readAll()">
Tout lire
</button>

</div>

<div id="notificationsList"></div>

</div>

</section>

</main>
</div>


<!-- ================= PROPERTY MODAL ================= -->

<div id="propertyModal" class="modal">

<div class="modal-box">

<h2>Ajouter un bien</h2>

<form id="propertyForm">

<div class="grid">

<div class="field">
<label>Référence *</label>
<input name="reference" required>
</div>

<div class="field">
<label>Nom du bien *</label>
<input name="title" required>
</div>

<div class="field">
<label>Adresse</label>
<input name="address">
</div>

<div class="field">
<label>Ville</label>
<input name="city" value="Thiès">
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
<input type="number" name="bedrooms" value="0">
</div>

<div class="field">
<label>Loyer</label>
<input type="number" name="rent_amount" value="0">
</div>

<div class="field">
<label>Propriétaire</label>
<select id="propertyOwner" name="owner_id"></select>
</div>

</div>

<div class="actions">
<button type="button" class="secondary" onclick="closeModals()">Annuler</button>
<button class="primary">Enregistrer</button>
</div>

</form>
</div>
</div>


<!-- OWNER -->

<div id="ownerModal" class="modal">

<div class="modal-box">

<h2>Ajouter un propriétaire</h2>

<form id="ownerForm">

<div class="field">
<label>Nom complet *</label>
<input name="name" required>
</div>

<div class="field">
<label>Téléphone</label>
<input name="phone">
</div>

<div class="field">
<label>Email</label>
<input name="email" type="email">
</div>

<div class="field">
<label>Adresse</label>
<input name="address">
</div>

<div class="actions">
<button type="button" class="secondary" onclick="closeModals()">Annuler</button>
<button class="primary">Enregistrer</button>
</div>

</form>
</div>
</div>


<!-- TENANT -->

<div id="tenantModal" class="modal">

<div class="modal-box">

<h2>Ajouter un locataire</h2>

<form id="tenantForm">

<div class="grid">

<div class="field">
<label>Prénom *</label>
<input name="first_name" required>
</div>

<div class="field">
<label>Nom *</label>
<input name="last_name" required>
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
<button type="button" class="secondary" onclick="closeModals()">Annuler</button>
<button class="primary">Enregistrer</button>
</div>

</form>
</div>
</div>


<!-- LEASE -->

<div id="leaseModal" class="modal">

<div class="modal-box">

<h2>Créer un bail</h2>

<form id="leaseForm">

<div class="field">
<label>Bien *</label>
<select id="leaseProperty" name="property_id" required></select>
</div>

<div class="field">
<label>Locataire *</label>
<select id="leaseTenant" name="tenant_id" required></select>
</div>

<div class="grid">

<div class="field">
<label>Date début *</label>
<input type="date" name="start_date" required>
</div>

<div class="field">
<label>Date fin</label>
<input type="date" name="end_date">
</div>

<div class="field">
<label>Loyer mensuel *</label>
<input type="number" name="monthly_rent" required>
</div>

<div class="field">
<label>Dépôt</label>
<input type="number" name="deposit" value="0">
</div>

</div>

<div class="actions">
<button type="button" class="secondary" onclick="closeModals()">Annuler</button>
<button class="primary">Créer</button>
</div>

</form>
</div>
</div>


<!-- PAYMENT -->

<div id="paymentModal" class="modal">

<div class="modal-box">

<h2>Ajouter un loyer</h2>

<form id="paymentForm">

<div class="field">
<label>Bail *</label>
<select id="paymentLease" name="lease_id" required></select>
</div>

<div class="grid">

<div class="field">
<label>Montant *</label>
<input type="number" name="amount" required>
</div>

<div class="field">
<label>Date d'échéance *</label>
<input type="date" name="due_date" required>
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

</div>

<div class="actions">
<button type="button" class="secondary" onclick="closeModals()">Annuler</button>
<button class="primary">Enregistrer</button>
</div>

</form>
</div>
</div>


<div id="toast" class="toast"></div>


<script>

const titles={
dashboard:"Tableau de bord",
properties:"Biens",
owners:"Propriétaires",
tenants:"Locataires",
leases:"Baux",
payments:"Loyers",
messages:"Messages",
notifications:"Notifications"
};


function esc(v){
return String(v??"")
.replaceAll("&","&amp;")
.replaceAll("<","&lt;")
.replaceAll(">","&gt;")
.replaceAll('"',"&quot;")
.replaceAll("'","&#039;");
}


function money(v){
return Number(v||0).toLocaleString("fr-FR")+" FCFA";
}


async function api(url,options={}){
const r=await fetch(url,{
...options,
headers:{
"Content-Type":"application/json",
...(options.headers||{})
}
});

const d=await r.json();

if(!r.ok)throw new Error(d.error||"Erreur");

return d;
}


function toast(text){
const t=document.getElementById("toast");
t.textContent=text;
t.style.display="block";
setTimeout(()=>t.style.display="none",3000);
}


function showRegister(){
document.getElementById("loginBox").classList.add("hidden");
document.getElementById("registerBox").classList.remove("hidden");
}


function showLogin(){
document.getElementById("registerBox").classList.add("hidden");
document.getElementById("loginBox").classList.remove("hidden");
}


function showApp(user){

document.getElementById("auth").classList.add("hidden");
document.getElementById("app").classList.remove("hidden");

document.getElementById("agencyName").textContent=
user.agency_name+" — "+user.name;

loadDashboard();

}


function showAuth(){

document.getElementById("app").classList.add("hidden");
document.getElementById("auth").classList.remove("hidden");

}


async function checkSession(){

try{

const d=await api("/api/me");

if(d.user)showApp(d.user);
else showAuth();

}catch{

showAuth();

}

}


document.getElementById("registerForm")
.addEventListener("submit",async e=>{

e.preventDefault();

try{

const d=await api("/api/register",{
method:"POST",
body:JSON.stringify({
agency_name:document.getElementById("regAgency").value,
name:document.getElementById("regName").value,
email:document.getElementById("regEmail").value,
password:document.getElementById("regPassword").value
})
});

showApp(d.user);
toast("Compte créé avec succès.");

}catch(err){

toast(err.message);

}

});


document.getElementById("loginForm")
.addEventListener("submit",async e=>{

e.preventDefault();

try{

const d=await api("/api/login",{
method:"POST",
body:JSON.stringify({
email:document.getElementById("loginEmail").value,
password:document.getElementById("loginPassword").value
})
});

showApp(d.user);
toast("Connexion réussie.");

}catch(err){

toast(err.message);

}

});


async function logout(){

await api("/api/logout",{method:"POST"});

showAuth();
showLogin();

}


function go(name,btn){

document.querySelectorAll(".page")
.forEach(x=>x.classList.remove("active"));

document.getElementById(name)
.classList.add("active");

document.querySelectorAll(".menu button")
.forEach(x=>x.classList.remove("active"));

if(btn)btn.classList.add("active");

document.getElementById("pageTitle").textContent=titles[name];

if(name==="dashboard")loadDashboard();
if(name==="properties")loadProperties();
if(name==="owners")loadOwners();
if(name==="tenants")loadTenants();
if(name==="leases")loadLeases();
if(name==="payments")loadPayments();
if(name==="messages")loadMessages();
if(name==="notifications")loadNotifications();

}


async function loadDashboard(){

const d=await api("/api/dashboard");

document.getElementById("statProperties").textContent=d.properties;
document.getElementById("statOccupied").textContent=d.occupied;
document.getElementById("statTenants").textContent=d.tenants;
document.getElementById("statLate").textContent=money(d.late);
document.getElementById("badge").textContent=d.unread;

}


async function loadProperties(){

const data=await api("/api/properties");

if(!data.length){

document.getElementById("propertiesTable").innerHTML=
'<div class="empty">Aucun bien enregistré.</div>';

return;
}

document.getElementById("propertiesTable").innerHTML=`

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

<td>${esc(p.reference)}</td>
<td>${esc(p.title)}</td>
<td>${esc(p.owner_name||"—")}</td>
<td>${esc(p.type)}</td>
<td>${money(p.rent_amount)}</td>

<td>
<span class="status ${p.status}">
${p.status==="occupied"?"Occupé":"Disponible"}
</span>
</td>

</tr>

`).join("")}

</tbody>
</table>
`;

}


async function loadOwners(){

const data=await api("/api/owners");

if(!data.length){

document.getElementById("ownersTable").innerHTML=
'<div class="empty">Aucun propriétaire.</div>';

return;
}

document.getElementById("ownersTable").innerHTML=`

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

${data.map(o=>`

<tr>
<td>${esc(o.name)}</td>
<td>${esc(o.phone)}</td>
<td>${esc(o.email)}</td>
<td>${esc(o.address)}</td>
</tr>

`).join("")}

</tbody>
</table>
`;

}


async function loadTenants(){

const data=await api("/api/tenants");

if(!data.length){

document.getElementById("tenantsTable").innerHTML=
'<div class="empty">Aucun locataire.</div>';

return;
}

document.getElementById("tenantsTable").innerHTML=`

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

${data.map(t=>`

<tr>
<td>${esc(t.first_name)} ${esc(t.last_name)}</td>
<td>${esc(t.phone)}</td>
<td>${esc(t.email)}</td>
<td>${esc(t.address)}</td>
</tr>

`).join("")}

</tbody>
</table>
`;

}


async function loadLeases(){

const data=await api("/api/leases");

if(!data.length){

document.getElementById("leasesTable").innerHTML=
'<div class="empty">Aucun bail.</div>';

return;
}

document.getElementById("leasesTable").innerHTML=`

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

${data.map(l=>`

<tr>
<td>${esc(l.reference)}</td>
<td>${esc(l.first_name)} ${esc(l.last_name)}</td>
<td>${esc(l.start_date)}</td>
<td>${money(l.monthly_rent)}</td>
<td><span class="status occupied">Actif</span></td>
</tr>

`).join("")}

</tbody>
</table>
`;

}


async function loadPayments(){

const data=await api("/api/payments");

if(!data.length){

document.getElementById("paymentsTable").innerHTML=
'<div class="empty">Aucun loyer.</div>';

return;
}

document.getElementById("paymentsTable").innerHTML=`

<table>
<thead>
<tr>
<th>Locataire</th>
<th>Bien</th>
<th>Montant</th>
<th>Échéance</th>
<th>Statut</th>
<th></th>
</tr>
</thead>

<tbody>

${data.map(p=>`

<tr>

<td>${esc(p.first_name)} ${esc(p.last_name)}</td>
<td>${esc(p.reference)}</td>
<td>${money(p.amount)}</td>
<td>${esc(p.due_date)}</td>

<td>
<span class="status ${p.status}">
${p.status==="paid"?"Payé":p.status==="late"?"En retard":"En attente"}
</span>
</td>

<td>
${
p.status!=="paid"
?`<button class="secondary" onclick="markPaid(${p.id})">✓ Payé</button>`
:""
}
</td>

</tr>

`).join("")}

</tbody>
</table>
`;

}


async function loadMessages(){

const data=await api("/api/messages");

if(!data.length){

document.getElementById("messagesList").innerHTML=
'<div class="empty">Aucun message.</div>';

return;
}

document.getElementById("messagesList").innerHTML=
data.map(m=>`

<div class="notification">

<div class="notification-title">
${esc(m.title)}
</div>

<div class="notification-message">
${esc(m.content)}
</div>

<small>
${m.first_name?esc(m.first_name+" "+m.last_name):"Système"}
</small>

</div>

`).join("");

}


async function loadNotifications(){

const data=await api("/api/notifications");

if(!data.length){

document.getElementById("notificationsList").innerHTML=
'<div class="empty">Aucune notification.</div>';

return;
}

document.getElementById("notificationsList").innerHTML=
data.map(n=>`

<div class="notification ${Number(n.is_read)===0?"unread":""}"
onclick="readNotification(${n.id})">

<div class="notification-title">
${esc(n.title)}
</div>

<div class="notification-message">
${esc(n.message)}
</div>

<small>${esc(n.created_at)}</small>

</div>

`).join("");

}


async function readNotification(id){

await api("/api/notifications/"+id+"/read",{method:"POST"});
loadNotifications();
loadDashboard();

}


async function readAll(){

await api("/api/notifications/read-all",{method:"POST"});

loadNotifications();
loadDashboard();

}


async function markPaid(id){

await api("/api/payments/"+id+"/paid",{method:"POST"});

toast("Paiement enregistré.");

loadPayments();
loadDashboard();

}


async function automation(){

const d=await api("/api/automation",{method:"POST"});

toast(d.created+" notification(s) générée(s).");

loadDashboard();

}


function openModal(name){

document.getElementById(name+"Modal").classList.add("show");

if(name==="property")loadOwnerOptions();
if(name==="lease")loadLeaseOptions();
if(name==="payment")loadPaymentOptions();

}


function closeModals(){

document.querySelectorAll(".modal")
.forEach(x=>x.classList.remove("show"));

}


async function loadOwnerOptions(){

const data=await api("/api/owners");

document.getElementById("propertyOwner").innerHTML=
'<option value="">Aucun</option>'+
data.map(o=>
`<option value="${o.id}">${esc(o.name)}</option>`
).join("");

}


async function loadLeaseOptions(){

const p=await api("/api/properties");
const t=await api("/api/tenants");

document.getElementById("leaseProperty").innerHTML=
p.filter(x=>x.status!=="occupied")
.map(x=>
`<option value="${x.id}">${esc(x.reference)} - ${esc(x.title)}</option>`
).join("");

document.getElementById("leaseTenant").innerHTML=
t.map(x=>
`<option value="${x.id}">${esc(x.first_name)} ${esc(x.last_name)}</option>`
).join("");

}


async function loadPaymentOptions(){

const data=await api("/api/leases");

document.getElementById("paymentLease").innerHTML=
data.filter(x=>x.status==="active")
.map(x=>
`<option value="${x.id}">
${esc(x.reference)} - ${esc(x.first_name)} ${esc(x.last_name)}
</option>`
).join("");

}


document.getElementById("propertyForm")
.addEventListener("submit",async e=>{

e.preventDefault();

try{

const d=Object.fromEntries(new FormData(e.target));

await api("/api/properties",{
method:"POST",
body:JSON.stringify(d)
});

closeModals();
e.target.reset();

toast("Bien ajouté.");

loadProperties();
loadDashboard();

}catch(err){toast(err.message)}

});


document.getElementById("ownerForm")
.addEventListener("submit",async e=>{

e.preventDefault();

try{

const d=Object.fromEntries(new FormData(e.target));

await api("/api/owners",{
method:"POST",
body:JSON.stringify(d)
});

closeModals();
e.target.reset();

toast("Propriétaire ajouté.");

loadOwners();

}catch(err){toast(err.message)}

});


document.getElementById("tenantForm")
.addEventListener("submit",async e=>{

e.preventDefault();

try{

const d=Object.fromEntries(new FormData(e.target));

await api("/api/tenants",{
method:"POST",
body:JSON.stringify(d)
});

closeModals();
e.target.reset();

toast("Locataire ajouté.");

loadTenants();
loadDashboard();

}catch(err){toast(err.message)}

});


document.getElementById("leaseForm")
.addEventListener("submit",async e=>{

e.preventDefault();

try{

const d=Object.fromEntries(new FormData(e.target));

await api("/api/leases",{
method:"POST",
body:JSON.stringify(d)
});

closeModals();
e.target.reset();

toast("Bail créé.");

loadLeases();
loadProperties();
loadDashboard();

}catch(err){toast(err.message)}

});


document.getElementById("paymentForm")
.addEventListener("submit",async e=>{

e.preventDefault();

try{

const d=Object.fromEntries(new FormData(e.target));

await api("/api/payments",{
method:"POST",
body:JSON.stringify(d)
});

closeModals();
e.target.reset();

toast("Loyer ajouté.");

loadPayments();

}catch(err){toast(err.message)}

});


function filterRows(input,id){

const table=document
.getElementById(id)
.querySelector("table");

if(!table)return;

const q=input.value.toLowerCase();

table.querySelectorAll("tbody tr")
.forEach(row=>{
row.style.display=
row.innerText.toLowerCase().includes(q)?"":"none";
});

}


checkSession();

</script>

</body>
</html>
`;


/* ============================================================
   DATABASE
   ============================================================ */

const SCHEMA = [

`CREATE TABLE IF NOT EXISTS users (
id INTEGER PRIMARY KEY AUTOINCREMENT,
agency_name TEXT NOT NULL,
name TEXT NOT NULL,
email TEXT NOT NULL UNIQUE,
password_hash TEXT NOT NULL,
created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`,

`CREATE TABLE IF NOT EXISTS sessions (
id INTEGER PRIMARY KEY AUTOINCREMENT,
user_id INTEGER NOT NULL,
token_hash TEXT NOT NULL UNIQUE,
expires_at TEXT NOT NULL,
created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`,

`CREATE TABLE IF NOT EXISTS owners (
id INTEGER PRIMARY KEY AUTOINCREMENT,
user_id INTEGER NOT NULL,
name TEXT NOT NULL,
phone TEXT,
email TEXT,
address TEXT,
created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`,

`CREATE TABLE IF NOT EXISTS properties (
id INTEGER PRIMARY KEY AUTOINCREMENT,
user_id INTEGER NOT NULL,
owner_id INTEGER,
reference TEXT NOT NULL,
title TEXT NOT NULL,
address TEXT,
city TEXT DEFAULT 'Thiès',
type TEXT DEFAULT 'Appartement',
bedrooms INTEGER DEFAULT 0,
rent_amount INTEGER DEFAULT 0,
status TEXT DEFAULT 'available',
created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`,

`CREATE TABLE IF NOT EXISTS tenants (
id INTEGER PRIMARY KEY AUTOINCREMENT,
user_id INTEGER NOT NULL,
first_name TEXT NOT NULL,
last_name TEXT NOT NULL,
phone TEXT,
email TEXT,
address TEXT,
created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`,

`CREATE TABLE IF NOT EXISTS leases (
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
)`,

`CREATE TABLE IF NOT EXISTS payments (
id INTEGER PRIMARY KEY AUTOINCREMENT,
user_id INTEGER NOT NULL,
lease_id INTEGER NOT NULL,
amount INTEGER NOT NULL,
due_date TEXT NOT NULL,
paid_date TEXT,
status TEXT DEFAULT 'pending',
payment_method TEXT,
reference TEXT,
created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`,

`CREATE TABLE IF NOT EXISTS notifications (
id INTEGER PRIMARY KEY AUTOINCREMENT,
user_id INTEGER NOT NULL,
type TEXT NOT NULL,
title TEXT NOT NULL,
message TEXT NOT NULL,
entity_type TEXT,
entity_id INTEGER,
is_read INTEGER DEFAULT 0,
created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`,

`CREATE TABLE IF NOT EXISTS messages (
id INTEGER PRIMARY KEY AUTOINCREMENT,
user_id INTEGER NOT NULL,
tenant_id INTEGER,
title TEXT NOT NULL,
content TEXT NOT NULL,
type TEXT DEFAULT 'automatic',
status TEXT DEFAULT 'sent',
created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`,

`CREATE INDEX IF NOT EXISTS idx_sessions_token
ON sessions(token_hash)`,

`CREATE INDEX IF NOT EXISTS idx_properties_user
ON properties(user_id)`,

`CREATE INDEX IF NOT EXISTS idx_tenants_user
ON tenants(user_id)`,

`CREATE INDEX IF NOT EXISTS idx_leases_user
ON leases(user_id)`,

`CREATE INDEX IF NOT EXISTS idx_payments_user
ON payments(user_id)`,

`CREATE INDEX IF NOT EXISTS idx_notifications_user
ON notifications(user_id)`

];


/* ============================================================
   HELPERS
   ============================================================ */

function json(data,status=200,extra={}){

return new Response(JSON.stringify(data),{
status,
headers:{
"Content-Type":"application/json;charset=UTF-8",
...extra
}
});

}


function today(){

return new Date().toISOString().slice(0,10);

}


function addDays(date,days){

const d=new Date(date+"T00:00:00Z");

d.setUTCDate(d.getUTCDate()+days);

return d.toISOString().slice(0,10);

}


async function sha256(value){

const bytes=new TextEncoder().encode(value);

const hash=await crypto.subtle.digest(
"SHA-256",
bytes
);

return [...new Uint8Array(hash)]
.map(x=>x.toString(16).padStart(2,"0"))
.join("");

}


function randomToken(){

return crypto.randomUUID()+"-"+crypto.randomUUID();

}


async function initDB(env){

for(const sql of SCHEMA){

await env.DB.prepare(sql).run();

}

}


async function body(request){

try{
return await request.json();
}catch{
return {};
}

}


/* ============================================================
   SESSION
   ============================================================ */

async function createSession(env,userId){

const raw=randomToken();
const hash=await sha256(raw);

const expires=new Date(
Date.now()+SESSION_DAYS*86400000
).toISOString();

await env.DB.prepare(`
INSERT INTO sessions
(user_id,token_hash,expires_at)
VALUES(?,?,?)
`)
.bind(userId,hash,expires)
.run();

return raw;

}


function cookieToken(request){

const cookie=request.headers.get("Cookie")||"";

const match=cookie.match(
/(?:^|;\s*)immoflow_session=([^;]+)/
);

return match?match[1]:null;

}


async function currentUser(request,env){

const token=cookieToken(request);

if(!token)return null;

const hash=await sha256(token);

const row=await env.DB.prepare(`
SELECT
u.id,
u.agency_name,
u.name,
u.email
FROM sessions s
JOIN users u ON u.id=s.user_id
WHERE s.token_hash=?
AND datetime(s.expires_at)>datetime('now')
`)
.bind(hash)
.first();

return row||null;

}


/* ============================================================
   NOTIFICATIONS
   ============================================================ */

async function notify(
env,
userId,
type,
title,
message,
entityType=null,
entityId=null
){

await env.DB.prepare(`
INSERT INTO notifications
(user_id,type,title,message,entity_type,entity_id)
VALUES(?,?,?,?,?,?)
`)
.bind(
userId,
type,
title,
message,
entityType,
entityId
)
.run();

}


/* ============================================================
   AUTOMATION
   ============================================================ */

async function runAutomation(env,userId){

const now=today();

await env.DB.prepare(`
UPDATE payments
SET status='late'
WHERE user_id=?
AND status='pending'
AND due_date<?
`)
.bind(userId,now)
.run();


const late=await env.DB.prepare(`
SELECT
p.id,
t.id tenant_id,
t.first_name,
t.last_name,
pr.reference
FROM payments p
JOIN leases l ON l.id=p.lease_id
JOIN tenants t ON t.id=l.tenant_id
JOIN properties pr ON pr.id=l.property_id
WHERE p.user_id=?
AND p.status='late'
`)
.bind(userId)
.all();


let created=0;


for(const p of late.results){

const exists=await env.DB.prepare(`
SELECT id
FROM notifications
WHERE user_id=?
AND type='late'
AND entity_id=?
AND date(created_at)=date('now')
`)
.bind(userId,p.id)
.first();


if(!exists){

await notify(
env,
userId,
"late",
"Loyer en retard",
`Le loyer de ${p.first_name} ${p.last_name} pour ${p.reference} est en retard.`,
"payment",
p.id
);


await env.DB.prepare(`
INSERT INTO messages
(user_id,tenant_id,title,content,type,status)
VALUES(?,?,?,?,?,?)
`)
.bind(
userId,
p.tenant_id,
"Rappel de loyer",
`Bonjour ${p.first_name}, votre loyer pour le bien ${p.reference} est en retard. Merci de régulariser votre situation.`,
"automatic",
"sent"
)
.run();


created++;

}

}


const soon=addDays(now,2);

const upcoming=await env.DB.prepare(`
SELECT
p.id,
t.first_name,
t.last_name,
pr.reference
FROM payments p
JOIN leases l ON l.id=p.lease_id
JOIN tenants t ON t.id=l.tenant_id
JOIN properties pr ON pr.id=l.property_id
WHERE p.user_id=?
AND p.status='pending'
AND p.due_date=?
`)
.bind(userId,soon)
.all();


for(const p of upcoming.results){

const exists=await env.DB.prepare(`
SELECT id
FROM notifications
WHERE user_id=?
AND type='upcoming'
AND entity_id=?
AND date(created_at)=date('now')
`)
.bind(userId,p.id)
.first();


if(!exists){

await notify(
env,
userId,
"upcoming",
"Échéance proche",
`Le loyer de ${p.first_name} ${p.last_name} pour ${p.reference} arrive à échéance dans 2 jours.`,
"payment",
p.id
);

created++;

}

}


return {created};

}


/* ============================================================
   WORKER
   ============================================================ */

export default {

async fetch(request,env){

await initDB(env);

const url=new URL(request.url);
const path=url.pathname;
const method=request.method;


/* ================= API ================= */

if(path.startsWith("/api/")){


/* ---------- REGISTER ---------- */

if(path==="/api/register"&&method==="POST"){

const d=await body(request);

if(
!d.agency_name||
!d.name||
!d.email||
!d.password
){

return json({
error:"Tous les champs sont obligatoires."
},400);

}

if(String(d.password).length<6){

return json({
error:"Le mot de passe doit contenir au moins 6 caractères."
},400);

}

const email=String(d.email)
.trim()
.toLowerCase();


const exists=await env.DB.prepare(`
SELECT id FROM users WHERE email=?
`)
.bind(email)
.first();


if(exists){

return json({
error:"Un compte existe déjà avec cet email."
},409);

}


const passwordHash=await sha256(
String(d.password)
);


const result=await env.DB.prepare(`
INSERT INTO users
(agency_name,name,email,password_hash)
VALUES(?,?,?,?)
`)
.bind(
String(d.agency_name).trim(),
String(d.name).trim(),
email,
passwordHash
)
.run();


const userId=result.meta.last_row_id;

const token=await createSession(env,userId);


return json({
success:true,
user:{
id:userId,
agency_name:d.agency_name,
name:d.name,
email
}
},201,{
"Set-Cookie":
`immoflow_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS*86400}`
});

}


/* ---------- LOGIN ---------- */

if(path==="/api/login"&&method==="POST"){

const d=await body(request);

const email=String(d.email||"")
.trim()
.toLowerCase();

const password=String(d.password||"");


const user=await env.DB.prepare(`
SELECT *
FROM users
WHERE email=?
`)
.bind(email)
.first();


if(!user){

return json({
error:"Email ou mot de passe incorrect."
},401);

}


const hash=await sha256(password);

if(hash!==user.password_hash){

return json({
error:"Email ou mot de passe incorrect."
},401);

}


const token=await createSession(env,user.id);


return json({
success:true,
user:{
id:user.id,
agency_name:user.agency_name,
name:user.name,
email:user.email
}
},200,{
"Set-Cookie":
`immoflow_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS*86400}`
});

}


/* ---------- LOGOUT ---------- */

if(path==="/api/logout"&&method==="POST"){

const token=cookieToken(request);

if(token){

const hash=await sha256(token);

await env.DB.prepare(`
DELETE FROM sessions
WHERE token_hash=?
`)
.bind(hash)
.run();

}


return json({success:true},200,{
"Set-Cookie":
"immoflow_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
});

}


/* ---------- ME ---------- */

if(path==="/api/me"){

const user=await currentUser(request,env);

return json({
user:user||null
});

}


/* ---------- AUTHENTICATION ---------- */

const user=await currentUser(request,env);

if(!user){

return json({
error:"Vous devez être connecté."
},401);

}

const uid=user.id;


/* ---------- DASHBOARD ---------- */

if(path==="/api/dashboard"){

const properties=await env.DB.prepare(`
SELECT COUNT(*) count
FROM properties
WHERE user_id=?
`)
.bind(uid)
.first();

const occupied=await env.DB.prepare(`
SELECT COUNT(*) count
FROM properties
WHERE user_id=?
AND status='occupied'
`)
.bind(uid)
.first();

const tenants=await env.DB.prepare(`
SELECT COUNT(*) count
FROM tenants
WHERE user_id=?
`)
.bind(uid)
.first();

const late=await env.DB.prepare(`
SELECT COALESCE(SUM(amount),0) total
FROM payments
WHERE user_id=?
AND status='late'
`)
.bind(uid)
.first();

const unread=await env.DB.prepare(`
SELECT COUNT(*) count
FROM notifications
WHERE user_id=?
AND is_read=0
`)
.bind(uid)
.first();

return json({
properties:properties.count,
occupied:occupied.count,
tenants:tenants.count,
late:late.total,
unread:unread.count
});

}


/* ---------- OWNERS ---------- */

if(path==="/api/owners"){

if(method==="GET"){

const r=await env.DB.prepare(`
SELECT *
FROM owners
WHERE user_id=?
ORDER BY id DESC
`)
.bind(uid)
.all();

return json(r.results);

}


if(method==="POST"){

const d=await body(request);

if(!d.name){

return json({
error:"Le nom est obligatoire."
},400);

}

const r=await env.DB.prepare(`
INSERT INTO owners
(user_id,name,phone,email,address)
VALUES(?,?,?,?,?)
`)
.bind(
uid,
d.name,
d.phone||"",
d.email||"",
d.address||""
)
.run();


await notify(
env,
uid,
"owner",
"Nouveau propriétaire",
`${d.name} a été ajouté.`,
"owner",
r.meta.last_row_id
);


return json({
success:true,
id:r.meta.last_row_id
},201);

}

}


/* ---------- PROPERTIES ---------- */

if(path==="/api/properties"){

if(method==="GET"){

const r=await env.DB.prepare(`
SELECT
p.*,
o.name owner_name
FROM properties p
LEFT JOIN owners o
ON o.id=p.owner_id
AND o.user_id=p.user_id
WHERE p.user_id=?
ORDER BY p.id DESC
`)
.bind(uid)
.all();

return json(r.results);

}


if(method==="POST"){

const d=await body(request);

if(!d.reference||!d.title){

return json({
error:"Référence et nom du bien obligatoires."
},400);

}

const r=await env.DB.prepare(`
INSERT INTO properties
(user_id,owner_id,reference,title,address,city,type,bedrooms,rent_amount,status)
VALUES(?,?,?,?,?,?,?,?,?,?)
`)
.bind(
uid,
d.owner_id?Number(d.owner_id):null,
d.reference,
d.title,
d.address||"",
d.city||"Thiès",
d.type||"Appartement",
Number(d.bedrooms||0),
Number(d.rent_amount||0),
"available"
)
.run();


await notify(
env,
uid,
"property",
"Nouveau bien",
`Le bien ${d.reference} a été ajouté.`,
"property",
r.meta.last_row_id
);


return json({
success:true,
id:r.meta.last_row_id
},201);

}

}


/* ---------- TENANTS ---------- */

if(path==="/api/tenants"){

if(method==="GET"){

const r=await env.DB.prepare(`
SELECT *
FROM tenants
WHERE user_id=?
ORDER BY id DESC
`)
.bind(uid)
.all();

return json(r.results);

}


if(method==="POST"){

const d=await body(request);

if(!d.first_name||!d.last_name){

return json({
error:"Prénom et nom obligatoires."
},400);

}

const r=await env.DB.prepare(`
INSERT INTO tenants
(user_id,first_name,last_name,phone,email,address)
VALUES(?,?,?,?,?,?)
`)
.bind(
uid,
d.first_name,
d.last_name,
d.phone||"",
d.email||"",
d.address||""
)
.run();


await notify(
env,
uid,
"tenant",
"Nouveau locataire",
`${d.first_name} ${d.last_name} a été ajouté.`,
"tenant",
r.meta.last_row_id
);


await env.DB.prepare(`
INSERT INTO messages
(user_id,tenant_id,title,content,type,status)
VALUES(?,?,?,?,?,?)
`)
.bind(
uid,
r.meta.last_row_id,
"Bienvenue sur ImmoFlow",
`Bonjour ${d.first_name}, votre dossier locataire a bien été enregistré.`,
"automatic",
"sent"
)
.run();


return json({
success:true,
id:r.meta.last_row_id
},201);

}

}


/* ---------- LEASES ---------- */

if(path==="/api/leases"){

if(method==="GET"){

const r=await env.DB.prepare(`
SELECT
l.*,
p.reference,
p.title property_title,
t.first_name,
t.last_name
FROM leases l
JOIN properties p
ON p.id=l.property_id
AND p.user_id=l.user_id
JOIN tenants t
ON t.id=l.tenant_id
AND t.user_id=l.user_id
WHERE l.user_id=?
ORDER BY l.id DESC
`)
.bind(uid)
.all();

return json(r.results);

}


if(method==="POST"){

const d=await body(request);

if(
!d.property_id||
!d.tenant_id||
!d.start_date||
!d.monthly_rent
){

return json({
error:"Informations du bail incomplètes."
},400);

}


/* Vérifier que le bien et le locataire appartiennent à l'agence */

const property=await env.DB.prepare(`
SELECT id
FROM properties
WHERE id=?
AND user_id=?
`)
.bind(Number(d.property_id),uid)
.first();


const tenant=await env.DB.prepare(`
SELECT id
FROM tenants
WHERE id=?
AND user_id=?
`)
.bind(Number(d.tenant_id),uid)
.first();


if(!property||!tenant){

return json({
error:"Bien ou locataire invalide."
},400);

}


const r=await env.DB.prepare(`
INSERT INTO leases
(user_id,property_id,tenant_id,start_date,end_date,monthly_rent,deposit,status)
VALUES(?,?,?,?,?,?,?,?)
`)
.bind(
uid,
Number(d.property_id),
Number(d.tenant_id),
d.start_date,
d.end_date||null,
Number(d.monthly_rent),
Number(d.deposit||0),
"active"
)
.run();


await env.DB.prepare(`
UPDATE properties
SET status='occupied'
WHERE id=?
AND user_id=?
`)
.bind(Number(d.property_id),uid)
.run();


await notify(
env,
uid,
"lease",
"Nouveau bail",
"Un nouveau bail a été créé.",
"lease",
r.meta.last_row_id
);


return json({
success:true,
id:r.meta.last_row_id
},201);

}

}


/* ---------- PAYMENTS ---------- */

if(path==="/api/payments"){

if(method==="GET"){

const r=await env.DB.prepare(`
SELECT
p.*,
t.first_name,
t.last_name,
pr.reference
FROM payments p
JOIN leases l
ON l.id=p.lease_id
AND l.user_id=p.user_id
JOIN tenants t
ON t.id=l.tenant_id
AND t.user_id=l.user_id
JOIN properties pr
ON pr.id=l.property_id
AND pr.user_id=l.user_id
WHERE p.user_id=?
ORDER BY p.due_date DESC
`)
.bind(uid)
.all();

return json(r.results);

}


if(method==="POST"){

const d=await body(request);

if(!d.lease_id||!d.amount||!d.due_date){

return json({
error:"Informations du loyer incomplètes."
},400);

}


const lease=await env.DB.prepare(`
SELECT id
FROM leases
WHERE id=?
AND user_id=?
`)
.bind(Number(d.lease_id),uid)
.first();


if(!lease){

return json({
error:"Bail invalide."
},400);

}


const r=await env.DB.prepare(`
INSERT INTO payments
(user_id,lease_id,amount,due_date,status,payment_method)
VALUES(?,?,?,?,?,?,?)
`)
.bind(
uid,
Number(d.lease_id),
Number(d.amount),
d.due_date,
"pending",
d.payment_method||""
)
.run();


return json({
success:true,
id:r.meta.last_row_id
},201);

}

}


/* ---------- PAID ---------- */

const paidMatch=
path.match(/^\/api\/payments\/(\d+)\/paid$/);

if(paidMatch&&method==="POST"){

const id=Number(paidMatch[1]);

const payment=await env.DB.prepare(`
SELECT id
FROM payments
WHERE id=?
AND user_id=?
`)
.bind(id,uid)
.first();

if(!payment){

return json({
error:"Paiement introuvable."
},404);

}

await env.DB.prepare(`
UPDATE payments
SET status='paid',
paid_date=?
WHERE id=?
AND user_id=?
`)
.bind(today(),id,uid)
.run();


await notify(
env,
uid,
"payment",
"Paiement enregistré",
"Un paiement de loyer a été enregistré.",
"payment",
id
);


return json({success:true});

}


/* ---------- NOTIFICATIONS ---------- */

if(path==="/api/notifications"){

const r=await env.DB.prepare(`
SELECT *
FROM notifications
WHERE user_id=?
ORDER BY id DESC
LIMIT 100
`)
.bind(uid)
.all();

return json(r.results);

}


const readMatch=
path.match(/^\/api\/notifications\/(\d+)\/read$/);

if(readMatch&&method==="POST"){

await env.DB.prepare(`
UPDATE notifications
SET is_read=1
WHERE id=?
AND user_id=?
`)
.bind(Number(readMatch[1]),uid)
.run();

return json({success:true});

}


if(
path==="/api/notifications/read-all"
&&method==="POST"
){

await env.DB.prepare(`
UPDATE notifications
SET is_read=1
WHERE user_id=?
`)
.bind(uid)
.run();

return json({success:true});

}


/* ---------- MESSAGES ---------- */

if(path==="/api/messages"){

const r=await env.DB.prepare(`
SELECT
m.*,
t.first_name,
t.last_name
FROM messages m
LEFT JOIN tenants t
ON t.id=m.tenant_id
AND t.user_id=m.user_id
WHERE m.user_id=?
ORDER BY m.id DESC
LIMIT 100
`)
.bind(uid)
.all();

return json(r.results);

}


/* ---------- AUTOMATION ---------- */

if(path==="/api/automation"&&method==="POST"){

return json(
await runAutomation(env,uid)
);

}


return json({
error:"Route inconnue."
},404);

}


/* ================= FRONTEND ================= */

return new Response(HTML,{
headers:{
"Content-Type":"text/html;charset=UTF-8"
}
});

},


/* ================= CRON ================= */

async scheduled(event,env,ctx){

ctx.waitUntil((async()=>{

await initDB(env);

const users=await env.DB.prepare(`
SELECT id FROM users
`).all();

for(const u of users.results){

await runAutomation(env,u.id);

}

})());

}

};
