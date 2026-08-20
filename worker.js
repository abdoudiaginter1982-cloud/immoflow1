const HTML = String.raw`
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ImmoFlow</title>

<style>
*{box-sizing:border-box}
body{
margin:0;
font-family:Arial,Helvetica,sans-serif;
background:#f5f7fb;
color:#172033
}
button,input,select,textarea{font:inherit}
button{cursor:pointer}

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
z-index:10
}

.logo{
font-size:25px;
font-weight:800;
margin:5px 10px 35px
}

.logo span{color:#4f8cff}

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

.menu button:hover,
.menu button.active{
background:#1f2937;
color:white
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

.top h1{margin:0}

.notification-btn{
border:0;
background:white;
padding:12px 15px;
border-radius:12px;
font-size:20px;
position:relative
}

.badge{
position:absolute;
right:-5px;
top:-5px;
background:#ef4444;
color:white;
border-radius:50%;
font-size:11px;
min-width:20px;
height:20px;
display:flex;
align-items:center;
justify-content:center
}

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
border-radius:15px;
padding:20px;
box-shadow:0 3px 15px rgba(0,0,0,.05)
}

.label{
font-size:13px;
color:#64748b
}

.value{
font-size:27px;
font-weight:800;
margin-top:8px
}

.panel{
background:white;
border-radius:15px;
padding:20px;
margin-bottom:20px;
box-shadow:0 3px 15px rgba(0,0,0,.05)
}

.panel-head{
display:flex;
justify-content:space-between;
align-items:center;
margin-bottom:15px
}

.primary{
background:#2563eb;
color:white;
border:0;
border-radius:9px;
padding:11px 15px;
font-weight:600
}

.secondary{
background:#e5e7eb;
border:0;
border-radius:9px;
padding:11px 15px
}

.danger{
background:#fee2e2;
color:#991b1b;
border:0;
border-radius:9px;
padding:8px 11px
}

table{
width:100%;
border-collapse:collapse
}

th,td{
padding:13px 9px;
border-bottom:1px solid #edf0f4;
text-align:left
}

th{
font-size:13px;
color:#64748b
}

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
border-radius:18px;
padding:25px;
width:min(650px,100%);
max-height:90vh;
overflow:auto
}

.grid{
display:grid;
grid-template-columns:1fr 1fr;
gap:13px
}

.field{
display:flex;
flex-direction:column;
gap:6px
}

.field.full{grid-column:1/-1}

.field input,
.field select,
.field textarea{
padding:11px;
border:1px solid #d8dee8;
border-radius:8px;
outline:none
}

.field textarea{min-height:90px}

.actions{
display:flex;
justify-content:flex-end;
gap:10px;
margin-top:20px
}

.notification{
padding:15px;
border-bottom:1px solid #eee
}

.notification.unread{
background:#eff6ff
}

.notification-title{
font-weight:700;
margin-bottom:5px
}

.notification-message{
color:#64748b;
font-size:14px
}

.empty{
padding:40px;
text-align:center;
color:#64748b
}

.search{
padding:10px;
border:1px solid #ddd;
border-radius:8px;
margin-bottom:15px;
width:100%
}

.toast{
position:fixed;
right:20px;
bottom:20px;
background:#111827;
color:white;
padding:15px 20px;
border-radius:10px;
display:none;
z-index:100
}

@media(max-width:900px){
.sidebar{width:70px}
.logo{font-size:0;text-align:center}
.logo span{font-size:22px}
.menu button{font-size:0;text-align:center}
.menu button:first-letter{font-size:20px}
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

<div class="app">

<aside class="sidebar">

<div class="logo">
Immo<span>Flow</span>
</div>

<div class="menu">

<button class="active" onclick="page('dashboard',this)">
🏠 Tableau de bord
</button>

<button onclick="page('properties',this)">
🏢 Biens
</button>

<button onclick="page('tenants',this)">
👤 Locataires
</button>

<button onclick="page('leases',this)">
📄 Baux
</button>

<button onclick="page('payments',this)">
💰 Loyers
</button>

<button onclick="page('messages',this)">
💬 Messages
</button>

<button onclick="page('notifications',this)">
🔔 Notifications
</button>

</div>
</aside>


<main class="main">

<div class="top">

<div>
<h1 id="title">Tableau de bord</h1>
<div style="color:#64748b">
Gestion immobilière
</div>
</div>

<button class="notification-btn" onclick="page('notifications')">
🔔
<span class="badge" id="badge">0</span>
</button>

</div>


<!-- DASHBOARD -->

<section id="dashboard" class="page active">

<div class="cards">

<div class="card">
<div class="label">Biens</div>
<div class="value" id="sProperties">0</div>
</div>

<div class="card">
<div class="label">Biens occupés</div>
<div class="value" id="sOccupied">0</div>
</div>

<div class="card">
<div class="label">Locataires</div>
<div class="value" id="sTenants">0</div>
</div>

<div class="card">
<div class="label">Impayés</div>
<div class="value" id="sLate">0 FCFA</div>
</div>

</div>


<div class="panel">

<div class="panel-head">
<h2>Automatisation</h2>

<button class="primary" onclick="runAutomation()">
🔄 Vérifier maintenant
</button>

</div>

<p>
ImmoFlow vérifie les échéances de loyers et crée
automatiquement les notifications et messages.
</p>

</div>


<div class="panel">

<div class="panel-head">
<h2>Actions rapides</h2>
</div>

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
<h2>Biens immobiliers</h2>

<button class="primary" onclick="openModal('property')">
+ Nouveau bien
</button>
</div>

<input
class="search"
placeholder="Rechercher un bien..."
oninput="filterTable(this,'propertiesTable')"
>

<div id="propertiesTable"></div>

</div>

</section>


<!-- TENANTS -->

<section id="tenants" class="page">

<div class="panel">

<div class="panel-head">
<h2>Locataires</h2>

<button class="primary" onclick="openModal('tenant')">
+ Nouveau locataire
</button>
</div>

<input
class="search"
placeholder="Rechercher un locataire..."
oninput="filterTable(this,'tenantsTable')"
>

<div id="tenantsTable"></div>

</div>

</section>


<!-- LEASES -->

<section id="leases" class="page">

<div class="panel">

<div class="panel-head">
<h2>Baux</h2>

<button class="primary" onclick="openModal('lease')">
+ Nouveau bail
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
+ Nouveau loyer
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
Tout marquer comme lu
</button>

</div>

<div id="notificationsList"></div>

</div>

</section>

</main>
</div>


<!-- PROPERTY MODAL -->

<div class="modal" id="propertyModal">

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
<label>Loyer mensuel</label>
<input type="number" name="rent_amount" value="0">
</div>

<div class="field">
<label>Propriétaire</label>
<input name="owner_name">
</div>

<div class="field">
<label>Téléphone propriétaire</label>
<input name="owner_phone">
</div>

<div class="field full">
<label>Notes</label>
<textarea name="notes"></textarea>
</div>

</div>

<div class="actions">

<button type="button" class="secondary" onclick="closeModals()">
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

<div class="modal" id="tenantModal">

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
<label>Numéro d'identité</label>
<input name="identity_number">
</div>

<div class="field">
<label>Adresse</label>
<input name="address">
</div>

<div class="field full">
<label>Notes</label>
<textarea name="notes"></textarea>
</div>

</div>

<div class="actions">

<button type="button" class="secondary" onclick="closeModals()">
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

<div class="modal" id="leaseModal">

<div class="modal-box">

<h2>Créer un bail</h2>

<form id="leaseForm">

<div class="grid">

<div class="field">
<label>Bien *</label>
<select id="leaseProperty" name="property_id" required></select>
</div>

<div class="field">
<label>Locataire *</label>
<select id="leaseTenant" name="tenant_id" required></select>
</div>

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

<button type="button" class="secondary" onclick="closeModals()">
Annuler
</button>

<button class="primary">
Créer le bail
</button>

</div>

</form>

</div>
</div>


<!-- PAYMENT MODAL -->

<div class="modal" id="paymentModal">

<div class="modal-box">

<h2>Ajouter une échéance</h2>

<form id="paymentForm">

<div class="grid">

<div class="field full">
<label>Bail *</label>
<select id="paymentLease" name="lease_id" required></select>
</div>

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
<option>Chèque</option>
</select>
</div>

<div class="field">
<label>Référence</label>
<input name="reference">
</div>

</div>

<div class="actions">

<button type="button" class="secondary" onclick="closeModals()">
Annuler
</button>

<button class="primary">
Enregistrer
</button>

</div>

</form>

</div>
</div>


<div id="toast" class="toast"></div>


<script>

const titles={
dashboard:"Tableau de bord",
properties:"Biens immobiliers",
tenants:"Locataires",
leases:"Baux",
payments:"Loyers",
messages:"Messages",
notifications:"Notifications"
};


function money(v){
return Number(v||0).toLocaleString("fr-FR")+" FCFA";
}


function esc(v){
return String(v??"")
.replaceAll("&","&amp;")
.replaceAll("<","&lt;")
.replaceAll(">","&gt;")
.replaceAll('"',"&quot;")
.replaceAll("'","&#039;");
}


async function api(url,options={}){
const r=await fetch(url,{
...options,
headers:{
"Content-Type":"application/json",
...(options.headers||{})
}
});

const data=await r.json();

if(!r.ok)throw new Error(data.error||"Erreur serveur");

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


function page(name,button){

document.querySelectorAll(".page")
.forEach(x=>x.classList.remove("active"));

document.getElementById(name)
.classList.add("active");

document.querySelectorAll(".menu button")
.forEach(x=>x.classList.remove("active"));

if(button)button.classList.add("active");

document.getElementById("title")
.textContent=titles[name];

loadPage(name);
}


async function loadPage(name){

try{

if(name==="dashboard")await dashboard();
if(name==="properties")await properties();
if(name==="tenants")await tenants();
if(name==="leases")await leases();
if(name==="payments")await payments();
if(name==="messages")await messages();
if(name==="notifications")await notifications();

}catch(e){

console.error(e);
toast(e.message);

}
}


async function dashboard(){

const d=await api("/api/dashboard");

document.getElementById("sProperties").textContent=d.properties;
document.getElementById("sOccupied").textContent=d.occupied;
document.getElementById("sTenants").textContent=d.tenants;
document.getElementById("sLate").textContent=money(d.late);
document.getElementById("badge").textContent=d.unread;
}


async function properties(){

const data=await api("/api/properties");

if(!data.length){

document.getElementById("propertiesTable").innerHTML=
'<div class="empty">Aucun bien.</div>';

return;
}

document.getElementById("propertiesTable").innerHTML=`

