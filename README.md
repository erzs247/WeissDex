# WeissDex – Collection Weiss Schwarz

Appli web (installable sur téléphone, utilisable hors connexion) pour suivre sa collection de cartes **Weiss Schwarz**,
sur le modèle de CardDex (lui-même tiré de NightDex) et de Pokécardex.

- **Deux éditions** (bouton EN | JP) : anglaise et japonaise. Chaque édition a ses séries, ses cartes et **sa propre collection**.
- **Accueil** : un onglet par animé (licence), les plus récents en tête ; dans chaque animé, ses séries et ses personnages (les séries vides dans une édition sont masquées).
- **Série** : trois affichages (Cartes, Liste, Grille), tri, filtres (possédées, manquantes, rareté), valeur de la série.
- **Fiche carte** : grande image, niveau / coût / puissance / âme / triggers / traits, cote Cardmarket, prix minimum,
  moyennes 7 j et 30 j, **courbe de prix**, exemplaires (état, foil), prix d'achat, vue 3D, lien vers la version EN ↔ JP.
- **Listes** (façon Pokécardex) : types de cartes (personnages, événements, climax, côtés Weiß / Schwarz), raretés
  (SSP / SEC, SP et raretés de licence, RRR / SR, RR, PR, TD, climax rares), couleurs, licences et personnages.
- **Collection**, **Classeurs**, **Gradées**, **Cotes** (hausses / baisses), **Souhaits** (alertes prix, liste d'achat Cardmarket), **Scanner**.
- Comptes et amis (Firebase), optionnels.
- En veille au début : créateur de decks, compagnon Capri (`DECKS_ON` / `PET_ON` en haut de `app.js`), actualités et
  produits scellés (affichés dès que `data/news.json` et `data/sealed.json` ont du contenu).

Aucune dépendance côté appli : HTML, CSS et JavaScript.

## Données

- **Cartes : [WS Lounge](https://github.com/gabrielcpws-ctrl/ws_lounge_db)**, base ouverte publiée sous licence
  **CC0 1.0** (domaine public, réutilisation libre), anglais et japonais, d'après les listes officielles de Bushiroad.
- **Images** : celles des listes officielles (`ws-tcg.com`, `en.ws-tcg.com`), affichées directement (rien n'est copié dans le dépôt).
  Les vignettes sont réduites à la volée par [wsrv.nl](https://wsrv.nl) (service d'images libre et gratuit) ;
  `"thumb": ""` dans `data/config.json` le désactive. Images de secours, dans l'ordre : image d'origine, même carte dans
  l'autre édition, puis un visuel généré (nom, couleur, niveau, puissance).
- **Prix : Cardmarket** (guide des prix public, **jeu n° 10 = Weiss Schwarz**). Les cartes anglaises sont rattachées à leur
  produit Cardmarket d'après la liste publique des produits (même nom dans la bonne extension, versions dans l'ordre).
  Cardmarket ne vend presque que l'édition anglaise : les cartes japonaises n'ont en général pas de cote.

| Script | Rôle |
|---|---|
| `scripts/import-ws.mjs` | séries et cartes EN / JP → `data/catalog.json` (séries) + `data/cards-en.json`, `data/cards-ja.json`, liens Cardmarket |
| `scripts/update-prices.mjs` | prix du jour → `data/prices.json` et historique → `data/history/<série>.json` (chargé à la demande) |
| `scripts/make-scan-index.mjs` | empreintes du scanner → `data/scan/<édition>.json` (1500 nouvelles images au plus par passage, après la publication) |

## Mise en ligne (GitHub Pages)

Le workflow « Prix Cardmarket, nouveautés et publication » fait tout :
prix chaque jour vers 7 h, nouvelles séries chaque lundi, puis publication sur GitHub Pages.
Pour relancer un import complet : *Actions → Run workflow*, cocher **nouveautés**.

Adresse : `https://erzs247.github.io/weissdex/` puis, sur le téléphone, « Ajouter à l'écran d'accueil ».

## Comptes (Firebase)

WeissDex a **son propre projet Firebase** (séparé de NightDex et CardDex). À faire une fois :

1. Coller la configuration web du projet dans `data/firebase.json` (`apiKey`, `authDomain`, `projectId`, `storageBucket`,
   `messagingSenderId`, `appId`). Tant que ce fichier est vide (`{}`), l'appli marche sans comptes.
2. Console Firebase → *Authentication* : activer **Google** et **E-mail / mot de passe**, et ajouter `erzs247.github.io`
   dans *Paramètres → Domaines autorisés*.
3. Console Firebase → *Firestore Database* : créer la base, puis coller `firestore.rules` dans *Règles → Publier*.
4. Pour gérer les soutiens depuis l'appli : copier ton ID (*Mon compte*) dans `data/config.json` → `admins`
   et dans `firestore.rules` → `isAdmin()`.

## Lancer en local

```bash
npm install
node scripts/import-ws.mjs      # cartes (base d'environ 125 Mo téléchargée, quelques secondes de calcul)
node scripts/update-prices.mjs  # prix du jour
npm start                       # http://localhost:8080
```
