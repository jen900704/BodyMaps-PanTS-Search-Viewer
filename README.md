# BodyMaps-PanTS-Search-Viewer

An integrated system for searching PanTS cases and visualizing CT volumes with multi-organ 3D/2D segmentation overlays.
Frontend uses React, Vite, Niivue, Cornerstone.
Backend uses Flask to serve CT volumes, merged labelmaps, and uint8 conversion for Niivue.

## Repository Structure
BodyMaps-PanTS-Search-Viewer/
│
├── PanTS-Demo/           # Frontend (React + Vite + Niivue + Cornerstone)
├── flask-server/         # Backend (Flask API for volumes & labels)
├── .github/workflows/    # Optional CI configurations
│
└── README.md             # This file

## Setup
### 1. Backend (Flask)

cd flask-server
pip install -r requirements.txt

Set dataset path in .env:
PANTS_PATH=/path/to/PanTS

Run backend:
python app.py

### 2. Frontend (Vite + React)

cd PanTS-Demo
npm install

Update .env (point to backend API):
VITE_API_BASE=http://localhost:5001

### Run viewer:
npm run dev

### Viewer URL:
http://localhost:5173

## Notes

Supports both local PanTS dataset and HuggingFace downloads.

Backend auto-converts float label maps to uint8 for Niivue compatibility.

Large CT and segmentation files are excluded from GitHub.

## License

MIT License

