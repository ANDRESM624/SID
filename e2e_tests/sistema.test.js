const request = require("supertest");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const API_URL = "http://127.0.0.1:8000";
const ROOT_DIR = path.resolve(__dirname, "..");
const DJANGO_LOG = path.join(ROOT_DIR, "django.log");
const ENV_FILE = path.join(ROOT_DIR, ".env");
const DB_FILE = path.join(ROOT_DIR, "db.sqlite3");
const URLS_FILE = path.join(ROOT_DIR, "imprenta_digital", "urls.py");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe("Pruebas de Sistema (Evaluación PDF)", () => {
  test("Debe validar la generación de Logs (Pistas de Auditoria) centralizados", async () => {
    await request(API_URL).get("/esta-ruta-no-existe-12345/");
    expect(fs.existsSync(DJANGO_LOG)).toBe(true);
    const logContent = fs.readFileSync(DJANGO_LOG, "utf-8");
    expect(logContent).toMatch(/Not Found/i);
  });

  test("Reconfiguración mediante Variables de Entorno (.env)", async () => {
    fs.writeFileSync(ENV_FILE, "DEBUG=False\n");
    await sleep(3000); // Esperar auto-reload

    try {
      const response = await request(API_URL).get("/login/");
      expect(response.statusCode).toBe(200);
    } finally {
      fs.unlinkSync(ENV_FILE);
      await sleep(2000);
    }
  });

  test("Ejecución de Migraciones de Base de Datos Limpias", async () => {
    jest.setTimeout(30000);
    const dbBackup = DB_FILE + ".backup";
    const fixturePath = path.join(ROOT_DIR, "datos_iniciales.json");

    try {
      if (fs.existsSync(DB_FILE)) {
        fs.copyFileSync(DB_FILE, dbBackup);
        execSync("python manage.py dumpdata --natural-foreign --natural-primary -e contenttypes -e auth.Permission --indent 4 > datos_iniciales.json", { cwd: ROOT_DIR });
      }

      if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
      execSync("python manage.py makemigrations", { cwd: ROOT_DIR });
      execSync("python manage.py migrate", { cwd: ROOT_DIR });
      
      if (fs.existsSync(fixturePath)) {
        execSync("python manage.py loaddata datos_iniciales.json", { cwd: ROOT_DIR });
      }

      await sleep(3000);

      const browser = await chromium.launch();
      const page = await browser.newPage();
      await page.goto(API_URL + "/login/");
      
      const title = await page.title();
      expect(title).toBeDefined();

      await browser.close();
    } finally {
      if (fs.existsSync(dbBackup)) {
        fs.copyFileSync(dbBackup, DB_FILE);
        fs.unlinkSync(dbBackup);
      }
      if (fs.existsSync(fixturePath)) {
        fs.unlinkSync(fixturePath);
      }
      await sleep(2000);
    }
  });

  test("Aislamiento de Módulos (Apps de Django)", async () => {
    const originalUrls = fs.readFileSync(URLS_FILE, "utf-8");
    const modifiedUrls = originalUrls.replace(
      /path\('', include\('Backend\.notas_de_debito_credito\.urls'\)\),/g,
      "#path('', include('Backend.notas_de_debito_credito.urls')),"
    );
    fs.writeFileSync(URLS_FILE, modifiedUrls);

    await sleep(3000); // Esperar auto-reload

    try {
      const response = await request(API_URL).get("/login/");
      expect(response.statusCode).toBe(200);
    } finally {
      fs.writeFileSync(URLS_FILE, originalUrls);
      await sleep(2000);
    }
  });
});
