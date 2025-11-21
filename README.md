# GitHub SLA Tracker

A dashboard to track GitHub's 99.9% uptime commitment across all service features by calendar quarter.

🔗 **Live Site**: [https://crazymeal.github.io/gh-sla-tracker/](https://crazymeal.github.io/gh-sla-tracker/)

## 🎯 Goal

GitHub commits to a monthly uptime of 99.9% for its services. This project tracks incidents and calculates the actual uptime percentage per quarter, helping to visualize SLA compliance and potential service credits.

## ⚙️ How it Works

1.  **Data Fetching**: A scheduled GitHub Action runs every 6 hours to fetch the latest 50 incidents from the [GitHub Status API](https://www.githubstatus.com/api).
2.  **Cumulative History**: The script `scripts/fetch-github-data.js` merges these new incidents with our existing archive (`src/data/incidents-archive.json`), ensuring we keep a long-term history even though the API only provides a limited window.
3.  **SLA Calculation**: The Astro site processes this data to calculate uptime percentages, weighted by incident impact and duration.
4.  **Deployment**: The site is automatically built and deployed to GitHub Pages whenever new incident data is committed.

## 🛠️ Development

### Prerequisites

- Node.js v18+
- npm

### Setup

```bash
# Install dependencies
npm install
```

### Fetching Data

To fetch the latest incidents and update the local archive:

```bash
npm run fetch-data
```

### Running Locally

Start the Astro development server:

```bash
npm run dev
```

The site will be available at `http://localhost:4321/gh-sla-tracker/`.

### Building for Production

```bash
npm run build
```

## 📂 Project Structure

- `src/data/incidents-archive.json`: The source of truth for incident history.
- `scripts/fetch-github-data.js`: The logic for fetching, merging, and de-duplicating incidents.
- `src/pages/`: Astro pages for the dashboard and quarter views.
- `.github/workflows/`:
    - `fetch-incidents.yml`: Scheduled job to update data.
    - `deploy.yml`: Reusable workflow to deploy to GitHub Pages.

## 📄 License

MIT
