# GeoLab · Notebook Portfolio

Auto-updating geospatial notebook portfolio.  
Drop a `.ipynb` into `notebooks/` → push → site rebuilds automatically via GitHub Actions.

**Live site:** `https://mamedrifqy.github.io/geolab` *(after setup below)*

---

## 🚀 One-time Setup

### 1. Create the GitHub repository

```bash
# From this project folder:
git init
git add .
git commit -m "Initial GeoLab portfolio"
gh repo create geolab --public --push --source=.
# Or use GitHub.com → New Repository → name it "geolab"
```

### 2. Enable GitHub Pages

1. Go to your repo → **Settings → Pages**
2. Set **Source** → `Deploy from a branch`
3. Set **Branch** → `gh-pages` / `/ (root)`
4. Click **Save**

> The first deploy will happen automatically when you push to `main`.  
> Your site will be live at `https://mamedrifqy.github.io/geolab`

---

## ✏️ Adding a Notebook

```bash
cp my_new_analysis.ipynb notebooks/
git add notebooks/my_new_analysis.ipynb
git commit -m "Add: my new analysis"
git push
```

That's it. GitHub Actions will:
1. Detect the new file
2. Run `build.py` to regenerate the site
3. Deploy the updated `docs/index.html` to GitHub Pages

The site is usually live within **60–90 seconds**.

---

## 🗑️ Removing a Notebook

```bash
git rm notebooks/old_notebook.ipynb
git commit -m "Remove: old notebook"
git push
```

The site rebuilds without it automatically.

---

## 🛠 Run Locally

```bash
# Install nothing — just Python 3.10+
python build.py

# Open the result
open docs/index.html      # macOS
start docs/index.html     # Windows
xdg-open docs/index.html  # Linux
```

---

## 📁 Project Structure

```
geolab/
├── notebooks/          ← DROP YOUR .ipynb FILES HERE
│   ├── Mangrove_Analysis_FINAL_FIXED.ipynb
│   └── ...
├── src/
│   ├── style.css       ← Edit to restyle the site
│   └── app.js          ← Edit to change site behaviour
├── docs/
│   └── index.html      ← Auto-generated (don't edit manually)
├── build.py            ← Build script (runs in CI and locally)
├── .github/
│   └── workflows/
│       └── deploy.yml  ← GitHub Actions workflow
└── README.md
```

---

## ⚙️ Customisation

Edit the top of `build.py`:

```python
OWNER_NAME = "Mamed Rifqy"
OWNER_URL  = "https://mamedrifqy.github.io/resume"
SITE_TITLE = "GeoLab · Notebook Portfolio"
```

The build script auto-detects notebook metadata (title, category, icon, accent colour)  
from file names and import statements — no manual config needed.

---

*Built by [Mamed Rifqy](https://mamedrifqy.github.io/resume)*
