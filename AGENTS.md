# AGENTS.md

## Cursor Cloud specific instructions

This repository contains **two independent projects**:

### 1. Flutter Social App (`social_app/`)
- **Framework:** Flutter 3.27.x / Dart 3.6.x
- **State management:** Riverpod; routing via GoRouter
- **Data:** All in-memory (no backend/database required)
- **Commands (run from `social_app/`):**
  - Install deps: `flutter pub get`
  - Lint: `flutter analyze`
  - Test: `flutter test` (note: the existing widget test has a pre-existing timer-pending failure caused by `SplashScreen.initState` creating a delayed navigation timer)
  - Build web: `flutter build web`
  - Run dev (web): `flutter run -d web-server --web-port=8080 --web-hostname=0.0.0.0`
- **Flutter SDK** is installed at `/opt/flutter`. Ensure `PATH` includes `/opt/flutter/bin`.

### 2. Streamlit Chemical Inventory App (root `main.py`)
- **Framework:** Python 3 / Streamlit
- **Dependencies:** `requirements.txt` plus `streamlit`, `networkx`, `google-auth` (these are not listed in `requirements.txt` but are required imports)
- **External requirements:** Requires a Google Cloud service account with Sheets + Drive API access, configured in `.streamlit/secrets.toml` as `gcp_service_account`. Cannot run without valid GCP credentials.
- **Commands (run from repo root):**
  - Install deps: `pip install -r requirements.txt streamlit networkx google-auth`
  - Run: `streamlit run main.py` (requires `.streamlit/secrets.toml`)
- No linter or tests are configured for the Python project.

### Notes
- The two projects are completely independent — no shared code or API contract.
- Chrome is pre-installed in the Cloud Agent VM for Flutter web testing.
- System packages for Flutter Linux desktop/web builds (`clang`, `cmake`, `ninja-build`, `pkg-config`, `libgtk-3-dev`) must be installed if not already present.
