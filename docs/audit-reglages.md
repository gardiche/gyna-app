# Audit des réglages écrits en dur (03/11/2026)

Question de départ (Thomas) : Gyna doit être un assistant go-to-market à qui l'on dit ce qu'on veut et qui le fait en autonomie. Or beaucoup de réglages sont écrits dans le code et dans les prompts, et ils s'imposent à la demande de l'associé. Cet audit les liste et les classe. Il ne modifie rien.

Deux catégories :

- **Garde-fou** : protège de l'argent, des données, l'extérieur ou la sécurité. Reste dans le code, que l'associé le demande ou non.
- **Méthode** : une façon de faire par défaut. Devrait être une recette que l'associé peut lire et changer dans l'app, et que sa demande peut écarter en le disant.

Le risque de la méthode écrite en dur : l'agent reçoit en même temps la demande de l'associé, `gyna.md`, la fiche du sous-agent, les skills, le brief et la description de l'outil, sans ordre de priorité. Il arbitre seul entre ces consignes.

## 1. Volume des consignes

| Couche | Taille | Qui peut la changer |
|---|---|---|
| `gyna.md` (prompt de Gyna, fiches des 6 sous-agents comprises) | 28,8 Ko | le code seul |
| Fiches `infra/hermes/agents/*.md` (recopiées en entier dans chaque délégation) | 16,7 Ko | le code seul |
| 26 skills (`packages/db/seed/skills`) | environ 140 Ko, 5 Ko en moyenne | les associés, dans l'app |
| Briefs (L'Amorce, Pressy Services) | 12,4 Ko et 11,5 Ko | les associés, dans l'app |
| Descriptions et paramètres des outils MCP | dans `apps/mcp` et `packages/schemas` | le code seul |

Plus de la moitié de ce que reçoit un agent ne peut pas être modifiée par un associé.

## 2. Garde-fous à garder

| Réglage | Où |
|---|---|
| Rien ne part vers l'extérieur sans validation d'un associé | `gyna.md`, fiches, app |
| Budget plafonné par mission, arrêt à `budget_exceeded` | `gyna.md`, outils MCP (`checkBudget`) |
| Jeton de mission, imposé par le plugin `gyna-mission` | plugin Hermes, MCP |
| Périmètre « prospection » (outils réservés, blocage des outils Meta et PostHog) | `PROSPECTION_TOOLS`, plugin, MCP |
| Outils `ads_*` réservés à Campagnes, pilotage seulement si `may_act` | `gyna.md`, fiche Campagnes, app |
| PostHog en lecture seule | `gyna.md`, fiche Campagnes, clé |
| Jamais d'Audience Network ; ne pas toucher à une campagne réglée par un associé | fiche Campagnes, `gyna.md` |
| Pas de cookies ni de compte LinkedIn personnel | skills, fiches |
| RGPD : pas de données sensibles, pas de relance d'un prospect écarté | skill `regles-alpact` |
| Aucun fait inventé, source citée | `gyna.md`, fiches, skills |
| Charte de marque contraignante, contrôles automatiques des textes | fiche Ads, `submit_ads`, `submit_posts` |
| Limites de caractères par plateforme | `AD_LIMITS`, `POST_LIMITS` |
| Pas de prospection à froid en masse avant validation juridique | brief, CLAUDE.md |

## 3. Méthode écrite en dur, à sortir ou à assouplir

### 3.1 Dans le prompt de Gyna (`gyna.md`)

| Réglage | Effet sur une demande de l'associé |
|---|---|
| Ordre fixe : Sourcing, puis tri, puis qualification fine sur demande, puis Rédaction | Gyna suit la chaîne même si la demande est d'une autre forme (« juste des noms », « rédige à partir de cette liste »). |
| Le tri suit le Sourcing « de lui-même » ; la qualification fine, jamais | Le tri coûte du budget sans avoir été demandé. |
| « Ne transforme jamais un segment en exigence de preuve » ; tout critère lisible sur le profil complet (ancienneté, activité, taille) va à la Qualification | Un sourcing précis demandé par l'associé est volontairement relâché. |
| Valeurs par défaut : 12 pubs, 3 à 5 angles, adéquation A d'abord, coût de 0,02 € par prospect, lots de 25 à 50 | Chiffres annoncés comme faits ; l'associé ne les voit pas avant de les subir. |
| Un seul compte rendu chiffré, tiré de `list_prospects` | Bon principe, mais figé : pas de format libre. |
| Copie intégrale de la fiche dans chaque délégation, goal préfixé `[Agent]` | Environ 17 Ko recopiés à chaque délégation, même quand une phrase suffirait. |
| Règles propres à Pressy Services écrites dans le prompt général (établissements, `search_places`, « jamais écarter dans le doute ») | Ce qui dépend d'une venture devrait être dans son brief (principe déjà posé). |

### 3.2 Dans les fiches des sous-agents

| Agent | Réglage | Effet |
|---|---|---|
| Sourcing | « Tu n'as rien à trier, rien à vérifier » ; relance seulement avec d'autres intitulés ou lieux ; Apify direct réservé à ce que l'outil ne sait pas faire | L'agent ne peut pas élargir la méthode de recherche. |
| Qualification | Grille A, B, C ou écarté ; chaud, tiède, froid ; « sans publication, froid » | Pas de notation libre selon la demande. |
| Rédaction | « 4 à 6 lignes, une seule demande simple, vouvoiement » | Format de message imposé. |
| Ads | Style visuel d'une marque dans le prompt global (« très gros titre en majuscules avec ombre décalée, photo détourée, pastille ») | Cette marque devrait vivre dans la charte, pas dans la fiche. |
| Ads | 3 à 5 angles, un lot par plateforme | Structure imposée. |
| Campagnes | Format de décision fixe (état, changement, chiffre, retour arrière) | Utile, mais rigide. |

### 3.3 Dans les outils MCP

| Outil | Réglage figé | Effet |
|---|---|---|
| `search_linkedin_profiles` | Mode court, intitulés actuels, 5 filtres (ancienneté, tailles, secteurs, mots-clés libres, segment), 25 résultats par page | On cherche par titre et lieu ; pas par posts, groupes, anciens postes ou entreprises précises. |
| `search_places` | Un lieu central, un rayon, jusqu'à 8 termes, Google Maps seulement | Pas d'autre source d'établissements. |
| `fetch_profiles` | Lot de 25 par défaut, 50 au plus | Tri par petits lots. |
| `fetch_posts` | 10 publications au plus par personne, sans repartages, fenêtre du brief, A par défaut, 30 prospects au plus | Qualification limitée à ce que le code sait lire. |
| `add_signals` | Les signaux hors de la fenêtre du brief sont **rejetés** | Règle de méthode appliquée par le code, sans moyen de l'écarter pour une mission. |
| `triage_prospects`, `rate_companies` | Valeurs A, B, C, écarté ; fort, possible, faible, écarté | Échelles fermées. |
| `list_prospects`, `list_companies` | 300 lignes au plus | Gyna ne voit jamais plus. |
| `submit_draft` | Format de brouillon LinkedIn | Un seul canal de message. |

### 3.4 Dans les skills (modifiables, mais en doublon avec le reste)

- Les mêmes consignes sont écrites à trois endroits : la fiche, le skill et la description de l'outil. Exemples : les filtres `company_sizes` et `industries` du sourcing ; le « un titre et un lieu suffisent ».
- Les skills sont une bonne place, mais comme il y a des consignes concurrentes dans le prompt, personne ne sait laquelle gagne.
- `regles-alpact` mélange des garde-fous (RGPD, sources) et du style (ton, emoji).

## 4. Constats

1. **Le plus gros levier est la hiérarchie des consignes.** Il n'y a pas de règle « la demande de l'associé prime sur les valeurs par défaut ». Gyna doit deviner.
2. **Les garde-fous sont en bon état** et bien placés dans le code ou le plugin. Rien à changer.
3. **La méthode de prospection est la plus rigide** : chaîne de 4 étapes, échelles fermées, outils à réglages fixes. C'est là que « trop fin ou pas assez » se produit.
4. **Des règles propres à une venture ou à une marque sont dans le prompt global** (Pressy, style visuel de L'Amorce). Elles devraient être dans le brief ou la charte.
5. **Un doublon à trois endroits** pour plusieurs consignes. À réduire à un seul (skill ou outil), les autres renvoyant à lui.
6. **Deux règles de méthode appliquées par le code sans échappatoire** : le rejet des signaux hors fenêtre, et les échelles fermées de tri.

## 5. Ce que je propose ensuite

1. Ajouter dans `gyna.md` une règle de priorité : la demande de l'associé prime sur les valeurs par défaut ; Gyna dit quand elle s'en écarte et pourquoi.
2. Sortir l'enchaînement sourcing, tri, qualification, rédaction dans un skill de recette, lisible et modifiable dans l'app.
3. Remplacer la copie intégrale des fiches dans chaque délégation par un renvoi aux skills, que chaque agent charge déjà.
4. Déplacer ce qui est propre à une venture (Pressy, style visuel) dans le brief ou la charte.
5. Rendre paramétrables les réglages d'outils qui le méritent (taille des lots, nombre de publications, fenêtre des signaux) au lieu de les figer.

Les étapes 2 à 5 changent le comportement de Gyna : à tester sur de vraies missions avant de pousser.