<table>

<thead>
<tr>
<th>Référence</th>
<th>Bien</th>
<th>Ville</th>
<th>Type</th>
<th>Loyer</th>
<th>Statut</th>
</tr>
</thead>

<tbody>

${data.map(p=>`

<tr>

<td><strong>${esc(p.reference)}</strong></td>
<td>${esc(p.title)}</td>
<td>${esc(p.city)}</td>
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


async function tenants(){

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

<td>
<strong>
${esc(t.first_name)} ${esc(t.last_name)}
</strong>
</td>

<td>${esc(t.phone)}</td>
<td>${esc(t.email)}</td>
<td>${esc(t.address)}</td>

</tr>

`).join("")}

</tbody>

</table>
`;
}


async function leases(){

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

<td>
${esc(l.first_name)}
${esc(l.last_name)}
</td>

<td>${esc(l.start_date)}</td>

<td>${money(l.monthly_rent)}</td>

<td>
<span class="status occupied">
Actif
</span>
</td>

</tr>

`).join("")}

</tbody>

</table>
`;
}


async function payments(){

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
<th>Action</th>
</tr>
</thead>

<tbody>

${data.map(p=>`

<tr>

<td>
${esc(p.first_name)}
${esc(p.last_name)}
</td>

<td>${esc(p.reference)}</td>

