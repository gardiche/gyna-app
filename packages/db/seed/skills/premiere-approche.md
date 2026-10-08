---
name: premiere-approche
agent: redaction
description: Structure, exemples et liste de contrôle pour écrire le premier message LinkedIn à un prospect qualifié. À utiliser pour chaque brouillon, avant submit_draft.
---

# Écrire une première approche LinkedIn

## Objectif

Un message qu'un associé approuve sans retouche, et auquel le prospect a envie de répondre parce qu'il parle de lui.

## Entrées

- Brief (`get_brief`) : offre, promesse, ton, interdits, format.
- Le prospect : nom, titre, signaux et justification de chaleur.
- Retours des associés (`get_feedback`) : appliquer leurs corrections, ne pas refaire ce qu'ils ont refusé.

Si l'offre du brief est « À compléter », écrire quand même avec `[offre]` entre crochets et le signaler à Gyna.

## Format

Par défaut, un message LinkedIn de 400 à 700 caractères. Si le brief demande une note d'invitation, 200 caractères au plus, sans la phrase sur l'offre.

## Structure

1. **Salutation** : « Bonjour [Prénom], »
2. **Accroche** : le signal, précisément, en une phrase. Ce qu'il a écrit et quand, pas un compliment.
3. **Pont** : pourquoi Alpact lui écrit, relié à ce signal.
4. **Offre** : une phrase, avec un élément concret du brief (format, lieu, durée).
5. **Demande** : une seule question, facile à accepter.
6. **Signature** : prénom de l'associé entre crochets, `[Prénom]`.

## Liste de contrôle avant submit_draft

```
- [ ] Vouvoiement partout
- [ ] Le signal cité est exact et vient de ses signaux enregistrés
- [ ] Une seule question
- [ ] Longueur dans le format
- [ ] Aucun fait inventé ; l'inconnu est entre crochets
- [ ] Aucune formule interdite (ci-dessous) ni interdit du brief
- [ ] Rien sur la façon dont on l'a trouvé
```

Si un point échoue, corriger puis relire la liste entière.

## Formules interdites

« J'espère que vous allez bien », « Je me permets de vous contacter », « opportunité unique », « places limitées » ou toute urgence artificielle, « Félicitations pour votre parcours » sans fait précis, « Notre outil a repéré… », emojis, points d'exclamation en série, lien dans le premier message.

## Exemples

Dans les exemples, les crochets marquent ce que le brief doit fournir. Dans un vrai brouillon, les remplir avec le brief, ou les laisser entre crochets si le brief ne le dit pas.

**Signal :** post il y a 3 semaines, « Après 8 ans dans la vente, je cherche une formation pour passer au développement web. Des conseils ? »

Bon :
```
Bonjour Claire,

Vous demandiez il y a quelques semaines des conseils pour passer de la vente au développement web. C'est le parcours que propose L'Amorce, notre bootcamp [lieu] : [format et durée, tels que décrits dans l'offre du brief].

Est-ce que je peux vous en dire plus lors d'un échange de 15 minutes ?

[Prénom]
```

Mauvais :
```
Bonjour Claire ! J'espère que vous allez bien. J'ai vu votre super profil et je me permets de vous contacter car nous avons une opportunité unique : notre bootcamp ! Les places sont limitées, inscrivez-vous vite : [lien]
```
Pourquoi : aucune référence à ce qu'elle a écrit, trois formules interdites, urgence artificielle, lien, deux injonctions.

**Signal :** commentaire il y a 5 jours sous un post de bootcamp, « Est-ce que c'est accessible sans bac+5 ? »

Bon :
```
Bonjour Julien,

Vous vous demandiez sous un post récent si un bootcamp était accessible sans bac+5. Pour L'Amorce, [conditions d'accès, telles que décrites dans le brief].

Voulez-vous que je vous explique comment se passe l'entrée en formation ?

[Prénom]
```
