# Message à envoyer à Hermes

Copiez le bloc ci-dessous et envoyez-le à Hermes (Telegram ou app desktop), une fois `install.sh` passé sur le VPS.
Hermes connaît sa propre configuration mieux que nous : on lui décrit le résultat attendu et on lui demande de vérifier chaque point.

```
Je veux que tu configures ce VPS pour Gyna, l'outil d'acquisition d'Alpact. Le code est installé dans /opt/gyna. Ne touche pas à ton profil personnel ni à ta gateway Telegram actuelle. Pour chaque étape, vérifie dans ta configuration ou ton code (v0.21.5) comment le faire correctement, fais-le, puis dis-moi ce que tu as fait et ce que tu n'as pas pu faire.

1. Profil dédié
   Crée un profil Hermes nommé « gyna », distinct du profil actuel. Modèle par défaut : anthropic/claude-sonnet-5 (provider actuel).
   Aucun accès au shell, aux fichiers ni au navigateur pour ce profil.

2. Agents
   Dans le profil « gyna », configure un agent principal et trois sous-agents, avec ces prompts système (fichiers dans /opt/gyna/infra/hermes/agents/) :
   - agent principal : gyna.md
   - sous-agent « sourcing » : sourcing.md
   - sous-agent « qualification » : qualification.md
   - sous-agent « redaction » : redaction.md
   L'agent principal doit pouvoir déléguer aux trois sous-agents. Explique-moi le mécanisme de délégation que tu utilises.

3. Serveurs MCP du profil « gyna »
   a. « gyna » : HTTP, URL http://127.0.0.1:8791/mcp, en-tête Authorization: Bearer <valeur de MCP_ACCESS_TOKEN dans /etc/gyna/mcp.env>.
      Outils attendus : get_brief, get_skill, find_prospect, upsert_prospects, add_signals, qualify_prospect, discard_prospect, submit_draft, report_cost, log_action.
   b. « apify » : le serveur MCP officiel d'Apify, avec le token Apify que je te donnerai, pour les sous-agents sourcing et qualification uniquement.
   Vérifie que les outils sont bien découverts au démarrage.

4. hermes serve
   Lance `hermes serve` en service permanent (systemd), écoute sur 127.0.0.1:9119 uniquement, chat embarqué activé.
   Donne-moi le jeton local à mettre dans HERMES_TOKEN (/etc/gyna/bridge.env), ou explique comment le pont doit s'authentifier si le mode local n'est pas possible.
   Vérifie que `session.create` accepte le paramètre profile="gyna".

5. Test
   Redémarre le service gyna-bridge, puis vérifie que `curl -s http://127.0.0.1:8790/health` répond "hermes":"connecté".
```

## Ce qu'il faut lui donner ensuite

- Le token Apify (console Apify, Settings > Integrations).
- Si Hermes signale un écart avec ce que le code attend (nom d'un paramètre, format d'un événement), copiez sa réponse dans la conversation avec Claude pour ajuster le pont.
