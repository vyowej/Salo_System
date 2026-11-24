# React + Vite

## How to Run SALO Locally

1. Start **Apache** and **MySQL** through XAMPP (MySQL is required for database-dependent features).
2. Open a terminal in the React project directory (the repository root).
3. Execute:
   ```bash
   npm run dev:all
   ```
4. Open the application at `http://localhost:5173` (not `127.0.0.1`).
   - Note: The Laravel backend API runs separately on port `8000` (`http://localhost:8000`).

### Reservation Scheduler (Local XAMPP Demos)

Reservation expiry (`salo:expire-stale-reservations`) and reminder (`salo:send-reservation-reminders`) commands are registered in `backend/routes/console.php` to run every 5 minutes (`Asia/Manila`). For local XAMPP demos, run the Laravel scheduler in a separate terminal:

```bash
cd backend
php artisan schedule:work
```

- **Fallback:** Even when the scheduler is not running, reservation detail reads and lifecycle actions perform a lazy single-row expiry sweep automatically.
- See `docs/reservation/SCHEDULER_SETUP.md` for manual `--dry-run` commands and Windows Task Scheduler setup.

---

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
