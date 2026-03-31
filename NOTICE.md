# NetTools — Notice d'utilisation

> Application de gestion réseau pour administrateurs système
> Wails v2 · Go · React · SQLite · Windows

---

## Table des matières

1. [Présentation générale](#1-présentation-générale)
2. [Installation et premier lancement](#2-installation-et-premier-lancement)
3. [Interface générale](#3-interface-générale)
4. [Gestion des credentials](#4-gestion-des-credentials)
5. [Découverte réseau (SNMP)](#5-découverte-réseau-snmp)
6. [Inventaire des équipements](#6-inventaire-des-équipements)
7. [Backups SSH](#7-backups-ssh)
8. [Comparateur de configurations](#8-comparateur-de-configurations)
9. [Audit de conformité](#9-audit-de-conformité)
10. [Playbooks SSH](#10-playbooks-ssh)
11. [Planificateur de tâches](#11-planificateur-de-tâches)
12. [Journaux d'activité](#12-journaux-dactivité)
13. [Topologie réseau](#13-topologie-réseau)
14. [Paramètres](#14-paramètres)
15. [Workflows types](#15-workflows-types)
16. [Référence technique](#16-référence-technique)
17. [Dépannage](#17-dépannage)

---

## 1. Présentation générale

### Qu'est-ce que NetTools ?

NetTools est une application desktop autonome pour **Windows** destinée aux administrateurs réseau. Elle regroupe dans une seule interface les opérations les plus courantes de gestion d'infrastructure réseau :

- **Découverte** des équipements par scan SNMP
- **Sauvegarde** automatisée des configurations (running/startup)
- **Audit de conformité** par règles regex configurables
- **Comparaison** de configurations (diff ligne à ligne)
- **Automatisation** par playbooks SSH en YAML
- **Planification** de tâches récurrentes (cron)
- **Journalisation** complète de toutes les opérations

### Architecture technique (pour les curieux)

```
Couche          Technologie
─────────────── ─────────────────────────────────
Frontend        React 18 + TypeScript + Tailwind CSS
Backend         Go (compilé dans le même binaire)
Communication   Wails v2 (IPC natif WebView2)
Base de données SQLite (GORM, mode WAL)
Chiffrement     DPAPI Windows (credentials)
SNMP            gosnmp v2c/v3
SSH             golang.org/x/crypto/ssh
Logs            zerolog (JSON)
Planificateur   robfig/cron v3
```

L'application est un **unique fichier `.exe`** embarquant à la fois le frontend React et le backend Go. Aucun serveur, aucune dépendance réseau externe : tout tourne localement.

### Données stockées

Tout est conservé dans `%APPDATA%\NetTools\` :

```
%APPDATA%\NetTools\
├── nettools.db          Base de données SQLite
├── settings.json            Préférences utilisateur
├── backups\                 Fichiers de configuration sauvegardés
└── logs\
    └── nettools-YYYY-MM.log   Journaux mensuels
```

---

## 2. Installation et premier lancement

### Prérequis

| Composant | Version | Notes |
|-----------|---------|-------|
| Windows | 10 / 11 | 64 bits obligatoire |
| WebView2 Runtime | Toute version récente | Pré-installé sur Windows 11 |

> **WebView2** est le moteur de rendu utilisé par Microsoft Edge. Il est présent par défaut sur Windows 11 et Windows 10 récent. Si absent, le télécharger sur le site Microsoft.

### Installation

1. Copier `Nettools_claude.exe` dans le dossier de votre choix
2. Double-cliquer pour lancer — aucune installation requise
3. Au premier lancement, Windows Defender peut afficher un avertissement : cliquer sur **Informations complémentaires → Exécuter quand même**

### Premier lancement : configuration initiale recommandée

```
1. Ouvrir les Paramètres (icône engrenage, barre latérale)
2. Configurer le répertoire de backup
3. Créer un credential SSH/SNMP
4. Lancer un premier scan SNMP de test
```

---

## 3. Interface générale

### Navigation

La barre latérale gauche donne accès à toutes les sections :

| Icône | Section | Rôle |
|-------|---------|------|
| 📡 | Scan réseau | Découverte SNMP |
| 📋 | Inventaire | Gestion des équipements |
| 💾 | Backups | Sauvegarde SSH |
| ↔️ | Diff | Comparaison de configs |
| ✔️ | Audit | Conformité |
| ▶️ | Playbooks | Automatisation SSH |
| 🕐 | Planificateur | Tâches programmées |
| 📜 | Journaux | Logs et événements |
| 🌐 | Topologie | Carte réseau |
| ⚙️ | Paramètres | Configuration |

### Credential actif (sidebar)

En bas de la barre latérale, un sélecteur affiche le **credential global actif**. Ce credential est utilisé par défaut pour toutes les opérations SSH et SNMP qui n'en spécifient pas un explicitement. Changer ce sélecteur affecte toutes les pages instantanément.

### Notifications

Des toasts (notifications courtes) apparaissent en haut à droite pour confirmer les actions ou signaler les erreurs. Ils disparaissent automatiquement après quelques secondes.

---

## 4. Gestion des credentials

> **Page :** Paramètres → onglet Credentials

Les credentials stockent les identifiants SSH et/ou SNMP de manière **chiffrée** (DPAPI Windows). Les mots de passe ne sont jamais stockés en clair.

### Créer un credential

Cliquer sur **Ajouter** (icône `+`) puis remplir :

**Champs SSH :**

| Champ | Obligatoire | Description |
|-------|-------------|-------------|
| Nom | ✓ | Identifiant lisible (ex: `admin-aruba`) |
| Nom d'utilisateur SSH | — | Login SSH |
| Mot de passe SSH | — | Laissé vide = authentification par clé |
| Clé privée SSH | — | Clé RSA/Ed25519 en PEM |

**Champs SNMP :**

| Champ | Description |
|-------|-------------|
| Version SNMP | `v2c` (communauté) ou `v3` (authentifié) |
| Communauté | Pour v2c (ex: `TICE`, `public`) |
| Utilisateur v3 | Pour SNMPv3 uniquement |
| Auth Protocol | SHA ou MD5 |
| Auth Key | Clé d'authentification v3 |
| Privacy Protocol | AES ou DES |
| Privacy Key | Clé de chiffrement v3 |

> **Conseil :** Un même credential peut contenir à la fois des infos SSH et SNMP. Créer un credential `admin-global` avec les deux pour simplifier la configuration.

### Credential global

Cliquer sur l'icône **étoile** ou **épingle** d'un credential pour le définir comme credential global. Il sera pré-sélectionné dans toutes les pages.

### Modifier un credential

En cliquant Éditer, les champs de mots de passe affichent `(inchangé)` — laisser vide pour ne pas modifier la valeur chiffrée existante.

---

## 5. Découverte réseau (SNMP)

> **Page :** Scan réseau

Le scanner SNMP interroge les équipements réseau pour collecter leurs métadonnées (nom, modèle, firmware, uptime...) et les enregistrer dans l'inventaire.

### Modes de scan

#### Mode Switches (rapide)
Cible automatiquement les IPs `.1` à `.95` et `.254` d'un sous-réseau `/24`. Adapté à une infrastructure où les switchs occupent des IPs basses.

```
Préfixe réseau : 10.113.76
→ Scanne 10.113.76.1 à 10.113.76.95 + 10.113.76.254
```

#### Mode Complet (/24)
Scanne les 254 IPs d'un sous-réseau `/24`.

```
Préfixe réseau : 10.113.76
→ Scanne 10.113.76.1 à 10.113.76.254
```

#### Mode CIDR (personnalisé)
Permet n'importe quelle plage CIDR.

```
Exemples :
10.113.76.0/24   → 254 IPs
10.0.0.0/22      → 1022 IPs
192.168.1.100/32 → 1 IP
```

#### Liste d'IPs manuelle
Saisir les IPs directement, séparées par des virgules, espaces ou retours à la ligne.

```
10.113.76.10, 10.113.76.11
10.113.76.20
10.113.77.1
```

### Paramètres de scan

| Paramètre | Défaut | Conseil |
|-----------|--------|---------|
| Communauté SNMP | TICE | Vérifier avec l'équipe réseau |
| Timeout par IP | 3 s | Augmenter sur liens WAN lents |
| Workers parallèles | 10 | Max 50 recommandé pour éviter la congestion |
| Credential | Global | Sélectionner un credential v3 si v2c refusé |

> **Attention :** Trop de workers sur un réseau lent ou via VPN peut provoquer des timeouts. Commencer avec 10 workers.

### Lancement et suivi

1. Configurer les paramètres
2. Cliquer **Lancer le scan**
3. La barre de progression indique l'avancement en temps réel (`X / Y IPs`)
4. Le bouton **Stop** arrête immédiatement le scan en cours
5. Les équipements découverts s'affichent dans le tableau

### Résultats du scan

Chaque ligne du tableau affiche :

| Colonne | Description |
|---------|-------------|
| IP | Adresse IP de l'équipement |
| Hostname | Valeur sysName SNMP |
| MAC | Adresse MAC (si disponible) |
| Fabricant | Détecté depuis sysDescr |
| Modèle | Modèle exact |
| Firmware | Version OS/firmware |
| Uptime | Temps depuis dernier redémarrage |
| Localisation | Valeur sysLocation SNMP |

### Export Excel

Cliquer **Exporter Excel** pour générer un fichier `.xlsx` avec :
- En-têtes colorés
- Lignes alternées (zèbre)
- Feuille de résumé par fabricant

### Diagnostic IP individuel

Le champ **Tester une IP** permet de tester la connectivité SNMP d'une seule adresse :
- Teste automatiquement v2c → v1 → communauté `public` en fallback
- Retourne les OIDs bruts collectés
- Utile pour diagnostiquer un équipement récalcitrant

---

## 6. Inventaire des équipements

> **Page :** Inventaire

L'inventaire est la base de données centrale de tous les équipements connus. Les scans SNMP y ajoutent automatiquement les équipements découverts.

### Tableau des équipements

La liste affiche IP, hostname, fabricant, modèle, localisation et date de dernière vue. Utiliser le champ **Recherche** pour filtrer par IP ou hostname.

### Ajouter un équipement manuellement

Cliquer **Ajouter** et remplir :

| Champ | Obligatoire | Exemple |
|-------|-------------|---------|
| Adresse IP | ✓ | `10.113.76.10` |
| Hostname | — | `SW-SALLE-A` |
| Fabricant | — | `aruba`, `cisco`, `allied`... |
| Modèle | — | `2930F` |
| Port SSH | — | `22` (défaut) |
| Localisation | — | `Bâtiment A / Salle réseau` |
| Credential | — | Sélectionner depuis la liste |

### Modifier un équipement

Cliquer l'icône **crayon** pour éditer les informations. Le credential assigné ici sera utilisé par défaut pour les backups et les commandes SSH sur cet équipement.

### Tester la connexion SSH

L'icône **prise électrique** lance un test de connexion SSH sur l'équipement. Un toast vert confirme le succès, rouge indique l'erreur avec le message exact.

> **Conseil :** Tester la connexion après avoir assigné un credential pour valider la configuration avant un backup.

### Vider l'inventaire

Le bouton **Vider l'inventaire** supprime tous les équipements après confirmation. Cette action est irréversible.

---

## 7. Backups SSH

> **Page :** Backups

Le gestionnaire de backups se connecte en SSH aux équipements et sauvegarde leur configuration de manière automatique, propre et reproductible.

### Fonctionnement technique

Le moteur utilise une stratégie **exec-first / interactive-fallback** :

1. **Tentative exec** : connexion SSH sans PTY (canal exec), sortie propre sans pagination
2. **Fallback interactif** : si l'équipement refuse le canal exec, bascule sur un shell PTY interactif
3. **Désactivation de la pagination** : commande vendor-spécifique envoyée avant la récupération de config
4. **Nettoyage** : suppression des artefacts (prompts, echo de commande, séquences de pagination)

### Support multi-vendor

| Fabricant | Commande config | Désactivation pagination | Notes |
|-----------|----------------|--------------------------|-------|
| Cisco IOS/XE | `show running-config` | `terminal length 0` | Canal exec préféré |
| Aruba AOS-S | `show running-config` | `no page` | Exec non supporté → interactif |
| HP ProCurve | `show running-config` | `no page` | |
| HPE Comware / H3C | `display current-configuration` | `screen-length 0 temporary` | |
| Huawei VRP | `display current-configuration` | `screen-length 0 temporary` | |
| Allied Telesis | `show running-config` | `terminal length 0` | AlliedWare Plus |
| Fortinet FortiOS | `show full-configuration` | — | Pas de pagination native |
| Unknown | `show running-config` | — | Détection auto depuis banner SSH/MOTD |

#### Détection automatique du vendor

Si un équipement est marqué **Unknown**, le moteur détecte automatiquement le fabricant depuis :
1. La chaîne de version SSH server (`SSH-2.0-Cisco-...`, `SSH-2.0-HuaweiSSH`...)
2. Le MOTD initial du shell interactif

### Lancer un backup

#### Étape 1 : Choisir le type de configuration

| Type | Description | Commande |
|------|-------------|----------|
| Running config | Configuration active en mémoire | Varie par vendor |
| Startup config | Configuration persistée (après `write memory`) | `show startup-config` |

> **Conseil :** Toujours faire un backup **running** pour avoir l'état réel. Le startup peut différer si des changements non sauvegardés existent.

#### Étape 2 : Sélectionner les équipements

**Mode Manuel :** Coller les IPs séparées par virgule/point-virgule/retour ligne.

**Mode Dernier scan :** Affiche les équipements du dernier scan SNMP avec des cases à cocher. Pratique pour cibler un sous-réseau entier.

#### Étape 3 : Credentials

- Si un credential global est actif : il est utilisé automatiquement
- Sinon : remplir les champs Identifiant/Mot de passe SSH en ligne

#### Étape 4 : Lancer

Cliquer **Lancer le backup**. La progression s'affiche en temps réel :
- Barre globale (`X / Y équipements`)
- Grille par équipement avec :
  - ⏳ En cours (spinner)
  - ✓ Succès (vert)
  - ✗ Échec + message d'erreur (rouge)

### Historique des backups

Le sélecteur d'équipement en bas de page affiche l'historique de tous les backups :

| Colonne | Description |
|---------|-------------|
| Date | Horodatage du backup |
| Type | Running / Startup |
| Statut | Succès / Échec |
| Taille | Taille du fichier |
| Durée | Temps de récupération |
| 👁️ | Visualiser le contenu |
| 💻 | Ouvrir le terminal SSH |

### Visualiser un backup

L'icône œil ouvre le contenu brut du fichier de configuration dans une fenêtre modale scrollable.

### Terminal SSH interactif

L'icône terminal ouvre une console SSH sur l'équipement. Utiliser pour :
- Diagnostiquer un équipement
- Vérifier une configuration spécifique
- Exécuter des commandes non couvertes par les backups

**Suggestions rapides disponibles :**
`show version` · `show running-config` · `show interfaces` · `show vlan` · `show ip route` · `show arp`

La sortie s'affiche en temps réel (fond noir, texte vert pour succès, rouge pour erreur).

---

## 8. Comparateur de configurations

> **Page :** Diff

Le comparateur permet de visualiser les différences ligne à ligne entre deux configurations.

### Modes de comparaison

#### Mode Texte
Coller ou importer deux blocs de configuration :
- Glisser-déposer des fichiers `.txt`, `.cfg`, `.conf`, `.log`
- Coller directement dans les zones de texte
- Bouton de chargement de fichier

#### Mode Backup
Comparer deux sauvegardes d'un même équipement :
1. Sélectionner l'équipement
2. Choisir le backup A (référence)
3. Choisir le backup B (version à comparer)
4. Cliquer **Comparer**

### Options de filtrage

| Option | Description |
|--------|-------------|
| Ignorer la casse | `VLAN` = `vlan` |
| Ignorer les espaces | Indentation ignorée |
| Trim trailing | Espaces de fin de ligne supprimés |
| Changements seulement | N'affiche que les lignes ajoutées/supprimées |
| Filtres regex | Ignorer des patterns (un par ligne) |

**Exemples de filtres regex courants :**
```
^!.*Last configuration change.*    # Ignorer les timestamps Cisco
^! Generated.*                     # Ignorer l'en-tête de génération
^ntp clock-period.*                # Ignorer les valeurs NTP auto-calculées
^\s*#.*                            # Ignorer les commentaires
```

### Lecture du diff

```
  10 | interface GigabitEthernet0/1        (gris = inchangé)
+ 11 | description UPLINK-CORE             (vert = ajouté)
- 11 | description UPLINK                  (rouge = supprimé)
  12 | switchport mode trunk               (gris = inchangé)
```

L'en-tête affiche le résumé : `+12 lignes ajoutées  -5 lignes supprimées  =342 lignes inchangées`

### Export HTML

Le bouton **Exporter HTML** génère un rapport diff standalone avec :
- Thème sombre
- Numéros de ligne
- Statistiques
- Partageable sans outil tiers (un seul fichier `.html`)

---

## 9. Audit de conformité

> **Page :** Audit

L'audit vérifie si les configurations des équipements respectent un ensemble de règles définies par l'administrateur.

### Concept des règles

Chaque règle est un **pattern regex** appliqué sur le texte de la configuration. Elle peut :
- Exiger la **présence** d'un pattern (`doit contenir`)
- Exiger l'**absence** d'un pattern (`interdit`)

**Exemples de règles :**
```
Règle : "Chiffrement passwords"
Pattern : service password-encryption
Type : Doit contenir
Sévérité : Critique
→ Passe si "service password-encryption" est présent dans la config

Règle : "Telnet désactivé"
Pattern : transport input telnet
Type : Interdit
Sévérité : Élevé
→ Passe si "transport input telnet" est ABSENT de la config
```

### Pattern AND (multi-bloc)

Pour vérifier que **plusieurs éléments sont présents ensemble**, utiliser ` AND ` :
```
ntp server 10.113.10.1 AND ntp authenticate
```
→ Passe seulement si les deux chaînes sont présentes dans la config.

### Règles prédéfinies

22 règles sont incluses, adaptées à l'environnement Aruba/HPE Région Grand Est :

| Catégorie | Exemples de règles |
|-----------|-------------------|
| Sécurité | Chiffrement passwords, désactivation HTTP/DHCP/Telnet, suppression compte `manager` |
| SSH | Service SSH activé, restriction aux utilisateurs autorisés |
| Journalisation | Facility `local0`, serveur syslog `10.113.x.x` |
| Heure | Timezone Paris, NTP `ntp.lor.numerique-educatif.fr` |
| SNMP | Communauté `TICE`, AAA/Radius |
| L2 | RSTP, LLDP, loop-protection, multicast routing, private VLAN 999 |
| VLANs | 1 (Administratif), 401 (PEDAGO), 502 (DMZ-PRIV), 504 (DMZ-PEDAGO), 517 (SERVEURS-PEDA) |

### Lancer un audit

#### Sélectionner les équipements

**Mode Dernier scan :** Case à cocher par équipement découvert
**Mode Manuel :** Saisir les IPs (analyse les backups existants de ces équipements)

> **Prérequis :** Un backup de la configuration doit exister pour chaque équipement audité.

#### Filtrer les règles

Par défaut, toutes les règles sont sélectionnées. Pour n'en appliquer que certaines :
1. Déplier la section **Règles appliquées**
2. Décocher les règles à exclure
3. L'indicateur `Filtré` apparaît si la sélection est partielle

#### Lancer l'audit

Cliquer le bouton **Auditer** (vert). Les résultats apparaissent par équipement.

### Lire les résultats

Chaque carte équipement affiche :
- **Score** : pourcentage de règles passées (vert ≥80%, orange 50-79%, rouge <50%)
- **Ratio** : `8/10 règles conformes`
- **Barre colorée** : visualisation rapide du score

En dépliant une carte, chaque règle s'affiche avec :
- ✓ Conforme (vert) ou ✗ Non-conforme (rouge)
- Nom de la règle
- Badge de sévérité (critique/élevé/moyen/faible)
- Détails du diagnostic (mots-clés trouvés ou manquants)

#### Remédiation

Pour les règles non conformes avec remediation configurée, un bloc **Remediation suggérée** apparaît (fond ambre) avec :
- Le script CLI à exécuter sur l'équipement
- Un bouton **Copier** pour copier les commandes dans le presse-papier

Le bouton **Remédiation complète** (icône outils) ouvre un modal avec le script complet pour l'équipement, copier en un clic.

### Gérer les règles d'audit

> Onglet **Règles** de la page Audit

#### Créer une règle

| Champ | Description |
|-------|-------------|
| Nom | Identifiant lisible |
| Pattern (regex) | Expression régulière (supporte `AND`) |
| Description | Explication optionnelle |
| Sévérité | Critique / Élevé / Moyen / Faible |
| Fabricant | Appliquer à tous ou vendor spécifique |
| Doit correspondre | ✓ = doit être présent, ✗ = doit être absent |
| Script de remédiation | Commandes CLI avec variables `{{hostname}}`, `{{ip}}`, `{{vendor}}` |

**Exemple de script de remédiation :**
```
! Remédiation pour {{hostname}} ({{ip}})
service password-encryption
no ip http server
no ip http secure-server
```

---

## 10. Playbooks SSH

> **Page :** Playbooks

Les playbooks permettent d'automatiser des séquences de commandes SSH sur un ou plusieurs équipements, avec vérification de sortie et gestion des erreurs.

### Structure d'un playbook (YAML)

```yaml
name: Vérification sécurité
description: Vérifie la configuration SSH et les accès
timeout: 120s
steps:
  - name: Version du système
    command: show version
    # Pas d'expect = toujours passé

  - name: Vérification SSH v2
    command: show ip ssh
    expect: SSH Enabled - version 2
    on_error: continue   # continuer même si l'expect échoue

  - name: Interfaces actives
    command: show interfaces status
    on_error: abort      # arrêter si cette commande échoue
```

#### Champs disponibles

| Champ | Obligatoire | Description |
|-------|-------------|-------------|
| `name` | ✓ | Nom du playbook |
| `description` | — | Description affichée dans la liste |
| `timeout` | — | Durée max (`30s`, `2m`, `1h`) |
| `steps[].name` | ✓ | Nom de l'étape |
| `steps[].command` | ✓ | Commande SSH à exécuter |
| `steps[].expect` | — | Texte attendu dans la sortie |
| `steps[].on_error` | — | `continue` ou `abort` (défaut: `abort`) |

### Créer un playbook

#### Mode Simple
Saisir une commande par ligne — le playbook YAML est généré automatiquement.
```
show version
show ip ssh
show running-config
```

#### Mode Avancé (YAML)
Éditer directement le YAML pour un contrôle total sur les étapes, les expects et la gestion des erreurs.

### Modèles prêts à l'emploi

Quatre modèles sont disponibles dans l'onglet **Guide & Exemples** :

| Modèle | Commandes incluses |
|--------|-------------------|
| Inventaire rapide | `show version`, `show uptime`, `show interfaces` |
| Vérification sécurité | SSH, Telnet, bannière, NTP, logging |
| Backup VLAN | Export de la configuration VLAN complète |
| Diagnostics réseau | ARP, routes, CDP/LLDP, compteurs d'interfaces |

Cliquer **Copier** sur un modèle pour coller le YAML dans l'éditeur.

### Exécuter un playbook

1. Cliquer **▶ Exécuter** sur le playbook
2. Sélectionner les équipements cibles (avec **Tout sélectionner** si besoin)
3. Cliquer **Exécuter**

### Terminal temps réel

Pendant l'exécution, un terminal affiche en direct :

```
── SW-SALLE-A (10.113.76.10) — équipement 1/3 ──

[1/3] Version du système
      $ show version

      Aruba JL356A 2930F-24G
      WC.16.11.0008

      ✓ Version du système

[2/3] Vérification SSH v2
      $ show ip ssh
      ...
      ✓ Vérification SSH v2

[3/3] Interfaces actives
      $ show interfaces status
      ...
      ✗ Interfaces actives — timeout
```

**Code couleur :**
- Cyan : en-tête équipement
- Blanc : commande envoyée
- Vert clair : sortie SSH
- Vert : step réussi (✓)
- Rouge : step échoué (✗)

### Résumé final

Après l'exécution, un résumé apparaît :
```
2/3 équipements OK
✗ 10.113.76.11 — connexion refusée
```

---

## 11. Planificateur de tâches

> **Page :** Planificateur

Le planificateur permet d'automatiser l'exécution de backups, scans, playbooks et commandes SSH selon un calendrier.

### Types de tâches

| Type | Description |
|------|-------------|
| Backup configuration | Lance un backup SSH sur des équipements |
| Scan réseau | Effectue un scan SNMP |
| Exécuter un playbook | Lance un playbook sur des équipements |
| Commande SSH | Exécute des commandes brutes |

### Créer une tâche planifiée

#### Nom et type

Donner un nom explicite (`Backup quotidien switchs bureau A`) et sélectionner le type.

#### Planification — Mode Simple

| Fréquence | Options disponibles |
|-----------|-------------------|
| Une fois | Date + heure |
| Toutes les heures | Minute (ex: `:30`) |
| Quotidien | Heure + Minute |
| Hebdomadaire | Jour de la semaine + Heure + Minute |
| Mensuel | Jour du mois (1-28) + Heure + Minute |

Un aperçu en français s'affiche : `S'exécute tous les lundis à 09h30`

#### Planification — Mode Avancé (Cron)

Format : `SEC MIN HEURE JOUR_MOIS MOIS JOUR_SEMAINE`

```
0 30 8 * * 1      Chaque lundi à 08:30:00
0 0 2 * * *       Chaque jour à 02:00:00
0 0 */4 * * *     Toutes les 4 heures
0 0 8 1 * *       Le 1er de chaque mois à 08:00
```

> **Note :** Le premier champ est la **seconde** (robfig/cron v3 avec secondes).

#### Paramètres — Mode Simple

**Pour un backup :**
- Credential SSH à utiliser
- Équipements cibles (cases à cocher depuis l'inventaire)
- Type : running ou startup

**Pour un scan :**
- Credential SNMP
- Plage CIDR à scanner

**Pour un playbook :**
- Playbook à exécuter (liste déroulante)
- Équipements cibles

**Pour des commandes SSH :**
- Équipements cibles
- Liste de commandes (une par ligne)

#### Paramètres — Mode Avancé (JSON)

Pour les cas complexes, saisir le payload JSON directement :

```json
// Backup
{
  "device_ids": ["uuid-1", "uuid-2"],
  "config_type": "running",
  "credential_id": "cred-uuid"
}

// Scan
{
  "cidr": "10.113.76.0/24",
  "credential_id": "cred-uuid"
}

// Playbook
{
  "playbook_id": "pb-uuid",
  "device_ids": ["uuid-1"]
}
```

### Gérer les tâches

| Action | Bouton | Description |
|--------|--------|-------------|
| Activer/Désactiver | Toggle bleu/gris | Suspend la tâche sans la supprimer |
| Exécuter maintenant | ▶ (vert) | Lance immédiatement hors planning |
| Supprimer | 🗑️ (rouge) | Supprime définitivement la tâche |

### Suivi des exécutions

La colonne **Dernière exécution** affiche la date/heure du dernier run et son statut (succès/échec). Les détails complets sont dans les **Journaux d'activité**.

> **Tâche "Une fois" :** Elle se désactive automatiquement après son exécution unique.

---

## 12. Journaux d'activité

> **Page :** Journaux

Les journaux tracent toutes les opérations effectuées par l'application.

### Onglet Événements

#### Types d'événements et couleurs

| Action | Couleur | Exemples |
|--------|---------|---------|
| scan | Bleu | Démarrage/fin d'un scan réseau |
| backup | Violet | Backup réussi ou échoué |
| audit | Jaune | Résultats d'audit |
| terminal | Vert | Commandes SSH interactives |
| device | Cyan | Ajout/suppression d'équipement |
| playbook | Orange | Exécution de playbook |
| scheduler | Indigo | Tâches planifiées |
| error | Rouge | Erreurs diverses |

#### Filtrage

Le champ de recherche filtre en temps réel par type d'action. Le bouton **Rafraîchir** recharge la liste (auto-rafraîchissement toutes les 10 secondes).

#### Détail d'un événement

Cliquer sur une ligne (ou le chevron) ouvre un modal avec :
- Grille de métadonnées (date, statut, durée, entité)
- Détails complets au format JSON ou texte
- **Analyse contextuelle** (fond jaune) : conseil de dépannage selon le type d'erreur

**Exemples d'analyses contextuelles :**
```
Backup échoué
→ "Vérifier les credentials SSH et que le port 22 est accessible"

Scan échoué
→ "Vérifier la communauté SNMP et que le port UDP/161 est ouvert"

Audit échoué
→ "Lancer d'abord un backup de l'équipement avant l'audit"
```

### Onglet Fichiers journaux

Le panneau gauche liste les fichiers de logs mensuels (`nettools-2025-11.log`). Cliquer sur un fichier pour afficher son contenu brut dans le panneau droit.

Les logs sont au format JSON structuré (zerolog) :
```json
{"level":"info","time":"2025-11-14T08:30:01Z","action":"backup_completed",
 "device_id":"...","duration_ms":1240,"status":"success"}
```

---

## 13. Topologie réseau

> **Page :** Topologie

La page topologie affiche un graphe interactif des équipements et de leurs interconnexions.

### Navigation dans le graphe

| Action | Geste |
|--------|-------|
| Déplacer un nœud | Glisser-déposer |
| Zoomer | Molette souris |
| Panoramique | Clic droit + glisser |
| Minimap | Coin bas-droit |

### Code couleur des nœuds

| Couleur | Fabricant |
|---------|-----------|
| Bleu | Cisco |
| Violet | Aruba |
| Vert | Allied Telesis |
| Gris | Inconnu |

### Icônes

- ⚡ PoE : l'équipement fournit de l'alimentation PoE (détecté depuis les OIDs)

### Actualiser

Le bouton **Rafraîchir** reconstruit le graphe depuis l'inventaire et les données LLDP collectées lors du dernier scan.

---

## 14. Paramètres

> **Page :** Paramètres

### Paramètres généraux

| Paramètre | Description | Défaut |
|-----------|-------------|--------|
| Thème | Sombre / Clair | Sombre |
| Langue | Français / English | Français |
| Workers max | Parallélisme des opérations | 10 |
| Rétention logs (jours) | Durée de conservation des logs | 90 |
| Répertoire backup | Dossier de stockage des configs | `%APPDATA%\NetTools\backups` |

### Répertoire de backup

Cliquer le bouton de sélection pour choisir un dossier personnalisé. Recommandé : un répertoire synchronisé (NAS, SharePoint...) pour garder les backups hors machine.

> **Conseil :** Mettre le répertoire de backup sur un partage réseau ou un dossier synchronisé pour assurer la sauvegarde des configurations même en cas de panne du poste.

---

## 15. Workflows types

Cette section décrit des séquences d'opérations complètes pour les cas d'usage courants.

### Workflow 1 : Audit hebdomadaire automatisé

**Objectif :** Auditer tous les switchs chaque semaine et recevoir un rapport.

```
1. Paramètres
   → Créer credential "admin-rge" (SSH + SNMP communauté TICE)

2. Scan réseau
   → Mode Switches, préfixe 10.113.76
   → Communauté TICE, timeout 3s, 10 workers
   → Vérifier les équipements découverts

3. Inventaire
   → Assigner le credential "admin-rge" à tous les équipements
   → Compléter les localisations

4. Planificateur → Nouvelle tâche
   → Nom : "Backup hebdomadaire"
   → Type : Backup configuration
   → Fréquence : Hebdomadaire, Lundi 06:00
   → Équipements : Tous
   → Config type : Running

5. Planificateur → Nouvelle tâche
   → Nom : "Audit hebdomadaire"
   → Type : Exécuter playbook
   → Fréquence : Hebdomadaire, Lundi 07:00 (après le backup)
   → Playbook : Vérification sécurité

6. Logs
   → Surveiller l'onglet Événements chaque lundi matin
```

### Workflow 2 : Déploiement d'un changement de configuration

**Objectif :** Activer NTP sur un groupe de switchs et vérifier le résultat.

```
1. Playbooks → Créer "Configuration NTP"
   Contenu YAML :
   ---
   name: Configuration NTP
   timeout: 60s
   steps:
     - name: Configurer NTP
       command: ntp server 10.113.10.1
     - name: Vérifier NTP
       command: show ntp status
       expect: Clock is synchronized

2. Playbooks → Exécuter sur les équipements cibles
   → Observer le terminal en temps réel
   → Vérifier que "✓ Vérifier NTP" s'affiche en vert

3. Audit → Lancer avec règle "NTP configuré"
   → Vérifier score 100%

4. Backup → Sauvegarder les nouvelles configs
```

### Workflow 3 : Comparaison avant/après maintenance

**Objectif :** Documenter les changements effectués pendant une fenêtre de maintenance.

```
1. Avant la maintenance
   Backups → Sauvegarder les configs (snapshot avant)

2. Effectuer la maintenance sur les équipements

3. Après la maintenance
   Backups → Sauvegarder à nouveau

4. Diff → Mode Backup
   → Sélectionner équipement
   → Backup A = avant maintenance
   → Backup B = après maintenance
   → Options : "Changements seulement"
   → Exporter HTML pour la documentation

5. Audit → Vérifier la conformité post-maintenance
```

### Workflow 4 : Inventaire initial d'un nouveau site

**Objectif :** Découvrir et documenter tous les équipements d'un nouveau bâtiment.

```
1. Paramètres → Créer credential SNMP pour le nouveau site

2. Scan réseau → Mode CIDR, plage du nouveau site
   → Récupérer la liste des équipements

3. Inventaire → Compléter les informations manquantes
   → Localisation par salle
   → Modèle si manquant
   → Credential SSH

4. Scan → Exporter Excel pour documentation
   → Feuille de résumé par fabricant incluse

5. Backups → Premier backup complet de tous les équipements

6. Audit → Premier audit de conformité
   → Identifier les écarts par rapport aux standards
```

---

## 16. Référence technique

### Formats de fichiers backup

Les fichiers de backup sont sauvegardés avec la convention de nommage :

```
{IP}_{CONFIG_TYPE}_{TIMESTAMP}.txt
Exemple : 10.113.76.10_running_20251114_083045.txt
```

Ils contiennent la configuration brute telle que renvoyée par l'équipement, sans artefacts de session.

### Format YAML des playbooks

```yaml
name: string                    # Obligatoire
description: string             # Optionnel
timeout: "60s"                  # Optionnel (défaut: 60s)
steps:
  - name: string                # Obligatoire
    command: string             # Obligatoire
    expect: string              # Optionnel — sous-chaîne attendue dans la sortie
    on_error: continue|abort    # Optionnel (défaut: abort)
```

### Expressions cron (Planificateur)

Format robfig/cron v3 avec secondes :

```
┌─────────── seconde (0-59)
│ ┌───────── minute (0-59)
│ │ ┌─────── heure (0-23)
│ │ │ ┌───── jour du mois (1-31)
│ │ │ │ ┌─── mois (1-12)
│ │ │ │ │ ┌─ jour de la semaine (0-6, 0=dimanche)
│ │ │ │ │ │
0 0 8 * * 1   → Chaque lundi à 08:00:00
```

**Wildcards et opérateurs :**

| Opérateur | Signification | Exemple |
|-----------|---------------|---------|
| `*` | Toutes valeurs | `* * * * * *` = chaque seconde |
| `*/n` | Tous les n | `0 */15 * * * *` = toutes les 15 min |
| `n,m` | Valeurs multiples | `0 0 8,20 * * *` = 8h et 20h |
| `n-m` | Plage | `0 0 8-18 * * 1-5` = heures ouvrées |

### Variables de remédiation (Audit)

Dans les scripts de remédiation des règles d'audit :

| Variable | Valeur |
|----------|--------|
| `{{hostname}}` | Hostname de l'équipement |
| `{{ip}}` | Adresse IP |
| `{{vendor}}` | Fabricant détecté |

### Événements temps réel (architecture)

Pour les développeurs étendant l'application, les événements Wails émis :

| Événement | Payload | Émis par |
|-----------|---------|----------|
| `scan:progress` | `{ip, done, total, percent}` | Scanner SNMP |
| `scan:complete` | `{total, duration_ms}` | Scanner SNMP |
| `backup:progress` | `{device_id, status, error}` | Gestionnaire backup |
| `backup:complete` | `{success, failed, duration_ms}` | Gestionnaire backup |
| `terminal:output` | `{line, error}` | Terminal SSH |
| `playbook:step` | `{device_id, device_ip, device_label, step_index, total_steps, step_name, command, done, output, passed, error}` | Runner playbook |
| `playbook:progress` | `{device_label, device_ip, status}` | App.go |
| `tasks:stopped` | — | StopAllTasks() |

---

## 17. Dépannage

### Problèmes de connexion SSH

**Symptôme :** Backup échoué — `connection refused`
```
→ Vérifier que le service SSH est actif sur l'équipement
→ Vérifier le port SSH (défaut: 22)
→ Tester avec le bouton "Test connexion" dans l'inventaire
```

**Symptôme :** Backup échoué — `authentication failed`
```
→ Vérifier le nom d'utilisateur et le mot de passe dans le credential
→ Tester manuellement : ssh user@ip depuis un terminal
→ Vérifier que l'utilisateur a les droits enable/admin
```

**Symptôme :** Backup réussi mais configuration incomplète
```
→ Vérifier que le vendor est correctement défini dans l'inventaire
→ Le terminal SSH interactif permet de tester manuellement la commande
→ Vérifier que la pagination est bien désactivée (pas de "--- More ---" dans le backup)
```

### Problèmes SNMP

**Symptôme :** Scan ne trouve aucun équipement
```
→ Vérifier la communauté SNMP (défaut: TICE)
→ Vérifier que le port UDP/161 est accessible (firewall/ACL)
→ Tester avec "Diagnostic IP individuel" sur une IP connue
→ Augmenter le timeout (3s → 5s sur liaison WAN)
```

**Symptôme :** Équipement découvert sans hostname
```
→ L'OID sysName n'est pas configuré sur l'équipement
→ Configurer manuellement le hostname dans l'inventaire
```

### Problèmes d'audit

**Symptôme :** Audit échoue avec "aucun backup disponible"
```
→ Effectuer d'abord un backup de l'équipement
→ L'audit analyse le dernier backup disponible, pas la config live
```

**Symptôme :** Score d'audit anormalement bas
```
→ Vérifier que les règles correspondent au vendor de l'équipement
→ Filtrer les règles par vendor dans les paramètres de la règle
→ Visualiser le backup pour vérifier manuellement les patterns
```

### Problèmes de performance

**Symptôme :** Scan très lent
```
→ Réduire le timeout par IP (1s si réseau LAN rapide)
→ Augmenter les workers (20-50 sur LAN stable)
→ Utiliser le mode Switches plutôt que Complet
```

**Symptôme :** Backup de nombreux équipements timeout
```
→ Le backup est séquentiel par défaut
→ Augmenter le timeout SSH dans les paramètres
→ Découper en plusieurs batches
```

### Base de données

**Symptôme :** Erreur "database is locked"
```
→ Une autre instance de NetTools est peut-être ouverte
→ Fermer toutes les instances et relancer
```

**Fichier de base de données :**
```
%APPDATA%\NetTools\nettools.db
```
Ce fichier SQLite peut être ouvert avec DB Browser for SQLite pour inspection directe.

### Logs de diagnostic

Les logs détaillés sont dans `%APPDATA%\NetTools\logs\nettools-YYYY-MM.log`.

Format JSON structuré, consultable directement dans l'application (Journaux → Fichiers journaux) ou avec un éditeur texte.

---

*NetTools — Région Grand Est — Administration réseau*
*Stack : Wails v2 · Go · React · SQLite · zerolog*
