---
name: steward
description: Conventions pour mener une PR de Tandem jusqu'à la fusion (CI, relectures, après fusion). Lu automatiquement quand une PR est suivie.
---

# Mener une PR de Tandem

- Suivre `.claude/workflow.md`, étapes 4 à 8.
- **CI rouge** :
  - lire le journal du job (`get_job_logs`) et reproduire l'échec en local ;
  - corriger à la racine, relancer les contrôles de la zone (tableau de l'étape 4), puis
    pousser un seul commit validé ;
  - un test qui échoue n'est jamais « instable » par défaut ;
  - un test n'est jamais désactivé pour obtenir du vert.
- **Pièges connus** :
  - `apps/docs/static/openapi.json` à régénérer après toute modification de route ou de
    contrat ;
  - `prettier --check .` à la racine, qui couvre aussi les `.md` et les `.json` ;
  - les attentes des tests API qui listent des énumérations, par exemple les types de
    notification ;
  - le lint Android `ImpliedQuantity`, en `values-fr` ;
  - le schéma Room exporté.
- **Relectures** : les petites demandes sont appliquées et poussées ; une demande plus large ou
  une question de conception est soumise à l'utilisateur, en français.
- **Après la fusion** : remettre la branche sur `main`, supprimer la vérification programmée,
  puis dire à l'utilisateur ce qu'il reste à faire hors code.
- **Communication** : en français ; commentaires GitHub rares et terminés par la ligne
  d'attribution demandée par la session.
