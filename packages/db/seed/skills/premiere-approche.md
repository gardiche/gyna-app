---
name: premiere-approche
agent: redaction
description: Structure, exemples et liste de contrôle pour écrire le premier message LinkedIn à un prospect qualifié chaud ou tiède. À utiliser pour chaque brouillon, avant submit_draft.
---

# Écrire une première approche LinkedIn

## Objectif

Un message qu'un associé approuve sans retouche, et auquel le prospect a envie de répondre parce qu'il parle de lui.

## Entrées

- Brief (`get_brief`) : offre, promesse, ton, interdits, format.
- Le prospect : nom, titre, chaleur, signaux et justification.
- Retours des associés (`get_feedback`) : appliquer leurs corrections, ne pas refaire ce qu'ils ont refusé.

Si l'offre du brief est « À compléter », écrire quand même avec `[offre]` entre crochets et le signaler à Gyna.

## Format

Par défaut, un message LinkedIn de 400 à 700 caractères. Si le brief demande une note d'invitation, 200 caractères au plus, sans la phrase sur l'offre.

## Chaud ou tiède

- **Chaud** : l'accroche cite ce qu'il a écrit, et la demande propose un échange sur son projet.
- **Tiède** : pas de signal explicite à citer. L'accroche part de sa situation visible (titre, sujet qu'il commente), sans lui prêter d'intention ; la demande est plus ouverte (« est-ce un sujet pour vous en ce moment ? »).

## Structure

1. **Salutation** : « Bonjour [Prénom], »
2. **Accroche** : le signal ou la situation, précisément, en une phrase. Pas un compliment.
3. **Pont** : pourquoi Alpact lui écrit, relié à cette accroche.
4. **Offre** : une phrase, avec un élément concret du brief (format, durée, lieu, résultat).
5. **Demande** : une seule question, facile à accepter.
6. **Signature** : prénom de l'associé entre crochets, `[Prénom]`.

Une échéance réelle du brief (date de clôture, nombre de places) peut être citée une fois, comme un fait, si le brief l'autorise.

## Liste de contrôle avant submit_draft

```
- [ ] Vouvoiement partout
- [ ] Accroche exacte : signal enregistré (chaud) ou situation visible (tiède)
- [ ] Une seule question
- [ ] Longueur dans le format
- [ ] Aucun fait inventé ; l'inconnu est entre crochets
- [ ] Aucune formule interdite (ci-dessous) ni interdit du brief
- [ ] Rien sur la façon dont on l'a trouvé
```

Si un point échoue, corriger puis relire la liste entière.

## Formules interdites

« J'espère que vous allez bien », « Je me permets de vous contacter », « opportunité unique », toute urgence artificielle (« dernière chance », « ne tardez pas »), « Félicitations pour votre parcours » sans fait précis, « Notre outil a repéré… », emojis, points d'exclamation en série, lien dans le premier message.

## Exemples

Les exemples sont tirés de L'Amorce ; pour une autre venture, prendre les faits de son brief.

**Chaud.** Post il y a 3 semaines : « Après 10 ans dans l'industrie, je quitte mon poste pour lancer mon projet. Je cherche des retours de futurs utilisateurs ! »

Bon :
```
Bonjour Claire,

Vous annonciez il y a quelques semaines quitter votre poste pour lancer votre projet, et chercher des retours de futurs utilisateurs. C'est exactement ce que travaille L'Amorce : 16 semaines à Annecy pour construire une première version avec l'IA et la tester face à de vrais clients, avec des entrepreneurs formateurs.

Seriez-vous d'accord pour qu'on en parle 15 minutes, autour de votre projet ?

[Prénom]
```

Mauvais :
```
Bonjour Claire ! J'espère que vous allez bien. J'ai vu votre super profil et je me permets de vous contacter car nous avons une opportunité unique : notre formation ! Ne tardez pas, inscrivez-vous vite : [lien]
```
Pourquoi : aucune référence à ce qu'elle a écrit, trois formules interdites, urgence artificielle, lien, deux injonctions.

**Chaud.** Commentaire il y a 5 jours : « Est-ce qu'on peut tester son idée sans savoir coder ? »

Bon :
```
Bonjour Julien,

Vous demandiez récemment si l'on peut tester son idée sans savoir coder. C'est le parti pris de L'Amorce : construire et tester une première version avec des outils d'IA, sans programmation, pendant 16 semaines à Annecy.

Avez-vous un projet que vous aimeriez confronter au terrain ?

[Prénom]
```

**Tiède.** Titre « Porteuse de projet · ex-responsable RH », commente des posts sur l'entrepreneuriat social.

Bon :
```
Bonjour Sophie,

Je vois que vous portez un projet après un parcours dans les ressources humaines, et que l'entrepreneuriat social vous intéresse. Nous lançons L'Amorce, un programme de 16 semaines à Annecy pour construire et tester un projet entrepreneurial avec l'IA, en intégrant ses objectifs sociaux et environnementaux dès le départ. Les pré-inscriptions sont ouvertes jusqu'au 30 octobre.

Est-ce un sujet pour vous en ce moment ?

[Prénom]
```