<td>${money(p.amount)}</td>

<td>${esc(p.due_date)}</td>

<td>

<span class="status ${p.status}">

${
p.status==="paid"
?"Payé"
:p.status==="late"
?"En retard"
:"En attente"
}

</span>

</td>

<td>

${
p.status!=="paid"
?`
<button
class="secondary"
onclick="paid(${p.id})"
>
✓ Payé
</button>
`
:"✓"
}

</td>

</tr>

`).join("")}

</tbody>

</table>
`;
}


async function messages(){

const data=await api("/api/messages");

if(!data.length){

document.getElementById("messagesList").innerHTML=
'<div class="empty">Aucun message automatique.</div>';

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
${m.first_name
?esc(m.first_name+" "+m.last_name)
:"Système"}
</small>

</div>

`).join("");
}


async function notifications(){

const data=await api("/api/notifications");

if(!data.length){

document.getElementById("notificationsList").innerHTML=
'<div class="empty">Aucune notification.</div>';

return;
}

document.getElementById("notificationsList").innerHTML=
data.map(n=>`

<div
class="notification ${Number(n.is_read)===0?"unread":""}"
onclick="readNotification(${n.id})"
>

<div class="notification-title">
${esc(n.title)}
</div>

<div class="notification-message">
${esc(n.message)}
</div>

<small>
${new Date(n.created_at).toLocaleString("fr-FR")}
</small>

</div>

`).join("");

await dashboard();
}


async function readNotification(id){

await api(
"/api/notifications/"+id+"/read",
{method:"POST"}
);

await notifications();
}


async function readAll(){

await api(
"/api/notifications/read-all",
{method:"POST"}
);

await notifications();

toast("Notifications marquées comme lues.");
}


async function paid(id){

await api(
"/api/payments/"+id+"/paid",
{method:"POST"}
);

toast("Paiement enregistré.");

await payments();
await dashboard();
}


async function runAutomation(){

const result=await api(
"/api/automation",
{method:"POST"}
);

await dashboard();
await notifications();

toast(
"Vérification terminée : "+
result.created+
" notification(s)."
);
}


function openModal(name){

document.getElementById(name+"Modal")
.classList.add("show");

if(name==="lease")loadLeaseOptions();
if(name==="payment")loadPaymentOptions();
}


function closeModals(){

document.querySelectorAll(".modal")
.forEach(x=>x.classList.remove("show"));
}


async function loadLeaseOptions(){

const properties=await api("/api/properties");
const tenants=await api("/api/tenants");

document.getElementById("leaseProperty").innerHTML=
properties
.filter(p=>p.status!=="occupied")
.map(p=>`
<option value="${p.id}">
${esc(p.reference)} - ${esc(p.title)}
</option>
`)
.join("");

document.getElementById("leaseTenant").innerHTML=
tenants.map(t=>`
<option value="${t.id}">
${esc(t.first_name)} ${esc(t.last_name)}
</option>
`).join("");
}


async function loadPaymentOptions(){

const data=await api("/api/leases");

document.getElementById("paymentLease").innerHTML=
data
.filter(l=>l.status==="active")
.map(l=>`
<option value="${l.id}">
${esc(l.reference)} -
${esc(l.first_name)} ${esc(l.last_name)}
</option>
`)
.join("");
}


document.getElementById("propertyForm")
.addEventListener("submit",async e=>{

e.preventDefault();

const data=Object.fromEntries(
new FormData(e.target).entries()
);

await api("/api/properties",{
method:"POST",
body:JSON.stringify(data)
});

e.target.reset();
closeModals();

toast("Bien ajouté.");

await dashboard();
await properties();
});


document.getElementById("tenantForm")
.addEventListener("submit",async e=>{

e.preventDefault();

const data=Object.fromEntries(
new FormData(e.target).entries()
);

await api("/api/tenants",{
method:"POST",
body:JSON.stringify(data)
});

e.target.reset();
closeModals();

toast("Locataire ajouté.");

await dashboard();
await tenants();
});


document.getElementById("leaseForm")
.addEventListener("submit",async e=>{

e.preventDefault();

const data=Object.fromEntries(
new FormData(e.target).entries()
);

await api("/api/leases",{
method:"POST",
body:JSON.stringify(data)
});

e.target.reset();
closeModals();

toast("Bail créé.");

await dashboard();
await leases();
});


document.getElementById("paymentForm")
.addEventListener("submit",async e=>{

e.preventDefault();

const data=Object.fromEntries(
new FormData(e.target).entries()
);

await api("/api/payments",{
method:"POST",
body:JSON.stringify(data)
});

e.target.reset();
closeModals();

toast("Échéance ajoutée.");

await payments();
});


function filterTable(input,id){

const value=input.value.toLowerCase();

const table=document
.getElementById(id)
.querySelector("table");

if(!table)return;

table.querySelectorAll("tbody tr")
.forEach(row=>{
row.style.display=
row.innerText.toLowerCase().includes(value)
?""
:"none";
});
}


async function init(){

try{

await api("/api/init");

await dashboard();

}catch(e){

console.error(e);
toast(e.message);

}

}

init();

</script>

</body>
</html>
`;


/* =========================================================
   DATABASE INITIALIZATION
========================================================= */

const TABLES = [

`CREATE TABLE IF NOT EXISTS properties (
id INTEGER PRIMARY KEY AUTOINCREMENT,
reference TEXT NOT NULL UNIQUE,
title TEXT NOT NULL,
address TEXT,
city TEXT DEFAULT 'Thiès',
type TEXT DEFAULT 'Appartement',
bedrooms INTEGER DEFAULT 0,
rent_amount INTEGER DEFAULT 0,
status TEXT DEFAULT 'available',
owner_name TEXT,
owner_phone TEXT,
notes TEXT,
created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`,

`CREATE TABLE IF NOT EXISTS tenants (
id INTEGER PRIMARY KEY AUTOINCREMENT,
first_name TEXT NOT NULL,
last_name TEXT NOT NULL,
phone TEXT,
email TEXT,
identity_number TEXT,
address TEXT,
notes TEXT,
created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`,

`CREATE TABLE IF NOT EXISTS leases (
id INTEGER PRIMARY KEY AUTOINCREMENT,
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
lease_id INTEGER NOT NULL,
amount INTEGER NOT NULL,
due_date TEXT NOT NULL,
paid_date TEXT,
status TEXT DEFAULT 'pending',
payment_method TEXT,
reference TEXT,
notes TEXT,
created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`,

`CREATE TABLE IF NOT EXISTS notifications (
id INTEGER PRIMARY KEY AUTOINCREMENT,
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
tenant_id INTEGER,
title TEXT NOT NULL,
content TEXT NOT NULL,
type TEXT DEFAULT 'automatic',
status TEXT DEFAULT 'sent',
created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`,

`CREATE INDEX IF NOT EXISTS idx_payments_due
ON payments(due_date)`,

`CREATE INDEX IF NOT EXISTS idx_notifications_read
ON notifications(is_read)`

];


/* =========================================================
   HELPERS
========================================================= */

function json(data,status=200){

return new Response(
JSON.stringify(data),
{
status,
headers:{
"Content-Type":"application/json; charset=utf-8"
}
}
);

}


async function parseBody(request){

try{
return await request.json();
}catch{
return {};
}

}


function today(){

return new Date()
.toISOString()
.slice(0,10);

}


function addDays(date,days){

const d=new Date(date+"T00:00:00Z");

d.setUTCDate(
d.getUTCDate()+days
);

return d
.toISOString()
.slice(0,10);

}


async function initDB(env){

for(const sql of TABLES){

await env.DB
.prepare(sql)
.run();

}

}


/* =========================================================
   NOTIFICATION
========================================================= */

async function notification(
env,
type,
title,
message,
entityType=null,
entityId=null
){

await env.DB
.prepare(`
INSERT INTO notifications
(type,title,message,entity_type,entity_id)
VALUES(?,?,?,?,?)
`)
.bind(
type,
title,
message,
entityType,
entityId
)
.run();

}


/* =========================================================
   AUTOMATION
========================================================= */

async function automation(env){

const now=today();

await env.DB
.prepare(`
UPDATE payments
SET status='late'
WHERE due_date < ?
AND status='pending'
`)
.bind(now)
.run();


const late=await env.DB
.prepare(`
SELECT
p.id,
p.lease_id,
p.due_date,
t.id tenant_id,
t.first_name,
t.last_name,
pr.reference
FROM payments p
JOIN leases l ON l.id=p.lease_id
JOIN tenants t ON t.id=l.tenant_id
JOIN properties pr ON pr.id=l.property_id
WHERE p.status='late'
`)
.all();


let created=0;


for(const p of late.results){

const exists=await env.DB
.prepare(`
SELECT id
FROM notifications
WHERE type='late'
AND entity_id=?
AND date(created_at)=date('now')
`)
.bind(p.id)
.first();


if(!exists){

await notification(
env,
"late",
"Loyer en retard",
`Le loyer de ${p.first_name} ${p.last_name} pour le bien ${p.reference} est en retard.`,
"payment",
p.id
);


await env.DB
.prepare(`
INSERT INTO messages
(tenant_id,title,content,type,status)
VALUES(?,?,?,?,?)
`)
.bind(
p.tenant_id,
"Rappel de loyer",
`Bonjour ${p.first_name}, votre loyer pour le bien ${p.reference} est actuellement en retard. Merci de régulariser votre situation.`,
"automatic",
"pending"
)
.run();


created++;

}

}


/* Échéances proches */

const soon=addDays(now,2);

const upcoming=await env.DB
.prepare(`
SELECT
p.id,
p.lease_id,
t.id tenant_id,
t.first_name,
t.last_name,
pr.reference
FROM payments p
JOIN leases l ON l.id=p.lease_id
JOIN tenants t ON t.id=l.tenant_id
JOIN properties pr ON pr.id=l.property_id
WHERE p.status='pending'
AND p.due_date=?
`)
.bind(soon)
.all();


for(const p of upcoming.results){

const exists=await env.DB
.prepare(`
SELECT id
FROM notifications
WHERE type='upcoming'
AND entity_id=?
AND date(created_at)=date('now')
`)
.bind(p.id)
.first();


if(!exists){

await notification(
env,
"upcoming",
"Échéance proche",
`Le loyer de ${p.first_name} ${p.last_name} pour ${p.reference} arrive à échéance dans 2 jours.`,
"payment",
p.id
);

created++;

}

}


return {
success:true,
created
};

}


/* =========================================================
   API
========================================================= */

async function api(request,env,url){

const path=url.pathname;
const method=request.method;


try{

await initDB(env);


/* INIT */

if(path==="/api/init"){

return json({
success:true,
database:"D1",
message:"ImmoFlow est connecté à la base de données."
});

}


/* DASHBOARD */

if(path==="/api/dashboard"){

const properties=await env.DB
.prepare(`SELECT COUNT(*) count FROM properties`)
.first();

const occupied=await env.DB
.prepare(`
SELECT COUNT(*) count
FROM properties
WHERE status='occupied'
`)
.first();

const tenants=await env.DB
.prepare(`SELECT COUNT(*) count FROM tenants`)
.first();

const late=await env.DB
.prepare(`
SELECT COALESCE(SUM(amount),0) total
FROM payments
WHERE status='late'
`)
.first();

const unread=await env.DB
.prepare(`
SELECT COUNT(*) count
FROM notifications
WHERE is_read=0
`)
.first();


return json({
properties:properties.count,
occupied:occupied.count,
tenants:tenants.count,
late:late.total,
unread:unread.count
});

}


/* PROPERTIES */

if(path==="/api/properties"){

if(method==="GET"){

const result=await env.DB
.prepare(`
SELECT *
FROM properties
ORDER BY id DESC
`)
.all();

return json(result.results);

}


if(method==="POST"){

const d=await parseBody(request);

if(!d.reference||!d.title){

return json({
error:"Référence et nom du bien obligatoires."
},400);

}


const result=await env.DB
.prepare(`
INSERT INTO properties
(reference,title,address,city,type,bedrooms,rent_amount,status,owner_name,owner_phone,notes)
VALUES(?,?,?,?,?,?,?,?,?,?,?)
`)
.bind(
d.reference,
d.title,
d.address||"",
d.city||"Thiès",
d.type||"Appartement",
Number(d.bedrooms||0),
Number(d.rent_amount||0),
d.status||"available",
d.owner_name||"",
d.owner_phone||"",
d.notes||""
)
.run();


await notification(
env,
"property",
"Nouveau bien",
`Le bien ${d.reference} a été ajouté à ImmoFlow.`,
"property",
result.meta.last_row_id
);


return json({
success:true,
id:result.meta.last_row_id
},201);

}

}


/* TENANTS */

if(path==="/api/tenants"){

if(method==="GET"){

const result=await env.DB
.prepare(`
SELECT *
FROM tenants
ORDER BY id DESC
`)
.all();

return json(result.results);

}


if(method==="POST"){

const d=await parseBody(request);

if(!d.first_name||!d.last_name){

return json({
error:"Prénom et nom obligatoires."
},400);

}


const result=await env.DB
.prepare(`
INSERT INTO tenants
(first_name,last_name,phone,email,identity_number,address,notes)
VALUES(?,?,?,?,?,?,?)
`)
.bind(
d.first_name,
d.last_name,
d.phone||"",
d.email||"",
d.identity_number||"",
d.address||"",
d.notes||""
)
.run();


await notification(
env,
"tenant",
"Nouveau locataire",
`${d.first_name} ${d.last_name} a été ajouté.`,
"tenant",
result.meta.last_row_id
);


await env.DB
.prepare(`
INSERT INTO messages
(tenant_id,title,content,type,status)
VALUES(?,?,?,?,?)
`)
.bind(
result.meta.last_row_id,
"Bienvenue sur ImmoFlow",
`Bonjour ${d.first_name}, votre dossier locataire a bien été enregistré dans ImmoFlow.`,
"automatic",
"sent"
)
.run();


return json({
success:true,
id:result.meta.last_row_id
},201);

}

}


/* LEASES */

if(path==="/api/leases"){

if(method==="GET"){

const result=await env.DB
.prepare(`
SELECT
l.*,
p.reference,
p.title property_title,
t.first_name,
t.last_name,
t.phone
FROM leases l
JOIN properties p ON p.id=l.property_id
JOIN tenants t ON t.id=l.tenant_id
ORDER BY l.id DESC
`)
.all();

return json(result.results);

}


if(method==="POST"){

const d=await parseBody(request);

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


const result=await env.DB
.prepare(`
INSERT INTO leases
(property_id,tenant_id,start_date,end_date,monthly_rent,deposit,status)
VALUES(?,?,?,?,?,?,?)
`)
.bind(
Number(d.property_id),
Number(d.tenant_id),
d.start_date,
d.end_date||null,
Number(d.monthly_rent),
Number(d.deposit||0),
"active"
)
.run();


await env.DB
.prepare(`
UPDATE properties
SET status='occupied'
WHERE id=?
`)
.bind(Number(d.property_id))
.run();


await notification(
env,
"lease",
"Nouveau bail",
"Un nouveau bail a été créé.",
"lease",
result.meta.last_row_id
);


return json({
success:true,
id:result.meta.last_row_id
},201);

}

}


/* PAYMENTS */

if(path==="/api/payments"){

if(method==="GET"){

const result=await env.DB
.prepare(`
SELECT
p.*,
t.first_name,
t.last_name,
pr.reference
FROM payments p
JOIN leases l ON l.id=p.lease_id
JOIN tenants t ON t.id=l.tenant_id
JOIN properties pr ON pr.id=l.property_id
ORDER BY p.due_date DESC
`)
.all();

return json(result.results);

}


if(method==="POST"){

const d=await parseBody(request);

if(!d.lease_id||!d.amount||!d.due_date){

return json({
error:"Informations de loyer incomplètes."
},400);

}


const result=await env.DB
.prepare(`
INSERT INTO payments
(lease_id,amount,due_date,paid_date,status,payment_method,reference)
VALUES(?,?,?,?,?,?,?)
`)
.bind(
Number(d.lease_id),
Number(d.amount),
d.due_date,
null,
"pending",
d.payment_method||"",
d.reference||""
)
.run();


return json({
success:true,
id:result.meta.last_row_id
},201);

}

}


/* PAID */

const paidMatch=
path.match(/^\/api\/payments\/(\d+)\/paid$/);


if(paidMatch&&method==="POST"){

const id=Number(paidMatch[1]);

await env.DB
.prepare(`
UPDATE payments
SET status='paid',
paid_date=?
WHERE id=?
`)
.bind(today(),id)
.run();


await notification(
env,
"payment",
"Paiement enregistré",
"Un paiement de loyer a été enregistré.",
"payment",
id
);


return json({success:true});

}


/* NOTIFICATIONS */

if(path==="/api/notifications"){

const result=await env.DB
.prepare(`
SELECT *
FROM notifications
ORDER BY id DESC
LIMIT 100
`)
.all();

return json(result.results);

}


const readMatch=
path.match(/^\/api\/notifications\/(\d+)\/read$/);


if(readMatch&&method==="POST"){

await env.DB
.prepare(`
UPDATE notifications
SET is_read=1
WHERE id=?
`)
.bind(Number(readMatch[1]))
.run();

return json({success:true});

}


if(
path==="/api/notifications/read-all"
&&method==="POST"
){

await env.DB
.prepare(`
UPDATE notifications
SET is_read=1
WHERE is_read=0
`)
.run();

return json({success:true});

}


/* MESSAGES */

if(path==="/api/messages"){

const result=await env.DB
.prepare(`
SELECT
m.*,
t.first_name,
t.last_name
FROM messages m
LEFT JOIN tenants t ON t.id=m.tenant_id
ORDER BY m.id DESC
LIMIT 100
`)
.all();

return json(result.results);

}


/* AUTOMATION */

if(
path==="/api/automation"
&&method==="POST"
){

return json(
await automation(env)
);

}


/* 404 */

return json({
error:"Route inconnue."
},404);


}catch(error){

console.error(error);

return json({
error:error.message
},500);

}

}


/* =========================================================
   WORKER
========================================================= */

export default {

async fetch(request,env){

const url=new URL(request.url);

if(url.pathname.startsWith("/api/")){

return api(request,env,url);

}

return new Response(HTML,{
headers:{
"Content-Type":"text/html;charset=UTF-8"
}
});

},

async scheduled(event,env,ctx){

ctx.waitUntil(
(async()=>{
await initDB(env);
await automation(env);
})()
);

}

};
