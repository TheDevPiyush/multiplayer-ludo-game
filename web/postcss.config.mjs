// Tailwind is only used by the admin console (app/admin-console/admin.css); the
// public site keeps its hand-written globals.css.
const config = {
    plugins: { '@tailwindcss/postcss': {} },
};

export default config;
