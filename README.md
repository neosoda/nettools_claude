# NetworkTools

Application desktop de gestion réseau pour administrateurs, construite avec **Wails v2 + Go + React + SQLite**.

---

## Fonctionnalités

### Découverte réseau (SNMP)
- Scan SNMP v2c/v3 par plage CIDR
- **Saisie manuelle d'une liste d'IPs** (une par ligne ou séparées par virgule)
- Collecte : hostname, MAC address, fabricant, modèle, **version firmware**, **uptime**
- Diagnostic IP individuel avec fallback v2c → v1 → public
- Progression en temps réel
- **Bouton STOP** — arrête immédiatement le scan en cours
- **Export Excel (.xlsx)** avec mise en forme : en-têtes colorés, lignes alternées, feuille résumé par fabricant

### Gestion des backups
- Backup SSH des configurations `running` / `startup`
- Sélection par équipement ou **depuis le dernier scan**
- Indicateurs de progression par équipement (succès / échec en direct)
- **Fenêtre Terminal SSH** — exécutez n'importe quelle commande interactive sur l'équipement, avec suggestions rapides (`show version`, `show vlan`, etc.)
- Historique : date, taille, hash SHA256, durée
- Visualisation et export ZIP des backups

#### Support multi-vendor SSH

Stratégie **exec-first / interactive-fallback** : le moteur tente d'abord le canal SSH exec (sans PTY, sortie propre sans pagination), puis bascule automatiquement vers un shell interactif PTY si le device le rejette.

| Vendor | Commande | Disable paging | Notes |
|--------|----------|----------------|-------|
| Cisco IOS/XE | `show running-config` | `terminal length 0` | Exec préféré |
| Aruba AOS-S | `show running-config` | `no page` | Exec non supporté → interactive |
| HP ProCurve | `show running-config` | `no page` | |
| HPE Comware / H3C | `display current-configuration` | `screen-length 0 temporary` | |
| Huawei VRP | `display current-configuration` | `screen-length 0 temporary` | |
| Allied Telesis | `show running-config` | `terminal length 0` | AlliedWare Plus |
| Fortinet FortiOS | `show full-configuration` | — | Pas de pagination |
| Unknown | `show running-config` | — | Détection auto depuis banner SSH/MOTD |

**Détection automatique du vendor** : si un équipement est marqué "unknown", le moteur détecte le vendor depuis la version SSH du serveur (`SSH-2.0-Cisco-...`, `SSH-2.0-HuaweiSSH`...) puis depuis le MOTD initial de la session.

### Audit de conformité
- Règles regex configurables (présence / absence)
- Sévérités : critique, élevé, moyen, faible
- Filtrage par fabricant
- Sélection **depuis le dernier scan**
- Score en pourcentage avec barre de progression colorée
- **Diagnostic enrichi** : en cas d'échec, les mots-clés trouvés / manquants dans la config sont affichés
- **22 règles prédéfinies** adaptées à l'environnement Aruba/HPE Région Grand Est :
  - Sécurité : chiffrement passwords, désactivation HTTP/DHCP/Telnet, suppression compte `manager`
  - SSH : service activé, restriction aux utilisateurs autorisés
  - Journalisation : facility `local0`, serveur syslog `10.113.x.x`
  - Heure : timezone Paris, NTP `ntp.lor.numerique-educatif.fr`
  - SNMP community `TICE`, AAA/Radius
  - L2 : RSTP, LLDP, loop-protection, multicast routing, private VLAN 999
  - VLANs métier : 1 (Administratif), 401 (PEDAGO), 502 (DMZ-PRIV), 504 (DMZ-PEDAGO), 517 (SERVEURS-PEDA)

### Comparateur de configuration
- Diff ligne par ligne avec indicateurs +/-
- Ignorer des patterns (regex)
- Comparaison directe entre deux backups
- **Export HTML** — rapport standalone avec thème sombre, partageable sans outil tiers

### Playbooks SSH
- Définition en YAML : nom, timeout, étapes (commande + expect + on_error)
- **Guide intégré** : explication, structure, bonnes pratiques
- **4 modèles prêts à l'emploi** : inventaire, sécurité, VLAN, diagnostic
- Exécution multi-équipements avec résultats pas-à-pas
- **Terminal temps réel** — chaque étape s'affiche en direct pendant l'exécution :
  - Ligne d'en-tête par équipement (device_start)
  - Démarrage de chaque step avec la commande envoyée
  - Sortie SSH brute au fur et à mesure
  - Indicateur ✓ (vert) / ✗ (rouge) à la fin de chaque step
  - Résumé final succès/échec par équipement

### Planificateur
- Interface **calendrier + horloge** : fréquence (horaire / quotidien / hebdo / mensuel) + heure + minute
- Aperçu en français de la planification
- Mode avancé pour expressions cron personnalisées
- Types de tâches : Backup, Scan réseau
- Activation/désactivation à la volée

### Journaux d'activité
- Événements cliquables avec **modal de détail** et analyse contextuelle
- Filtrage texte (action, type, détails)
- **Lecteur de fichiers journaux** — parcourez les `.log` mensuels directement dans l'app
- Auto-rafraîchissement toutes les 10 secondes

### Inventaire
- Gestion CRUD des équipements
- Test de connexion SSH
- Assignation de credentials par équipement

### Topologie réseau
- Visualisation graphe (ReactFlow)
- Couleurs par fabricant, icône PoE

---

## Stack technique

| Couche | Technologie |
|---|---|
| Framework desktop | Wails v2 |
| Backend | Go 1.25 |
| Frontend | React 18 + TypeScript + TailwindCSS |
| Base de données | SQLite (GORM, mode WAL) |
| SNMP | gosnmp |
| SSH | golang.org/x/crypto/ssh |
| Export Excel | excelize v2 |
| Scheduler | robfig/cron v3 |
| Chiffrement | DPAPI (Windows) / AES-256-GCM |
| Logs | zerolog |

---

## Architecture

```
networktools/
├── app.go                    # API principale (méthodes Wails)
├── main.go                   # Point d'entrée
├── internal/
│   ├── db/                   # SQLite + modèles GORM
│   ├── snmp/                 # Scanner réseau + mapping OID→modèle (70+ équipements)
│   ├── backup/               # Gestionnaire de backups SSH
│   ├── playbook/             # Exécuteur de playbooks YAML
│   ├── scheduler/            # Planificateur cron
│   ├── audit/                # Moteur de conformité
│   ├── diff/                 # Comparateur de configurations
│   ├── ssh/                  # Pool de workers SSH
│   ├── topology/             # Constructeur de graphe
│   ├── logger/               # Logs fichier + base de données
│   └── secret/               # Chiffrement credentials
├── frontend/
│   └── src/pages/            # Pages React
└── build/bin/
    └── Nettools_claude.exe   # Binaire Windows
```

---

## Données

Stockées dans `%APPDATA%\NetworkTools\` :
- `networktools.db` — base SQLite
- `backups/` — fichiers de configuration
- `logs/networktools-YYYY-MM.log` — journaux mensuels
- `settings.json` — préférences utilisateur

---

## Développement

```bash
# Mode développement (hot-reload)
wails dev

# Build production
wails build
```

Binaire produit : `build/bin/Nettools_claude.exe`

---

## Prérequis build

- Go 1.21+
- Node.js 18+
- Wails CLI v2 : `go install github.com/wailsapp/wails/v2/cmd/wails@latest`
- WebView2 Runtime (inclus dans Windows 10/11)
