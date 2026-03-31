<div align="center">

![NetTools Logo](frontend/src/assets/images/logo.png)

# NetTools

**Plateforme complète de gestion réseau et d'audit de conformité pour administrateurs IT**

[![GitHub release](https://img.shields.io/github/v/release/neosoda/nettools_claude?color=blue&label=Version&logo=github)](../../releases)
[![License](https://img.shields.io/badge/License-Proprietary-red)](./NOTICE.md)
[![Go Version](https://img.shields.io/badge/Go-1.24-00ADD8?logo=go&logoColor=white)](https://golang.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![Platform](https://img.shields.io/badge/Platform-Windows-0078D4?logo=windows&logoColor=white)](https://www.microsoft.com/windows)

[Télécharger](#-téléchargement) • [Documentation](#-documentation) • [Fonctionnalités](#-fonctionnalités) • [Contribution](#-contribution)

</div>

---

## 🚀 À propos

**NetTools** est une application desktop puissante conçue pour simplifier la gestion réseau et l'audit de conformité. Avec une interface moderne et intuitive, elle offre aux administrateurs IT tous les outils nécessaires pour :

- 🔍 **Découvrir** les équipements réseau automatiquement
- 💾 **Sauvegarder** les configurations en un clic
- ✅ **Auditer** la conformité avec 22 règles prédéfinies
- 📊 **Comparer** et analyser les configurations
- 🎯 **Automatiser** les tâches avec des playbooks
- 📈 **Visualiser** la topologie réseau

---

## ✨ Fonctionnalités principales

<table>
<tr>
<td width="50%">

### 🔗 Découverte Réseau
- Scan **SNMP v2c/v3** rapide et fiable
- Saisie manuelle ou import d'IPs
- Collecte automatique de métadonnées
- Export **Excel** formaté et professionnel
- Progression en temps réel
- **Bouton STOP** pour arrêt instantané

</td>
<td width="50%">

### 💾 Gestion des Backups
- Backup SSH des configurations
- Support **multi-vendor** (Cisco, Aruba, HP, etc.)
- Terminal SSH intégré pour commandes customs
- Historique avec hash SHA256
- Export ZIP des sauvegardes
- Visualisation des configurations

</td>
</tr>

<tr>
<td width="50%">

### ✅ Audit de Conformité
- **22 règles prédéfinies** personnalisables
- Sévérités : critique → faible
- Score en % avec barre de progression
- Diagnostic enrichi des écarts
- Détection automatique des patterns
- Filtrage par fabricant

</td>
<td width="50%">

### 🔄 Comparateur de Configuration
- **Diff ligne par ligne** avec indicateurs +/-
- Ignorer des patterns (regex)
- Comparaison entre deux backups
- Export **HTML** standalone
- Thème sombre et responsive
- Partageable sans dépendances

</td>
</tr>

<tr>
<td width="50%">

### 🎯 Playbooks SSH
- Exécution multi-équipements
- Modèles YAML prêts à l'emploi
- Terminal temps réel intégré
- **4 templates** : inventaire, sécurité, VLAN, diagnostic
- Gestion d'erreurs et expectations
- Résultats pas-à-pas

</td>
<td width="50%">

### 📅 Planificateur
- Interface **calendrier + horloge**
- Fréquences : horaire → mensuel
- Mode avancé (expressions cron)
- Activation/désactivation à la volée
- Tâches : Backup, Scan
- Aperçu en français

</td>
</tr>

<tr>
<td width="50%">

### 📊 Topologie Réseau
- Visualisation graphique (ReactFlow)
- Couleurs par fabricant
- Icônes PoE automatiques
- Détection LLDP
- Layout interactif

</td>
<td width="50%">

### 📝 Journaux & Inventaire
- Événements cliquables
- Modal de détail avec contexte
- Lecteur de fichiers `.log` mensuels
- Gestion CRUD équipements
- Test de connexion SSH
- Auto-rafraîchissement

</td>
</tr>
</table>

---

## 🛠️ Stack Technologique

```
┌─────────────────────────────────────────────┐
│           NetTools Architecture             │
├─────────────────────────────────────────────┤
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │  Frontend (React 18 + TypeScript)    │  │
│  │  • TailwindCSS                       │  │
│  │  • React Router                      │  │
│  │  • React Query                       │  │
│  │  • ReactFlow (topologie)             │  │
│  └──────────────────────────────────────┘  │
│                   ↕️                        │
│  ┌──────────────────────────────────────┐  │
│  │  Wails v2 (Desktop Framework)        │  │
│  │  • WebView2 Runtime                  │  │
│  │  • IPC Bridge                        │  │
│  └──────────────────────────────────────┘  │
│                   ↕️                        │
│  ┌──────────────────────────────────────┐  │
│  │  Backend (Go 1.24)                   │  │
│  │  • SNMP (gosnmp)                     │  │
│  │  • SSH (x/crypto/ssh)                │  │
│  │  • SQLite + GORM                     │  │
│  │  • Scheduler (robfig/cron)           │  │
│  │  • Excelize (Excel export)           │  │
│  └──────────────────────────────────────┘  │
│                   ↕️                        │
│  ┌──────────────────────────────────────┐  │
│  │  SQLite (Database)                   │  │
│  │  • Mode WAL                          │  │
│  │  • Chiffrement DPAPI (Windows)       │  │
│  └──────────────────────────────────────┘  │
│                                             │
└─────────────────────────────────────────────┘
```

| Composant | Technologie | Rôle |
|-----------|------------|------|
| **Frontend** | React 18 + TypeScript | Interface moderne et réactive |
| **Desktop** | Wails v2 | Framework de distribution |
| **Backend** | Go 1.24 | Logique métier et communications |
| **Database** | SQLite + GORM | Persistance des données |
| **Réseau** | gosnmp, x/crypto/ssh | SNMP et SSH |
| **UI Framework** | TailwindCSS | Design responsive |
| **Export** | excelize v2 | Génération Excel |
| **Scheduling** | robfig/cron v3 | Planification des tâches |
| **Chiffrement** | DPAPI / AES-256-GCM | Sécurisation des credentials |
| **Logs** | zerolog | Journalisation structurée |

---

## 📥 Téléchargement

<div align="center">

### [⬇️ Télécharger NetTools v1.3.0](../../releases/download/v1.3.0/NetTools.exe)

**Windows 10/11 • 64-bit • ~80 MB**

</div>

### Installation

1. Téléchargez `NetTools.exe` depuis la [page Releases](../../releases)
2. Exécutez l'installateur (ou double-cliquez)
3. L'application crée automatiquement ses dossiers de données dans :
   ```
   %APPDATA%\NetTools\
   ├── nettools.db          (Base de données SQLite)
   ├── backups/                 (Configurations sauvegardées)
   ├── logs/                    (Journaux mensuels)
   └── settings.json            (Préférences utilisateur)
   ```

### Prérequis

- **Windows 10/11** (64-bit)
- **WebView2 Runtime** (inclus dans Windows 11, [télécharger pour W10](https://developer.microsoft.com/en-us/microsoft-edge/webview2))
- **.NET Framework 4.7+** (recommandé)

---

## 🚀 Démarrage rapide

### 1️⃣ Découvrir des équipements

```
Scan → Entrer plage CIDR (10.0.0.0/24) → Lancer → Export Excel
```

### 2️⃣ Sauvegarder les configurations

```
Backups → Sélectionner équipements → Récupérer depuis scan → Exécuter
```

### 3️⃣ Auditer la conformité

```
Audit → Choisir règles → Sélectionner configurations → Analyser → Voir résultats
```

### 4️⃣ Comparer deux configurations

```
Comparateur → Sélectionner 2 backups → Configurer filtres → Exporter HTML
```

---

## 📖 Documentation

| Document | Description |
|----------|-------------|
| [NOTICE.md](./NOTICE.md) | Guide utilisateur complet + règles d'audit |
| [go.mod](./go.mod) | Dépendances Go |
| [Architecture](#architecture) | Structure du projet |

### Supports Multi-Vendor

| Vendor | Commande Backup | Support |
|--------|-----------------|---------|
| **Cisco IOS/XE** | `show running-config` | ✅ Exec (préféré) |
| **Aruba AOS-S** | `show running-config` | ✅ Interactive PTY |
| **HP ProCurve** | `show running-config` | ✅ Interactive |
| **HPE Comware** | `display current-configuration` | ✅ Interactive |
| **Huawei VRP** | `display current-configuration` | ✅ Interactive |
| **Fortinet FortiOS** | `show full-configuration` | ✅ Exec |
| **Allied Telesis** | `show running-config` | ✅ Exec |

---

## 🏗️ Architecture

```
nettools/
├── 📄 app.go                      # API principale (méthodes Wails exposées)
├── 📄 main.go                     # Point d'entrée
│
├── 📁 internal/
│   ├── db/                        # SQLite + modèles GORM
│   ├── snmp/                      # Scanner SNMP + mapping OID (70+ équipements)
│   ├── ssh/                       # Pool de workers SSH
│   ├── backup/                    # Gestionnaire de backups
│   ├── audit/                     # Moteur de conformité
│   ├── diff/                      # Comparateur de configurations
│   ├── playbook/                  # Exécuteur de playbooks YAML
│   ├── scheduler/                 # Planificateur cron
│   ├── topology/                  # Constructeur de topologie
│   ├── logger/                    # Logs fichier + base de données
│   └── secret/                    # Chiffrement credentials (DPAPI/AES)
│
├── 📁 frontend/
│   ├── src/
│   │   ├── pages/                 # Pages React (Scan, Backup, Audit, etc.)
│   │   ├── components/            # Composants réutilisables
│   │   ├── context/               # Context API (gestion d'état global)
│   │   └── assets/                # Logo, icône
│   └── index.html                 # Point d'entrée HTML
│
├── 📁 build/
│   └── bin/
│       └── NetTools.exe           # Binaire production
│
├── 📄 go.mod                      # Dépendances Go
├── 📄 wails.json                  # Configuration Wails
└── 📄 Makefile                    # Commandes build/test
```

---

## 💻 Développement

### Prérequis

- **Go 1.21+**
- **Node.js 18+**
- **Wails CLI v2** : `go install github.com/wailsapp/wails/v2/cmd/wails@latest`
- **Git**

### Installer les dépendances

```bash
# Go + dépendances
go mod download

# Frontend
cd frontend && npm install --legacy-peer-deps
```

### Mode développement (hot-reload)

```bash
wails dev
```

L'application se lance avec accès aux DevTools (F12).

### Build production

```bash
wails build
```

Binaire généré : `build/bin/NetTools.exe`

### Tests

```bash
# Tests unitaires
go test ./internal/... -v

# Avec couverture
go test ./internal/... -coverprofile=coverage.out
go tool cover -html=coverage.out
```

### Linting

```bash
# Go
golangci-lint run ./...

# Frontend TypeScript
cd frontend && npx tsc --noEmit
```

---

## 🔐 Sécurité

### Stockage des Credentials

- **Windows** : DPAPI (Data Protection API) - chiffrement au niveau du système
- **Fallback** : AES-256-GCM avec seed dérivée du hostname

### Bonnes pratiques

✅ Les mots de passe ne sont jamais stockés en clair
✅ Communication SSH chiffrée (crypto/ssh standard)
✅ Base de données SQLite locale (pas de cloud)
✅ Logs sensibles masqués en production

---

## 📊 Cas d'usage

### 🏢 Inventaire Réseau

Découvrir et documenter automatiquement tous les équipements d'un site :

```
Scan SNMP → Export Excel → Import dans CMDB
```

### 🔒 Audit de Sécurité

Vérifier la conformité de 22 règles de sécurité :

```
Audit → Générer rapport → Identifier écarts → Corriger → Re-auditer
```

### 🔄 Migration de Configuration

Comparer avant/après une mise à jour :

```
Backup T0 → Mise à jour → Backup T1 → Comparateur → Rapport HTML
```

### 🤖 Automatisation

Exécuter des tâches répétitives via playbooks :

```
Créer playbook → Définir étapes → Sélectionner équipements → Exécuter → Résultats
```

---

## 🐛 Signaler un bug

1. Vérifiez que le bug n'existe pas déjà dans [Issues](../../issues)
2. Créez une nouvelle [Issue](../../issues/new) avec :
   - Description claire du problème
   - Étapes pour reproduire
   - Logs (dans `%APPDATA%\NetTools\logs\`)
   - Équipements affectés

---

## 💡 Contribuer

Les contributions sont bienvenues ! Pour contribuer :

1. Fork le projet
2. Créez une branche feature : `git checkout -b feature/ma-fonctionnalité`
3. Commitez vos changements : `git commit -m "feat: description"`
4. Poussez vers la branche : `git push origin feature/ma-fonctionnalité`
5. Ouvrez une Pull Request

**Avant de contribuer**, consultez [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## 📜 Licence & Dépendances

Ce projet utilise plusieurs bibliothèques open source.
Voir [NOTICE.md](./NOTICE.md) pour la liste complète des dépendances et licences.

---

<div align="center">

### 💬 Questions ?

Consultez la [documentation](./NOTICE.md) ou créez une [Issue](../../issues)

---

**Fait avec ❤️ par [neosoda](https://github.com/neosoda)**

*Wails • Go • React • TypeScript*

</div>
